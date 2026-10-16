/**
 * Mordoku — logique pure du sudoku.
 *
 * Représentation : un tableau de 81 entiers (Uint8Array) indexé par
 * `index = ligne * 9 + colonne`, où 0 représente une case vide.
 *
 * Ce module ne touche ni au DOM, ni au localStorage : il est entièrement
 * testable sous Node (voir tests/).
 */

/** Tous les chiffres 1..9 dans un masque de bits (bit 0 = chiffre 1). */
const ALL_DIGITS = 0x1ff;

/** Masque de bits correspondant à un chiffre (1..9). */
const bitOf = (digit) => 1 << (digit - 1);

/** Ligne d'un index. */
export const ROW_OF = new Uint8Array(81);
/** Colonne d'un index. */
export const COL_OF = new Uint8Array(81);
/** Bloc (boîte 3x3) d'un index. */
export const BOX_OF = new Uint8Array(81);

/** Cases voisines (même ligne, colonne ou bloc), indexées comme la grille. */
export const PEERS = Array.from({ length: 81 }, () => new Set());

for (let index = 0; index < 81; index++) {
  const row = Math.floor(index / 9);
  const col = index % 9;
  ROW_OF[index] = row;
  COL_OF[index] = col;
  BOX_OF[index] = Math.floor(row / 3) * 3 + Math.floor(col / 3);
}

// Seconde passe, uniquement une fois les trois tables totalement peuplées :
// les lire pendant leur propre remplissage donnerait des zéros.
for (let index = 0; index < 81; index++) {
  const row = ROW_OF[index];
  const col = COL_OF[index];
  const box = BOX_OF[index];
  for (let other = 0; other < 81; other++) {
    if (other === index) continue;
    const sameRow = ROW_OF[other] === row;
    const sameCol = COL_OF[other] === col;
    const sameBox = BOX_OF[other] === box;
    if (sameRow || sameCol || sameBox) PEERS[index].add(other);
  }
}

/** Difficultés disponibles, du plus simple au plus dur. */
export const DIFFICULTIES = {
  facile: { id: 'facile', label: 'Facile', clues: 40, symmetric: false },
  moyen: { id: 'moyen', label: 'Moyen', clues: 34, symmetric: false },
  difficile: { id: 'difficile', label: 'Difficile', clues: 28, symmetric: true },
  expert: { id: 'expert', label: 'Expert', clues: 24, symmetric: true },
};

/** Ordre d'affichage des difficultés. */
export const DIFFICULTY_ORDER = ['facile', 'moyen', 'difficile', 'expert'];

/** Grille vide. */
export function createEmptyGrid() {
  return new Uint8Array(81);
}

/** Copie défensive d'une grille. */
export function cloneGrid(grid) {
  return Uint8Array.from(grid);
}

/** Nombre de chiffres déjà posés. */
export function countClues(grid) {
  let total = 0;
  for (let index = 0; index < 81; index++) if (grid[index] !== 0) total++;
  return total;
}

/**
 * Chiffres déjà présents dans la ligne, la colonne et le bloc d'une case.
 * Retourne un tableau de 9 booléens indexé par chiffre - 1.
 */
export function usedDigits(grid, index) {
  const used = new Array(9).fill(false);
  for (const peer of PEERS[index]) {
    const value = grid[peer];
    if (value !== 0) used[value - 1] = true;
  }
  return used;
}

/** true si la case viole la règle des doublons (indépendamment de l'exactitude). */
export function hasConflict(grid, index) {
  const value = grid[index];
  if (value === 0) return false;
  for (const peer of PEERS[index]) if (grid[peer] === value) return true;
  return false;
}

/** Index de toutes les cases en conflit. */
export function findConflicts(grid) {
  const conflicts = [];
  for (let index = 0; index < 81; index++) if (hasConflict(grid, index)) conflicts.push(index);
  return conflicts;
}

/** true si la grille est complète et valide. */
export function isSolved(grid) {
  for (let index = 0; index < 81; index++) if (grid[index] === 0) return false;
  return findConflicts(grid).length === 0;
}

/** Vrai si chaque ligne, colonne et bloc contient bien les chiffres 1 à 9. */
export function isCompleteValid(grid) {
  return isSolved(grid);
}

/** Générateur pseudo-aléatoire déterministe (mulberry32), pour rejouer un seed. */
export function createRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(items, random) {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function popcount(mask) {
  let count = 0;
  let value = mask;
  while (value) {
    value &= value - 1;
    count++;
  }
  return count;
}

function fillMasks(grid, rows, cols, boxes) {
  rows.fill(0);
  cols.fill(0);
  boxes.fill(0);
  for (let index = 0; index < 81; index++) {
    const value = grid[index];
    if (value === 0) continue;
    const bit = bitOf(value);
    rows[ROW_OF[index]] |= bit;
    cols[COL_OF[index]] |= bit;
    boxes[BOX_OF[index]] |= bit;
  }
}

/**
 * Recherche backtracking. Choisit à chaque étape la case vide ayant le moins
 * de candidats (heuristique MRV), ce qui rend le comptage de solutions rapide.
 * S'arrête dès que `state.count` atteint `limit`.
 *
 * Attention : les affectations sont annulées en remontant la récursion, donc
 * la première solution est mise de côté dans `state.solution` au moment exact
 * où la grille est complète — la grille de travail est vide en fin d'appel.
 */
function search(grid, rows, cols, boxes, limit, state) {
  let target = -1;
  let targetMask = 0;
  let targetCount = 10;

  for (let index = 0; index < 81; index++) {
    if (grid[index] !== 0) continue;
    const used = rows[ROW_OF[index]] | cols[COL_OF[index]] | boxes[BOX_OF[index]];
    const mask = ALL_DIGITS & ~used;
    const count = popcount(mask);
    if (count === 0) return; // impasse : aucune solution possible par ce chemin
    if (count < targetCount) {
      target = index;
      targetMask = mask;
      targetCount = count;
      if (count === 1) break; // candidat unique, inutile de chercher mieux
    }
  }

  if (target === -1) {
    state.count++; // grille complète : une solution de plus
    if (!state.solution) state.solution = cloneGrid(grid);
    return;
  }

  const row = ROW_OF[target];
  const col = COL_OF[target];
  const box = BOX_OF[target];

  for (let digit = 1; digit <= 9; digit++) {
    const bit = bitOf(digit);
    if ((targetMask & bit) === 0) continue;
    grid[target] = digit;
    rows[row] |= bit;
    cols[col] |= bit;
    boxes[box] |= bit;

    search(grid, rows, cols, boxes, limit, state);

    rows[row] ^= bit;
    cols[col] ^= bit;
    boxes[box] ^= bit;
    grid[target] = 0;

    if (state.count >= limit) return;
  }
}

/**
 * true si les chiffres déjà posés violent la règle des doublons.
 *
 * Garde indispensable avant de lancer la recherche : sur une grille déjà
 * contradictoire, le backtracking explorerait un arbre combinatoire
 * gigantesque avant de conclure à l'absence de solution.
 */
export function hasInvalidGivens(grid) {
  for (let index = 0; index < 81; index++) {
    if (grid[index] !== 0 && hasConflict(grid, index)) return true;
  }
  return false;
}

/**
 * Compte les solutions d'une grille, en s'arrêtant à `limit`.
 * `limit = 2` suffit à prouver si une grille a une solution unique.
 */
export function countSolutions(grid, limit = 2) {
  if (hasInvalidGivens(grid)) return 0;
  const work = cloneGrid(grid);
  const rows = new Uint16Array(9);
  const cols = new Uint16Array(9);
  const boxes = new Uint16Array(9);
  fillMasks(work, rows, cols, boxes);
  const state = { count: 0, solution: null };
  search(work, rows, cols, boxes, Math.max(1, limit), state);
  return state.count;
}

/**
 * Première solution trouvée pour une grille, ou null si insoluble.
 * Renvoie une nouvelle grille : l'entrée n'est pas modifiée.
 */
export function solve(grid) {
  if (hasInvalidGivens(grid)) return null;
  const work = cloneGrid(grid);
  const rows = new Uint16Array(9);
  const cols = new Uint16Array(9);
  const boxes = new Uint16Array(9);
  fillMasks(work, rows, cols, boxes);
  const state = { count: 0, solution: null };
  search(work, rows, cols, boxes, 1, state);
  return state.solution;
}

/** Grille complète et valide, construite par backtracking aléatoire. */
export function generateSolvedGrid(random = Math.random) {
  const grid = createEmptyGrid();
  const rows = new Uint16Array(9);
  const cols = new Uint16Array(9);
  const boxes = new Uint16Array(9);

  function recurse() {
    let target = -1;
    let targetMask = 0;
    let targetCount = 10;
    for (let index = 0; index < 81; index++) {
      if (grid[index] !== 0) continue;
      const used = rows[ROW_OF[index]] | cols[COL_OF[index]] | boxes[BOX_OF[index]];
      const mask = ALL_DIGITS & ~used;
      const count = popcount(mask);
      if (count === 0) return false;
      if (count < targetCount) {
        target = index;
        targetMask = mask;
        targetCount = count;
      }
    }
    if (target === -1) return true;

    for (const digit of shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9], random)) {
      const bit = bitOf(digit);
      if ((targetMask & bit) === 0) continue;
      grid[target] = digit;
      rows[ROW_OF[target]] |= bit;
      cols[COL_OF[target]] |= bit;
      boxes[BOX_OF[target]] |= bit;

      if (recurse()) return true;

      rows[ROW_OF[target]] ^= bit;
      cols[COL_OF[target]] ^= bit;
      boxes[BOX_OF[target]] ^= bit;
      grid[target] = 0;
    }
    return false;
  }

  if (!recurse()) throw new Error('Impossible de générer une grille complète valide');
  return grid;
}

/**
 * Les paires de cases symétriques (rotation de 180°), pour creuser des
 * grilles qui « se répondent » visuellement. Le centre (index 40) est fixe.
 */
function symmetryPairs(random) {
  const pairs = [];
  for (let index = 0; index <= 40; index++) {
    pairs.push(index === 40 ? [40] : [index, 80 - index]);
  }
  return shuffled(pairs, random);
}

/**
 * Creuse une grille complète en ne retirant que les cases dont la suppression
 * laisse la solution unique. S'arrête une fois `targetClues` atteints.
 */
function carvePuzzle(solution, targetClues, symmetric, random) {
  const puzzle = cloneGrid(solution);
  const groups = symmetric
    ? symmetryPairs(random)
    : shuffled([...Array(81).keys()], random).map((index) => [index]);

  for (const group of groups) {
    if (countClues(puzzle) - group.length <= targetClues) break;
    const backup = group.map((index) => puzzle[index]);
    for (const index of group) puzzle[index] = 0;
    if (countSolutions(puzzle, 2) !== 1) {
      group.forEach((index, position) => {
        puzzle[index] = backup[position];
      });
    }
  }
  return puzzle;
}

/**
 * Génère une partie.
 *
 * @param {string} difficulty  une clé de DIFFICULTIES
 * @param {{seed?: number}} [options]  seed fixe = partie reproductible
 * @returns {{puzzle: Uint8Array, solution: Uint8Array, difficulty: string}}
 */
export function generatePuzzle(difficulty = 'facile', options = {}) {
  const config = DIFFICULTIES[difficulty];
  if (!config) {
    throw new Error(`Difficulté inconnue : ${difficulty}`);
  }
  const random =
    options.seed === undefined ? Math.random : createRandom(options.seed);

  const solution = generateSolvedGrid(random);
  const puzzle = carvePuzzle(solution, config.clues, config.symmetric, random);

  return { puzzle, solution, difficulty: config.id };
}

/** Sérialise une grille en 9 lignes de 9 caractères (0 = vide). */
export function gridToString(grid) {
  const lines = [];
  for (let row = 0; row < 9; row++) {
    let line = '';
    for (let col = 0; col < 9; col++) line += String(grid[row * 9 + col]);
    lines.push(line);
  }
  return lines.join('\n');
}

/** Relit une grille produite par gridToString. */
export function gridFromString(text) {
  const digits = String(text).replace(/[^0-9]/g, '');
  if (digits.length !== 81) {
    throw new Error(`Grille invalide : ${digits.length} chiffres au lieu de 81`);
  }
  const grid = createEmptyGrid();
  for (let index = 0; index < 81; index++) grid[index] = Number(digits[index]);
  return grid;
}