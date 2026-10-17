# Mordoku

Jeu web de Murdoku — déduction spatiale qui allie sudoku et enquête
criminelle (« sudoku meets murder mystery »). Aucune dépendance, aucun
build, aucun compte : tout se passe dans le navigateur, l'affaire est
générée sur place.

En ligne : <https://mordoku.laurans.org>

## Principe

1. Une pièce est divisée en zones (salle, meuble, plante…). Quelques
   cases sont interdites.
2. Six à huit suspects plus la victime sont placés **un par ligne et une
   par colonne**, comme au sudoku.
3. Chaque suspect arrive avec une carte d'indice spatiale
   (« A est à côté de la plante », « B est dans la 3e ligne »,
   « C est la seule personne sur le tapis »…). Les indices sont des
   contraintes.
4. La carte est une preuve : zones, meubles et cases interdites comptent.
5. Une fois le plateau rempli, le meurtrier est **la personne restée
   seule avec la victime dans la même zone**.

Chaque affaire possède exactement une solution déductible, sans deviner.

## Deux façons de jouer

Au lancement, le jeu propose un choix.

**Six dossiers préparés**, du plus simple au plus exigeant. Ils sont figés
dans le dépôt, jamais tirés au sort, et tous ont été vérifiés un par un à
la construction : solution unique, et résolution **entièrement** par
déduction, étape par étape. La section « solution » les explique donc
jusqu'au bout.

Le premier est volontairement mécanique : 4 × 4, et pour chaque personne un
indice de ligne plus un indice de colonne — le croisement des deux est la
seule case possible. On apprend à lire la grille avant de lire la scène.
Les suivants abandonnent peu à peu ce confort : 5 × 5, puis 6 × 6 où les
indices parlent d'objets et de pièces, et enfin 7 × 7 avec le jeu d'indices
le plus court qui résout encore l'affaire.

**Une affaire au hasard**, aux difficultés habituelles (6 × 6 et 7 × 7).

Les fichiers de cas sont produits par `outils/construire-cas.mjs`, jamais
édités à la main :

```sh
node outils/construire-cas.mjs            # reconstruit le fichier des cas
node outils/construire-cas.mjs --verifier # relit le fichier et revalide chaque cas
```

La construction valide chaque cas deux fois : une fois en mémoire, une
fois après sérialisation et rechargement. C'est ce second passage qui a
révélé une faute de frappe dans une clé de scène, qui faisait disparaître
les cases interdites et rendait un dossier non unique.

## Développement local

Les modules ES ne se chargent pas depuis `file://`. Un serveur statique
minuscule en Node suffit :

```sh
node /tmp/opencode/serve.mjs site 8933
# http://127.0.0.1:8933/
```

## Tests

Logique pure et sans dépendance, testée avec le runner natif de Node :

```sh
cd ~/mordoku && node --test
```

13 tests (générateur, unicité, solveur, scène, et revalidation complète des
six dossiers préparés).

L'interface est vérifiée par un harnais qui pilote un Chromium headless via
le protocole DevTools, sans aucune dépendance npm (installé via mise) :

```sh
chromium --headless=new --no-sandbox --remote-debugging-port=9222 \
         --user-data-dir=/tmp/murdoku-chrome about:blank &
MORDOKU_URL=http://127.0.0.1:8933/ node tests/e2e.mjs
```

`tests/e2e.mjs` vide le `localStorage` de l'origine visée : ne pas le
lancer depuis un profil contenant une partie en cours.

## Arborescence

```
mordoku/
├── site/             racine web : c'est ce dossier qui est servi par Caddy
│   ├── index.html
│   ├── css/style.css
│   └── js/{game.js, storage.js, murdoku/*}
├── outils/           scripts de construction hors ligne (cas pré-calculés)
├── tests/            tests unitaires + tests d'interface
├── deploy/           extraits Caddy/compose appliqués sur le serveur
├── handoff.md        contexte de reprise / déploiement
└── README.md
```

Le dossier `site/` est volontairement isolé : le serveur ne monte que lui,
donc ni les tests, ni cette documentation ne sont exposés sur Internet.

## Déploiement

Voir `handoff.md`. Résumé : `git push origin main` puis
`ssh ociub 'sudo -H git -C /app/mordoku pull'` — le site sert le dossier
`site/` en direct, pas de build, pas de reload.

## Remarque sur la marque

Murdoku est une marque de Digivoid Studios / Manuel Garand. Ce dépôt est
un projet personnel d'apprentissage ; le contenu écrit (thèmes, noms de
pièces, scènes) est original, et les mécaniques de jeu sont une réimplémentation. Le cas échéant, la page d'accueil renvoie au site officiel
https://murdoku.com.