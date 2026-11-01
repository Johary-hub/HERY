# Mahery — carnet d'entraînement (PWA Android)

**App en ligne : https://johary-hub.github.io/HERY/**

Application web installable, 100 % hors ligne, qui suit le programme de 24 semaines décrit dans `public/program.json` (source de vérité). Toutes les données restent sur le téléphone (IndexedDB).

## Développement

```bash
npm install
npm run dev        # serveur local
npm test           # tests du moteur (Vitest)
npm run build      # build de production dans dist/
```

Astuce : ajouter `?date=2026-11-09` à l'URL simule un autre jour (pratique pour tester).

## Déploiement GitHub Pages

1. Créer un dépôt GitHub (ex. `hery`) et y pousser la branche `main`.
2. Dans le dépôt : **Settings → Pages → Source : GitHub Actions**.
3. Chaque push sur `main` lance `.github/workflows/deploy.yml` (tests, build, mise en ligne).
   L'app est servie sur `https://<utilisateur>.github.io/<dépôt>/`.

## Installation sur Android

1. Ouvrir l'URL dans **Chrome**, attendre le chargement complet.
2. Menu ⋮ → **Ajouter à l'écran d'accueil** (ou « Installer l'application »).
3. Vérifier en **mode avion** : l'app s'ouvre et enregistre une séance.

Penser à **exporter une sauvegarde JSON** (Réglages) régulièrement.

## Structure

- `src/engine.js` — logique métier pure (semaines, phases, rotation, double progression, assiduité, poids), testée dans `tests/engine.test.js`
- `src/db.js` — IndexedDB (`hery`, v1 : `workouts`, `sets`, `body`, `settings`)
- `src/session.js` — création des séances et suggestions
- `src/views/` — un fichier par écran ; `src/timer.js` — minuteur de repos + wake lock
- `src/video.js` — fiche vidéo par exercice (lien YouTube choisi, lu dans l’app ; recherche pré-remplie sinon)
- `src/icons.js` — icônes SVG et anneaux de progression ; police Outfit embarquée (`@fontsource-variable/outfit`), aucune ressource externe
