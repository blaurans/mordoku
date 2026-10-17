/**
 * Mordoku — moteur de raisonnement.
 *
 * Rejoue la déduction par propagation de contraintes et renvoie, pour
 * chaque étape, la **cause précise** de chaque élimination : quel indice
 * écarte quelles cases, quelle ligne ou colonne déjà prise, et pourquoi il
 * ne reste qu'une position.
 *
 * Rien n'est inventé. Une déduction n'est retenue que si elle est prouvée :
 * soit le suspect n'a plus qu'une case possible, soit sa position est la
 * seule qui rende l'affaire soluble — ce dernier point étant testé par
 * appariement.
 */

import { avecArticle } from './scene.js';

function ligne(cellule, N) {
  return Math.floor(cellule / N);
}

function colonne(cellule, N) {
  return cellule % N;
}

function nom(scene, p) {
  return scene.noms ? scene.noms[p] : scene.lettres[p];
}

/** « L3 C5 », format court, tel que le joueur compte les lignes et colonnes. */
export function position(scene, cellule) {
  const N = scene.taille;
  return `L${ligne(cellule, N) + 1} C${colonne(cellule, N) + 1}`;
}

function casesInterdites(scene) {
  return new Set((scene.interdites ?? []).map((i) => i.cellule));
}

export function nomInterdit(scene, cellule) {
  const trouve = (scene.interdites ?? []).find((i) => i.cellule === cellule);
  return trouve ? avecArticle(trouve) : 'case interdite';
}

/**
 * Analyse complète des contraintes qui s'appliquent à un suspect, avec le
 * détail de ce que chaque règle élimine.
 *
 * @returns {{
 *   candidates: number[],
 *   sesIndices: Array<{indice, titre, mot, garde: number[], eliminees: number[]}>,
 *   autresIndices: Array<{indice, titre, auteur, garde: number[], eliminees: number[]}>,
 *   lignesPrises: Array<{par, ligne}>,
 *   colonnesPrises: Array<{par, colonne}>,
 *   interdites: number[],
 * }}
 */
function analyser(scene, indices, placement, p) {
  const N = scene.taille;
  const total = N * N;
  const restants = new Set();
  for (let c = 0; c < total; c++) restants.add(c);

  const interdites = [];
  for (const c of casesInterdites(scene)) {
    if (restants.delete(c)) interdites.push(c);
  }

  const sesIndices = [];
  const autresIndices = [];

  for (const indice of indices ?? []) {
    const masque = indice.masques && indice.masques[p];
    if (!masque) continue; // cet indice ne parle pas de ce suspect

    const avant = [...restants];
    const eliminees = [];
    for (const c of avant) {
      if (!masque[c]) { restants.delete(c); eliminees.push(c); }
    }
    if (!eliminees.length) continue;

    // Ce que l'indice laisse debout compte souvent plus que ce qu'il écarte :
    // un indice qui réduit 20 cases à 3 est le cœur du raisonnement.
    const garde = avant.filter((c) => masque[c]);

    const texte = indice.titre.replace(/^«\s*/, '').replace(/\s*»$/, '');
    if ((indice.sujets ?? []).includes(p)) {
      sesIndices.push({ indice, titre: texte, mot: p, eliminees, garde });
    } else {
      // Un indice posé sur quelqu'un d'autre élimine aussi des cases ici.
      const sujets = indice.sujets ?? [];
      const auteur = sujets.map((q) => nom(scene, q)).join(' et ');
      autresIndices.push({ indice, titre: texte, auteur, sujets, eliminees, garde });
    }
  }

  const lignesPrises = [];
  const colonnesPrises = [];
  for (let q = 0; q < N; q++) {
    if (placement[q] === -1) continue;
    const L = ligne(placement[q], N);
    const C = colonne(placement[q], N);
    lignesPrises.push({ par: nom(scene, q), ligne: L });
    colonnesPrises.push({ par: nom(scene, q), colonne: C });
    for (const c of [...restants]) {
      if (ligne(c, N) === L || colonne(c, N) === C) restants.delete(c);
    }
  }

  return {
    candidates: [...restants].sort((a, b) => a - b),
    sesIndices,
    autresIndices,
    lignesPrises,
    colonnesPrises,
    interdites,
  };
}

/**
 * Existe-t-il une complétion dans laquelle le suspect `p` n'est PAS en
 * `cellule` ? Si non, cette position est forcée.
 */
function positionForcee(candidats, placement, N, p, cellule) {
  const ordre = [];
  for (let i = 0; i < N; i++) if (placement[i] === -1 && i !== p) ordre.push(i);
  ordre.sort((a, b) => candidats[a].size - candidats[b].size);

  const libre = (c) => {
    for (let r = 0; r < N; r++) {
      if (placement[r] === -1) continue;
      if (ligne(c, N) === ligne(placement[r], N) || colonne(c, N) === colonne(placement[r], N)) return false;
    }
    return true;
  };

  const essai = (k) => {
    if (k === ordre.length) return true;
    const q = ordre[k];
    for (const c of candidats[q]) {
      // Les autres suspects ont le droit de prendre la case testée :
      // c'est justement ce qu'on cherche à savoir.
      if (!libre(c)) continue;
      placement[q] = c;
      if (essai(k + 1)) { placement[q] = -1; return true; }
      placement[q] = -1;
    }
    return false;
  };

  return !essai(0);
}

/**
 * @returns {{etapes: Array, complet: boolean, placement: number[]}}
 */
export function deduire(scene, indices) {
  const N = scene.taille;
  const placement = new Array(N).fill(-1);
  const etapes = [];

  // Candidats de départ : les cases que les indices ne touchent pas encore,
  // mis à jour à chaque placement.
  const candidats = Array.from({ length: N }, (_, p) => {
    const ensemble = new Set();
    for (let c = 0; c < N * N; c++) {
      if (casesInterdites(scene).has(c)) continue;
      let ok = true;
      for (const indice of indices ?? []) {
        const m = indice.masques && indice.masques[p];
        if (m && !m[c]) { ok = false; break; }
      }
      if (ok) ensemble.add(c);
    }
    return ensemble;
  });

  const libre = (c) => {
    for (let r = 0; r < N; r++) {
      if (placement[r] === -1) continue;
      if (ligne(c, N) === ligne(placement[r], N) || colonne(c, N) === colonne(placement[r], N)) return false;
    }
    return true;
  };

  let bouge = true;
  while (bouge) {
    bouge = false;

    for (let p = 0; p < N; p++) {
      if (placement[p] !== -1) continue;
      const dispo = [...candidats[p]].filter(libre).sort((a, b) => a - b);

      if (dispo.length === 0) {
        return {
          etapes,
          complet: false,
          placement,
          impasse: nom(scene, p),
          restants: etatRestants(scene, N, placement, candidats, libre),
        };
      }

      let choisi = null;
      let regle = null;

      if (dispo.length === 1) {
        choisi = dispo[0];
        regle = 'case-unique';
      } else {
        for (const c of dispo) {
          if (positionForcee(candidats, placement, N, p, c)) { choisi = c; regle = 'position-forcee'; break; }
        }
      }

      if (choisi === null) continue;

      const detail = analyser(scene, indices, placement, p);
      placement[p] = choisi;
      bouge = true;

      etapes.push({
        type: regle,
        regle,
        personne: p,
        cellule: choisi,
        candidates: dispo,
        detail,
        titre: regle === 'case-unique'
          ? 'Case unique'
          : 'Position forcée',
      });
    }
  }

  return {
    etapes,
    complet: placement.every((c) => c !== -1),
    placement,
    restants: etatRestants(scene, N, placement, candidats, libre),
  };
}

/**
 * Qui reste à placer, et combien de cases lui restent. Sert à dire
 * honnêtement où la propagation s'arrête, au lieu de prétendre savoir
 * expliquer la fin de l'affaire.
 */
function etatRestants(scene, N, placement, candidats, libre) {
  const liste = [];
  for (let p = 0; p < N; p++) {
    if (placement[p] !== -1) continue;
    const dispo = [...candidats[p]].filter(libre).sort((a, b) => a - b);
    liste.push({ personne: p, nom: nom(scene, p), cellules: dispo });
  }
  return liste;
}