# Déploiement microservice ML Python — XGBoost / LightGBM / CatBoost

Ce dossier ajoute un vrai service Python FastAPI séparé pour entraîner et servir un modèle football ensemble.

## 1. Déployer `ml_service/` sur Render

Crée un nouveau Web Service Render :

- Root Directory : `ml_service`
- Environment : Docker
- Dockerfile Path : `./Dockerfile`
- Health Check Path : `/health`

Variables :

```env
MODEL_DIR=/data/models
```

Le service expose :

```txt
GET  /health
POST /predict
POST /train
```

## 2. Connecter Next.js au service ML

Dans les variables d’environnement du Web Service Next.js :

```env
ML_SERVICE_URL=https://ton-service-ml.onrender.com
```

Si `ML_SERVICE_URL` est absent ou le service est down, l'application repasse automatiquement sur l'ensemble TypeScript local.

## 3. Entraînement

POST `/train` avec des lignes labellisées :

```json
{
  "rows": [
    {
      "homeElo": 1700,
      "awayElo": 1600,
      "eloDiff": 100,
      "homeAttack": 1.2,
      "awayAttack": 0.9,
      "homeDefense": 0.8,
      "awayDefense": 1.1,
      "homeXg": 1.8,
      "awayXg": 0.9,
      "homeXga": 0.9,
      "awayXga": 1.4,
      "homeInjured": 0,
      "awayInjured": 2,
      "homeForm": 1.1,
      "awayForm": 0.9,
      "homePosition": 2,
      "awayPosition": 14,
      "pointsDiff": 22,
      "impliedHome": 0.58,
      "impliedDraw": 0.24,
      "impliedAway": 0.18,
      "matchImportance": 1.0,
      "outcome": 0
    }
  ]
}
```

`outcome`: 0 = home win, 1 = draw, 2 = away win.

## 4. Production

Le modèle entraîné est sauvegardé dans :

```txt
/data/models/stacked_football_ensemble.joblib
```

avec disque persistant Render.
