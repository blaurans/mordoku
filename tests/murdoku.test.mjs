import test from 'node:test';
import assert from 'node:assert/strict';

import {
  genererAffaire,
  genererAffaireAuHasard,
} from '../site/js/murdoku/generator.js';

import {
  compterSolutions,
  resoudrePlacement,
} from '../site/js/murdoku/solver.js';

import { estVrai } from '../site/js/murdoku/clues.js';
import {
  pieceDe,
  casesInterdites,
} from '../site/js/murdoku/scene.js';

import { CAS_PRECALCULES, reconstruireCas } from '../site/js/murdoku/cas.js';
import { deduire } from '../site/js/murdoku/solution.js';

function estPlacementValide(affaire) {
  const scene = affaire.scene;
  const N = scene.taille;
  const interdites = new Set(casesInterdites(scene));
  const lignes = new Set();
  const colonnes = new Set();
  for (let p = 0; p < N; p++) {
    const cellule = affaire.arrangement[p];
    if (interdites.has(cellule)) return false;
    const l = Math.floor(cellule / N);
    const c = cellule % N;
    if (lignes.has(l)) return false;
    if (colonnes.has(c)) return false;
    lignes.add(l);
    colonnes.add(c);
  }
  if (lignes.size !== N || colonnes.size !== N) return false;
  return true;
}

function estMeurtrierValide(affaire) {
  const scene = affaire.scene;
  const parPiece = new Map();
  for (let p = 0; p < scene.lettres.length; p++) {
    // pièce contenant la personne p
    const piece = pieceDe(scene, affaire.arrangement[p]);
    const id = typeof piece === 'number' ? piece : piece.id;
    if (!parPiece.has(id)) parPiece.set(id, []);
    parPiece.get(id).push(p);
  }
  const pieceVictime = Array.from(parPiece.values()).find((personnes) => personnes.includes(affaire.victime));
  if (!pieceVictime || pieceVictime.length !== 2) return false;
  return pieceVictime.includes(affaire.meurtrier);
}

for (const taille of [6, 7]) {
  test(`génération ${taille}×${taille} : placement valide`, () => {
    const affaire = genererAffaireAuHasard(taille, 2026);
    assert.ok(affaire, 'l\'affaire doit être générée');
    assert.equal(affaire.taille, taille);
    assert.ok(estPlacementValide(affaire), 'placement non valide (ligne/colonne/interdit)');
  });

  test(`génération ${taille}×${taille} : meurtrier déterminé par la scène`, () => {
    const affaire = genererAffaireAuHasard(taille, 2026);
    assert.ok(estMeurtrierValide(affaire));
  });

  test(`génération ${taille}×${taille} : chaque indice est vrai`, () => {
    const affaire = genererAffaireAuHasard(taille, 2026);
    for (const indice of affaire.clues) {
      assert.ok(estVrai(indice, affaire.scene, affaire.arrangement), `indice faux : ${indice.id} — ${indice.titre}`);
    }
  });

  test(`génération ${taille}×${taille} : unicité (exactement une solution)`, () => {
    const affaire = genererAffaireAuHasard(taille, 2026);
    const masques = Array.from({ length: taille }, () => null);
    for (const indice of affaire.clues) {
      if (!indice.masques) continue;
      for (let p = 0; p < taille; p++) {
        if (masques[p] === null) masques[p] = indice.masques[p] ? Uint8Array.from(indice.masques[p]) : null;
        else if (indice.masques[p]) for (let i = 0; i < masques[p].length; i++) masques[p][i] = masques[p][i] && indice.masques[p][i] ? 1 : 0;
      }
    }
    const globales = (affaire.clues ?? []).map((c) => c.global).filter(Boolean);
    const count = compterSolutions(affaire.scene, masques, globales, 2);
    assert.equal(count, 1, `attendu 1 solution, obtenu ${count}`);
    const solution = resoudrePlacement(affaire.scene, masques, globales);
    assert.ok(solution);
    assert.deepEqual(Array.from(solution), affaire.arrangement);
  });
}

test('génération est déterministe à seed fixé', () => {
  const a = genererAffaire(6, 1234, null);
  const b = genererAffaire(6, 1234, null);
  assert.equal(JSON.stringify(a.arrangement), JSON.stringify(b.arrangement));
  assert.equal(a.clues.length, b.clues.length);
  assert.equal(JSON.stringify(a.clues.map((c) => c.id)), JSON.stringify(b.clues.map((c) => c.id)));
});

test('thèmes disponibles', () => {
  const seen = new Set();
  for (let seed = 1; seed < 20; seed++) {
    const a = genererAffaire(6, seed, null);
    if (a) seen.add(a.scene.theme);
  }
  assert.ok(seen.size >= 3, `seulement ${seen.size} thèmes atteints`);
});

test('construit des indices au moins 2 par affaire', () => {
  let min = Infinity;
  for (let seed = 1; seed < 10; seed++) {
    const a = genererAffaire(6, seed, null);
    if (a) min = Math.min(min, a.clues.length);
  }
  assert.ok(min >= 2);
});
/* ------------------------------------------------------------------ */
/* Affaires pré-calculées                                              */
/* ------------------------------------------------------------------ */

test('les cas pré-calculés sont complets et progressifs', () => {
  assert.ok(CAS_PRECALCULES.length >= 4, 'il faut au moins quatre paliers');

  let tailleAvant = 0;
  for (const brut of CAS_PRECALCULES) {
    const cas = reconstruireCas(brut);
    const N = cas.scene.taille;

    // Le placement de référence est légal.
    assert.ok(estPlacementValide(cas), `${brut.id} : placement illégal`);
    assert.ok(estMeurtrierValide(cas), `${brut.id} : meurtrier ou victime incohérent`);

    // Tous les indices sont vrais, et leurs masques tiennent la solution.
    for (const indice of cas.indices) {
      assert.ok(estVrai(indice, cas.scene, cas.arrangement), `${brut.id} : indice faux « ${indice.id} »`);
    }

    // Unicité, mesurée sur les contraintes qu'ils portent réellement.
    const masques = Array.from({ length: N }, () => null);
    const globales = [];
    for (const indice of cas.indices) {
      if (indice.masques) {
        for (let p = 0; p < N; p++) {
          const m = indice.masques[p];
          if (!m) continue;
          if (!masques[p]) masques[p] = new Uint8Array(N * N).fill(1);
          for (let c = 0; c < N * N; c++) if (!m[c]) masques[p][c] = 0;
        }
      }
      if (typeof indice.global === 'function') globales.push(indice.global);
    }
    assert.equal(
      compterSolutions(cas.scene, masques, globales, 2),
      1,
      `${brut.id} : la solution n'est pas unique`,
    );

    // Et elle se déduit entière, sans deviner : c'est la promesse faite
    // à qui choisit un cas pré-calculé.
    const deduction = deduire(cas.scene, cas.indices);
    assert.ok(deduction.complet, `${brut.id} : propagation incomplète`);
    assert.deepEqual(
      deduction.placement,
      cas.arrangement,
      `${brut.id} : la déduction ne mène pas à la bonne solution`,
    );
    assert.equal(deduction.etapes.length, N, `${brut.id} : il manque des étapes`);

    // Un cas ne doit jamais être plus petit que le précédent.
    assert.ok(N >= tailleAvant, `${brut.id} : la progression régresse`);
    tailleAvant = N;
  }
});

test('le premier cas se résout sans aucun indice spatial', () => {
  const premier = CAS_PRECALCULES[0];
  assert.equal(premier.resume.length > 0, true, 'le premier cas doit se décrire');
  const cas = reconstruireCas(premier);
  // Chaque personne est donnée par sa ligne et sa colonne : on apprend la
  // mécanique avant les indices spatiaux.
  assert.ok(cas.indices.every((i) => i.id.startsWith('ligne-') || i.id.startsWith('colonne-')));
  assert.equal(cas.indices.length, cas.scene.taille * 2);
});
