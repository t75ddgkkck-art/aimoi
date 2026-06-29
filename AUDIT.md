# 📋 AUDIT & ROADMAP — GoalMind AI

## État actuel (post-audit)

### Ce qui est RÉEL maintenant
- ✅ Intégration **TheSportsDB** (API publique, clé "3", 100% gratuite)
- ✅ Vraies équipes et vraies ligues (Premier League, La Liga, Serie A, Bundesliga, Ligue 1, UCL)
- ✅ Vrais matchs à venir (fetchés en live depuis l'API)
- ✅ Vrais résultats passés (30 derniers jours)
- ✅ Vrais classements (table officielle)
- ✅ Elos calculés dynamiquement depuis les résultats historiques (K=20, initialisation 1500)
- ✅ Attack/Defense strength calculés depuis les buts marqués/encaissés réels
- ✅ Forme (last 5) calculée depuis les vrais résultats
- ✅ Vraies cotes bookmaker (quand TheSportsDB les fournit, sinon recalculées depuis les Elos)

### Ce qui reste SIMULÉ (limitations techniques)
- ⚠️ Le modèle Dixon-Coles tourne en TypeScript (pas XGBoost/LightGBM/RandomForest qui nécessitent Python)
- ⚠️ Les stats d'accuracy 30d/90d sont encore une estimation basée sur les vrais résultats (pas un tracking historique sur 90 jours)
- ⚠️ Pas de xG réel (Understat/FBref requiert du scraping)
- ⚠️ Pas de bot Telegram (le prompt original demandait Python, on est en Next.js)
- ⚠️ Les matchs "live" sont rares en vrai — quand il n'y en a pas, la page Live est vide

### Sources de données
1. **TheSportsDB** (principale) : équipes, matchs, résultats, classements, cotes partielles
   - URL : `https://www.thesportsdb.com/api/v1/json/3/`
   - Rate limit : raisonnable, pas de quota strict pour la clé publique
   - Licence : données libres d'usage

### Comment rafraîchir les données
- `POST /api/refresh` : recharge ligues + équipes + matchs + résultats + recalcule Elos
- `GET /api/seed` : reset complet + seed depuis TheSportsDB
- Les données sont rechargées automatiquement si la DB est vide

### Modèle de prédiction
Dixon-Coles bivariate Poisson avec :
- λ (home) = leagueAvg × attack_home × defense_away × elo_mod × form × home_advantage
- μ (away) = leagueAvg × attack_away × defense_home × elo_mod × form
- ρ = -0.13 (correction standard Dixon-Coles)
- Cotes : si disponibles depuis TheSportsDB, sinon calculées depuis Elos + marge 6%
