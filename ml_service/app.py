from __future__ import annotations

import math
import os
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

import joblib
import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel, Field
from scipy.stats import poisson
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.calibration import CalibratedClassifierCV
from sklearn.model_selection import train_test_split

try:
    from xgboost import XGBClassifier
except Exception:  # pragma: no cover
    XGBClassifier = None

try:
    from lightgbm import LGBMClassifier
except Exception:  # pragma: no cover
    LGBMClassifier = None

try:
    from catboost import CatBoostClassifier
except Exception:  # pragma: no cover
    CatBoostClassifier = None

MODEL_DIR = Path(os.getenv("MODEL_DIR", "/data/models"))
MODEL_DIR.mkdir(parents=True, exist_ok=True)
MODEL_PATH = MODEL_DIR / "stacked_football_ensemble.joblib"


# Module-level (picklable) stacked ensemble. Defining this at module scope is
# REQUIRED so joblib.dump/load works — a class defined inside a function cannot
# be unpickled and breaks /train.
class StackedModel:
    def __init__(self, fitted, meta):
        self.fitted = fitted
        self.meta = meta

    def predict_proba(self, X):
        parts = [clf.predict_proba(X) for _, clf in self.fitted]
        meta_X = np.concatenate(parts, axis=1)
        return self.meta.predict_proba(meta_X)


app = FastAPI(title="GoalMind ML Ensemble", version="1.0.0")


class TeamInput(BaseModel):
    elo: float = 1500
    attackStrength: float = 1.0
    defenseStrength: float = 1.0
    xgScoredAvg: Optional[float] = None
    xgConcededAvg: Optional[float] = None
    injuredCount: int = 0
    formLast5: Optional[str] = ""
    formLast10: Optional[str] = ""
    position: Optional[int] = 10
    points: Optional[int] = 0


class OddsInput(BaseModel):
    home: float = 2.2
    draw: float = 3.3
    away: float = 3.1


class PredictRequest(BaseModel):
    home: TeamInput
    away: TeamInput
    odds: OddsInput = Field(default_factory=OddsInput)
    leagueCode: str = "PL"
    leagueAvgGoals: float = 1.35
    homeAdvantageBase: float = 0.15
    minute: Optional[int] = None
    homeScore: Optional[int] = None
    awayScore: Optional[int] = None
    matchImportance: float = 1.0


class ScoreProb(BaseModel):
    score: str
    prob: float


class PredictResponse(BaseModel):
    homeWin: float
    draw: float
    awayWin: float
    over15: float
    over25: float
    over35: float
    bttsYes: float
    bttsNo: float
    expectedHomeGoals: float
    expectedAwayGoals: float
    exactScores: List[ScoreProb]
    confidence: int
    modelVersion: str
    ensembleUsed: bool
    heads: Dict[str, List[float]] = Field(default_factory=dict)


class TrainRequest(BaseModel):
    # Rows are feature dictionaries with outcome: 0=home, 1=draw, 2=away
    rows: List[Dict[str, Any]]


def fact(n: int) -> int:
    return math.factorial(n)


def form_multiplier(form: Optional[str]) -> float:
    if not form:
        return 1.0
    outcomes = list(form.upper())[-10:]
    weights = {"W": 1.0, "D": 0.4, "L": 0.0}
    if not outcomes:
        return 1.0
    weighted = 0.0
    total = 0.0
    for i, c in enumerate(outcomes):
        w = 1.25 ** i
        weighted += weights.get(c, 0.3) * w
        total += w
    return 0.75 + (weighted / max(total, 1e-9)) * 0.50


def dixon_coles_tau(x: int, y: int, lam: float, mu: float, rho: float) -> float:
    if x == 0 and y == 0:
        return 1 - lam * mu * rho
    if x == 0 and y == 1:
        return 1 + lam * rho
    if x == 1 and y == 0:
        return 1 + mu * rho
    if x == 1 and y == 1:
        return 1 - rho
    return 1.0


def league_params(code: str) -> Dict[str, float]:
    table = {
        "PL": {"avg": 1.42, "ha": 0.18, "rho": -0.13},
        "LL": {"avg": 1.28, "ha": 0.22, "rho": -0.14},
        "SA": {"avg": 1.32, "ha": 0.20, "rho": -0.12},
        "BL1": {"avg": 1.55, "ha": 0.15, "rho": -0.11},
        "FL1": {"avg": 1.25, "ha": 0.24, "rho": -0.15},
        "UCL": {"avg": 1.48, "ha": 0.12, "rho": -0.12},
        "WC": {"avg": 1.30, "ha": 0.05, "rho": -0.16},
        "LIVE": {"avg": 1.35, "ha": 0.10, "rho": -0.10},
    }
    return table.get(code, table["PL"])


def build_feature_vector(req: PredictRequest) -> np.ndarray:
    h = req.home
    a = req.away
    odds_sum = (1 / req.odds.home) + (1 / req.odds.draw) + (1 / req.odds.away)
    implied_home = (1 / req.odds.home) / odds_sum
    implied_draw = (1 / req.odds.draw) / odds_sum
    implied_away = (1 / req.odds.away) / odds_sum
    return np.array([
        h.elo,
        a.elo,
        h.elo - a.elo,
        h.attackStrength,
        a.attackStrength,
        h.defenseStrength,
        a.defenseStrength,
        (h.xgScoredAvg or req.leagueAvgGoals),
        (a.xgScoredAvg or req.leagueAvgGoals),
        (h.xgConcededAvg or req.leagueAvgGoals),
        (a.xgConcededAvg or req.leagueAvgGoals),
        h.injuredCount,
        a.injuredCount,
        form_multiplier(h.formLast10 or h.formLast5),
        form_multiplier(a.formLast10 or a.formLast5),
        h.position or 10,
        a.position or 10,
        (h.points or 0) - (a.points or 0),
        implied_home,
        implied_draw,
        implied_away,
        req.matchImportance,
    ], dtype=float)


def local_dixon_coles(req: PredictRequest) -> Dict[str, Any]:
    params = league_params(req.leagueCode)
    avg = params["avg"] or req.leagueAvgGoals
    ha = params["ha"]
    rho = params["rho"]
    h = req.home
    a = req.away

    elo_shift = (h.elo - a.elo) / 100 * 0.12
    home_form = form_multiplier(h.formLast10 or h.formLast5)
    away_form = form_multiplier(a.formLast10 or a.formLast5)
    home_xg_mod = (h.xgScoredAvg or avg) / max(avg, 0.1)
    away_xg_mod = (a.xgScoredAvg or avg) / max(avg, 0.1)
    home_xga = (h.xgConcededAvg or avg) / max(avg, 0.1)
    away_xga = (a.xgConcededAvg or avg) / max(avg, 0.1)
    home_inj = max(0.75, 1 - h.injuredCount * 0.035)
    away_inj = max(0.75, 1 - a.injuredCount * 0.035)

    lam = avg * h.attackStrength * away_xga * home_xg_mod * (1 + ha) * (1 + elo_shift) * home_form * home_inj
    mu = avg * a.attackStrength * home_xga * away_xg_mod * (1 - elo_shift) * away_form * away_inj

    if req.matchImportance > 1.2:
        lam *= 0.92
        mu *= 0.92

    # Live conditional adjustment if current score/minute provided
    current_home = req.homeScore or 0
    current_away = req.awayScore or 0
    if req.minute is not None:
        remaining = max(0.0, min(1.0, (96 - req.minute) / 96))
        lam = current_home + lam * (remaining ** 0.92)
        mu = current_away + mu * (remaining ** 0.92)

    max_goals = 6
    matrix = np.zeros((max_goals + 1, max_goals + 1))
    for i in range(max_goals + 1):
        for j in range(max_goals + 1):
            matrix[i, j] = poisson.pmf(i, max(lam, 0.01)) * poisson.pmf(j, max(mu, 0.01)) * dixon_coles_tau(i, j, lam, mu, rho)
    matrix /= max(matrix.sum(), 1e-12)

    home_win = float(np.tril(matrix, -1).sum())  # i>j after transpose concern handled below? rows home, cols away => tril below diagonal is away. Fix below.
    home_win = float(sum(matrix[i, j] for i in range(max_goals + 1) for j in range(max_goals + 1) if i > j))
    draw = float(sum(matrix[i, i] for i in range(max_goals + 1)))
    away_win = float(sum(matrix[i, j] for i in range(max_goals + 1) for j in range(max_goals + 1) if i < j))
    over15 = float(sum(matrix[i, j] for i in range(max_goals + 1) for j in range(max_goals + 1) if i + j > 1))
    over25 = float(sum(matrix[i, j] for i in range(max_goals + 1) for j in range(max_goals + 1) if i + j > 2))
    over35 = float(sum(matrix[i, j] for i in range(max_goals + 1) for j in range(max_goals + 1) if i + j > 3))
    btts = float(sum(matrix[i, j] for i in range(max_goals + 1) for j in range(max_goals + 1) if i > 0 and j > 0))

    scores = []
    for i in range(max_goals + 1):
        for j in range(max_goals + 1):
            scores.append({"score": f"{i}-{j}", "prob": float(matrix[i, j])})
    scores.sort(key=lambda x: x["prob"], reverse=True)

    confidence = int(min(98, max(25, max(home_win, draw, away_win) * 100 + scores[0]["prob"] * 20)))
    return {
        "homeWin": home_win,
        "draw": draw,
        "awayWin": away_win,
        "over15": over15,
        "over25": over25,
        "over35": over35,
        "bttsYes": btts,
        "bttsNo": 1 - btts,
        "expectedHomeGoals": float(lam),
        "expectedAwayGoals": float(mu),
        "exactScores": scores[:10],
        "confidence": confidence,
    }


def load_model():
    if MODEL_PATH.exists():
        try:
            return joblib.load(MODEL_PATH)
        except Exception:
            return None
    return None


def predict_ensemble(req: PredictRequest, base: Dict[str, Any]):
    model = load_model()
    x = build_feature_vector(req).reshape(1, -1)
    if not model:
        return base, False, {}
    probs = model.predict_proba(x)[0]
    # outcome labels: 0 home, 1 draw, 2 away
    base["homeWin"] = float(probs[0])
    base["draw"] = float(probs[1])
    base["awayWin"] = float(probs[2])
    base["confidence"] = int(min(98, max(25, max(probs) * 100)))
    return base, True, {"stacked": [float(p) for p in probs]}


@app.get("/health")
def health():
    return {
        "ok": True,
        "modelLoaded": MODEL_PATH.exists(),
        "xgboost": XGBClassifier is not None,
        "lightgbm": LGBMClassifier is not None,
        "catboost": CatBoostClassifier is not None,
    }


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    base = local_dixon_coles(req)
    enhanced, used, heads = predict_ensemble(req, base)
    return PredictResponse(
        **enhanced,
        modelVersion="python-xgboost-lightgbm-catboost-v1" if used else "python-dixon-coles-fallback-v1",
        ensembleUsed=used,
        heads=heads,
    )


@app.post("/train")
def train(req: TrainRequest):
    if len(req.rows) < 30:
        return {"ok": False, "error": "At least 30 labelled rows are required."}

    X = []
    y = []
    for row in req.rows:
      outcome = row.get("outcome")
      if outcome not in [0, 1, 2]:
          continue
      X.append([float(row.get(k, 0)) for k in [
          "homeElo", "awayElo", "eloDiff", "homeAttack", "awayAttack", "homeDefense", "awayDefense",
          "homeXg", "awayXg", "homeXga", "awayXga", "homeInjured", "awayInjured", "homeForm",
          "awayForm", "homePosition", "awayPosition", "pointsDiff", "impliedHome", "impliedDraw",
          "impliedAway", "matchImportance"
      ]])
      y.append(outcome)

    X = np.asarray(X, dtype=float)
    y = np.asarray(y, dtype=int)

    learners = []
    if XGBClassifier is not None:
        learners.append(("xgb", XGBClassifier(n_estimators=120, max_depth=3, learning_rate=0.05, subsample=0.9, eval_metric="mlogloss")))
    if LGBMClassifier is not None:
        learners.append(("lgbm", LGBMClassifier(n_estimators=140, learning_rate=0.04, num_leaves=15, verbose=-1)))
    if CatBoostClassifier is not None:
        learners.append(("cat", CatBoostClassifier(iterations=120, depth=4, learning_rate=0.05, loss_function="MultiClass", verbose=False)))
    learners.append(("rf", RandomForestClassifier(n_estimators=180, max_depth=7, random_state=42)))

    # Fit base learners and build stacked meta features
    meta_X = []
    fitted = []
    for name, clf in learners:
        clf.fit(X, y)
        fitted.append((name, clf))
        meta_X.append(clf.predict_proba(X))
    meta_X = np.concatenate(meta_X, axis=1)

    # LogisticRegression infers multinomial automatically in modern sklearn
    # (the `multi_class` arg was removed in 1.7+). Calibrate for better probs.
    meta = LogisticRegression(max_iter=1000)
    n_classes = len(np.unique(y))
    cv = max(2, min(3, np.min(np.bincount(y)) if n_classes > 1 else 2))
    try:
        calibrated = CalibratedClassifierCV(estimator=meta, cv=cv)
        calibrated.fit(meta_X, y)
        final_meta = calibrated
    except Exception:
        # Fallback: plain logistic meta-learner if calibration fails (small data)
        meta.fit(meta_X, y)
        final_meta = meta

    stacked = StackedModel(fitted, final_meta)
    joblib.dump(stacked, MODEL_PATH)
    train_acc = float((np.argmax(stacked.predict_proba(X), axis=1) == y).mean())
    return {"ok": True, "rows": len(y), "modelPath": str(MODEL_PATH), "trainAccuracy": train_acc}


if __name__ == "__main__":
    import uvicorn
    # Hugging Face Spaces strictly requires binding to port 7860 to avoid Launch Timeouts
    uvicorn.run("app:app", host="0.0.0.0", port=int(os.getenv("PORT", "7860")))
