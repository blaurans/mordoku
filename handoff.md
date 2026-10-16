# Handoff — Mordoku

Document de reprise. Tout ce qu'il faut pour reprendre le projet ou le
redéployer, sans aucun secret (il n'y en a pas : voir « Sécurité »).

Dernière mise à jour : 2026-10-16, déploiement effectif et vérifié.

---

## 1. Résumé

Jeu de sudoku en HTML/CSS/JS vanilla. Aucune dépendance, aucun build, aucun
compte, aucun backend : tout se joue dans le navigateur.

- **En ligne** : https://mordoku.laurans.org
- **Dépôt** : https://github.com/blaurans/mordoku (public)
- **Clone local** : `~/mordoku`
- **Clone serveur** : `/app/mordoku` sur `ociub`

Fonctionnalités : générateur à solution unique, 4 difficultés, notes,
chrono + records par difficulté, undo/redo, vérification, indice (pénalité
chrono), surbrillance contextuelle, clavier + pavé tactile, sauvegarde
automatique, thème sombre par défaut avec bascule claire.

## 2. État vérifié au déploiement

- `https://mordoku.laurans.org` renvoie 200, certificat valide (ACME
  automatique par Caddy), HTTP/2 et HTTP/3 annoncés.
- En-têtes posés : HSTS, `X-Content-Type-Options`, `Referrer-Policy`,
  `Cache-Control: no-cache`, en-tête `Server` retiré.
- `topps`, `mybooks`, `tempspartiel` : inchangés.
- `bastion.laurans.org` et `charge.laurans.org` : toujours refusés sans
  certificat client — le mTLS strict du Caddy n'a pas été-affaibli.
- 21 tests unitaires (`node --test`) et 50 assertions E2E (`tests/e2e.mjs`)
  passent contre le site déployé.

## 3. Déployer une nouvelle version

Le plus souvent, il n'y a rien de spécial à faire :

```sh
cd ~/mordoku
git pull                 # si le travail a été fait ailleurs
# ... modifier, tester, commiter ...
git push origin main
ssh ociub 'sudo -H git -C /app/mordoku pull'
```

Caddy sert le dossier `site/` du dépôt via un bind mount : les fichiers sont
lus à chaque requête, le `git pull` suffit, il n'y a **ni build ni redémarrage
ni reload à faire**.

Vérifier ensuite :

```sh
curl -sSI https://mordoku.laurans.org/ | head -1
```

## 4. Tester en local

Tests unitaires (logique pure, sans navigateur) :

```sh
cd ~/mordoku && node --test
```

Tests d'interface (Chromium headless piloté en CDP, sans dépendance npm) :

```sh
chromium --headless=new --no-sandbox --remote-debugging-port=9222 \
         --user-data-dir=/tmp/mordoku-chrome about:blank &

# dans un autre terminal
cd ~/mordoku && MORDOKU_URL=https://mordoku.laurans.org/ node tests/e2e.mjs
```

> `tests/e2e.mjs` **vide le localStorage** de l'origine visée : ne pas le
> lancer depuis un profil contenant une partie en cours.

Jouer en local : les modules ES ne se chargent pas en `file://`, il faut un
serveur statique, par exemple `python3 -m http.server` depuis `~/mordoku/site`.
(`python3 -m http.server` échoue pour binder sur cette machine ; un petit
serveur Node marche si besoin.)

## 5. Côté serveur ociub

Connexion : `ssh ociub` (alias `~/.ssh/config`, utilisateur `ubuntu`,
clé `~/.ssh/udi`). `sudo` est disponible **sans mot de passe**.

| Quoi | Où |
|---|---|
| Dépôt du site | `/app/mordoku` (propriétaire `ubuntu:ubuntu`) |
| Racine servie | `/app/mordoku/site` |
| Caddy (frontal TLS de tout l'hébergement) | `/app/guacamole/Caddyfile` |
| Compose du Caddy | `/app/guacamole/docker-compose.yml` |
| Réseau Docker commun | `guacamole_internal` |
| Log d'accès du site | `/app/guacamole/caddy/data/mordoku-access.log` |

Le bloc vhost et la ligne de montage appliqués sont recopiés dans
`deploy/vhost.caddy` et `deploy/compose-snippet.yml`, à comparer avec le
serveur en cas de divergence.

### Ajouter un nouveau vhost statique (procédure)

1. `ssh ociub 'sudo -H git clone https://github.com/<user>/<repo>.git /app/<projet>'`
   — **avant** de modifier le compose : un bind mount vers un chemin absent
   fait créer un répertoire vide root qui masque ensuite le dépôt.
2. Ajouter le bloc de site dans `/app/guacamole/Caddyfile`.
3. Ajouter le montage `- /app/<projet>/site:/srv/<projet>:ro` dans le service
   `caddy` de `docker-compose.yml`.
4. Valider **avant** de toucher à la production :
   ```sh
   sudo docker run --rm \
     -v /app/guacamole/Caddyfile:/etc/caddy/Caddyfile:ro \
     -v /app/guacamole/mtls:/etc/caddy/mtls:ro \
     -e ACME_EMAIL=validation-locale \
     caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
   ```
5. Recréer uniquement Caddy :
   `cd /app/guacamole && sudo docker compose up -d --no-deps caddy`
   → mesuré à 0,6 s. `--no-deps` est important : sans lui, postgres,
   guacamole et guacd repartent aussi.

### Deux façons de modifier le Caddy, deux risques différents

| Modification | Effet | Risque |
|---|---|---|
| Caddyfile seul (`file_server`, en-têtes, `root`) | visible après `caddy reload` | aucun, reload gracieux |
| Ajout d'un montage dans `docker-compose.yml` | exige une recréation du conteneur | **coupe le TLS quelques secondes sur tous les vhosts, `bastion` compris** |

Toujours faire une sauvegarde datée avant d'éditer :

```sh
sudo cp -a /app/guacamole/Caddyfile /app/guacamole/Caddyfile.bak.$(date +%Y%m%d-%H%M%S)
```

### Rollback

Le rollback du 2026-10-16 est déjà sur le serveur :

- `/app/guacamole/Caddyfile.bak.mordoku-20261016-192059`
- `/app/guacamole/docker-compose.yml.bak.mordoku-20261016-192059`

```sh
sudo cp -a /app/guacamole/Caddyfile.bak.mordoku-20261016-192059 /app/guacamole/Caddyfile
sudo cp -a /app/guacamole/docker-compose.yml.bak.mordoku-20261016-192059 /app/guacamole/docker-compose.yml
cd /app/guacamole && sudo docker compose up -d --no-deps caddy
```

Pour revenir au dernier Caddyfile valide sans recréer le conteneur :

```sh
sudo docker exec guacamole-caddy-1 caddy reload --config /etc/caddy/Caddyfile
```

## 6. Pièges déjà payés

À relire avant toute modification, tous ont coûté du temps :

1. **`index` n'existe pas en Caddy 2** — c'est de la syntaxe Caddy 1 et ça
   fait échouer `caddy validate`. `file_server` sert déjà `index.html`.
2. **Un seul bloc `header` par site** — Caddy refuse les directives
   dupliquées, il faut regrouper HSTS, `nosniff`, `Cache-Control` et `-Server`
   dans le même bloc.
3. **`sudo` sur ociub est bruyant** : un fichier sudoers mal formé
   (`/etc/sudoers.d/100-oracle-cloud-agent-users`) émet une dizaine de lignes
   d'avertissement avant chaque sortie. Préexistant, sans rapport avec ce
   projet — filtrer avec `grep -v sudoers` si on veut une sortie lisible.
4. **Le remote Git est en SSH**, pas en HTTPS : le jeton `gh` présent sur la
   machine n'a pas les droits d'écriture sur ce dépôt (erreur 403). Le push
   passe par `git@github.com:blaurans/mordoku.git`, qui fonctionne.
5. **Aucune identité git globale** sur cette machine. Elle est définie au
   niveau du dépôt (`blaurans <blaurans@gmail.com>`), comme dans `~/veille`.
6. **Python n'arrive pas à binder un port** sur cette machine (`EADDRINUSE`
   sur un port libre) alors que Node le fait. Utiliser un serveur Node pour
   les tests en local.

## 7. Architecture du code

```
site/js/sudoku.js   logique pure : solveur, générateur, tables de voisinage
site/js/storage.js  persistance localStorage (partie, records, thème, notes)
site/js/game.js     état, rendu, clavier, tactile, undo/redo, sauvegarde
site/css/style.css  thème sombre (défaut) / clair via data-theme
site/index.html     structure, sans script inline
```

`sudoku.js` ne touche ni au DOM ni au stockage : c'est ce qui permet de le
tester sous Node. Représentation : un `Uint8Array` de 81 cases,
`index = ligne * 9 + colonne`, `0` = vide.

Trois pièges de logique corrigés en cours de route, à ne pas réintroduire :

- `PEERS` doit être construit **après** le remplissage de
  `ROW_OF`/`COL_OF`/`BOX_OF`, jamais pendant.
- Le backtracking annule ses affectations en remontant : la solution doit
  être capturée à la feuille, sinon `solve()` renvoie une grille vide.
- `countSolutions()` doit tester `hasInvalidGivens()` avant de chercher, sinon
  une grille déjà contradictoire déclenche une explosion combinatoire.

## 8. Sécurité

Il n'y a **aucun secret dans ce projet ni dans cette procédure** :

- le dépôt est public, cloné en HTTPS anonyme sur le serveur ;
- pas de token, pas de `.env`, pas de clé d'API ;
- le jeu n'a ni compte ni stockage serveur : tout est dans le `localStorage`
  du visiteur ;
- la seule authentification de l'hébergement est le mTLS de Caddy, dont les
  certificats vivent dans `/app/guacamole/mtls` et n'ont pas été touchés.

Point de vigilance : `sudo` est sans mot de passe sur ce serveur. C'est un
choix d'exploitation existant, à garder en tête avant d'y ajouter des
services.

## 9. Si l'on veut aller plus loin

- Classement de difficultés dans le générateur : aujourd'hui le seul critère
  est le nombre d'indices conservés (40 / 34 / 28 / 24), `difficile` et
  `expert` étant en plus symétriques.
- Export / import d'une partie en fichier.
- Journalisation des erreurs au lieu du simple compteur (le compteur `Erreurs`
  ne compte que les erreurs révélées par « Vérifier »).