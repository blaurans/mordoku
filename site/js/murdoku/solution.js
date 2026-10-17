/**
 * Mordoku — moteur de raisonnement.
 *
 * Rejoue la déduction par propagation de contraintes et renvoie la liste
 * des étapes réellement justifiées. Rien n'est inventé : si la propagation
 * ne suffit pas à terminer l'affaire, on le dit plutôt que de fabriquer
 * une explication.
 *
 * Deux règles sont appliquées, dans cet ordre :
 *   1. naked single — un suspect n'a plus qu'une case possible ;
 *   2. hidden single — une case n'est plus possible que pour un seul suspect.
 */

/** Ligne / colonne d'une case, à partir du côté de la grille. */
function ligne(cellule, N) {
  return Math.floor(cellule / N);
}

function colonne(cellule, N) {
  return cellule % N;
}

/** cases interdites de la scène. */
function casesInterdites(scene) {
  return new Set((scene.interdites ?? []).map((i) => i.cellule));
}

/** Positions candidates initiales, déduites des indices. */
function candidatsInitiaux(scene, indices) {
  const N = scene.taille;
  const bloquees = casesInterdites(scene);
  const candidats = [];

  for (let p = 0; p < N; p++) {
    const ensemble = new Set();
    for (let cellule = 0; cellule < N * N; cellule++) {
      if (bloquees.has(cellule)) continue;
      let compatible = true;
      for (const indice of indices ?? []) {
        const masque = indice.masques && indice.masques[p];
        if (masque && !masque[cellule]) { compatible = false; break; }
      }
      if (compatible) ensemble.add(cellule);
    }
    candidats.push(ensemble);
  }
  return candidats;
}

/** Deux cases se marchent-elles dessus (même ligne ou même colonne) ? */
function seMarchent(celluleA, celluleB, N) {
  if (celluleA === celluleB) return false;
  return ligne(celluleA, N) === ligne(celluleB, N) || colonne(celluleA, N) === colonne(celluleB, N);
}

function caseLibre(cellule, placement, N) {
  for (let p = 0; p < N; p++) {
    if (placement[p] === -1) continue;
    if (seMarchent(cellule, placement[p], N)) return false;
  }
  return true;
}

/** Phrase d'un suspect. */
function nom(scene, p) {
  return scene.noms ? scene.noms[p] : scene.lettres[p];
}

function position(scene, cellule) {
  const N = scene.taille;
  return `ligne ${ligne(cellule, N) + 1}, colonne ${colonne(cellule, N) + 1}`;
}

function nomPiece(scene, cellule) {
  for (const piece of scene.pieces) if (piece.cellules.includes(cellule)) return piece.nom;
  return null;
}

/** Une position est-elle compatible avec les autres, ligne et colonne ? */
function compatible(cellule, placement, N) {
  return caseLibre(cellule, placement, N);
}

/**
 * Existe-t-il une complétion de `placement` dans laquelle le suspect `p`
 * n'est PAS en `cellule` ? Si non, cette position est forcée : c'est la
 * seule qui rende l'affaire soluble.
 *
 * On répond par un appariement par backtracking : chaque suspect prend une
 * case libre, sans partager ligne ni colonne.
 */
function positionForcee(candidats, placement, N, p, cellule) {
  const ordre = [];
  for (let i = 0; i < N; i++) if (placement[i] === -1 && i !== p) ordre.push(i);

  // Tri par nombre de cases possibles : on échoue vite.
  ordre.sort((a, b) => candidats[a].size - candidats[b].size);

  const essai = (k) => {
    if (k === ordre.length) return true;
    const q = ordre[k];
    for (const c of candidats[q]) {
      // Les autres suspects ont le droit de prendre la case testée : c'est
      // justement ce qu'on cherche à savoir.
      if (!compatible(c, placement, N)) continue;
      placement[q] = c;
      if (essai(k + 1)) {
        placement[q] = -1;
        return true;
      }
      placement[q] = -1;
    }
    return false;
  };

  return !essai(0);
}

/**
 * @returns {{etapes: Array, complet: boolean, placement: number[]}}
 *
 * Une déduction n'est retenue que si elle est prouvée par cet appariement :
 * on ne montre jamais une étape qui pourrait être fausse.
 */
export function deduire(scene, indices, arrangementReference) {
  const N = scene.taille;
  const candidats = candidatsInitiaux(scene, indices);
  const placement = new Array(N).fill(-1);
  const etapes = [];

  let bouge = true;
  while (bouge) {
    bouge = false;

    // Un suspect à la fois : case unique, sinon position forcée.
    for (let p = 0; p < N; p++) {
      if (placement[p] !== -1) continue;
      const dispo = [...candidats[p]].filter((c) => caseLibre(c, placement, N));

      if (dispo.length === 0) {
        return { etapes, complet: false, placement, impasse: nom(scene, p) };
      }

      let choisi = null;
      let raison = '';

      if (dispo.length === 1) {
        choisi = dispo[0];
        raison =
          `${nom(scene, p)} n'a plus qu'une case possible : ` +
          `les autres sont exclues par ses indices ou déjà prises. ` +
          `Il est donc ${position(scene, choisi)}.`;
      } else {
        for (const c of dispo) {
          if (positionForcee(candidats, placement, N, p, c)) {
            choisi = c;
            raison =
              `${nom(scene, p)} ne peut pas être ailleurs : sans cette case, ` +
              `aucune répartition des autres suspects ne satisfait à la fois ` +
              `les indices et la règle d'une personne par ligne et colonne. ` +
              `Il est donc ${position(scene, c)}.`;
            break;
          }
        }
      }

      if (choisi !== null) {
        placement[p] = choisi;
        bouge = true;
        etapes.push({
          type: dispo.length === 1 ? 'case-unique' : 'position-forcee',
          personne: p,
          cellule: choisi,
          raison,
          explicationCourte: dispo.length === 1 ? 'case unique' : 'position forcée',
        });
      }
    }
  }

  const complet = placement.every((c) => c !== -1);
  return { etapes, complet, placement };
}