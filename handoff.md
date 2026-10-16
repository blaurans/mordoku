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

- 6×6 : ~15 ms
- 7×7 : ~100 ms
- 8×8 : ~4 s (générateur complet, unique)

Au-delà de 8×8, le comptage des solutions reste trop lent dans le navigateur
(pas de Worker, ui synchronisée). Difficultés actuelles : debutant/facile/
intermédiaire. L'ajout d'une difficulté 9×9 ou 10×10 demande soit l'optimisation
du solveur (tabulation, propagation progressive), soit la pré-generation
de plusieurs affaires embarquées.

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

- Optimiser la génération au-delà de 8×8 (Worker, bon ordre de propagation).
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