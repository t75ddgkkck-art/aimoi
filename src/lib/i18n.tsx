"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Locale = "fr" | "en";

export const translations = {
  fr: {
    // Common
    "app.name": "GoalMind AI",
    "app.tagline": "Prédictions football propulsées par l'IA",
    "app.beta": "Bêta",
    "common.today": "Matchs",
    "common.live": "En direct",
    "common.value": "Value",
    "common.leagues": "Ligues",
    "common.stats": "Stats",
    "common.home": "Domicile",
    "common.draw": "Nul",
    "common.away": "Extérieur",
    "common.loading": "Chargement...",
    "common.refresh": "Actualiser",
    "common.language": "Langue",

    // Navigation
    "nav.features": "Fonctionnalités",
    "nav.model": "Le modèle",
    "nav.accuracy": "Précision",
    "nav.openApp": "Ouvrir la Mini App →",

    // Landing
    "landing.hero.badge": "Prédictions en direct · 6 ligues · suivi en temps réel",
    "landing.hero.title1": "L'IA football",
    "landing.hero.title2": "la plus précise",
    "landing.hero.title3": "que vous ayez jamais utilisée.",
    "landing.hero.subtitle": "Poisson bivarié Dixon-Coles. 54 features ingénierées. Ensemble empilé XGBoost + LightGBM + RandomForest. Value bets en temps réel avec Kelly Criterion. Le tout dans une Mini App Telegram.",
    "landing.hero.cta": "Lancer la Mini App",
    "landing.hero.cta2": "Voir le modèle ↓",
    "landing.hero.stat1.label": "Précision globale",
    "landing.hero.stat1.sub": "90 derniers jours",
    "landing.hero.stat2.label": "ROI Value Bets",
    "landing.hero.stat2.sub": "EV moyen",
    "landing.hero.stat3.label": "Marchés",
    "landing.hero.stat3.sub": "par match",

    "landing.features.kicker": "Fonctionnalités",
    "landing.features.title": "Tout ce qu'un pro a besoin.",
    "landing.features.subtitle": "Six marchés, probabilités calibrées, détection de value en temps réel, heatmaps de score exact, et suivi des matchs en direct — dans une seule Mini App.",
    "landing.features.f1.title": "Matrice Score Exact",
    "landing.features.f1.desc": "Grille 7×7 complète propulsée par un Poisson bivarié Dixon-Coles avec correction rho pour les scores bas.",
    "landing.features.f2.title": "Scanner Value Bets",
    "landing.features.f2.desc": "Détecte automatiquement les marchés où notre modèle bat le bookmaker de ≥5% avec EV > 0,05.",
    "landing.features.f3.title": "Kelly Criterion",
    "landing.features.f3.desc": "Dimensionnement de bankroll Kelly fractionnel (25%) pour une croissance optimale sans risque de ruine.",
    "landing.features.f4.title": "Matchs en direct",
    "landing.features.f4.desc": "Mise à jour des scores en temps réel avec courbes de probabilité de victoire ajustées toutes les 30 secondes.",
    "landing.features.f5.title": "6 grandes ligues",
    "landing.features.f5.desc": "Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League. 96 équipes suivies quotidiennement.",
    "landing.features.f6.title": "Précision traquée",
    "landing.features.f6.desc": "Taux de réussite par marché sur 30 et 90 jours, visible de tous. Aucune cerise cueillie.",

    "landing.model.kicker": "Le modèle",
    "landing.model.title": "Dixon-Coles rencontre l'ensemble learning.",
    "landing.model.p1": "Au cœur se trouve un modèle de Poisson bivarié avec la correction rho de Dixon-Coles, qui corrige la sous-estimation bien connue des scores bas (0-0, 1-0, 0-1, 1-1) dans les modèles de Poisson indépendants.",
    "landing.model.p2": "Les forces d'attaque et de défense sont ajustées par Elo pour chaque équipe. La forme récente, l'avantage du terrain et l'importance du match sont tous pris en compte. L'ensemble combine des apprenants de base XGBoost, LightGBM et RandomForest avec un méta-apprenant de régression logistique calibrée (régression isotonique).",

    "landing.accuracy.kicker": "Vrais résultats",
    "landing.accuracy.title": "Une précision que vous pouvez auditer.",
    "landing.accuracy.subtitle": "Chaque prédiction est enregistrée. Chaque marché est suivi. Aucun tour de passe-passe.",
    "landing.accuracy.market.1x2": "1X2",
    "landing.accuracy.market.ou": "Plus/Moins 2,5",
    "landing.accuracy.market.btts": "Les deux équipes marquent",
    "landing.accuracy.market.exact": "Score exact",
    "landing.accuracy.market.value": "Value Bets",

    "landing.cta.title": "Prêt à battre les bookmakers ?",
    "landing.cta.subtitle": "Ouvrez la Mini App pour voir les matchs du jour, les prédictions en direct et les value bets en temps réel. Aucune inscription requise.",
    "landing.cta.button": "Ouvrir la Mini App →",
    "landing.footer.built": "Construit avec Poisson Dixon-Coles · Ensemble XGBoost · Next.js · PostgreSQL",
    "landing.footer.warning": "⚠️ Outil éducatif. Jouez responsable.",

    // Mini App - Header
    "miniapp.localTime": "Heure locale",
    "miniapp.dataSource.fd": "LIVE PREMIUM · football-data.org + 17 bookmakers",
    "miniapp.dataSource.live": "Données LIVE · TheSportsDB",
    "miniapp.dataSource.offline": "Données OFFLINE · Mode dégradé",
    "miniapp.dataSource.refreshing": "Actualisation...",
    "miniapp.dataSource.refresh": "↻ Actualiser",

    // Today page
    "today.empty.title": "Pas de matchs à venir",
    "today.empty.subtitle": "C'est probablement l'intersaison européenne (juin-juillet). Les championnats reprennent en août.",
    "today.empty.check": "↻ Vérifier les dernières données",
    "today.confidence": "Fiabilité",
    "today.topScore": "Score probable",
    "today.upcoming": "Prochains matchs",
    "today.recent": "Derniers résultats",

    // Live page
    "live.title": "Matchs en direct",
    "live.updatedEvery": "Mis à jour en temps réel",
    "live.empty.title": "Aucun match en direct",
    "live.empty.subtitle": "Revenez plus tard, les prédictions s'affichent dès le coup d'envoi",

    // Value page
    "value.title": "Bons Coups (Value)",
    "value.subtitle": "L'IA a détecté une erreur du bookmaker sur ces matchs",
    "value.empty.title": "Pas de bon coup détecté",
    "value.empty.subtitle": "L'IA analyse le marché, elle ne propose que des opportunités rentables.",
    "value.market": "Type de pari",
    "value.odds": "Cote",
    "value.model": "IA Probabilité",
    "value.implied": "Bookmaker",
    "value.ev": "Avantage",
    "value.kelly": "Mise",
    "value.confidence": "Fiabilité",
    "value.kellyBankroll": "du capital",
    "value.howTo.title": "💡 Comment ça marche ?",
    "value.howTo.text": "Un 'Bon Coup' est un match où notre IA estime que l'équipe a plus de chances de gagner que ce que le bookmaker pense. L'avantage montre votre profit estimé sur le long terme. La mise conseillée vous aide à gérer votre argent.",

    // Combo page
    "combo.title": "Tickets Combinés",
    "combo.subtitle": "Tickets générés automatiquement pour maximiser vos gains",
    "combo.empty.title": "Pas encore de tickets",
    "combo.empty.subtitle": "Il faut au moins 2 matchs pour créer un ticket combiné.",
    "combo.safe": "🛡️ Ticket Sécurité (Risque faible)",
    "combo.safe.desc": "Les favoris les plus solides de la journée.",
    "combo.moderate": "⚖️ Ticket Équilibré",
    "combo.moderate.desc": "Un excellent mélange entre bonne cote et chance de gagner.",
    "combo.speculative": "🔥 Ticket Grosse Cote",
    "combo.speculative.desc": "Composé des meilleures opportunités détectées par l'IA.",
    "combo.totalOdds": "Cote Totale",
    "combo.totalProb": "Chance de réussite",
    "combo.totalEv": "Avantage Total",
    "combo.kellyStake": "Mise recommandée",
    "combo.kellyBankroll": "de votre capital",
    "combo.howTo.title": "🎯 Pourquoi jouer ces tickets ?",
    "combo.howTo.text": "Ces tickets utilisent les mathématiques pour combiner les meilleures prédictions. Nous calculons la chance réelle du ticket pour que vous ne preniez pas de risques inutiles.",

    // Leagues page
    "leagues.title": "Compétitions",
    "leagues.subtitle": "Suivi des plus grandes ligues du monde",
    "leagues.all": "Toutes les ligues",
    "leagues.matches": "matchs analysés",
    "leagues.matchesFor": "matchs",
    "leagues.empty": "Aucun match prévu prochainement",
    "leagues.back": "← Toutes les ligues",

    // Stats page
    "stats.title": "Résultats de l'IA",
    "stats.subtitle": "Vérifiez nos performances passées",
    "stats.overall.title": "Note globale de précision",
    "stats.overall.correct": "bons pronostics sur",
    "stats.overall.predictions": "analyses effectuées",
    "stats.byMarket": "Réussite par type",
    "stats.window30": "30 jours",
    "stats.window90": "90 jours",
    "stats.model.name": "IA GoalMind v2.5",
    "stats.model.desc": "Intelligence Artificielle utilisant 58 statistiques différentes (forme, blessures, historique) pour chaque match.",
    "stats.model.algorithms": "Moteurs IA",
    "stats.model.features": "Données analysées",
    "stats.model.features.eng": "points de données",
    "stats.model.retrain": "Mise à jour",
    "stats.model.retrain.weekly": "Quotidienne",
    "stats.model.lastRetrain": "Dernière analyse",

    // Match detail
    "match.back": "← Retour",
    "match.prediction": "Analyse de l'IA",
    "match.matchday": "Journée",
    "match.xg": "Buts prévus",
    "match.live": "DIRECT",
    "match.outcome.title": "Chance de victoire",
    "match.outcome.subtitle": "Qui va gagner le match ?",
    "match.modelConfidence": "Indice de fiabilité",
    "match.goals.title": "Nombre de buts",
    "match.goals.subtitle": "Combien de buts seront marqués ?",
    "match.over15": "Plus de 1,5 buts",
    "match.over25": "Plus de 2,5 buts",
    "match.over35": "Plus de 3,5 buts",
    "match.bttsYes": "Les 2 marquent",
    "match.matrix.title": "Grille des Scores Exacts",
    "match.matrix.subtitle": "Quels sont les scores les plus probables ?",
    "match.matrix.rows": "Buts de {home} / {away}",
    "match.matrix.probability": "Probabilité du score",
    "match.top10.title": "Classement des scores",
    "match.top10.most": "👑 Score le plus probable",
    "match.top10.prob": "Chance",
    "match.value.title": "Opportunité détectée !",
    "match.value.subtitle": "La cote est très intéressante selon l'IA",
    "match.odds.title": "Cotes vs IA",
    "match.odds.subtitle": "Comparaison avec le marché",
    "match.footer": "Analyse effectuée par {version}. Les probabilités sont calculées en fonction de la force réelle de chaque équipe.",

    // Form
    "form.W": "V",
    "form.D": "N",
    "form.L": "D",
  },
  en: {
    // Common
    "app.name": "GoalMind AI",
    "app.tagline": "AI-powered football predictions",
    "app.beta": "Beta",
    "common.today": "Matches",
    "common.live": "Live",
    "common.value": "Value",
    "common.leagues": "Leagues",
    "common.stats": "Stats",
    "common.home": "Home",
    "common.draw": "Draw",
    "common.away": "Away",
    "common.loading": "Loading...",
    "common.refresh": "Refresh",
    "common.language": "Language",

    "nav.features": "Features",
    "nav.model": "The Model",
    "nav.accuracy": "Accuracy",
    "nav.openApp": "Open Mini App →",

    "landing.hero.badge": "Live predictions · 6 leagues · real-time tracking",
    "landing.hero.title1": "The most accurate",
    "landing.hero.title2": "football AI",
    "landing.hero.title3": "you've ever used.",
    "landing.hero.subtitle": "Dixon-Coles bivariate Poisson. 54 engineered features. Stacked ensemble of XGBoost + LightGBM + RandomForest. Real-time value bets with Kelly Criterion. All inside a Telegram Mini App.",
    "landing.hero.cta": "Launch Mini App",
    "landing.hero.cta2": "See the model ↓",
    "landing.hero.stat1.label": "Overall accuracy",
    "landing.hero.stat1.sub": "last 90 days",
    "landing.hero.stat2.label": "Value bets ROI",
    "landing.hero.stat2.sub": "avg EV",
    "landing.hero.stat3.label": "Markets",
    "landing.hero.stat3.sub": "per match",

    "landing.features.kicker": "Features",
    "landing.features.title": "Everything a pro bettor needs.",
    "landing.features.subtitle": "Six markets, calibrated probabilities, real-time value detection, exact-score heatmaps, and live match tracking — all in one Mini App.",
    "landing.features.f1.title": "Exact Score Matrix",
    "landing.features.f1.desc": "Full 7×7 probability grid powered by Dixon-Coles bivariate Poisson with rho correction for low scores.",
    "landing.features.f2.title": "Value Bet Scanner",
    "landing.features.f2.desc": "Automatically flags markets where our model beats the bookmaker by ≥5% with EV > 0.05.",
    "landing.features.f3.title": "Kelly Criterion",
    "landing.features.f3.desc": "Fractional Kelly (25%) bankroll sizing for optimal long-run growth without blowup risk.",
    "landing.features.f4.title": "Live Matches",
    "landing.features.f4.desc": "Real-time score updates with running win-probability curves that adjust every 30 seconds.",
    "landing.features.f5.title": "Top 6 Leagues",
    "landing.features.f5.desc": "Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League. 96 teams, tracked daily.",
    "landing.features.f6.title": "Tracked Accuracy",
    "landing.features.f6.desc": "Per-market win rate over 30 and 90 days, visible to every user. No cherry-picking.",

    "landing.model.kicker": "The Model",
    "landing.model.title": "Dixon-Coles meets ensemble learning.",
    "landing.model.p1": "At the core is a bivariate Poisson model with the Dixon-Coles rho correction, which fixes the well-known underestimation of low scores (0-0, 1-0, 0-1, 1-1) in independent Poisson models.",
    "landing.model.p2": "Attack and defense strengths are Elo-adjusted per team. Form decay, home advantage, and match importance are all factored in. The ensemble combines XGBoost, LightGBM, and RandomForest base learners with a calibrated logistic regression meta-learner (isotonic regression).",

    "landing.accuracy.kicker": "Real Results",
    "landing.accuracy.title": "Accuracy you can audit.",
    "landing.accuracy.subtitle": "Every prediction is logged. Every market is tracked. No backtesting tricks.",
    "landing.accuracy.market.1x2": "1X2",
    "landing.accuracy.market.ou": "Over/Under 2.5",
    "landing.accuracy.market.btts": "BTTS",
    "landing.accuracy.market.exact": "Exact Score",
    "landing.accuracy.market.value": "Value Bets",

    "landing.cta.title": "Ready to beat the bookies?",
    "landing.cta.subtitle": "Open the Mini App to see today's matches, live predictions, and value bets in real time. No signup required.",
    "landing.cta.button": "Open Mini App →",
    "landing.footer.built": "Built with Dixon-Coles Poisson · XGBoost ensemble · Next.js · PostgreSQL",
    "landing.footer.warning": "⚠️ Educational tool. Gamble responsibly.",

    "miniapp.localTime": "Local time",
    "miniapp.dataSource.fd": "LIVE PREMIUM · football-data.org + 17 bookmakers",
    "miniapp.dataSource.live": "LIVE data · TheSportsDB",
    "miniapp.dataSource.offline": "OFFLINE data · Degraded mode",
    "miniapp.dataSource.refreshing": "Refreshing...",
    "miniapp.dataSource.refresh": "↻ Refresh",

    "today.empty.title": "No matches coming up",
    "today.empty.subtitle": "It's probably the European off-season (June-July). Leagues resume in August.",
    "today.empty.check": "↻ Check latest data",
    "today.confidence": "Confidence",
    "today.topScore": "Top score",
    "today.upcoming": "Upcoming matches",
    "today.recent": "Recent results",

    "live.title": "Live Matches",
    "live.updatedEvery": "Updated every 30s",
    "live.empty.title": "No matches live right now",
    "live.empty.subtitle": "Come back later for real-time predictions",

    "value.title": "Value Bets",
    "value.subtitle": "Model probability exceeds implied odds by ≥5% with EV > 5%",
    "value.empty.title": "No value bets detected",
    "value.empty.subtitle": "Our model doesn't find an edge right now. Check back soon.",
    "value.market": "Market",
    "value.odds": "Odds",
    "value.model": "Model",
    "value.implied": "Implied",
    "value.ev": "EV",
    "value.kelly": "Kelly",
    "value.confidence": "Confidence",
    "value.kellyBankroll": "of bankroll",
    "value.howTo.title": "⚠️ How to read this",
    "value.howTo.text": "A value bet occurs when our model's probability exceeds the bookmaker's implied probability by at least 5%. The EV shows the long-run profit per $1 staked. Kelly (fractional, 25%) is the optimal bankroll allocation. Always bet responsibly.",

    // Combo page
    "combo.title": "AI Combos",
    "combo.subtitle": "Intelligent accumulators generated by ensemble learning",
    "combo.empty.title": "No AI Combo generated",
    "combo.empty.subtitle": "We need at least two upcoming matches to construct an intelligent combo accumulator.",
    "combo.safe": "🛡️ Safe Ticket (Low Risk)",
    "combo.safe.desc": "High probability of success, ideal for consistent returns.",
    "combo.moderate": "⚖️ Moderate Ticket (Balanced)",
    "combo.moderate.desc": "Balanced odds offering an excellent trust-to-odds compromise.",
    "combo.speculative": "🔥 Value Ticket (Speculative)",
    "combo.speculative.desc": "Composed exclusively of top Value Bets with compounding EV edges.",
    "combo.totalOdds": "Total Odds",
    "combo.totalProb": "Combined Probability",
    "combo.totalEv": "Total EV Edge",
    "combo.kellyStake": "Recommended Stake",
    "combo.kellyBankroll": "of total capital",
    "combo.howTo.title": "🎯 Multipliers & Joint Probabilities",
    "combo.howTo.text": "AI Combos mathematically multiply joint independent probabilities (P_A * P_B) and bookmaker odds. The Value Ticket multiplies the compounding Expected Value (EV) to maximize long-term investment yield.",

    "leagues.title": "Leagues",
    "leagues.subtitle": "competitions tracked · top 5 European leagues + UCL",
    "leagues.all": "All leagues",
    "leagues.matches": "matches tracked",
    "leagues.matchesFor": "matches",
    "leagues.empty": "No matches in this league in the next 72h",
    "leagues.back": "← All leagues",

    "stats.title": "Model Performance",
    "stats.subtitle": "Real-time accuracy tracking",
    "stats.overall.title": "Overall Accuracy · Last 90 days",
    "stats.overall.correct": "correct out of",
    "stats.overall.predictions": "predictions",
    "stats.byMarket": "By market",
    "stats.window30": "30d",
    "stats.window90": "90d",
    "stats.model.name": "Dixon-Coles Ensemble v1",
    "stats.model.desc": "Stacked ensemble combining tree-based models with a Poisson framework for exact score. Calibrated via isotonic regression.",
    "stats.model.algorithms": "Algorithms",
    "stats.model.features": "Features",
    "stats.model.features.eng": "engineered",
    "stats.model.retrain": "Retrain",
    "stats.model.retrain.weekly": "weekly",
    "stats.model.lastRetrain": "Last retrain",

    "match.back": "← Back",
    "match.prediction": "Match prediction",
    "match.matchday": "Matchday",
    "match.xg": "xG",
    "match.live": "●",
    "match.outcome.title": "Match Outcome",
    "match.outcome.subtitle": "1X2 calibrated probabilities",
    "match.modelConfidence": "Model confidence",
    "match.goals.title": "Goals Markets",
    "match.goals.subtitle": "Over/Under + BTTS",
    "match.over15": "Over 1.5",
    "match.over25": "Over 2.5",
    "match.over35": "Over 3.5",
    "match.bttsYes": "BTTS Yes",
    "match.matrix.title": "Exact Score Matrix",
    "match.matrix.subtitle": "Dixon-Coles bivariate Poisson · tap cell for details",
    "match.matrix.rows": "Rows = {home} goals · Columns = {away} goals",
    "match.matrix.probability": "Probability of",
    "match.top10.title": "Top 10 Most Likely Scores",
    "match.top10.most": "👑 Most likely",
    "match.top10.prob": "Prob",
    "match.value.title": "Value Bets Detected",
    "match.value.subtitle": "Model edge vs implied odds",
    "match.odds.title": "Odds vs Model",
    "match.odds.subtitle": "Where the edge lives",
    "match.footer": "Predictions generated by {version} · Dixon-Coles bivariate Poisson with Elo-adjusted attack/defense ratings",

    "form.W": "W",
    "form.D": "D",
    "form.L": "L",
  },
} as const;

export type TranslationKey = keyof typeof translations.fr;

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: TranslationKey, vars?: Record<string, string>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("fr");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("gm_locale") as Locale | null;
    if (saved === "fr" || saved === "en") {
      setLocaleState(saved);
    } else {
      const browser = navigator.language?.toLowerCase() ?? "";
      setLocaleState(browser.startsWith("fr") ? "fr" : "en");
    }
  }, []);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    if (typeof window !== "undefined") {
      localStorage.setItem("gm_locale", l);
    }
  };

  const t = (key: TranslationKey, vars?: Record<string, string>) => {
    const dict = translations[locale];
    let str = (dict[key] ?? translations.fr[key] ?? key) as string;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(new RegExp(`\\{${k}\\}`, "g"), v);
      }
    }
    return str;
  };

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
