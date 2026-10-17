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

function genererPlacement(scene, random, echeance = Infinity) {
  const N = scene.taille;
  const interdites = new Set((scene.interdites ?? []).map((x) => x.cellule));
  const placement = new Int16Array(N).fill(-1);
  const personnageUtilise = new Uint8Array(N);
  const ligneUtilisee = new Uint8Array(N);
  const colonneUtilisee = new Uint8Array(N);
  let noeuds = 0;

  const ordre = Array.from({ length: N }, (_, i) => i).sort(() => random() - 0.5);

  let trouve = false;

  function chercher() {
    if (trouve) return true;
    // Même garde-fou que le solveur : un placement peut explorer un arbre
    // combinatoire déraisonnable sur les grandes grilles.
    if ((++noeuds & 255) === 0 && Date.now() > echeance) return false;
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

/**
 * Nombre de suspects qui n'ont plus qu'une case possible, et suspects qui
 * n'en ont plus aucune (une impasse : l'indice est inutile).
 *
 * C'est ce chiffre qui rend une déduction démontrable en une ligne. À
 * réduction de solutions égale, on préfère l'indice qui en crée le plus :
 * le dossier se résout alors par une succession de déductions visibles,
 * plutôt qu'en devinant des combinaisons.
 */
function compterCasesUniques(scene, masques) {
  const N = scene.taille;
  const interdites = new Set((scene.interdites ?? []).map((x) => x.cellule));
  let uniques = 0;
  let impasses = 0;
  for (let p = 0; p < N; p++) {
    const m = masques[p];
    let libres = 0;
    for (let c = 0; c < N * N; c++) {
      if (interdites.has(c)) continue;
      if (m && !m[c]) continue;
      libres++;
    }
    if (libres === 1) uniques++;
    else if (libres === 0) impasses++;
  }
  return { uniques, impasses };
}

/** Comparaison lexicographique de deux critères de sélection. */
function comparerCles(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
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

/**
 * Sélection gloutonne des indices : à chaque tour on retient celui qui
 * réduit le plus le nombre de solutions restantes. `echeance` permet
 * d'abandonner une piste trop coûteuse plutôt que de figer le jeu.
 */
export function selectionnerIndices(scene, candidats, arrangement, random, echeance) {
  const N = scene.taille;
  const selection = [];
  let masquesActuels = Array(N).fill(null);
  let globalesActuelles = [];

  const pool = candidats.slice();
  let garde = 0;
  while (selection.length < 22 && garde < 900) {
    garde++;
    // Budget temps : sur certaines grilles, une sélection peut partir
    // dans des millions de nœuds. Plutôt que de figer l'onglet, on
    // abandonne et l'appelant retentera avec une autre graine.
    if (Date.now() > echeance) break;
    const solsActuels = compterSolutions(
      scene,
      masquesActuels,
      globalesActuelles,
      200,
      echeance,
    );
    if (solsActuels <= 1) break;
    if (solsActuels === 0) break;

    let meilleur = -1;
    let meilleureCle = null;

    // On ne teste qu'un échantillon de 6 indices par tour, pour que la
    // génération reste fluide sur les grandes grilles.
    const indicesATest = Array.from(pool.keys()).sort(() => random() - 0.5).slice(0, 6);

    for (const i of indicesATest) {
      if (Date.now() > echeance) return selection;
      const c = pool[i];
      const trialMasks = masquesActuels.map((m, p) =>
        combinerMasques(m, c.masques ? c.masques[p] : null),
      );
      const trialGlobales = [...globalesActuelles, ...(c.global ? [c.global] : [])];
      const sols = compterSolutions(scene, trialMasks, trialGlobales, 200, echeance);
      if (sols <= 0) continue;

      // À réduction égale, on prend l'indice qui fabrique le plus de cases
      // uniques : c'est ce qui rend la déduction démontrable au joueur.
      const { uniques, impasses } = compterCasesUniques(scene, trialMasks);
      const cle = [sols, impasses, -uniques, specificite(c, scene)];

      if (meilleureCle === null || comparerCles(cle, meilleureCle) < 0) {
        meilleureCle = cle;
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

export function genererAffaireAuHasard(taille, seedBase = 1, budgetMs = 6000) {
  const debut = Date.now();
  let seed = seedBase;
  for (let n = 0; n < 6; n++) {
    const affaire = genererAffaire(taille, seed, null, debut + budgetMs);
    if (affaire) return affaire;
    seed += 1;
    if (Date.now() - debut > budgetMs) return null;
  }
  return null;
}

export function genererAffaire(taille, seed, theme, echeance = Date.now() + 4000) {
  const random = createRandom(seed);
  let fond = theme;
  if (!fond) {
    fond = THEMES_DISTINCT[Math.floor(random() * THEMES_DISTINCT.length)];
  }

  for (let essaiScene = 0; essaiScene < 50; essaiScene++) {
    if (Date.now() > echeance) return null;
    const scene = genererScene(taille, fond, random);
    for (let essaiPlace = 0; essaiPlace < 80; essaiPlace++) {
      if (Date.now() > echeance) return null;
      const placement = genererPlacement(scene, random, echeance);
      if (!placement) continue;

      const candidats = candidatsFabriques(scene, placement.arrangement, random);
      if (!candidats.length) continue;

      const selection = selectionnerIndices(scene, candidats, placement.arrangement, random, echeance);

      // Vérifier unicité et solution de référence.
      const masques = construireMasques(scene, selection);
      const globales = selection.map((c) => c.global).filter(Boolean);
      if (compterSolutions(scene, masques, globales, 2, echeance) !== 1) continue;
      const solution = resoudrePlacement(scene, masques, globales, echeance);
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