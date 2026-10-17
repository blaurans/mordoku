/**
 * Mordoku — génération de la scène de crime.
 *
 * La carte est une grille NxN découpée en pièces rectangulaires, peuplée
 * d'objets repérables, avec quelques cases interdites (Flaques, Ruines…).
 *
 * Un objet ne bloque pas la case : on peut se tenir sur un tapis. Seules les
 * cases explicitement interdites refusent une personne — c'est ce qui rend
 * les indices du type « la seule personne sur un tapis » possibles.
 */

/** Décors : chaque thème donne son ton au vocabulaire. */
import { entier, shuffled, choisir } from './random.js';

export const THEMES = [
  {
    id: 'bureau',
    titre: "Le Bureau",
    pieces: [
      { nom: 'LE BUREAU', article: 'le' },
      { nom: 'LA SALLE DE RÉUNION', article: 'la' },
      { nom: 'LES ARCHIVES', article: 'les' },
      { nom: 'LA COPIEUSE', article: 'la' },
    ],
    objets: [
      { nom: 'plant', article: 'le', emoji: '🪴' },
      { nom: 'table', article: 'la', emoji: '🗄️' },
      { nom: 'fauteuil', article: 'le', emoji: '🪑' },
      { nom: 'classeur', article: 'le', emoji: '📁' },
      { nom: 'horloge', article: "l'", emoji: '🕰️' },
    ],
    interdits: [
      { nom: 'tache de peinture', article: 'la', emoji: '🟤' },
      { nom: 'tas de papiers', article: 'le', emoji: '📄' },
    ],
  },
  {
    id: 'maison',
    titre: 'La Villa',
    pieces: [
      { nom: 'LE SALON', article: 'le' },
      { nom: 'LA CUISINE', article: 'la' },
      { nom: 'LA CHAMBRE', article: 'la' },
      { nom: 'LA TERRASSE', article: 'la' },
      { nom: 'LE HALL', article: 'le' },
    ],
    objets: [
      { nom: 'canapé', article: 'le', emoji: '🛋️' },
      { nom: 'plante', article: 'la', emoji: '🪴' },
      { nom: 'tapis', article: 'le', emoji: '🟫' },
      { nom: 'table', article: 'la', emoji: '🍽️' },
      { nom: 'lampe', article: 'la', emoji: '💡' },
      { nom: 'miroir', article: 'le', emoji: '🪞' },
    ],
    interdits: [{ nom: 'flaque', article: 'la', emoji: '💧' }],
  },
  {
    id: 'plage',
    titre: 'La Plage',
    pieces: [
      { nom: 'LA CABANE DE SAUVETAGE', article: 'la' },
      { nom: 'LE POSTE DE SECOURS', article: 'le' },
      { nom: 'LES CABINES', article: 'les' },
      { nom: 'LE TERRASSEMENT', article: 'le' },
    ],
    objets: [
      { nom: 'parasol', article: 'le', emoji: '⛱️' },
      { nom: 'fauteuil pliant', article: 'le', emoji: '🪑' },
      { nom: 'glacier', article: 'le', emoji: '🍨' },
      { nom: 'paddle', article: 'la', emoji: '🏄' },
      { nom: 'serviette', article: 'la', emoji: '🧺' },
    ],
    interdits: [{ nom: 'flaque', article: 'la', emoji: '💧' }],
  },
  {
    id: 'manoir',
    titre: 'Le Manoir',
    pieces: [
      { nom: 'LA BIBLIOTHÈQUE', article: 'la' },
      { nom: 'LA SALLE À MANGER', article: 'la' },
      { nom: 'LE SALON', article: 'le' },
      { nom: 'LE COULOIR', article: 'le' },
      { nom: 'LE JARDIN', article: 'le' },
    ],
    objets: [
      { nom: 'étagère', article: "l'", emoji: '📚' },
      { nom: 'table', article: 'la', emoji: '🍽️' },
      { nom: 'buste', article: 'le', emoji: '🗿' },
      { nom: 'plante', article: 'la', emoji: '🪴' },
      { nom: 'porte', article: 'la', emoji: '🚪' },
      { nom: 'tableau', article: 'le', emoji: '🖼️' },
    ],
    interdits: [{ nom: 'ruines', article: 'les', emoji: '🧱' }],
  },
  {
    id: 'foret',
    titre: 'La Forêt',
    pieces: [
      { nom: 'LE CAMPEMENT', article: 'le' },
      { nom: 'LA CLAIRIÈRE', article: 'la' },
      { nom: 'LE SENTIER', article: 'le' },
      { nom: 'LA BERGE', article: 'la' },
    ],
    objets: [
      { nom: 'arbre', article: "l'", emoji: '🌲' },
      { nom: 'buisson', article: 'le', emoji: '🌿' },
      { nom: 'rocher', article: 'le', emoji: '🪨' },
      { nom: 'campement de tentes', article: 'le', emoji: '⛺' },
      { nom: 'bûcher', article: 'le', emoji: '🪵' },
    ],
    interdits: [{ nom: 'flaque', article: 'la', emoji: '💧' }],
  },
  {
    id: 'hotel',
    titre: "L'Hôtel",
    pieces: [
      { nom: 'LE HALL', article: 'le' },
      { nom: 'LA CHAMBRE 101', article: 'la' },
      { nom: 'LA CHAMBRE 102', article: 'la' },
      { nom: 'LE VESTIBULE', article: 'le' },
      { nom: 'LE JARDIN D HIVER', article: 'le' },
    ],
    objets: [
      { nom: 'plante', article: 'la', emoji: '🪴' },
      { nom: 'fauteuil', article: 'le', emoji: '🪑' },
      { nom: 'coffre-fort', article: 'le', emoji: '🧰' },
      { nom: 'tapis', article: 'le', emoji: '🟫' },
      { nom: 'lampe', article: 'la', emoji: '💡' },
      { nom: 'porte', article: 'la', emoji: '🚪' },
    ],
    interdits: [{ nom: 'ruines', article: 'les', emoji: '🧱' }],
  },
  {
    id: 'train',
    titre: 'Le Train',
    pieces: [
      { nom: 'LE WAGON-RESTAURANT', article: 'le' },
      { nom: 'LE COULOIR', article: 'le' },
      { nom: 'LE COMPARTIMENT 4', article: 'le' },
      { nom: 'LA FOURGON', article: 'la' },
    ],
    objets: [
      { nom: 'panier', article: 'le', emoji: '🧺' },
      { nom: 'tabouret', article: 'le', emoji: '🪑' },
      { nom: 'lampe', article: 'la', emoji: '💡' },
      { nom: 'valise', article: 'la', emoji: '🧳' },
      { nom: 'plante', article: 'la', emoji: '🪴' },
    ],
    interdits: [{ nom: 'huile', article: "l'", emoji: '🛢️' }],
  },
  {
    id: 'theatre',
    titre: 'Le Théâtre',
    pieces: [
      { nom: 'LA SCÈNE', article: 'la' },
      { nom: 'LE PARTERRE', article: 'le' },
      { nom: 'LA LOGE', article: 'la' },
      { nom: 'LES COULISSES', article: 'les' },
    ],
    objets: [
      { nom: 'fauteuil', article: 'le', emoji: '🪑' },
      { nom: 'statue', article: 'la', emoji: '🗿' },
      { nom: 'rampe', article: 'la', emoji: '💡' },
      { nom: 'cordes', article: 'les', emoji: '🪢' },
      { nom: 'chevalet', article: 'le', emoji: '🎨' },
    ],
    interdits: [{ nom: 'ruines', article: 'les', emoji: '🧱' }],
  },
];

const LETTRES = 'ABCDEFGHIJ';

/**
 * Prénoms des suspects. Tirés sans répétition dans chaque affaire : ça
 * donne beaucoup plus de présence qu'une lettre, et l'indice devient
 * « Elle était à côté de la plante » plutôt que « C est… ».
 */
export const NOMS = [
  'Ada', 'Brigitte', 'Cameron', 'Darlène', 'Edison', 'Vinita',
  'Odette', 'Renard', 'Colette', 'Marius', 'Sylvie', 'Antoine',
  'Bernadette', 'Cyril', 'Delphine', 'Émile', 'Fantine', 'Gustave',
  'Hortense', 'Joachim', 'Léonie', 'Marcel', 'Noémie', 'Octave',
  'Perrine', 'Quentin', 'Roxane', 'Séverin', 'Thérèse', 'Ulysse',
  'Valentin', 'Ysabeau',
];

/** Surface d'un rectangle de pièce. */
const surface = (morceau) =>
  (morceau.maxL - morceau.minL + 1) * (morceau.maxC - morceau.minC + 1);

/** Scindable = assez grand dans au moins une direction pour une coupe utile. */
const scindable = (morceau) =>
  morceau.maxL - morceau.minL + 1 >= 4 || morceau.maxC - morceau.minC + 1 >= 4;

/**
 * Partie une pièce en deux le long d'un axe, au hasard mais en gardant au
 * moins deux lignes/colonnes de chaque côté.
 */
function couper(morceau, random) {
  const hauteur = morceau.maxL - morceau.minL + 1;
  const largeur = morceau.maxC - morceau.minC + 1;
  const axeHorizontal = largeur < 4 || (hauteur >= 4 && hauteur >= largeur);
  const longueur = axeHorizontal ? hauteur : largeur;
  const coupe = 2 + entier(longueur - 3, random);

  if (axeHorizontal) {
    return [
      { minL: morceau.minL, minC: morceau.minC, maxL: morceau.minL + coupe - 1, maxC: morceau.maxC },
      { minL: morceau.minL + coupe, minC: morceau.minC, maxL: morceau.maxL, maxC: morceau.maxC },
    ];
  }
  return [
    { minL: morceau.minL, minC: morceau.minC, maxL: morceau.maxL, maxC: morceau.minC + coupe - 1 },
    { minL: morceau.minL, minC: morceau.minC + coupe, maxL: morceau.maxL, maxC: morceau.maxC },
  ];
}

/** Partition de Guillotine : on scinde la plus grande pièce, autant de fois
 *  qu'il faut pour obtenir le nombre de pièces voulu. */
function partitionner(taille, nombre, random) {
  const morceaux = [{ minL: 0, minC: 0, maxL: taille - 1, maxC: taille - 1 }];

  for (let garde = 0; morceaux.length < nombre && garde < 200; garde++) {
    let cible = -1;
    let meilleureSurface = 0;
    for (let i = 0; i < morceaux.length; i++) {
      if (!scindable(morceaux[i])) continue;
      if (surface(morceaux[i]) > meilleureSurface) {
        meilleureSurface = surface(morceaux[i]);
        cible = i;
      }
    }
    if (cible === -1) break; // plus rien de scindable : on s'arrête là
    const morceau = morceaux.splice(cible, 1)[0];
    morceaux.push(...couper(morceau, random));
  }

  return morceaux;
}

/**
 * Crée une scène.
 *
 * @param {number} taille   côté de la grille (6 à 10)
 * @param {object} theme    thème de THEMES ou tiré au sort
 * @param {Function} random
 */
export function genererScene(taille, theme, random) {
  const decalage = taille * taille;
  const nomsPieces = [...theme.pieces].sort(() => random() - 0.5);

  // Nombre de pièces : environ une tous les 9 à 14 cases, entre 3 et 5.
  const vise = Math.min(5, Math.max(3, Math.round(decalage / 11)));
  const nombre = Math.min(theme.pieces.length, vise);

  const morceaux = partitionner(taille, nombre, random);

  const pieces = morceaux.map((morceau, i) => {
    const definition = nomsPieces[i % nomsPieces.length];
    const cellules = [];
    for (let l = morceau.minL; l <= morceau.maxL; l++) {
      for (let c = morceau.minC; c <= morceau.maxC; c++) cellules.push(l * taille + c);
    }
    return {
      id: i,
      nom: definition.nom,
      article: definition.article,
      cellules,
      /** Indice de couleur, pour distinguer les pièces à l'écran. */
      teinte: i,
    };
  });

  // Un objet par pièce au minimum, plus quelques-uns supplémentaires.
  const noms = shuffled(NOMS, random).slice(0, taille);
  const paletteObjets = [...theme.objets];
  const objets = [];
  for (const piece of pieces) {
    const modele = paletteObjets.splice(Math.floor(random() * paletteObjets.length), 1)[0];
    if (!modele) break;
    objets.push({
      id: objets.length,
      ...modele,
      cellule: piece.cellules[entier(piece.cellules.length, random)],
    });
  }
  for (let k = objets.length; k < Math.min(nombre + 2, taille + 1) && paletteObjets.length; k++) {
    const modele = paletteObjets.splice(Math.floor(random() * paletteObjets.length), 1)[0];
    objets.push({ id: k, ...modele, cellule: entier(decalage, random) });
  }

  // Cases interdites : quelques-unes seulement, pour ne pas compliquer
  // excessivement la déduction.
  const interdites = [];
  const nombreInterdites = taille >= 8 ? 2 : taille >= 7 ? 2 : 1;
  const casesLibres = shuffled([...Array(decalage).keys()], random);
  for (let i = 0; i < nombreInterdites; i++) {
    const modele = theme.interdits[i % theme.interdits.length];
    interdites.push({ id: i, ...modele, cellule: casesLibres[i] });
  }

  return {
    taille,
    theme: theme.id,
    titre: theme.titre,
    decalage,
    pieces,
    objets,
    interdites,
    /** Pour chaque personne, une lettre d'identité. */
    lettres: LETTRES.slice(0, taille),
    /** Et un prénom, pour la présentation. */
    noms: [...noms],
  };
}

/** Index de la pièce contenant une cellule, ou -1. */
export function pieceDe(scene, cellule) {
  for (const piece of scene.pieces) if (piece.cellules.includes(cellule)) return piece;
  return -1;
}

/** Liste des cases interdites (utilisé par le solveur). */
export function casesInterdites(scene) {
  return scene.interdites.map((interdit) => interdit.cellule);
}

/** Grille d'appartenance aux pièces, pour un rendu rapide. */
export function tablePieces(scene) {
  const table = new Int16Array(scene.decalage).fill(-1);
  for (const piece of scene.pieces) for (const cellule of piece.cellules) table[cellule] = piece.id;
  return table;
}