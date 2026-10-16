/**
 * Mordoku — contrôleur de jeu : état, rendu, saisie clavier et tactile.
 */

import {
  COL_OF,
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  ROW_OF,
  cloneGrid,
  generatePuzzle,
  hasConflict,
  solve,
  usedDigits,
} from './sudoku.js';

import {
  chargerModeNotes,
  chargerPartie,
  chargerRecords,
  chargerTheme,
  enregistrerRecord,
  sauverModeNotes,
  sauverPartie,
  sauverTheme,
} from './storage.js';

/** Pénalité appliquée au chrono pour chaque indice utilisé. */
const PENALITE_INDICE = 30_000;

/** Historique max conservé pour l'annulation (borne la taille du stockage). */
const TAILLE_HISTORIQUE = 250;

/** Durée d'affichage des cases erronées après « Vérifier », en ms. */
const DUREE_SIGNALEMENT = 2600;

const elements = {
  grille: document.getElementById('grille'),
  chrono: document.getElementById('chrono'),
  annonce: document.getElementById('annonce'),
  difficulte: document.getElementById('difficulte'),
  records: document.getElementById('records'),
  voile: document.getElementById('voile'),
  fin: document.getElementById('fin'),
  finDetail: document.getElementById('fin-detail'),
  compteurIndices: document.getElementById('compteur-indices'),
  compteurErreurs: document.getElementById('compteur-erreurs'),
  boutonPause: document.getElementById('bouton-pause'),
  boutonTheme: document.getElementById('bouton-theme'),
  boutonNouvelle: document.getElementById('bouton-nouvelle'),
  boutonReprendre: document.getElementById('bouton-reprendre'),
  boutonAnnuler: document.getElementById('bouton-annuler'),
  boutonRetablir: document.getElementById('bouton-retablir'),
  boutonIndice: document.getElementById('bouton-indice'),
  boutonVerifier: document.getElementById('bouton-verifier'),
  boutonNotes: document.getElementById('bouton-notes'),
  boutonEffacer: document.getElementById('bouton-effacer'),
  themeIcone: document.getElementById('theme-icone'),
  touchesChiffres: [...document.querySelectorAll('.pave-chiffres .touche')],
  cases: [],
};

const etat = {
  puzzle: null, // Uint8Array des indices donnés (0 = vide)
  grille: null, // Uint8Array de la saisie du joueur
  solution: null, // Uint8Array, jamais sauvegardé, recalculé au chargement
  notes: Array.from({ length: 81 }, () => ''), // chiffres candidats par case
  difficulte: 'facile',
  selection: 0,
  elapsedMs: 0,
  runningSince: null,
  indices: 0,
  erreurs: 0,
  terminee: false,
  enPause: false,
  modeNotes: false,
  historique: [],
  futur: [],
  signales: new Set(), // erreurs en cours de signalement
  revelees: new Set(), // cases révélées par un indice (style permanent)
  theme: 'sombre',
};

let minuteurSignalement = null;
let minuteurSauvegarde = null;

/* ------------------------------------------------------------------ */
/* Outils                                                             */
/* ------------------------------------------------------------------ */

const maintenant = () => Date.now();

function tempsEcoule() {
  return etat.elapsedMs + (etat.runningSince === null ? 0 : maintenant() - etat.runningSince);
}

function formatDuration(millisecondes) {
  const total = Math.max(0, Math.floor(millisecondes / 1000));
  const heures = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const deuxChiffres = (n) => String(n).padStart(2, '0');
  const hhmmss = `${deuxChiffres(minutes)}:${deuxChiffres(total % 60)}`;
  return heures > 0 ? `${heures}:${hhmmss}` : hhmmss;
}

function annoncer(message) {
  elements.annonce.textContent = message;
}

function grilleVersChaine(grille) {
  return Array.from(grille).join('');
}

function chaineVersGrille(chaine) {
  const grille = new Uint8Array(81);
  for (let index = 0; index < 81; index++) grille[index] = Number(chaine[index]) || 0;
  return grille;
}

function notesVides() {
  return Array.from({ length: 81 }, () => '');
}

/** Les 8 cases voisines + la case elle-même, pour le surlignage. */
function casesAutour(index) {
  const entourage = new Set();
  for (let i = 0; i < 9; i++) entourage.add(ROW_OF[index] * 9 + i);
  for (let i = 0; i < 9; i++) entourage.add(i * 9 + COL_OF[index]);
  for (let i = 0; i < 9; i++) entourage.add(index - (index % 9) - (index % 3) + i);
  return entourage;
}

function etiquette(index, valeur) {
  const position = `Ligne ${ROW_OF[index] + 1}, colonne ${COL_OF[index] + 1}`;
  const contenu =
    valeur === 0
      ? etat.notes[index]
        ? `notes ${etat.notes[index].split('').join(' ')}`
        : 'vide'
      : `chiffre ${valeur}${etat.puzzle[index] !== 0 ? ', donné' : ''}`;
  return `${position}, ${contenu}`;
}

/* ------------------------------------------------------------------ */
/* Construction de la grille à l'écran                                */
/* ------------------------------------------------------------------ */

function construireGrille() {
  const fragment = document.createDocumentFragment();

  for (let rangee = 0; rangee < 9; rangee++) {
    const ligne = document.createElement('div');
    ligne.className = 'rangee';
    ligne.setAttribute('role', 'row');

    for (let colonne = 0; colonne < 9; colonne++) {
      const index = rangee * 9 + colonne;
      const case_ = document.createElement('div');
      case_.className = 'case';
      case_.setAttribute('role', 'gridcell');
      case_.dataset.index = String(index);
      if (rangee % 3 === 2 && rangee !== 8) case_.dataset.blocLigne = 'true';
      if (colonne % 3 === 2 && colonne !== 8) case_.dataset.blocColonne = 'true';

      const valeur = document.createElement('span');
      valeur.className = 'valeur';

      const notes = document.createElement('div');
      notes.className = 'notes';
      for (let chiffre = 1; chiffre <= 9; chiffre++) {
        const span = document.createElement('span');
        span.dataset.chiffre = String(chiffre);
        span.textContent = String(chiffre);
        notes.append(span);
      }

      case_.append(valeur, notes);
      case_.addEventListener('click', () => selectionner(index));
      ligne.append(case_);
      elements.cases.push(case_);
    }

    fragment.append(ligne);
  }

  elements.grille.append(fragment);
}

/* ------------------------------------------------------------------ */
/* Rendu                                                              */
/* ------------------------------------------------------------------ */

function rendre() {
  const entourage = casesAutour(etat.selection);
  const chiffreSelection = etat.grille[etat.selection];

  for (let index = 0; index < 81; index++) {
    const case_ = elements.cases[index];
    const valeur = etat.grille[index];
    const classes = case_.classList;
    const spanValeur = case_.firstChild;

    classes.toggle('donne', etat.puzzle[index] !== 0);
    classes.toggle('saisie', etat.puzzle[index] === 0 && valeur !== 0);
    classes.toggle('selection', index === etat.selection);
    classes.toggle('entourage', index !== etat.selection && entourage.has(index));
    classes.toggle('meme-chiffre', chiffreSelection !== 0 && valeur === chiffreSelection);
    classes.toggle('erreur', etat.signales.has(index));
    classes.toggle('indice', etat.revelees.has(index));

    spanValeur.textContent = valeur === 0 ? '' : String(valeur);

    const notes = case_.lastChild;
    for (const span of notes.children) {
      span.hidden = !(valeur === 0 && etat.notes[index].includes(span.dataset.chiffre));
    }

    case_.setAttribute('aria-label', etiquette(index, valeur));
    case_.setAttribute('aria-selected', String(index === etat.selection));
  }

  elements.chrono.textContent = formatDuration(tempsEcoule());
  elements.compteurIndices.textContent = String(etat.indices);
  elements.compteurErreurs.textContent = String(etat.erreurs);

  elements.boutonAnnuler.disabled = etat.historique.length === 0;
  elements.boutonRetablir.disabled = etat.futur.length === 0;
  elements.boutonPause.setAttribute('aria-pressed', String(etat.enPause));
  elements.boutonNotes.setAttribute('aria-pressed', String(etat.modeNotes));
  elements.boutonIndice.disabled = etat.terminee;
  elements.boutonVerifier.disabled = etat.terminee;

  elements.voile.hidden = !etat.enPause;
  elements.fin.hidden = !etat.terminee;
  elements.fin.dataset.visible = String(etat.terminee);

  majPave();
  majRecords();
}

/** Grise les chiffres déjà posés 9 fois, et marque celui de la case active. */
function majPave() {
  const compte = new Array(10).fill(0);
  for (const valeur of etat.grille) if (valeur !== 0) compte[valeur]++;
  const caseOccupee = etat.puzzle[etat.selection] !== 0 || etat.grille[etat.selection] !== 0;

  for (const touche of elements.touchesChiffres) {
    const chiffre = Number(touche.dataset.saisie);
    const complete = compte[chiffre] >= 9;
    touche.classList.toggle('est-complete', complete);
    touche.classList.toggle('est-utilisee', etat.grille[etat.selection] === chiffre);
    touche.disabled = caseOccupee || complete;
  }
}

function majRecords() {
  const records = chargerRecords();
  elements.records.replaceChildren();
  for (const difficulte of DIFFICULTY_ORDER) {
    const dt = document.createElement('dt');
    dt.textContent = DIFFICULTIES[difficulte].label;
    const dd = document.createElement('dd');
    const temps = records[difficulte];
    dd.textContent = typeof temps === 'number' ? formatDuration(temps) : '—';
    elements.records.append(dt, dd);
  }
}

/* ------------------------------------------------------------------ */
/* Sauvegarde                                                          */
/* ------------------------------------------------------------------ */

function sauvegarder() {
  sauverPartie({
    version: 1,
    difficulte: etat.difficulte,
    puzzle: grilleVersChaine(etat.puzzle),
    grille: grilleVersChaine(etat.grille),
    notes: etat.notes.slice(),
    elapsedMs: etat.elapsedMs,
    runningSince: etat.runningSince,
    enPause: etat.enPause,
    indices: etat.indices,
    erreurs: etat.erreurs,
    terminee: etat.terminee,
    selection: etat.selection,
    historique: etat.historique.slice(-TAILLE_HISTORIQUE),
    futur: etat.futur.slice(-TAILLE_HISTORIQUE),
  });
}

function sauvegarderDifferé() {
  if (minuteurSauvegarde !== null) return;
  minuteurSauvegarde = window.setTimeout(() => {
    minuteurSauvegarde = null;
    sauvegarder();
  }, 400);
}

/* ------------------------------------------------------------------ */
/* Coups                                                              */
/* ------------------------------------------------------------------ */

function enregistrerCoup(index, avant, apres) {
  etat.historique.push({ index, avant, apres });
  if (etat.historique.length > TAILLE_HISTORIQUE) etat.historique.shift();
  etat.futur.length = 0;
}

const estJouable = () => !etat.terminee && !etat.enPause && etat.puzzle[etat.selection] === 0;

function poserChiffre(chiffre) {
  if (!estJouable()) return;
  const index = etat.selection;
  const avant = { valeur: etat.grille[index], notes: etat.notes[index] };

  if (etat.modeNotes) {
    if (avant.valeur !== 0) {
      etat.grille[index] = 0;
      etat.notes[index] = '';
      enregistrerCoup(index, avant, { valeur: 0, notes: '' });
    } else {
      const chiffreTexte = String(chiffre);
      const notes = avant.notes.includes(chiffreTexte)
        ? avant.notes.replace(chiffreTexte, '')
        : [...(avant.notes + chiffreTexte)].sort().join('');
      etat.notes[index] = notes;
      enregistrerCoup(index, avant, { valeur: 0, notes });
      avancer(index);
    }
  } else {
    // Écrire un chiffre le remplace toujours : une valeur déjà présente est
    // réécrite, jamais vidée. Vider passe par ⌫ / 0, ce qui évite la
    // situation piégée d'une case remplie qui se vide sur le même appui.
    etat.grille[index] = chiffre;
    etat.notes[index] = '';
    etat.revelees.delete(index);
    etat.signales.delete(index);
    enregistrerCoup(index, avant, { valeur: chiffre, notes: '' });
    avancer(index);
  }

  rendre();
  sauvegarderDifferé();
  verifierFin();
}

function effacerCase() {
  if (!estJouable()) return;
  const index = etat.selection;
  const avant = { valeur: etat.grille[index], notes: etat.notes[index] };
  if (avant.valeur === 0 && avant.notes === '') return;

  etat.grille[index] = 0;
  etat.notes[index] = '';
  etat.revelees.delete(index);
  enregistrerCoup(index, avant, { valeur: 0, notes: '' });
  rendre();
  sauvegarderDifferé();
}

/** Avance le curseur seulement si la case suivante est réellement libre. */
function avancer(index) {
  const suivant = (index + 1) % 81;
  if (etat.puzzle[suivant] === 0 && etat.grille[suivant] === 0) selectionner(suivant);
}

function selectionner(index) {
  etat.selection = Math.max(0, Math.min(80, index));
  rendre();
}

function annuler() {
  const coup = etat.historique.pop();
  if (!coup) return;
  etat.futur.push(coup);
  appliquerCoup(coup, coup.avant);
  annoncer('Coup annulé');
}

function retablir() {
  const coup = etat.futur.pop();
  if (!coup) return;
  etat.historique.push(coup);
  appliquerCoup(coup, coup.apres);
  annoncer('Coup rétabli');
}

function appliquerCoup(coup, etatCase) {
  etat.grille[coup.index] = etatCase.valeur;
  etat.notes[coup.index] = etatCase.notes;
  etat.revelees.delete(coup.index);
  etat.signales.clear();
  selectionner(coup.index);
  sauvegarderDifferé();
}

/* ------------------------------------------------------------------ */
/* Actions de jeu                                                     */
/* ------------------------------------------------------------------ */

/** Victoire : les 81 cases sont remplies et toutes justes. */
function estGagne() {
  if (etat.solution === null) return false;
  for (let index = 0; index < 81; index++) if (etat.grille[index] !== etat.solution[index]) return false;
  return true;
}

function verifierFin() {
  if (etat.terminee || !estGagne()) return;

  etat.terminee = true;
  etat.elapsedMs = tempsEcoule();
  etat.runningSince = null;

  const temps = etat.elapsedMs;
  // Un temps obtenu avec des indices n'est pas un record honnête.
  const record = etat.indices === 0 && enregistrerRecord(etat.difficulte, temps);
  const indices = etat.indices > 0 ? ` · ${etat.indices} indice${etat.indices > 1 ? 's' : ''}` : '';

  elements.finDetail.textContent =
    `${DIFFICULTIES[etat.difficulte].label} en ${formatDuration(temps)}${indices}` +
    (record ? ' · nouveau record !' : '');

  annoncer(`Grille résolue en ${formatDuration(temps)}`);
  rendre();
  sauvegarder();
}

function signalerErreurs() {
  if (etat.terminee) return;
  let erreurs = 0;
  etat.signales.clear();

  for (let index = 0; index < 81; index++) {
    const valeur = etat.grille[index];
    if (valeur === 0) continue;
    if (valeur !== etat.solution[index] || hasConflict(etat.grille, index)) {
      etat.signales.add(index);
      erreurs++;
    }
  }

  etat.erreurs += erreurs;
  rendre();
  sauvegarderDifferé();
  annoncer(
    erreurs === 0
      ? 'Aucune erreur pour le moment'
      : `${erreurs} erreur${erreurs > 1 ? 's' : ''} repérée${erreurs > 1 ? 's' : ''}`,
  );

  window.clearTimeout(minuteurSignalement);
  minuteurSignalement = window.setTimeout(() => {
    etat.signales.clear();
    rendre();
  }, DUREE_SIGNALEMENT);
}

function donnerIndice() {
  if (etat.terminee || etat.enPause || etat.solution === null) return;

  // Case vide, sans conflit avec la saisie, et de préférence la plus
  // contrainte : c'est celle qui apporte le plus d'information.
  let cible = -1;
  let moinsCandidats = 10;

  for (let index = 0; index < 81; index++) {
    if (etat.puzzle[index] !== 0 || etat.grille[index] !== 0) continue;
    if (hasConflict(etat.grille, index)) continue;
    const candidats = usedDigits(etat.grille, index).filter(Boolean).length;
    if (candidats < moinsCandidats) {
      cible = index;
      moinsCandidats = candidats;
      if (candidats === 8) break; // case totalement libre : on s'arrête là
    }
  }

  if (cible === -1) return;

  const avant = { valeur: etat.grille[cible], notes: etat.notes[cible] };
  const valeur = etat.solution[cible];

  etat.grille[cible] = valeur;
  etat.notes[cible] = '';
  etat.revelees.add(cible);
  etat.indices += 1;
  etat.elapsedMs += PENALITE_INDICE;
  enregistrerCoup(cible, avant, { valeur, notes: '' });

  selectionner(cible);
  annoncer(`Indice donné ligne ${ROW_OF[cible] + 1}, colonne ${COL_OF[cible] + 1}`);
  verifierFin();
}

function basculerPause(force) {
  if (etat.terminee) return;
  etat.enPause = typeof force === 'boolean' ? force : !etat.enPause;

  if (etat.enPause) {
    etat.elapsedMs = tempsEcoule();
    etat.runningSince = null;
  } else if (etat.runningSince === null) {
    etat.runningSince = maintenant();
  }

  rendre();
  sauvegarder();
  annoncer(etat.enPause ? 'Partie en pause' : 'Reprise de la partie');
}

function nouvellePartie(difficulte = 'facile') {
  const config = DIFFICULTIES[difficulte] ? difficulte : 'facile';
  const { puzzle, solution } = generatePuzzle(config);

  etat.puzzle = puzzle;
  etat.grille = cloneGrid(puzzle);
  etat.solution = solution;
  etat.notes = notesVides();
  etat.difficulte = config;
  etat.selection = premiereCaseVide();
  etat.elapsedMs = 0;
  etat.runningSince = maintenant();
  etat.indices = 0;
  etat.erreurs = 0;
  etat.terminee = false;
  etat.enPause = false;
  etat.historique = [];
  etat.futur = [];
  etat.signales.clear();
  etat.revelees.clear();

  window.clearTimeout(minuteurSignalement);
  elements.difficulte.value = config;
  rendre();
  sauvegarder();
  annoncer(`Nouvelle partie ${DIFFICULTIES[config].label}`);
}

function premiereCaseVide() {
  for (let index = 0; index < 81; index++) if (etat.puzzle[index] === 0) return index;
  return 0;
}

/* ------------------------------------------------------------------ */
/* Thème                                                               */
/* ------------------------------------------------------------------ */

function appliquerTheme(theme) {
  etat.theme = theme;
  document.documentElement.dataset.theme = theme;
  elements.themeIcone.textContent = theme === 'sombre' ? '☾' : '☀';
  sauverTheme(theme);
}

function basculerTheme() {
  appliquerTheme(etat.theme === 'sombre' ? 'clair' : 'sombre');
  annoncer(etat.theme === 'sombre' ? 'Thème sombre' : 'Thème clair');
}

/* ------------------------------------------------------------------ */
/* Saisie clavier                                                     */
/* ------------------------------------------------------------------ */

function deplacer(dRow, dCol) {
  let row = ROW_OF[etat.selection] + dRow;
  let col = COL_OF[etat.selection] + dCol;
  if (row < 0) row = 8;
  if (row > 8) row = 0;
  if (col < 0) col = 8;
  if (col > 8) col = 0;
  selectionner(row * 9 + col);
}

function basculerModeNotes() {
  etat.modeNotes = !etat.modeNotes;
  sauverModeNotes(etat.modeNotes);
  rendre();
  annoncer(etat.modeNotes ? 'Mode notes activé' : 'Mode notes désactivé');
}

function surToucheClavier(evenement) {
  if (evenement.ctrlKey && !['z', 'y'].includes(evenement.key.toLowerCase())) return;
  if (evenement.metaKey || evenement.altKey) return;

  const touche = evenement.key;
  const surBouton = document.activeElement?.tagName === 'BUTTON';

  // Espace et Entrée activent le bouton focusé : on ne les intercepte pas,
  // sinon le clavier ne pourrait plus piloter l'interface.
  if (surBouton && (touche === ' ' || touche === 'Enter')) return;

  if (evenement.ctrlKey) {
    const raccourci = touche.toLowerCase();
    if (raccourci === 'z') {
      evenement.preventDefault();
      evenement.shiftKey ? retablir() : annuler();
      return;
    }
    if (raccourci === 'y') {
      evenement.preventDefault();
      retablir();
      return;
    }
  }

  if (touche >= '1' && touche <= '9') {
    evenement.preventDefault();
    poserChiffre(Number(touche));
    return;
  }

  switch (touche) {
    case 'ArrowUp':
      evenement.preventDefault();
      deplacer(-1, 0);
      return;
    case 'ArrowDown':
      evenement.preventDefault();
      deplacer(1, 0);
      return;
    case 'ArrowLeft':
      evenement.preventDefault();
      deplacer(0, -1);
      return;
    case 'ArrowRight':
      evenement.preventDefault();
      deplacer(0, 1);
      return;
    case 'Backspace':
    case 'Delete':
    case '0':
      evenement.preventDefault();
      effacerCase();
      return;
    case ' ':
      evenement.preventDefault();
      basculerModeNotes();
      return;
    default:
      break;
  }

  switch (touche.toLowerCase()) {
    case 'n':
      basculerModeNotes();
      break;
    case 'h':
      donnerIndice();
      break;
    case 'v':
      signalerErreurs();
      break;
    case 'p':
      basculerPause();
      break;
    case 't':
      basculerTheme();
      break;
    default:
      break;
  }
}

/* ------------------------------------------------------------------ */
/* Démarrage                                                           */
/* ------------------------------------------------------------------ */

function remplirDifficultes() {
  for (const difficulte of DIFFICULTY_ORDER) {
    const option = document.createElement('option');
    option.value = difficulte;
    option.textContent = DIFFICULTIES[difficulte].label;
    elements.difficulte.append(option);
  }
}

function restaurer() {
  const partie = chargerPartie();

  if (!partie) {
    nouvellePartie(elements.difficulte.value || 'facile');
    return;
  }

  etat.puzzle = chaineVersGrille(partie.puzzle);
  etat.grille = chaineVersGrille(partie.grille);
  etat.notes =
    Array.isArray(partie.notes) && partie.notes.length === 81
      ? partie.notes.map((notes) => (typeof notes === 'string' ? notes : ''))
      : notesVides();
  etat.difficulte = DIFFICULTIES[partie.difficulte] ? partie.difficulte : 'facile';
  etat.elapsedMs = Number(partie.elapsedMs) || 0;
  etat.runningSince = typeof partie.runningSince === 'number' ? partie.runningSince : null;
  etat.enPause = partie.enPause === true;
  etat.indices = Number(partie.indices) || 0;
  etat.erreurs = Number(partie.erreurs) || 0;
  etat.terminee = partie.terminee === true;
  etat.selection = Math.max(0, Math.min(80, Number(partie.selection) || 0));
  etat.historique = Array.isArray(partie.historique) ? partie.historique : [];
  etat.futur = Array.isArray(partie.futur) ? partie.futur : [];

  // La solution n'est jamais sauvegardée : le sudoku ayant une solution
  // unique, le solveur retrouve exactement celle de la partie en cours.
  etat.solution = solve(etat.puzzle);

  elements.difficulte.value = etat.difficulte;
  rendre();
}

function brancher() {
  construireGrille();
  remplirDifficultes();
  appliquerTheme(chargerTheme());
  etat.modeNotes = chargerModeNotes();
  restaurer();

  document.addEventListener('keydown', surToucheClavier);

  for (const touche of elements.touchesChiffres) {
    touche.addEventListener('click', () => poserChiffre(Number(touche.dataset.saisie)));
  }

  elements.boutonEffacer.addEventListener('click', effacerCase);
  elements.boutonNotes.addEventListener('click', basculerModeNotes);
  elements.boutonAnnuler.addEventListener('click', annuler);
  elements.boutonRetablir.addEventListener('click', retablir);
  elements.boutonIndice.addEventListener('click', donnerIndice);
  elements.boutonVerifier.addEventListener('click', signalerErreurs);
  elements.boutonPause.addEventListener('click', () => basculerPause());
  elements.boutonReprendre.addEventListener('click', () => basculerPause(false));
  elements.boutonTheme.addEventListener('click', basculerTheme);
  elements.boutonNouvelle.addEventListener('click', () => nouvellePartie(elements.difficulte.value));
  elements.difficulte.addEventListener('change', () => nouvellePartie(elements.difficulte.value));

  window.setInterval(() => {
    if (etat.runningSince !== null && !etat.enPause && !etat.terminee) {
      elements.chrono.textContent = formatDuration(tempsEcoule());
    }
  }, 500);

  window.addEventListener('beforeunload', sauvegarder);
  window.addEventListener('pagehide', sauvegarder);
}

brancher();