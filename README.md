# Mordoku

Jeu de sudoku en HTML/CSS/JavaScript vanilla. Aucune dépendance, aucun build,
aucun compte : tout se joue dans le navigateur.

En ligne : <https://mordoku.laurans.org>

## Fonctionnalités

- Générateur à **solution unique** (backtracking + vérification d'unicité)
- 4 difficultés : Facile, Moyen, Difficile, Expert
- Notes / candidats
- Chrono, pause et records par difficulté (`localStorage`)
- Undo / redo
- Vérifier (compte les erreurs) et Indice (révèle une case, pénalité chrono)
- Surlignage de la case active, de sa ligne / colonne / bloc et des doublons
- Clavier (1-9, flèches, espace, backspace) **et** pavé numérique tactile
- Sauvegarde automatique, reprise au rechargement
- Thème sombre par défaut, bascule clair/sombre mémorisée

## Développement local

Les modules ES ne se chargent pas depuis `file://`, il faut un serveur statique :

```sh
python3 -m http.server 8000
# puis http://localhost:8000/site/
```

## Tests

La logique (`site/js/sudoku.js`) est pure et sans dépendance, elle est testée
avec le runner natif de Node :

```sh
node --test tests/
```

## Arborescence

```
mordoku/
├── site/            racine web : c'est ce dossier qui est servi par Caddy
│   ├── index.html
│   ├── css/style.css
│   └── js/{sudoku,storage,game}.js
├── tests/           tests node --test (hors ligne web)
├── handoff.md       contexte de reprise / déploiement
└── README.md
```

Le dossier `site/` est volontairement isolé : le serveur ne monte que lui, donc
ni les tests, ni cette documentation ne sont exposés sur Internet.

## Déploiement

Voir `handoff.md`.