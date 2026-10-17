/**
 * Mordoku — solveur par retour arrière.
 *
 * Compte les solutions aux contraintes (personnes, masques par personne,
 * contraintes globales), avec plafond pour ne pas exploser sur les cas
 * difficiles. Utilisé par le générateur pour garantir l'unicité.
 */

/**
 * @param {object} scene
 * @param {Array<|message|>Uint8Array>} masques  indexé par personne, chaque valeur est
 *   un Uint8Array de taille taille×taille ou null (toutes les cases).
 * @param {Array<function(Uint16Array, scene): boolean>|null} globales
 * @param {number} limite   plafond de solutions à compter
 */
export function compterSolutions(scene, masques, globales, limite = 10000, echeance = Infinity) {
  const N = scene.taille;
  const taille2 = N * N;
  const interdites = new Set((scene.interdites ?? []).map((x) => x.cellule));
  const limiteEffective = Math.max(1, limite);
  let noeuds = 0;

  const masqueDe = masques.map((m, i) => (m ? m : plein(taille2)));

  const candidats = Array.from({ length: N }, (_, p) =>
    precalculerCandidates(p, N, masqueDe[p], interdites),
  );

  const personnageUtilise = new Uint8Array(N);
  const ligneUtilisee = new Uint8Array(N);
  const colonneUtilisee = new Uint8Array(N);
  const attribution = new Int16Array(N).fill(-1);

  let compte = 0;

  function verifierGlobales() {
    if (!globales) return true;
    for (const global of globales) if (!global(attribution, scene)) return false;
    return true;
  }

  function chercher(personnesRestantes) {
    if (compte >= limiteEffective) return;
    // Vérification périodique du budget : sans cela, un seul appel peut
    // explorer des millions de nœuds et figer l'onglet du navigateur.
    if ((++noeuds & 511) === 0 && Date.now() > echeance) return;
    if (personnesRestantes === 0) {
      if (verifierGlobales()) compte++;
      return;
    }

    // MRV sur les personnes restantes.
    let p = -1;
    let minOptions = Infinity;
    let disponible = null;
    for (let i = 0; i < N; i++) {
      if (personnageUtilise[i]) continue;
      let options = 0;
      const liste = [];
      for (const cellule of candidats[i]) {
        const l = Math.floor(cellule / N);
        const c = cellule % N;
        if (ligneUtilisee[l] || colonneUtilisee[c]) continue;
        liste.push(cellule);
        options++;
      }
      if (options < minOptions) {
        minOptions = options;
        p = i;
        disponible = liste;
      }
      if (minOptions === 0) break;
    }

    if (minOptions === 0) return; // impasse

    for (const cellule of disponible) {
      const l = Math.floor(cellule / N);
      const c = cellule % N;
      attribution[p] = cellule;
      personnageUtilise[p] = 1;
      ligneUtilisee[l] = 1;
      colonneUtilisee[c] = 1;
      chercher(personnesRestantes - 1);
      attribution[p] = -1;
      personnageUtilise[p] = 0;
      ligneUtilisee[l] = 0;
      colonneUtilisee[c] = 0;
      if (compte >= limiteEffective) return;
    }
  }

  chercher(N);
  return compte;
}

/** Résout la solution d'une attribution (déterministe : première trouvée). */
export function resoudrePlacement(scene, masques, globales, echeance = Infinity) {
  const N = scene.taille;
  const interdites = new Set((scene.interdites ?? []).map((x) => x.cellule));
  const masqueDe = masques.map((m) => (m ? m : plein(N * N)));
  const candidats = Array.from({ length: N }, (_, p) =>
    precalculerCandidates(p, N, masqueDe[p], interdites),
  );

  const personnageUtilise = new Uint8Array(N);
  const ligneUtilisee = new Uint8Array(N);
  const colonneUtilisee = new Uint8Array(N);
  const attribution = new Int16Array(N).fill(-1);

  let solution = null;
  let noeuds = 0;

  function chercher(personnesRestantes) {
    if (solution) return;
    if ((++noeuds & 511) === 0 && Date.now() > echeance) return;
    if (personnesRestantes === 0) {
      if (!globales || globales.every((g) => g(attribution, scene))) {
        solution = Array.from(attribution);
      }
      return;
    }
    let p = -1;
    let minOptions = Infinity;
    let disponible = null;
    for (let i = 0; i < N; i++) {
      if (personnageUtilise[i]) continue;
      let options = 0;
      const liste = [];
      for (const cellule of candidats[i]) {
        const l = Math.floor(cellule / N);
        const c = cellule % N;
        if (ligneUtilisee[l] || colonneUtilisee[c]) continue;
        liste.push(cellule);
        options++;
      }
      if (options < minOptions) {
        minOptions = options;
        p = i;
        disponible = liste;
      }
      if (minOptions === 0) break;
    }
    if (minOptions === 0) return;
    for (const cellule of disponible) {
      const l = Math.floor(cellule / N);
      const c = cellule % N;
      attribution[p] = cellule;
      personnageUtilise[p] = 1;
      ligneUtilisee[l] = 1;
      colonneUtilisee[c] = 1;
      chercher(personnesRestantes - 1);
      if (solution) return;
      attribution[p] = -1;
      personnageUtilise[p] = 0;
      ligneUtilisee[l] = 0;
      colonneUtilisee[c] = 0;
    }
  }
  chercher(N);

  if (!solution || !estAssignmentValide(solution, scene, masqueDe, interdites)) return null;
  return solution;
}

function estAssignmentValide(attribution, scene, masqueDe, interdites) {
  const N = scene.taille;
  const lignesVues = new Set();
  const colsVues = new Set();
  for (let p = 0; p < N; p++) {
    const cell = attribution[p];
    if (cell < 0 || cell >= N * N) return false;
    if (interdites.has(cell)) return false;
    const l = Math.floor(cell / N);
    const c = cell % N;
    if (lignesVues.has(l) || colsVues.has(c)) return false;
    lignesVues.add(l);
    colsVues.add(c);
    if (!masqueDe[p][cell]) return false;
  }
  return true;
}

function precalculerCandidates(p, N, masque, interdites) {
  const result = [];
  for (let cell = 0; cell < N * N; cell++) {
    if (masque[cell] && !interdites.has(cell)) result.push(cell);
  }
  return result;
}

function plein(n) {
  const m = new Uint8Array(n);
  m.fill(1);
  return m;
}