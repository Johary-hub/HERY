# CLAUDE.md — Projet « Hery » (carnet d'entraînement Android)

Ce fichier est lu automatiquement par Claude Code. Il décrit l'application à construire.

## Contexte

- Utilisateur unique : Abraham, 115 kg, 1,83 m, débute un programme salle de 24 semaines le **lundi 2 novembre 2026**.
- Le plan complet (lisible humain) est dans `PLAN_ENTRAINEMENT.md`.
- Le programme structuré est dans `program.json` : **c'est la source de vérité**. L'app ne doit coder en dur aucun exercice, série, fourchette ou date — tout est lu depuis ce fichier.
- Langue de l'interface : **français**. Unités : kg, cm, secondes, mètres.

## Choix technique

**PWA (Progressive Web App)** installable sur Android via Chrome → « Ajouter à l'écran d'accueil ».
Raisons : pas d'Android Studio, pas de Play Store, fonctionne hors ligne à la salle, mise à jour instantanée.

- **Vite + JavaScript vanilla** (pas de framework lourd). TypeScript accepté si utile.
- **IndexedDB** via le paquet `idb` pour le stockage local.
- **vite-plugin-pwa** pour le manifest + service worker (cache offline complet de l'app et de `program.json`).
- **Chart.js** (bundlé, pas de CDN) pour les graphiques.
- Déploiement : **GitHub Pages** (workflow GitHub Actions) ou Netlify.
- Option ultérieure (ne pas faire maintenant) : empaqueter en APK avec Capacitor.

Contraintes :
- 100 % hors ligne après le premier chargement (la connexion en salle peut être mauvaise).
- Mobile-first, utilisable d'une main, gros boutons (≥ 48 px), thème sombre par défaut.
- Aucune donnée envoyée à un serveur. Tout reste sur le téléphone.

## Écrans

1. **Aujourd'hui** (accueil)
   - Semaine en cours (S1…S24), phase, badge « Décharge » si semaine de décharge.
   - Si jour d'entraînement : carte de la séance proposée avec bouton « Commencer » et bouton « Séance minimum ».
   - Sinon : « Jour off — marche 30 min conseillée » + prochaine séance prévue.
   - Assiduité de la semaine (ex. 2/3) et série en cours (semaines consécutives ≥ objectif).
   - Alerte « Règle des 2 jours » si 1 séance prévue a déjà été ratée.

2. **Séance en cours**
   - Liste des exercices dans l'ordre, avec consigne technique (`cue`) dépliable.
   - Par série : champs charge (kg) et reps (ou secondes / mètres selon `unit`), pré-remplis avec la **suggestion** du moteur de progression, case « validée ».
   - Bouton « Remplacer » → propose les `substitutes` de l'exercice (le remplacement est enregistré sous l'id du substitut).
   - **Minuteur de repos** auto-démarré à la validation d'une série (`restSec` de la phase), vibration (`navigator.vibrate`) + bip à la fin, garder l'écran allumé (Wake Lock API si dispo).
   - Rappel échauffement en haut, rappel cardio (`cardioMin`) en bas.
   - Bouton « Terminer » → enregistre durée, note libre optionnelle, ressenti 1–5.

3. **Progrès**
   - Par exercice : courbe de la charge max et du volume (charge × reps) dans le temps.
   - Liste des records personnels.

4. **Corps**
   - Saisie poids (kg) et tour de taille (cm) avec date.
   - Graphique du poids : points bruts + **moyenne hebdomadaire** en ligne principale.
   - Alerte stagnation (voir `tracking.stallAlert`).

5. **Réglages**
   - Date de début (par défaut `startDate`), jours d'entraînement (par défaut `defaultTrainingDays`).
   - Activer l'option 4 jours (phase 3) — grisé tant que la condition d'assiduité n'est pas remplie, avec le taux actuel affiché.
   - **Export JSON** (téléchargement de toutes les données) et **Import JSON** (restauration). Indispensable : changement de téléphone, réinstallation.
   - Bouton « Réinitialiser » avec double confirmation.

## Logique métier (à implémenter dans un module pur `src/engine.js`, testé)

```
week(date)        = floor((date - startDate) / 7 jours) + 1     // 1..24, >24 → recommencer phase 3
phase(week)       = phase dont weeks[0] <= week <= weeks[1]
isDeload(week)    = week ∈ deload.weeks
isTrainingDay(d)  = isoWeekday(d) ∈ trainingDays (réglages)
```

**Séance proposée** : la suivante dans la `rotation` de la phase **après la dernière séance terminée** (pas après la dernière séance prévue). Une séance ratée n'est jamais sautée. Au changement de phase, repartir du premier élément de la nouvelle rotation.

**Nombre de séries** :
- base = `sets` de l'exercice dans la séance
- si `weekOverrides[week].maxSets` → min(base, maxSets)
- si décharge → ceil(base × `setsMultiplier`)

**Charge suggérée (double progression)** pour un exercice :
1. Chercher la dernière séance terminée **hors décharge** contenant cet exercice.
2. Aucune → mode « Séance test » : champ vide + message « Trouve une charge où tu fais {range[0]} reps en gardant 3–4 reps en réserve ».
3. Si toutes les séries validées ont reps ≥ `range[1]` → charge + `increments[category]` (core en `seconds` : +5 s sur la cible ; `meters` : ne pas changer la distance, augmenter la charge des haltères de 2 kg).
4. Sinon → même charge, cible = meilleures reps de la dernière fois + 1 (plafonnée à `range[1]`).
5. Si décharge → charge × `loadMultiplier`, arrondie à 0,5 kg.
6. Si la fourchette de l'exercice change d'une phase à l'autre, garder la charge, viser le bas de la nouvelle fourchette.

**Séance minimum** : seulement les `minimumSession.exerciseCount` premiers exercices, cardio `minimumSession.cardioMin`. Comptée comme séance terminée (flag `minimum: true`).

**Assiduité** : séances terminées / séances prévues (selon les jours d'entraînement) sur une période. Objectif `tracking.adherenceTarget`.

**Moyenne hebdo du poids** : moyenne des pesées de la semaine ISO. Stagnation = 3 semaines consécutives sans baisse de la moyenne.

## Modèle de données (IndexedDB, base `hery`, version 1)

| Store | Clé | Champs |
|---|---|---|
| `workouts` | `id` (uuid) | `date` (ISO), `week`, `phaseId`, `templateId`, `minimum` (bool), `deload` (bool), `startedAt`, `finishedAt`, `feeling` (1–5), `note` |
| `sets` | `id` (uuid), index `workoutId`, `exerciseId` | `workoutId`, `exerciseId`, `plannedExerciseId`, `setIndex`, `weightKg`, `value` (reps / s / m), `done` (bool) |
| `body` | `id`, index `date` | `date`, `weightKg?`, `waistCm?` |
| `settings` | `key` | `startDate`, `trainingDays`, `fourDayOption` |

L'export JSON = `{ schemaVersion: 1, exportedAt, workouts, sets, body, settings }`.

## Structure attendue

```
/
├─ CLAUDE.md
├─ PLAN_ENTRAINEMENT.md
├─ public/program.json        ← copie de program.json
├─ src/
│  ├─ main.js                 ← routeur simple par hash (#/today, #/workout, #/progress, #/body, #/settings)
│  ├─ engine.js               ← logique pure (aucun accès DOM ni DB)
│  ├─ db.js                   ← accès IndexedDB
│  ├─ views/                  ← un fichier par écran
│  └─ styles.css
├─ tests/engine.test.js       ← Vitest
└─ vite.config.js
```

## Ordre de construction (un sprint = un commit testé)

1. **Socle** : Vite, PWA (manifest, icône, service worker), routeur, thème sombre, chargement de `program.json`.
2. **Moteur** : `engine.js` + tests Vitest (voir cas ci-dessous). Ne pas passer à la suite tant que les tests ne passent pas.
3. **Écran Aujourd'hui + Séance en cours** avec enregistrement IndexedDB et minuteur de repos.
4. **Progression** : suggestions de charges branchées sur l'historique, mode séance test, remplacements.
5. **Corps + Progrès** : saisies, graphiques, moyenne hebdo, alerte stagnation.
6. **Réglages** : export/import JSON, option 4 jours, réinitialisation.
7. **Déploiement** GitHub Pages + vérification installation Android et fonctionnement en mode avion.

## Cas de test obligatoires (engine)

- 2026-11-02 → S1, phase P1, séance A1, 2 séries max par exercice.
- 2026-11-04 (A1 terminée le 02) → séance B1, toujours 2 séries max (S1).
- 2026-11-09 → S2, retour à 3 séries.
- 2026-11-30 → S5, phase P2, rotation A2/B2.
- 2026-12-21 → S8, décharge : 3 séries → 2, charge ×0,9 arrondie à 0,5 kg.
- 2027-01-25 → S13, phase P3.
- Lundi raté, mercredi : la séance proposée est celle qui était prévue lundi.
- Presse à cuisses 3×12 à 80 kg (fourchette 10–12) → suggestion 85 kg.
- Presse à cuisses 12/11/10 à 80 kg → suggestion 80 kg.
- Gainage 30/30 s (fourchette 20–30) → cible 35 s.
- Exercice jamais fait → mode séance test.
- Dimanche → pas de jour d'entraînement.

## Ce qu'il ne faut PAS faire

- Pas de compte utilisateur, pas de backend, pas de tracking.
- Pas de calcul de calories ni d'objectifs alimentaires chiffrés dans l'app.
- Ne pas modifier `program.json` depuis l'app.
- Pas de dépendance chargée depuis un CDN (casse le mode hors ligne).
