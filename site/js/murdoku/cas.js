/**
 * Mordoku — affaires pré-calculées.
 *
 * Un cas figé est stocké sous forme de données pures : la scène, le
 * placement de référence et une liste d'indices dont les masques sont des
 * chaînes de '0'/'1'. Ce module les ramène à la forme attendue par le
 * reste du jeu (Uint8Array et fonctions).
 *
 * Les contraintes globales sont des fonctions, donc non sérialisables :
 * chacune est décrite par un petit objet (`type`, plus ses paramètres),
 * réinterprété ici. Toute forme inconnue lève une erreur — on préfère un
 * cas qui refuse de se charger plutôt qu'un dossier faux.
 */

import { CAS_PRECALCULES } from './cas-precalcules.js';

/** Reconstruit une contrainte globale à partir de sa description. */
function reconstruireGlobal(desc, scene) {
  if (!desc) return null;
  if (desc.type === 'au-moins') {
    const piece = scene.pieces.find((p) => p.id === desc.piece);
    if (!piece) throw new Error(`pièce inconnue dans un indice : ${desc.piece}`);
    const { seuil, cellules } = { seuil: desc.seuil, cellules: piece.cellules };
    return (attribution) => {
      let n = 0;
      for (const cell of attribution) if (cellules.includes(cell)) n++;
      return n >= seuil;
    };
  }
  if (desc.type === 'seule-sur') {
    const objet = scene.objets.find((o) => o.id === Number(desc.objet));
    if (!objet) throw new Error(`objet inconnu dans un indice : ${desc.objet}`);
    return (attribution) => attribution.filter((cell) => cell === objet.cellule).length === 1;
  }
  throw new Error(`contrainte globale inconnue : ${JSON.stringify(desc)}`);
}

/** Remet un indice sérialisé dans la forme du jeu. */
function reconstruireIndice(brut, scene) {
  const taille = scene.taille;
  const masques = (brut.masques ?? []).map((chaine) => {
    if (chaine === null) return null;
    const m = new Uint8Array(taille * taille);
    for (let c = 0; c < m.length && c < chaine.length; c++) m[c] = chaine[c] === '1' ? 1 : 0;
    return m;
  });

  return {
    id: brut.id,
    sujets: brut.sujets ?? [],
    titre: brut.titre,
    masques,
    global: reconstruireGlobal(brut.global, scene),
  };
}

/**
 * @param {object} brut  cas tel qu'écrit dans `cas-precalcules.js`
 * @returns {object} affaire au même format que le générateur
 */
export function reconstruireCas(brut) {
  const scene = brut.scene;

  // Un cas incomplet se chargerait sans bruit et donnerait un dossier faux :
  // on préfère un cas qui refuse de s'ouvrir. C'est un garde-fou, la
  // construction des cas le vérifie déjà à chaque relecture.
  for (const champ of ['taille', 'pieces', 'objets', 'interdites', 'lettres', 'noms']) {
    if (scene[champ] === undefined) throw new Error(`${brut.id} : champ manquant « ${champ} »`);
  }
  if (scene.taille !== brut.taille) {
    throw new Error(`taille incohérente pour ${brut.id}`);
  }
  if (!Array.isArray(brut.indices) || !brut.indices.length) {
    throw new Error(`${brut.id} : aucun indice`);
  }
  if (brut.arrangement.length !== scene.taille) {
    throw new Error(`${brut.id} : placement incohérent`);
  }

  const indices = brut.indices.map((i) => reconstruireIndice(i, scene));

  // Le masque des suspects sert au solveur et à l'indice « position forcée ».
  // Il se déduit des indices ci-dessus, on ne le stocke pas deux fois.
  return {
    id: brut.id,
    niveau: brut.niveau,
    resume: brut.resume ?? '',
    scene,
    arrangement: brut.arrangement.slice(),
    indices,
    clues: indices,
    victime: scene.victime,
    meurtrier: scene.meurtrier,
    taille: brut.taille,
    seed: null,
  };
}

/** Le cas d'un niveau donné, ou le premier si le niveau n'existe pas. */
export function casParNiveau(niveau) {
  const rang = Math.min(CAS_PRECALCULES.length, Math.max(1, niveau));
  return reconstruireCas(CAS_PRECALCULES[rang - 1]);
}

export { CAS_PRECALCULES };