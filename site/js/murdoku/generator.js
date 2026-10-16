/**
 * Mordoku — générateur d'affaires.
 */

import { createRandom } from './random.js';
import { THEMES, genererScene, pieceDe } from './scene.js';
import { candidatsFabriques, specificite } from './clues.js';
import { compterSolutions, resoudrePlacement } from './solver.js';

const THEMES_DISTINCT = [...THEMES];

function combinerMasques(a, b) {
  if (!a && !b) return null;
  if (!a) return Uint8Array.from(b);
  if (!b) return Uint8Array.from(a);
  const r = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) r[i] = a[i] && b[i] ? 1 : 0;
  return r;
}

function genererPlacement(scene, random) {
  const N = scene.taille;
  const interdites = new Set((scene.interdites ?? []).map((x) => x.cellule));
  const placement = new Int16Array(N).fill(-1);
  const personnageUtilise = new Uint8Array(N);
  const ligneUtilisee = new Uint8Array(N);
  const colonneUtilisee = new Uint8Array(N);

  const ordre = Array.from({ length: N }, (_, i) => i).sort(() => random() - 0.5);

  let trouve = false;

  function chercher() {
    if (trouve) return true;
    // MRV
    let p = -1;
    let minOptions = Infinity;
    let disponible = null;
    for (const i of ordre) {
      if (personnageUtilise[i]) continue;
      const options = [];
      for (let cellule = 0; cellule < N * N; cellule++) {
        if (interdites.has(cellule)) continue;
        const l = Math.floor(cellule / N);
        const c = cellule % N;
        if (ligneUtilisee[l] || colonneUtilisee[c]) continue;
        options.push(cellule);
      }
      if (options.length < minOptions) {
        minOptions = options;
        p = i;
        disponible = options;
      }
      if (minOptions === 0) break;
    }
    if (minOptions === 0) return false;
    if (minOptions === Infinity) {
      trouve = true;
      return true; // placement terminé
    }

    for (const cellule of disponible.slice().sort(() => random() - 0.5)) {
      const l = Math.floor(cellule / N);
      const c = cellule % N;
      placement[p] = cellule;
      personnageUtilise[p] = 1;
      ligneUtilisee[l] = 1;
      colonneUtilisee[c] = 1;
      const ok = chercher();
      if (ok) {
        if (trouve) return true;
      }
      placement[p] = -1;
      personnageUtilise[p] = 0;
      ligneUtilisee[l] = 0;
      colonneUtilisee[c] = 0;
    }
    return false;
  }

  const ok = chercher();
  if (!ok || !trouve) return null;
  const arrangement = Array.from(placement);

  // chercher une pièce contenant exactement 2 personnes
  const parPiece = new Map();
  for (let p = 0; p < N; p++) {
    const piece = pieceDe(scene, arrangement[p]);
    if (!piece) continue;
    const id = typeof piece === 'number' ? piece : piece.id;
    if (!parPiece.has(id)) parPiece.set(id, []);
    parPiece.get(id).push(p);
  }
  const paire = [...parPiece.values()].find((liste) => liste.length === 2);
  if (!paire) return null;

  let [personneA, personneB] = paire;
  if (random() < 0.5) {
    personneA = paire[1];
    personneB = paire[0];
  }
  // personneA pourra être la victime, personneB le meurtrier (ou inverse)
  const victime = random() < 0.5 ? personneA : personneB;
  const meurtrier = victime === personneA ? personneB : personneA;

  return { arrangement, victime, meurtrier };
}

function verifierClue(clue, scene, arrangement) {
  if (clue.masques) {
    for (let p = 0; p < clue.masques.length; p++) {
      const m = clue.masques[p];
      if (m && !m[arrangement[p]]) return false;
    }
  }
  if (typeof clue.global === 'function') return clue.global(arrangement, scene);
  return true;
}

function selectionnerIndices(scene, candidats, arrangement, random) {
  const N = scene.taille;
  const selection = [];
  let masquesActuels = Array(N).fill(null);
  let globalesActuelles = [];

  const pool = candidats.slice();
  let garde = 0;
  while (selection.length < 14 && garde < 500) {
    garde++;
    const solsActuels = compterSolutions(
      scene,
      masquesActuels,
      globalesActuelles,
      200,
    );
    if (solsActuels <= 1) break;
    if (solsActuels === 0) break;

    let meilleur = -1;
    let meilleureReduction = solsActuels;
    let meilleureSpec = Infinity;

    // On ne teste qu'un échantillon de 6 indices par tour, pour que la
    // génération reste fluide sur les grandes grilles.
    const indicesATest = Array.from(pool.keys()).sort(() => random() - 0.5).slice(0, 6);

    for (const i of indicesATest) {
      const c = pool[i];
      const trialMasks = masquesActuels.map((m, p) =>
        combinerMasques(m, c.masques ? c.masques[p] : null),
      );
      const trialGlobales = [...globalesActuelles, ...(c.global ? [c.global] : [])];
      const sols = compterSolutions(scene, trialMasks, trialGlobales, 200);
      const spec = specificite(c, scene);
      if (sols > 0 && (sols < meilleureReduction || (sols === meilleureReduction && spec < meilleureSpec))) {
        meilleureReduction = sols;
        meilleureSpec = spec;
        meilleur = i;
      }
      if (sols === 1) break;
    }

    if (meilleur < 0) break;
    const c = pool[meilleur];
    selection.push(c);
    masquesActuels = masquesActuels.map((m, p) => combinerMasques(m, c.masques ? c.masques[p] : null));
    if (c.global) globalesActuelles.push(c.global);
    pool.splice(meilleur, 1);
  }

  return selection;
}

export function genererAffaireAuHasard(taille, seedBase = 1) {
  let seed = seedBase;
  for (let n = 0; n < 6; n++) {
    const affaire = genererAffaire(taille, seed, null);
    if (affaire) return affaire;
    seed += 1;
  }
  return null;
}

export function genererAffaire(taille, seed, theme) {
  const random = createRandom(seed);
  let fond = theme;
  if (!fond) {
    fond = THEMES_DISTINCT[Math.floor(random() * THEMES_DISTINCT.length)];
  }

  for (let essaiScene = 0; essaiScene < 50; essaiScene++) {
    const scene = genererScene(taille, fond, random);
    for (let essaiPlace = 0; essaiPlace < 80; essaiPlace++) {
      const placement = genererPlacement(scene, random);
      if (!placement) continue;

      const candidats = candidatsFabriques(scene, placement.arrangement, random);
      if (!candidats.length) continue;

      const selection = selectionnerIndices(scene, candidats, placement.arrangement, random);

      // Vérifier unicité et solution de référence.
      const masques = construireMasques(scene, selection);
      const globales = selection.map((c) => c.global).filter(Boolean);
      if (compterSolutions(scene, masques, globales, 2) !== 1) continue;
      const solution = resoudrePlacement(scene, masques, globales);
      if (!solution) continue;
      let ok = true;
      for (let p = 0; p < solution.length; p++) {
        if (solution[p] !== placement.arrangement[p]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;

      scene.victime = placement.victime;
      scene.meurtrier = placement.meurtrier;

      return {
        scene,
        arrangement: placement.arrangement,
        clues: selection,
        victime: placement.victime,
        meurtrier: placement.meurtrier,
        seed,
        taille,
      };
    }
  }
  return null;
}

function construireMasques(scene, indices) {
  const N = scene.taille;
  const masques = Array.from({ length: N }, () => null);
  for (const indice of indices) {
    if (!indice.masques) continue;
    for (let p = 0; p < N; p++) {
      masques[p] = combinerMasques(masques[p], indice.masques[p]);
    }
  }
  return masques;
}