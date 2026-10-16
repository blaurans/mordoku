import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BOX_OF,
  COL_OF,
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  PEERS,
  ROW_OF,
  cloneGrid,
  countClues,
  countSolutions,
  createEmptyGrid,
  createRandom,
  findConflicts,
  generatePuzzle,
  generateSolvedGrid,
  gridFromString,
  gridToString,
  isSolved,
  solve,
  usedDigits,
} from '../site/js/sudoku.js';

/** Grille classique à solution unique, très utilisée en tests. */
const KNOWN_UNIQUE = gridFromString(
  '530070000' +
    '600195000' +
    '098000060' +
    '800060003' +
    '400803001' +
    '700020006' +
    '060000280' +
    '000419005' +
    '000080079',
);

test('les index lignes/colonnes/blocs sont cohérents', () => {
  for (let index = 0; index < 81; index++) {
    assert.equal(ROW_OF[index], Math.floor(index / 9));
    assert.equal(COL_OF[index], index % 9);
    assert.equal(BOX_OF[index], Math.floor(index / 9 / 3) * 3 + Math.floor((index % 9) / 3));
  }
});

test('chaque case a exactement 20 voisines (ligne + colonne + bloc)', () => {
  for (let index = 0; index < 81; index++) {
    assert.equal(PEERS[index].size, 20, `case ${index}`);
    assert.equal(PEERS[index].has(index), false);
    for (const peer of PEERS[index]) {
      const shares =
        ROW_OF[peer] === ROW_OF[index] ||
        COL_OF[peer] === COL_OF[index] ||
        BOX_OF[peer] === BOX_OF[index];
      assert.ok(shares, `${peer} n'est pas voisin de ${index}`);
      assert.ok(PEERS[peer].has(index), 'la relation de voisinage doit être symétrique');
    }
  }
});

test('solve remplit une grille vide avec une solution valide', () => {
  const solution = solve(createEmptyGrid());
  assert.ok(solution, 'une solution doit exister');
  assert.equal(countClues(solution), 81);
  assert.ok(isSolved(solution));
  assert.equal(findConflicts(solution).length, 0);
});

test('solve ne modifie pas la grille fournie', () => {
  const grid = createEmptyGrid();
  const before = gridToString(grid);
  solve(grid);
  assert.equal(gridToString(grid), before);
});

test('solve renvoie la grille inchangée si elle est déjà complète', () => {
  const grid = generateSolvedGrid(createRandom(42));
  assert.equal(gridToString(solve(grid)), gridToString(grid));
});

test('solve renvoie null sur une grille insoluble', () => {
  // Deux 5 dans la même ligne : aucun remplissage ne peut aboutir.
  const grid = createEmptyGrid();
  grid[0] = 5;
  grid[1] = 5;
  assert.equal(solve(grid), null);
  assert.equal(countSolutions(grid, 2), 0);
});

test('solve renvoie null quand la grille est complète mais invalide', () => {
  const grid = cloneGrid(KNOWN_UNIQUE);
  grid[0] = 5;
  grid[8] = 5; // doublon en ligne, plus aucune case vide
  assert.equal(solve(grid), null);
});

test('countSolutions borne à la limite demandée', () => {
  assert.equal(countSolutions(createEmptyGrid(), 2), 2);
  assert.equal(countSolutions(createEmptyGrid(), 5), 5);
});

test('la grille classique de référence a bien une solution unique', () => {
  assert.equal(countSolutions(KNOWN_UNIQUE, 2), 1);
  assert.equal(countClues(KNOWN_UNIQUE), 30);
});

test('gridToString / gridFromString font un aller-retour exact', () => {
  const grid = generateSolvedGrid(createRandom(7));
  assert.equal(gridToString(gridFromString(gridToString(grid))), gridToString(grid));
  assert.throws(() => gridFromString('123'), /chiffres au lieu de 81/);
});

test('usedDigits liste les chiffres déjà posés autour d’une case', () => {
  const used = usedDigits(KNOWN_UNIQUE, 0);

  // Recoupement indépendant : on relit la grille à la main.
  const aroundIndexZero = new Set();
  for (let other = 0; other < 81; other++) {
    if (other === 0) continue;
    const sharesLine = Math.floor(other / 9) === 0;
    const sharesColumn = other % 9 === 0;
    const sharesBox =
      Math.floor(other / 27) === 0 && Math.floor((other % 9) / 3) === 0;
    if (sharesLine || sharesColumn || sharesBox) {
      const value = KNOWN_UNIQUE[other];
      if (value !== 0) aroundIndexZero.add(value);
    }
  }

  // Autour de la case 0 : 3 et 7 (ligne), 6, 8, 4 (colonne), 9 (bloc).
  // Le 5 de la case 0 lui-même n'est évidemment pas compté.
  for (const digit of [3, 4, 6, 7, 8, 9]) {
    assert.ok(aroundIndexZero.has(digit), `le ${digit} doit être dans le voisinage`);
  }
  assert.equal(aroundIndexZero.has(1), false, 'aucun 1 autour de la case 0');
  assert.equal(aroundIndexZero.has(5), false, 'le seul 5 est la case 0 elle-même');

  for (let digit = 1; digit <= 9; digit++) {
    assert.equal(
      used[digit - 1],
      aroundIndexZero.has(digit),
      `le chiffre ${digit} doit être signalé exactement quand il est présent`,
    );
  }
});

test('findConflicts repère les doublons dans une ligne', () => {
  const grid = createEmptyGrid();
  grid[0] = 4;
  grid[8] = 4;
  assert.deepEqual(findConflicts(grid), [0, 8]);
  grid[8] = 0;
  assert.deepEqual(findConflicts(grid), []);
});

test('isSolved refuse une grille incomplète', () => {
  const grid = cloneGrid(KNOWN_UNIQUE);
  grid[0] = 0;
  assert.equal(isSolved(grid), false);
  assert.equal(isSolved(solve(KNOWN_UNIQUE)), true);
});

test('generateSolvedGrid est déterministe à seed fixé', () => {
  const a = generateSolvedGrid(createRandom(1234));
  const b = generateSolvedGrid(createRandom(1234));
  const c = generateSolvedGrid(createRandom(4321));
  assert.equal(gridToString(a), gridToString(b));
  assert.notEqual(gridToString(a), gridToString(c));
  assert.ok(isSolved(a));
});

for (const difficulty of DIFFICULTY_ORDER) {
  const config = DIFFICULTIES[difficulty];

  test(`generatePuzzle(${difficulty}) produit une grille à solution unique`, () => {
    const { puzzle, solution } = generatePuzzle(difficulty, { seed: 2026 });

    assert.equal(countSolutions(puzzle, 2), 1, 'la solution doit être unique');

    assert.ok(isSolved(solution), 'la solution doit être complète et valide');
    assert.equal(gridToString(solve(puzzle)), gridToString(solution));

    assert.ok(
      countClues(puzzle) >= config.clues,
      `attendu au moins ${config.clues} indices, obtenu ${countClues(puzzle)}`,
    );
    assert.ok(countClues(puzzle) < 81);

    for (let index = 0; index < 81; index++) {
      if (puzzle[index] === 0) continue;
      assert.equal(
        puzzle[index],
        solution[index],
        `l'indice donné en ${index} doit correspondre à la solution`,
      );
    }
  });
}

test('la difficulté croît : plus la cible est basse, plus il reste d’indices', () => {
  const clues = {};
  for (const difficulty of DIFFICULTY_ORDER) {
    clues[difficulty] = countClues(generatePuzzle(difficulty, { seed: 99 }).puzzle);
  }
  assert.ok(clues.facile >= clues.moyen, 'facile doit garder plus d’indices que moyen');
  assert.ok(clues.moyen >= clues.difficile, 'moyen doit garder plus d’indices que difficile');
  assert.ok(clues.difficile >= clues.expert, 'difficile doit garder plus d’indices que expert');
});

test('une difficulté inconnue est rejetée', () => {
  assert.throws(() => generatePuzzle('impossible'), /Difficulté inconnue/);
});

test('générer les quatre difficultés reste rapide', () => {
  const started = process.hrtime.bigint();
  for (const difficulty of DIFFICULTY_ORDER) {
    generatePuzzle(difficulty, { seed: 5 });
  }
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(ms < 8000, `génération trop lente : ${ms.toFixed(0)} ms`);
});