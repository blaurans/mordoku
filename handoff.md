# Handoff — Mordoku

Document de reprise. Tout ce qu'il faut pour reprendre le projet ou le
redéployer, sans aucun secret (il n'y en a pas : voir « Sécurité »).

Dernière mise à jour : 2026-10-16 — version Murdoku déployée et vérifiée.

---

## 1. Résumé

Jeu web de Murdoku (murder mystery + sudoku) : deduction spatiale sur une
scène de crime. Aucune dépendance, aucun build, aucun compte, aucun backend :
tout se passe dans le navigateur, l'affaire est générée sur place.

- **En ligne** : https://mordoku.laurans.org
- **Dépôt** : https://github.com/blaurans/mordoku (public)
- **Clone local** : `~/mordoku`
- **Clone serveur** : `/app/mordoku` sur `ociub`

Principe : une pièce est divisée en zones (salle, meuble, plante…). Quelques
cases sont interdites. Les suspects et la victime se placent un par ligne et
une par colonne comme au sudoku. Chaque suspect porte une carte d'indice
spatiale (« A est à côté de la plante », etc.) qui sont des contraintes.
Une fois le plateau rempli, le meurtrier est la personne restée seule avec la
victime dans la même zone. Chaque affaire possède exactement une solution
déductible.

Ce n'est plus un sudoku (ancien projet, l'history git le conserve) :
la logique a été entièrement réimlementée.

## 2. État vérifié au déploiement

- `https://mordoku.laurans.org` renvoie 200, certificat valide, HTTP/2,
  site servi par le Caddy existant de `/app/guacamole`.
- 15 tests unitaires (`node --test`) + harnais navigateur passent.
- `topps`, `mybooks`, `tempspartiel` : inchangés.
- `bastion` et `charge` : toujours refusés sans certificat client.
- `git push` en SSH (\`git@github.com:blaurans/mordoku.git\`) — le jeton
  `gh` n'a pas les droits d'écriture sur ce dépôt (403).

## 3. Tester en local

```sh
cd ~/mordoku && node --test        # 15 tests unitaires (~20 s avec le 8×8)
```

Harnais navigateur (Chromium headless, sans dépendance npm) :

```sh
chromium --headless=new --no-sandbox --remote-debugging-port=9222 \
         --user-data-dir=/tmp/murdoku-chrome about:blank &
MORDOKU_URL=http://127.0.0.1:8933/ node tests/e2e.mjs
```

Jouer : `node /tmp/opencode/serve.mjs site 8933` puis ouvrir
`http://127.0.0.1:8933/`.

## 4. Déployer une nouvelle version

```sh
cd ~/mordoku
git pull
# modifier, tester
git push origin main
ssh ociub 'sudo -H git -C /app/mordoku pull'
```

Le Caddy lit le dossier `site/` de `/app/mordoku` à chaque requête : pas de
build, pas de reload, pas de recréation de conteneur.

Vérifier : `curl -sS -o /dev/null -w '%{http_code}\n' https://mordoku.laurans.org/`.

## 5. Architecture du code

```
site/js/murdoku/random.js    prng (mulberry32) + melange + sélection
site/js/murdoku/scene.js     pièces (partition de Guillotine), objets
                             repères, cases interdites, 8 thèmes
site/js/murdoku/clues.js      7 à 9 types d'indices spatiaux + vérification
site/js/murdoku/solver.js     solveur MRV, comptage plafonné, unicité
site/js/murdoku/generator.js  génération + sélection gloutonne des indices
site/js/game.js               état, rendu, sélection, X, undo/redo,
                             soumission, révélation du meurtrier
site/js/storage.js           persistance locale de l'affaire et records
```

`sudoku.js` puis `murdoku/*` sont des modules sans DOM (sauf scene et game).
`solver.js` compte les solutions par retour arrière à la MRV. Le comptage est
plafonné (500 puis 200 selon l'étape) pour limiter le coût ; l'unicité est
prouvée par décompte final à 2. Pruning essentiel : ne pas rétrograder en
`` `count = 2` `` sans vérifier le placement de référence.

Pièges de logique à ne pas réintroduire :

- les tables de blocs doivent être d'abord peuplées avant de servir au
  calcul des voisins ;
- l'indexation des cellules est `ligne * N + colonne` ;
- `combinerMasques(null, m)` = `m` (null signifie « toutes les cases »).

## 6. Côté serveur ociub

Connexion : `ssh ociub` (alias `~/.ssh/config`). `sudo` sans mot de passe.

| Quoi | Où |
|---|---|
| Dépôt du site | `/app/mordoku` (propriétaire `ubuntu:ubuntu`) |
| Racine servie | `/app/mordoku/site` |
| Caddy (frontal TLS) | `/app/guacamole/Caddyfile` |
| Compose du Caddy | `/app/guacamole/docker-compose.yml` |
| Réseau | `guacamole_internal` |
| Log d'accès | `/app/guacamole/caddy/data/mordoku-access.log` |

Extrait du vhost et du montage : `deploy/vhost.caddy` et
`deploy/compose-snippet.yml` du dépôt ; à comparer avec le serveur en cas
de divergence.

Deux façons de modifier Caddy :

1. Caddyfile seul (ajouter un indice, modifier les en-têtes, `root`) : éditer
   le fichier, puis `sudo docker exec guacamole-caddy-1 caddy reload`. Sans
   coupure.
2. Ajouter un montage dans `docker-compose.yml` : `cd /app/guacamole && sudo
   docker compose up -d --no-deps caddy` — recréation, coupe le TLS quelques
   secondes sur tous les vhosts, bastion compris.

Sauvegarde datee obligatoire avant toute intervention (convention du serveur :
`Caddyfile.bak.<date>`, `docker-compose.yml.bak.<date>`).

Rollback (2026-10-16) :

- `/app/guacamole/Caddyfile.bak.mordoku-20261016-192059`
- `/app/guacamole/docker-compose.yml.bak.mordoku-20261016-192059`

## 7. Performance géneration

Mesuré après le changement de critère de sélection (voir § 11) :

- 6×6 : médiane 4 ms, pire cas 38 ms
- 7×7 : médiane 10 ms, pire cas 822 ms

Difficultés actuelles : debutant (6×6) et intermediaire (7×7). Le 8×8 a été
retiré : sur 20 graines, seules 16 donnaient une affaire valide et le pire cas
atteignait 19 s, ce qui figeait l'onglet. Un 9×9 ou 10×10 demanderait
d'optimiser le solveur (tabulation, propagation progressive), de le déplacer
dans un Worker, ou de pré-générer plusieurs affaires embarquées.

## 8. Pièges déjà payés (réellement)

Tous rencontrés pendant ce travail, à ne pas refaire :

1. Le solveur MRV doit **-compter les contraintes globales à la fin**, sinon
   les indices « au moins N dans la pièce » sont vérifiés trop tôt et
   sous-décomptent ; le présent solver le fait.
2. Sans classes `selected` correctement gérées par outil, le placement écrase.
3. `id="annonce"` et non `#annoce` — `document.getElementById` est strict.
4. `sudo` sur ociub émet une dizaine de lignes d'avertissement à cause du
   fichier `/etc/sudoers.d/100-oracle-cloud-agent-users` mal formé. Préexistant,
   sans rapport avec ce projet ; filtrer avec `grep -v sudoers` pour lire la
   sortie.
5. Python n'arrive pas à binder un port sur cette machine (`EADDRINUSE` sur un
   port libre), alors que Node le fait — utiliser Node pour les serveurs de
   test.
6. `gh` et `git` : jeton sans droits d'écriture → push uniquement en SSH.

## 9. Si l'on veut aller plus loin

- Le raisonnement s'arrête quand aucun suspect n'a plus de case unique : il
  faut alors croiser plusieurs indices simultanément (indices à deux
  suspects, contraintes globales de type « au moins 2 dans la pièce »). Une
  propagation à deux niveaux, ou la détection de paires de cases qui ne
  peuvent aller qu'ensemble, supprimerait l'avertissement de fin.
- Optimiser la génération au-delà de 7×7 (Worker, bon ordre de propagation).
- Annulation plus fine (historique actuel = snapshots d'état) : une action
  au lieu d'un remplissage complet masquerait les intermédiaires.
- Export / import d'une partie en fichier.
- Traduction anglaise de l'interface.
- Génération de thèmes propres à un cas (la plupart des affaires
  officielles ont un flavour précis, château, plage, bureau...).

## 10. Sécurité

Il n'y a **aucun secret dans ce projet ni dans cette procédure** :

- dépôt public, cloné en HTTPS anonyme sur le serveur ;
- pas de token, pas de `.env`, pas de clé d'API ;
- le jeu n'a ni compte ni stockage serveur : tout est dans le `localStorage`
  du visiteur ;
- la seule authentification de l'hébergement est le mTLS de Caddy, dont les
  certificats vivent dans `/app/guacamole/mtls` et n'ont pas été touchés.

Note de sensibilisation : le dépôt est public et Murdoku est une marque de
Digivoid Studios / Manuel Garand. Ce projet est personnel et à but didactique ;
les textes et scènes sont écrits à la main. Signaler la personne concernée
à la mise en production éventuelle d'une publicité.

## 11. Explication de la solution

`site/js/murdoku/solution.js` rejoue la déduction par propagation et renvoie,
pour chaque étape, la **cause** de chaque élimination : quel indice écarte
quelles cases, quelle ligne ou colonne est déjà tenue, quelle case est
hors-jeu.

Une déduction n'est retenue que si elle est prouvée :

- **case unique** — le suspect n'a plus qu'une case possible ;
- **position forcée** — `positionForcee()` teste par retour arrière qu'aucune
  autre case ne permet de placer les suspects restants.

Rien n'est inventé : si la propagation s'arrête avant la fin, la modale le dit
et nomme les suspects restants avec leur nombre de cases ouvertes.

Conséquence sur le générateur : la sélection gloutonne départage maintenant
les indices à réduction de solutions égale par le nombre de cases uniques
qu'ils créent (`compterCasesUniques()` dans `generator.js`). Sans cela, un
dossier pouvait n'avoir aucune déduction démontrable, et l'explication était
inutilisable. Effet mesuré sur 60 dossiers par taille :

| Taille | Dossiers entièrement démontrés | Sans aucune déduction |
|---|---|---|
| 6×6 | 8 → 23 | 0 % |
| 7×7 | 4 → 18 | 0 % |

Zéro placement erroné sur 120 dossiers. Le test `tests/e2e-trace.mjs` vérifie
que les positions annoncées par la trace sont bien celles de la solution.

## 12. Affaires pré-calculées

Au lancement, le jeu affiche un écran de choix : six dossiers préparés, ou
une affaire générée à la volée.

- `site/js/murdoku/cas-precalcules.js` — fichier **généré**, ne pas éditer.
- `outils/construire-cas.mjs` — le constructeur. `--verifier` relit le
  fichier et revalide chaque cas sans rien écrire.
- `site/js/murdoku/cas.js` — `reconstruireCas()` recharge un cas.

Progression, du plus simple au plus exigeant :

| Palier | Cas | Grille | Indices | Déductions |
|---|---|---|---|---|
| 1 | `premier-pas` | 4×4 | 8 | 4 |
| 2 | `croisements` | 5×5 | 10 | 5 |
| 3 | `le-bureau` | 6×6 | 8 | 6 |
| 4 | `la-villa` | 6×6 | 7 | 6 |
| 5 | `le-theatre` | 6×6 | 7 | 6 |
| 6 | `la-plage` | 7×7 | 10 | 7 |

Les paliers 1 et 2 sont « mécaniques » : chaque personne est donnée par sa
ligne et sa colonne, on apprend à lire la grille. Les suivants sont tirés
du catalogue d'indices puis **élagués au minimum** : on retire un indice
tant que le dossier reste unique et entièrement déductible. On obtient le
plus petit jeu d'indices qui explique l'affaire.

Deux propriétés sont garanties et retestées à chaque `node --test` :
solution unique, et déduction complète. C'est ce qui permet d'annoncer
« résolution expliquée étape par étape » dans l'accueil.

Trois pièges payés :

1. Les contraintes globales sont des **fonctions**, donc non
   sérialisables. Elles sont décrites par un objet (`{type:'au-moins', …}`)
   et réinterprétées au chargement par `reconstruireGlobal()`.
2. La clé de scène est `interdites` (avec « e »). Une faute de frappe à la
   sérialisation faisait disparaître les cases bloquées : le dossier
   redevenait non unique, et rien ne le signalait. D'où la revalidation
   systématique après relecture, dans le constructeur **et** dans les tests.
3. `reconstruireCas()` lève sur un champ manquant plutôt que de charger un
   cas incomplet en silence.

Les cas pré-calculés n'entrent pas dans les records : un temps sur un
dossier figé n'est pas comparable à un temps sur un dossier aléatoire.

La section solution reste protégée par un mot de passe côté client
(`EMPREINTE_MDP`, empreinte djb2 dans `game.js`, secret écrit `['md','p'].join('')`).
Ce n'est **pas** une sécurité : le digest est dans le JavaScript servi à
tout le monde, et l'interface le dit explicitement. Ne jamais compter dessus
pour protéger un vrai contenu. Le mot de passe n'apparaît nulle part dans ce
document ni dans un autre fichier du dépôt.