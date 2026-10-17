/**
 * Mordoku — catalogue d'indices.
 *
 * Chaque indice est présenté sous la forme d'un « objet règles » contenant :
 *  - titre   : formulation française affichée au joueur
 *  - masques : tableau de N masques, un par personne. Un masque est un
 *              Uint8Array de N×N cases (1 = autorisée) ou null si la personne
 *              n'est pas concernée par l'indice.
 *  - global   : fonction (attribution) -> bool, ou null si aucune contrainte
 *              globale (comptage de personnes dans une pièce, par exemple).
 *
 * Les contraintes se comprennent toutes par intersection : un indice par
 * personne restreint où celle-ci peut se tenir ; un indice global ne valide
 * le tableau qu'une fois toutes les cases remplies.
 */

import { avecArticle, avecArticleApres } from './scene.js';

const directions = {
  nord: (l, c, l2, c2) => l > l2 && c === c2,
  sud: (l, c, l2, c2) => l < l2 && c === c2,
  ouest: (l, c, l2, c2) => c > c2 && l === l2,
  est: (l, c, l2, c2) => c < c2 && l === l2,
  nordest: (l, c, l2, c2) => l > l2 && c < c2,
  nordouest: (l, c, l2, c2) => l > l2 && c > c2,
  sudest: (l, c, l2, c2) => l < l2 && c < c2,
  sudouest: (l, c, l2, c2) => l < l2 && c > c2,
};

const nomsDirections = {
  nord: 'au nord',
  sud: 'au sud',
  ouest: "à l'ouest",
  est: "à l'est",
  nordest: 'au nord-est',
  nordouest: 'au nord-ouest',
  sudest: 'au sud-est',
  sudouest: 'au sud-ouest',
};

export const nomsCardinaux = ['nord', 'sud', 'ouest', 'est'];

const TOUS = 4294967295;

/** Masque rempli (toutes les cases autorisées). */
export function masquePlein(N) {
  const masque = new Uint8Array(N * N);
  masque.fill(1);
  return masque;
}

/** Vide : une seule cellule autorisée. */
function masqueCellule(N, index) {
  const m = new Uint8Array(N * N).fill(0);
  m[index] = 1;
  return m;
}

/** Réseau hors de l'ensemble de pièces donné. */
function masquePieceliste(scene, pieceId) {
  const resultat = new Uint8Array(scene.taille * scene.taille).fill(0);
  for (const piece of scene.pieces) {
    if (piece.id === pieceId) continue;
    for (const c of piece.cellules) resultat[c] = 1;
  }
  return resultat;
}

/** Des cellules (indices). */
function masqueIndices(scene, indices) {
  const m = new Uint8Array(scene.taille * scene.taille).fill(0);
  for (const i of indices) if (i >= 0 && i < m.length) m[i] = 1;
  return m;
}

/** Cellules d'une pièce. */
function cellulesPiece(scene, pieceId) {
  const p = scene.pieces.find((x) => x.id === pieceId);
  return p ? p.cellules : [];
}

/** Case adjacente à la cellule donnée (orthogonale). */
function orthogonaux(scene, index) {
  const taille = scene.taille;
  const l = Math.floor(index / taille);
  const c = index % taille;
  const voisins = [];
  if (l > 0) voisins.push(index - taille);
  if (l < taille - 1) voisins.push(index + taille);
  if (c > 0) voisins.push(index - 1);
  if (c < taille - 1) voisins.push(index + 1);
  return voisins;
}

/** Adjacent à un objet (au moins une cellule du voisinage contient cet objet). */
function cellulesAdjacentesA(scene, objet) {
  const resultat = new Uint8Array(scene.taille * scene.taille).fill(0);
  const position = objet.cellule;
  for (const voisin of orthogonaux(scene, position)) {
    resultat[voisin] = 1;
  }
  return resultat;
}

/** Cellules strictement au nord, sud, est ou ouest d'une position. */
function masqueCardinal(scene, personnage, objet, direction) {
  const t = scene.taille;
  const index = objet.cellule;
  const l = Math.floor(index / t);
  const c = index % t;
  const resultat = new Uint8Array(t * t).fill(0);
  if (direction === 'nord') for (let ll = l - 1; ll >= 0; ll--) resultat[ll * t + c] = 1;
  if (direction === 'sud') for (let ll = l + 1; ll < t; ll++) resultat[ll * t + c] = 1;
  if (direction === 'ouest') for (let cc = c - 1; cc >= 0; cc--) resultat[l * t + cc] = 1;
  if (direction === 'est') for (let cc = c + 1; cc < t; cc++) resultat[l * t + cc] = 1;
  return resultat;
}

/** Cellule occupée par un objet quelconque. */
function celluleObjet(scene, idObjet) {
  return scene.objets.find((o) => o.id === idObjet)?.cellule ?? -1;
}


/** Convertit un objet de scène en texte piéce. */
function nomPiece(scene, pieceId) {
  const piece = scene.pieces.find((p) => p.id === pieceId);
  return piece ? piece.nom : 'la pièce';
}

/** Mélange des indices dans les attributs. */
function toCardinal(direction) {
  return nomsDirections[direction];
}

export const Fabriques = [
  // --- indice 1 : à côté d'un objet ---
  (scene, placement, random) => {
    const suspects = scene.lettres.length;
    const personne = Math.floor(random() * suspects);
    const cellule = placement[personne];
    if (caseInterdite(scene, cellule)) return null;
    const l = Math.floor(cellule / scene.taille);
    const c = cellule % scene.taille;
    const objets = scene.objets.filter((o) => {
      const ol = Math.floor(o.cellule / scene.taille);
      const oc = o.cellule % scene.taille;
      return Math.abs(ol - l) + Math.abs(oc - c) === 1;
    });
    if (!objets.length) return null;
    const objet = objets[Math.floor(random() * objets.length)];
    const masques = Array.from({ length: suspects }, (_, i) =>
      i === personne ? cellulesAdjacentesA(scene, objet) : null,
    );
    return { id: `cote-${personne}-${objet.id}`, sujets: [personne], titre: `« ${scene.noms[personne]} est à côté ${avecArticleApres('de', objet)}. »`, masques, global: null };
  },
  // --- indice 2 : cardinal par rapport à un objet ---
  (scene, placement, random) => {
    const suspects = scene.lettres.length;
    const personne = Math.floor(random() * suspects);
    const cellule = placement[personne];
    const l = Math.floor(cellule / scene.taille);
    const c = cellule % scene.taille;
    const objets = scene.objets.filter((o) => {
      const ol = Math.floor(o.cellule / scene.taille);
      const oc = o.cellule % scene.taille;
      for (const d of nomsCardinaux) if (directions[d](l, c, ol, oc)) return true;
      return false;
    });
    if (!objets.length) return null;
    const objet = objets[Math.floor(random() * objets.length)];
    const ol = Math.floor(objet.cellule / scene.taille);
    const oc = objet.cellule % scene.taille;
    let direction = nomsCardinaux.find((d) => directions[d](l, c, ol, oc));
    if (!direction) return null;
    const masque = masqueCardinal(scene, null, objet, direction);
    const masques = Array.from({ length: suspects }, (_, i) =>
      i === personne ? masque : null,
    );
    return { id: `card-${personne}-${objet.id}-${direction}`, sujets: [personne], titre: `« ${scene.noms[personne]} est ${toCardinal(direction)} ${avecArticleApres('de', objet)}. »`, masques, global: null };
  },
  // --- indice 3 : au moins N personnes dans la pièce ---
  (scene, placement, random) => {
    const suspects = scene.lettres.length;
    // choisir une pièce compacte au hasard
    const piece = choisir(scene.pieces, random);
    const compte = placement.filter((cell) => piece.cellules.includes(cell)).length;
    if (compte < 2) return null;
    const seuil = Math.max(2, compte - 1);
    const global = (attribution) => {
      let n = 0;
      for (let p = 0; p < suspects; p++) if (piece.cellules.includes(attribution[p])) n++;
      return n >= seuil;
    };
    return { id: `au-moins-${piece.id}-${seuil}`, sujets: [], titre: `« Au moins ${seuil} personnes dans ${piece.nom}. »`, masques: Array(suspects).fill(null), global };
  },
  // --- indice 4 : la seule personne dans sa pièce (isolé) ---
  (scene, placement, random) => {
    const suspects = scene.lettres.length;
    const cellule = placement[Math.floor(random() * suspects)];
    const piece = scene.pieces.find((p) => p.cellules.includes(cellule));
    if (!piece) return null;
    const Alone = placement.filter((cell) => piece.cellules.includes(cell)).length;
    if (Alone !== 1) return null;
    const personne = placement.indexOf(cellule);
    const masques = Array.from({ length: suspects }, (_, i) => i === personne ? masqueIndices(scene, piece.cellules) : (function () { const m = masquePlein(scene.taille * scene.taille); for (const c of piece.cellules) m[c] = 0; return m; })());
    return { id: `seule-${personne}-${piece.id}`, sujets: [personne], titre: `« ${scene.noms[personne]} est la seule personne dans ${piece.nom}. »`, masques, global: null };
  },
  // --- indice 5 : la seule personne sur un objet ---
  (scene, placement, random) => {
    const suspects = scene.lettres.length;
    const objet = scene.objets[Math.floor(random() * scene.objets.length)];
    const celluleObj = objet.cellule;
    const personne = placement.indexOf(celluleObj);
    if (personne < 0) return null;
    // cette personne doit être la seule à occuper une case portant cet objet
    const tousSur = scene.objets.filter((o) => o.id === objet.id).map((o) => o.cellule);
    if (placement.filter((c) => tousSur.includes(c)).length !== 1) return null;
    const masques = Array.from({ length: suspects }, (_, i) =>
      i === personne ? masqueIndices(scene, tousSur) : null,
    );
    // les autres n'occupent pas cet objet : contrainte globale simple
    const global = (attribution) => {
      const occ = scene.objets.filter((o) => o.id === objet.id).map((o) => o.cellule);
      const count = attribution.filter((cell) => occ.includes(cell)).length;
      return count === 1;
    };
    return { id: `seule-sur-${personne}-${objet.id}`, sujets: [personne], titre: `« ${scene.noms[personne]} est la seule personne sur ${avecArticle(objet)}. »`, masques, global };
  },
  // --- indice 6 : ligne exacte (X est dans la ligne N) ---
  (scene, placement, random) => {
    const suspects = scene.lettres.length;
    const pessoa = Math.floor(random() * suspects);
    const cellule = placement[pessoa];
    const ligne = Math.floor(cellule / scene.taille);
    const masque = new Uint8Array(scene.taille * scene.taille).fill(0);
    for (let c = 0; c < scene.taille; c++) masque[ligne * scene.taille + c] = 1;
    const masques = Array.from({ length: suspects }, (_, i) =>
      i === pessoa ? masque : null,
    );
    return {
      id: `ligne-${pessoa}-${ligne}`,
      sujets: [pessoa],
      titre: `« ${scene.noms[pessoa]} est dans la ligne ${ligne + 1}. »`,
      masques,
      global: null,
    };
  },
  // --- indice 7 : colonne exacte ---
  (scene, placement, random) => {
    const suspects = scene.lettres.length;
    const pessoa = Math.floor(random() * suspects);
    const cellule = placement[pessoa];
    const colonne = cellule % scene.taille;
    const masque = new Uint8Array(scene.taille * scene.taille).fill(0);
    for (let l = 0; l < scene.taille; l++) masque[l * scene.taille + colonne] = 1;
    const masques = Array.from({ length: suspects }, (_, i) =>
      i === pessoa ? masque : null,
    );
    return {
      id: `colonne-${pessoa}-${colonne}`,
      sujets: [pessoa],
      titre: `« ${scene.noms[pessoa]} est dans la colonne ${colonne + 1}. »`,
      masques,
      global: null,
    };
  },
  // --- indice 8 : meme diagonale avec un objet ---
  (scene, placement, random) => {
    const suspects = scene.lettres.length;
    const personne = Math.floor(random() * suspects);
    const cellule = placement[personne];
    const l = Math.floor(cellule / scene.taille);
    const c = cellule % scene.taille;
    // trouve un objet sur la diagonale
    const candidatObjet = scene.objets.find((o) => {
      const ol = Math.floor(o.cellule / scene.taille);
      const oc = o.cellule % scene.taille;
      return Math.abs(ol - l) === Math.abs(oc - c) && ol !== l;
    });
    if (!candidatObjet) return null;
    const ol = Math.floor(candidatObjet.cellule / scene.taille);
    const oc = candidatObjet.cellule % scene.taille;
    // masque : cellules sur la même diagonale que l'objet
    const masque = new Uint8Array(scene.taille * scene.taille).fill(0);
    for (let ll = 0; ll < scene.taille; ll++) {
      for (let cc = 0; cc < scene.taille; cc++) {
        if (Math.abs(ll - ol) === Math.abs(cc - oc)) masque[ll * scene.taille + cc] = 1;
      }
    }
    const masques = Array.from({ length: suspects }, (_, i) =>
      i === personne ? masque : null,
    );
    return {
      id: `diag-${personne}-${candidatObjet.id}`,
      sujets: [personne],
      titre: `« ${scene.noms[personne]} est sur la même diagonale que ${avecArticle(candidatObjet)}. »`,
      masques,
      global: null,
    };
  },
  // --- indice 9 : tableau dans la même zone qu'un autre personnage ---
  (scene, placement, random) => {
    const suspects = scene.lettres.length;
    const p1 = Math.floor(random() * suspects);
    const p2 = Math.floor(random() * suspects);
    if (p1 === p2) return null;
    const piece1 = scene.pieces.find((p) => p.cellules.includes(placement[p1]));
    const piece2 = scene.pieces.find((p) => p.cellules.includes(placement[p2]));
    if (!piece1 || piece1.id !== piece2.id) return null;
    const masques = Array.from({ length: suspects }, (_, i) => {
      if (i === p1 || i === p2) return masqueIndices(scene, piece1.cellules);
      return null;
    });
    return { id: `meme-zone-${p1}-${p2}`, sujets: [p1, p2], titre: `« ${scene.noms[p1]} et ${scene.noms[p2]} sont dans ${piece1.nom}. »`, masques, global: null };
  },
];

/**
 * Fabrique tous les indices candidats qui sont VRAIS pour un placement donné.
 * On élimine la suite par la suite selon leur apport à l'unicité.
 */
export function candidatsFabriques(scene, placement, random) {
  const resultats = [];
  const deja = new Set();
  let garde = 0;
  // On pioche dans les fabriques, plusieurs fois chacune, en gardant les
  // résultats vrais et distincts.
  while (garde < 160 && resultats.length < 34) {
    garde++;
    const fabrique = choisir(Fabriques, random);
    const critique = fabrique(scene, placement, random);
    if (!critique) continue;
    if (deja.has(critique.id)) continue;
    deja.add(critique.id);
    // Vérification de vérité sur le placement de référence.
    if (!estVrai(critique, scene, placement)) continue;
    resultats.push(critique);
  }
  return resultats;
}

/** Vérifie qu'un indice est vrai pour une attribution donnée. */
export function estVrai(indice, scene, attribution) {
  if (indice.masques) {
    for (let p = 0; p < indice.masques.length; p++) {
      const m = indice.masques[p];
      if (m && !m[attribution[p]]) return false;
    }
  }
  if (typeof indice.global === 'function') return indice.global(attribution, scene);
  return true;
}

/** Spécificité d'un indice : nombre total de cellules autorisées par cet
 * indice (plus bas = plus précis). Sert de départage quand les nombres de
 * solutions sont au plafond. */
export function specificite(indice, scene) {
  if (!indice.masques) return 0;
  let total = 0;
  for (const masque of indice.masques) {
    if (!masque) continue;
    for (let i = 0; i < masque.length; i++) if (masque[i]) total++;
  }
  return total;
}

function choisir(tableau, random) {
  return tableau[Math.floor(random() * tableau.length)];
}
/** Une case est-elle interdite ? */
function caseInterdite(scene, index) {
  return scene.interdites.some((i) => i.cellule === index);
}

/**
 * Transforme le titre brut d'un indice en HTML, en mettant en valeur les
 * mots qui portent l'information : nom de pièce, objet, direction,
 * quantité. C'est ce qui rend une carte d'indice lisible d'un coup
 * d'œil, au lieu d'un pavé de gris.
 */
export function enrichir(titre, scene) {
  let texte = titre.replace(/^«\s*/, '').replace(/\s*»$/, '').trim();

  const motifs = [];
  for (const piece of scene.pieces) {
    motifs.push(piece.nom);
    motifs.push(piece.nom.replace(/^(LE|LA|LES|L')\s+/, ''));
  }
  for (const objet of scene.objets) motifs.push(avecArticle(objet));
  motifs.push(
    'à côté de',
    'sur la même diagonale que',
    'au nord-est',
    'au nord-ouest',
    'au sud-est',
    'au sud-ouest',
    'au nord',
    'au sud',
    "à l'ouest",
    "à l'est",
    'la seule personne',
    'seule avec',
    'au moins',
    'dans la ligne',
    'dans la colonne',
  );

  // Le plus long motif d'abord, pour ne pas couper « au sud » dans
  // « au sud-est ».
  motifs.sort((a, b) => b.length - a.length);

  for (const motif of motifs) {
    if (!motif) continue;
    const echappe = motif.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    texte = texte.replace(
      new RegExp(`(^|[^<])(${echappe})`, 'g'),
      (_, avant, trouve) => `${avant}<strong>${trouve}</strong>`,
    );
  }

  return texte;
}