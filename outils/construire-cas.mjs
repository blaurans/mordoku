/**
 * Construction des affaires pré-calculées.
 *
 * Le jeu propose deux entrées : des affaires générées à la volée, et une
 * sélection d'affaires figées, vérifiées et classées par difficulté. Les
 * premières frames sont volontairement triviales — une case par personne,
 * deux indices qui se croisent — pour apprendre la mécanique avant de
 * découvrir les indices spatiaux.
 *
 * On ne fige que ce qui est prouvé : unicité de la solution, et résolution
 * complète par propagation, sans backtracking. Le fichier produit est relu
 * et validé par `tests/murdoku.test.mjs`.
 *
 *   node outils/construire-cas.mjs            écrit le fichier
 *   node outils/construire-cas.mjs --verifier relit sans réécrire
 */

import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createRandom } from '../site/js/murdoku/random.js';
import { THEMES, genererScene, pieceDe } from '../site/js/murdoku/scene.js';
import {
  indiceLigne,
  indiceColonne,
  estVrai,
  candidatsFabriques,
} from '../site/js/murdoku/clues.js';
import { compterSolutions, resoudrePlacement } from '../site/js/murdoku/solver.js';
import { selectionnerIndices } from '../site/js/murdoku/generator.js';
import { deduire } from '../site/js/murdoku/solution.js';
import { reconstruireCas } from '../site/js/murdoku/cas.js';

const ICI = dirname(fileURLToPath(import.meta.url));
const SORTIE = join(ICI, '..', 'site', 'js', 'murdoku', 'cas-precalcules.js');

/* ------------------------------------------------------------------ */
/* Placement de référence                                             */
/* ------------------------------------------------------------------ */

function lignesColonnesLibres(N, random) {
  return Array.from({ length: N }, () => Array.from({ length: N }, (_, i) => i).sort(() => random() - 0.5));
}

/**
 * Tirage d'un placement : une personne par ligne, une par colonne.
 * `eviter` permet d'écarter les cases interdites de la scène.
 */
function tirerPlacement(scene, random) {
  const N = scene.taille;
  const interdites = new Set(scene.interdites.map((i) => i.cellule));
  const parLigne = lignesColonnesLibres(N, random);

  const placement = new Array(N).fill(-1);
  const colonnePrise = new Array(N).fill(false);
  let ordre = Array.from({ length: N }, (_, i) => i);

  const placer = (restants) => {
    if (restants.length === 0) return true;
    // Moins d'options d'abord : c'est le même ordre MRV que le solveur.
    let cible = -1;
    let options = null;
    for (const p of restants) {
      const dispo = parLigne[p].filter((c) => !colonnePrise[c] && !interdites.has(p * N + c));
      if (dispo.length === 0) return false;
      if (options === null || dispo.length < options.length) {
        options = dispo;
        cible = p;
        if (dispo.length === 1) break;
      }
    }
    for (const c of options.sort(() => random() - 0.5)) {
      placement[cible] = cible * N + c;
      colonnePrise[c] = true;
      // Suite faisable a priori : on ecarte les colonnes deja prises.
      const suite = restants.filter((p) => p !== cible);
      const plausible = suite.every((p) => parLigne[p].some((cc) => !colonnePrise[cc]));
      if (plausible && placer(suite)) return true;
      placement[cible] = -1;
      colonnePrise[c] = false;
    }
    return false;
  };

  if (!placer(ordre)) return null;
  return placement;
}

/**
 * Le meurtrier et la victime doivent être les deux seuls occupants d'une
 * même pièce : c'est ce qui rend l'affaire vérifiable à l'écran.
 */
function choisirMeutreEtVictime(scene, placement, random) {
  const parPiece = new Map();
  for (let p = 0; p < placement.length; p++) {
    const piece = pieceDe(scene, placement[p]);
    if (!piece) return null;
    if (!parPiece.has(piece.id)) parPiece.set(piece.id, []);
    parPiece.get(piece.id).push(p);
  }
  const paires = [...parPiece.values()].filter((liste) => liste.length === 2);
  if (!paires.length) return null;
  const paire = paires[Math.floor(random() * paires.length)];
  return random() < 0.5
    ? { victime: paire[0], meurtrier: paire[1] }
    : { victime: paire[1], meurtrier: paire[0] };
}

/* ------------------------------------------------------------------ */
/* Fabrication et validation                                          */
/* ------------------------------------------------------------------ */

/** Vérifie unicité, solution de référence, et résolution par propagation. */
function valider(scene, indices, arrangement) {
  const N = scene.taille;
  const masques = Array.from({ length: N }, () => null);
  const globales = [];
  for (const indice of indices) {
    if (indice.masques) {
      for (let p = 0; p < N; p++) {
        const m = indice.masques[p];
        if (!m) continue;
        if (!masques[p]) {
          const plein = new Uint8Array(N * N).fill(1);
          masques[p] = plein;
        }
        for (let c = 0; c < N * N; c++) if (!m[c]) masques[p][c] = 0;
      }
    }
    if (typeof indice.global === 'function') globales.push(indice.global);
  }

  // Tous les indices doivent être vrais pour le placement de référence.
  for (const indice of indices) if (!estVrai(indice, scene, arrangement)) return { ok: false, raison: 'indice faux' };
  for (let p = 0; p < N; p++) if (masques[p] && !masques[p][arrangement[p]]) return { ok: false, raison: 'masque faux' };

  // Unicité.
  const compte = compterSolutions(scene, masques, globales, 2);
  if (compte !== 1) return { ok: false, raison: `${compte} solutions` };

  // La solution du solveur doit être celle qu'on a tirée.
  const solution = resoudrePlacement(scene, masques, globales);
  if (!solution) return { ok: false, raison: 'pas de solution' };
  for (let p = 0; p < N; p++) if (solution[p] !== arrangement[p]) return { ok: false, raison: 'solution différente' };

  // Et elle doit se déduire, pas se deviner.
  const deduction = deduire(scene, indices);
  if (!deduction.complet) return { ok: false, raison: `déduction incomplète (${deduction.etapes.length})` };
  for (let p = 0; p < N; p++) if (deduction.placement[p] !== arrangement[p]) return { ok: false, raison: 'déduction fausse' };

  return { ok: true, deduction };
}

/* ------------------------------------------------------------------ */
/* Index minimal : le plus petit jeu d'indices qui résout encore        */
/* ------------------------------------------------------------------ */

/**
 * Sélectionne un jeu d'indices puis le taille au minimum : on retire un
 * indice dès que le dossier reste unique ET entièrement déductible. Le
 * résultat est le plus petit jeu qui explique l'affaire, ce qui est
 * exactement ce qu'on veut pour un cas figé.
 */
function indicesMinimaux(scene, placement, random) {
  const candidats = candidatsFabriques(scene, placement, random);
  if (!candidats.length) return null;

  const selection = selectionnerIndices(scene, candidats, placement, random, Date.now() + 4000);
  if (!selection.length) return null;

  // On tente de retirer chaque indice, en commençant par les moins utiles.
  let triee = selection.slice();
  for (let i = triee.length - 1; i >= 0; i--) {
    const essai = [...triee.slice(0, i), ...triee.slice(i + 1)];
    const verdict = valider(scene, essai, placement);
    if (verdict.ok) triee = essai;
  }
  return triee.length ? triee : null;
}

/** Mesure de difficulté, pour classer les cas et vérifier la progression. */
function mesurer(scene, indices, arrangement) {
  const deduction = deduire(scene, indices);
  const pas = deduction.etapes.length;
  const parIndice = indices.length / scene.taille;
  return {
    pas,
    indices: indices.length,
    // Combien d'indices il faut lire, en moyenne, pour poser une personne.
    effort: Math.round((parIndice * 100) / Math.max(1, pas)) / 100,
  };
}

/* ------------------------------------------------------------------ */
/* Cas simples : une ligne et une colonne par personne                 */
/* ------------------------------------------------------------------ */

/**
 * Le tout premier cas. Chaque personne est donnée par sa ligne et sa
 * colonne : le croisement des deux indices ne laisse qu'une case. Aucun
 * recul, aucune ambiguïté — on apprend juste à lire la grille.
 */
function casFondation(scene, placement, indices = []) {
  const N = scene.taille;
  for (let p = 0; p < N; p++) {
    const cellule = placement[p];
    indices.push(indiceLigne(scene, p, Math.floor(cellule / N)));
    indices.push(indiceColonne(scene, p, cellule % N));
  }
  return indices;
}

/* ------------------------------------------------------------------ */
/* Recherche                                                          */
/* ------------------------------------------------------------------ */

/**
 * Cherche un cas conforme. `fabriquer` reçoit la scène et le placement et
 * renvoie la liste d'indices ; le script n'en garde que les versions qui
 * passent `valider`.
 */
function chercherCas(taille, theme, fabriquer, essais = 4000) {
  let refusee = 0;
  for (let essai = 0; essai < essais; essai++) {
    const random = createRandom(essai * 7919 + taille * 104729 + 17);
    const scene = genererScene(taille, theme, random);
    const placement = tirerPlacement(scene, random);
    if (!placement) continue;
    const role = choisirMeutreEtVictime(scene, placement, random);
    if (!role) continue;

    const indices = fabriquer(scene, placement) ?? null;
    if (!indices || !indices.length) continue;

    const verdict = valider(scene, indices, placement);
    if (!verdict.ok) continue;

    scene.victime = role.victime;
    scene.meurtrier = role.meurtrier;

    // Aller-retour obligatoire : le fichier ne doit contenir que des cas
    // qui se relisent et se revalident à l'identique. Si la sérialisation
    // perdait une information (une contrainte globale, la largeur d'un
    // masque), ce serait ici qu'on le verrait.
    const relu = relire(serialiserCas({ scene, arrangement: placement, indices }, 1));
    const verif = valider(relu.scene, relu.indices, relu.arrangement);
    if (!verif.ok) {
      refusee++;
      if (refusee === 1) {
        process.stderr.write(
          `  [${taille}×${taille}] cas écarté après relecture : ${verif.raison}\n`,
        );
      }
      continue;
    }

    return { scene, arrangement: placement, indices, deduction: verif.deduction };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Sérialisation                                                      */
/* ------------------------------------------------------------------ */

/** Masques : chaîne de '0'/'1', compacte et relisible dans le fichier. */
function serialiserIndice(indice, N) {
  return {
    id: indice.id,
    sujets: indice.sujets,
    titre: indice.titre,
    masques: (indice.masques ?? []).map((m) => (m ? Array.from(m).join('') : null)),
    global: indice.global ? indice.global.nom ?? null : null,
  };
}

/**
 * Les contraintes globales sont des fonctions : on ne peut pas les écrire
 * dans le fichier. Chacune est donc décrite par un objet que
 * `reconstruireCas` sait réinterpréter.
 */
function decrireGlobal(indice, scene) {
  if (typeof indice.global !== 'function') return null;
  const m = /^au-moins-(\d+)-(\d+)$/.exec(indice.id);
  if (m) return { type: 'au-moins', piece: Number(m[1]), seuil: Number(m[2]) };
  const s = /^seule-sur-(\d+)-(.+)$/.exec(indice.id);
  if (s) return { type: 'seule-sur', personne: Number(s[1]), objet: s[2] };
  throw new Error(`contrainte globale non décrivable : ${indice.id}`);
}

function serialiserCas(cas, niveau, resume = '') {
  const N = cas.scene.taille;
  return {
    id: cas.id,
    niveau,
    resume,
    titre: cas.scene.titre,
    taille: N,
    indices: cas.indices.length,
    scene: {
      taille: N,
      theme: cas.scene.theme,
      titre: cas.scene.titre,
      decalage: N * N,
      pieces: cas.scene.pieces.map((p) => ({ id: p.id, nom: p.nom, article: p.article, cellules: p.cellules, teinte: p.teinte })),
      objets: cas.scene.objets,
      // La clé doit s'appeler exactement `interdites` : c'est celle que
      // lisent le solveur, la trace et le contrôleur. Une faute de frappe ici
      // faisait disparaître les cases bloquées et le dossier cessait d'être unique.
      interdites: cas.scene.interdites,
      lettres: cas.scene.lettres,
      noms: cas.scene.noms,
      victime: cas.scene.victime,
      meurtrier: cas.scene.meurtrier,
    },
    arrangement: cas.arrangement,
    indices_detail: cas.indices.map((indice) => {
      const s = serialiserIndice(indice, N);
      s.global = decrireGlobal(indice, cas.scene);
      return s;
    }),
  };
}

/** Relecture d'un cas sérialisé, par le même chemin que le jeu. */
function relire(brut) {
  // `serialiserCas` range les indices sous `indices_detail` ; dans le
  // fichier final ils sont replacés sous `indices`. On uniformise ici.
  return reconstruireCas({ ...brut, indices: brut.indices_detail ?? brut.indices });
}

/* ------------------------------------------------------------------ */
/* Programme                                                          */
/* ------------------------------------------------------------------ */

// Chaque palier est défini par un thème, une taille et une fabrique
// d'indices. L'ordre du tableau est l'ordre d'apprentissage.
//
// `mechanicale: true` signifie que chaque personne est donnée par sa ligne
// et sa colonne : aucune déduction n'est nécessaire, on apprend seulement à
// lire la grille. Les paliers suivants utilisent tout le catalogue
// d'indices et le jeu minimal qui résout encore le dossier.
const PALIERS = [
  {
    id: 'premier-pas',
    theme: 'maison',
    taille: 4,
    resume: "Quatre personnes, quatre cases. Chaque indice donne une ligne puis une colonne : leur croisement est la réponse.",
    fabriquer: (scene, placement) => casFondation(scene, placement),
  },
  {
    id: 'croisements',
    theme: 'bureau',
    taille: 5,
    resume: "Même principe sur une grille plus grande : la ligne dit la bande, la colonne dit la colonne.",
    fabriquer: (scene, placement) => casFondation(scene, placement),
  },
  {
    id: 'le-bureau',
    theme: 'bureau',
    taille: 6,
    resume:
      "Six personnes. Les indices parlent désormais de la pièce et des objets : il faut lire la scène avant de conclure.",
    fabriquer: (scene, placement) => indicesMinimaux(scene, placement, createRandom(placement.join('') + scene.taille)),
  },
  {
    id: 'la-villa',
    theme: 'maison',
    taille: 6,
    resume:
      "Mêmes suspects, autre décor. Les indices s'enchaînent : la première déduction ouvre toutes les autres.",
    fabriquer: (scene, placement) => indicesMinimaux(scene, placement, createRandom(scene.theme + placement.join(','))),
  },
  {
    id: 'le-theatre',
    theme: 'theatre',
    taille: 6,
    resume:
      "Un indice par personne, rien de plus. Chaque déduction doit se justifier seule.",
    fabriquer: (scene, placement) => indicesMinimaux(scene, placement, createRandom('theatre' + placement.join(','))),
  },
  {
    id: 'la-plage',
    theme: 'plage',
    taille: 7,
    resume:
      "Sept personnes, et le jeu d'indices le plus court qui résout encore l'affaire.",
    fabriquer: (scene, placement) => indicesMinimaux(scene, placement, createRandom('plage' + placement.join(','))),
  },
];

function construire() {
  const cas = [];
  for (const [i, palier] of PALIERS.entries()) {
    const theme = THEMES.find((t) => t.id === palier.theme);
    if (!theme) throw new Error(`thème inconnu : ${palier.theme}`);
    const trouve = chercherCas(palier.taille, theme, palier.fabriquer);
    if (!trouve) throw new Error(`aucun cas conforme pour ${palier.id}`);
    trouve.id = palier.id;
    cas.push(serialiserCas(trouve, i + 1, palier.resume ?? ''));
    const mesure = mesurer(trouve.scene, trouve.indices, trouve.arrangement);
    process.stdout.write(
      `${palier.id.padEnd(14)} ${palier.taille}×${palier.taille} ` +
        `${String(cas[i].indices).padStart(2)} indices, ${mesure.pas} déductions, ` +
        `${mesure.effort} indice(s) par déduction\n`,
    );
  }
  return cas;
}

function ecrire(cas) {
  const corps = cas
    .map((c) => {
      const resume = JSON.stringify(c.resume ?? '');
      return [
        '  {',
        `    id: ${JSON.stringify(c.id)},`,
        `    niveau: ${c.niveau},`,
        `    resume: ${resume},`,
        `    taille: ${c.taille},`,
        `    scene: ${JSON.stringify(c.scene)},`,
        `    arrangement: ${JSON.stringify(c.arrangement)},`,
        `    indices: ${JSON.stringify(c.indices_detail)},`,
        '  },',
      ].join('\n');
    })
    .join('\n');

  return `/**
 * Affaires pré-calculées.
 *
 * Fichier produit par \`outils/construire-cas.mjs\` — ne pas éditer à la main.
 *
 * Chaque cas a été vérifié au moment de sa construction : la solution est
 * unique, et elle se déduit entièrement par propagation, étape par étape,
 * sans avoir à deviner. Le premier cas est volontairement trivial — une
 * ligne et une colonne par personne — pour apprendre la mécanique.
 *
 * \`reconstruireCas()\` réassemble les masques et les contraintes globales au
 * chargement ; les contraintes globales ne sont pas des fonctions
 * sérialisables, elles sont donc décrites par un objet.
 */

export const CAS_PRECALCULES = [
${corps}
];
`;
}

if (process.argv.includes('--verifier')) {
  const texte = await readFile(SORTIE, 'utf8');
  const module_ = await import(`data:text/javascript;base64,${Buffer.from(texte).toString('base64')}`);
  const { reconstruireCas } = await import('../site/js/murdoku/cas.js');
  let ko = 0;
  for (const brut of module_.CAS_PRECALCULES) {
    const cas = reconstruireCas(brut);
    const verdict = valider(cas.scene, cas.indices, cas.arrangement);
    if (!verdict.ok) {
      ko++;
      console.error(`  ECHEC ${brut.id} : ${verdict.raison}`);
    } else {
      console.log(`  ok   ${brut.id.padEnd(14)} ${verdict.deduction.etapes.length} déductions`);
    }
  }
  console.log(ko === 0 ? '\nTous les cas sont valides.' : `\n${ko} cas invalides.`);
  process.exit(ko === 0 ? 0 : 1);
}

const cas = construire();
await writeFile(SORTIE, ecrire(cas), 'utf8');
console.log(`\n${cas.length} cas écrits dans ${SORTIE}`);