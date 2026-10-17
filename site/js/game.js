/**
 * Mordoku — contrôleur du jeu : affaire, scène, sélection, action.
 * Tout reste dans le navigateur.
 */

import { genererAffaireAuHasard } from './murdoku/generator.js';
import { enrichir } from './murdoku/clues.js';

import {
  chargerPartie,
  sauverPartie,
  chargerRecords,
  chargerTheme,
  enregistrerRecord,
  sauverTheme,
} from './storage.js';

const DIFFICULTIES = [
  { id: 'debutant', label: 'Débutant', taille: 6, penaliteIndice: 60000 },
  { id: 'intermediaire', label: 'Intermédiaire', taille: 7, penaliteIndice: 90000 },
];

const els = {
  scene: document.getElementById('scene'),
  calqueNoms: document.getElementById('calque-noms'),
  titreAffaire: document.getElementById('titre-affaire'),
  selectDifficulte: document.getElementById('select-difficulte'),
  listeSuspects: document.getElementById('liste-suspects'),
  listeIndices: document.getElementById('liste-indices'),
  videIndices: document.getElementById('vide-indices'),
  records: document.getElementById('records'),
  voile: document.getElementById('voile'),
  chargement: document.getElementById('chargement'),
  chrono: document.getElementById('chrono'),
  annce: document.getElementById('annonce'),
  boutonPause: document.getElementById('bouton-pause'),
  boutonTheme: document.getElementById('bouton-theme'),
  boutonReprendre: document.getElementById('bouton-reprendre'),
  boutonAnnuler: document.getElementById('bouton-annuler'),
  boutonRetablir: document.getElementById('bouton-retablir'),
  boutonIndice: document.getElementById('bouton-indice'),
  compteurIndices: document.getElementById('compteur-indices'),
  boutonSoumettre: document.getElementById('bouton-soumettre'),
  btnOutX: document.getElementById('bouton-outil-x'),
  btnOutEffacer: document.getElementById('bouton-effacer'),
  boutonAide: document.getElementById('bouton-aide'),
  boutonFermerAide: document.getElementById('bouton-fermer-aide'),
  aide: document.getElementById('aide'),
  themeIcone: document.getElementById('theme-icone'),
  fin: document.getElementById('fin'),
  finTitre: document.getElementById('fin-titre'),
  finSousTitre: document.getElementById('fin-sous-titre'),
  reveal: document.getElementById('reveal'),
  boutonFermerFin: document.getElementById('bouton-fermer-fin'),
  boutonNouvelle: document.getElementById('bouton-nouvelle'),
  boutonRevoir: document.getElementById('bouton-revoir'),
};

/** Portraits : un par suspect, tirés une fois pour l'affaire. */
const PORTRAITS = ['👩🏻', '👨🏾', '👩🏼', '👨🏻', '👩🏽', '👨🏼', '👩🏿', '👨🏽'];

const state = {
  affaire: null,
  difficulty: 'debutant',
  placements: [],
  xMarks: new Set(),
  candidats: [],
  lettresAffaire: [],
  selectedPerson: 0,
  tool: 'personne',
  indices: 0,
  elapsedMs: 0,
  runningSince: null,
  enPause: false,
  terminee: false,
  meurtrierRevele: false,
  historique: [],
  futur: [],
  chronoHandle: null,
  theme: 'sombre',
};

const now = () => Date.now();

function tempsEcoule() {
  return state.elapsedMs + (state.runningSince === null ? 0 : now() - state.runningSince);
}

function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const heures = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const mm = String(minutes).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return heures > 0 ? `${heures}:${mm}:${ss}` : `${mm}:${ss}`;
}

function annonce(msg) {
  els.annce.textContent = msg;
}

function diffInfo() { return DIFFICULTIES.find((d) => d.id === state.difficulty) ?? DIFFICULTIES[0]; }

function lettres() { return state.affaire.scene.lettres; }
function N() { return state.affaire.scene.taille; }

/* ---------- Sauvegarde ---------- */

function sauvegarder() {
  if (!state.affaire) return;
  sauverPartie({
    version: 1,
    difficulte: state.difficulty,
    seed: state.affaire.seed,
    taille: state.affaire.taille,
    scene: state.affaire.scene,
    arrangement: state.affaire.arrangement,
    clues: state.affaire.clues,
    victime: state.affaire.victime,
    meurtrier: state.affaire.meurtrier,
    placements: state.placements.slice(),
    xMarks: [...state.xMarks],
    candidats: snapCandidats(state.candidats),
    indices: state.indices,
    selectionPersonne: state.selectedPerson,
    historique: state.historique.slice(-200),
    futur: state.futur.slice(-200),
    elapsedMs: state.elapsedMs,
    runningSince: state.runningSince,
    enPause: state.enPause,
    terminee: state.terminee,
    meurtrierRevele: state.meurtrierRevele,
  });
}

let minuteurSauvegarde = null;
function sauvegarderDifferé() {
  if (minuteurSauvegarde !== null) return;
  minuteurSauvegarde = window.setTimeout(() => {
    minuteurSauvegarde = null;
    sauvegarder();
  }, 400);
}

/* ---------- Rendu ---------- */

let pieceTable = [];

function reconstruireScene() {
  const scene = state.affaire.scene;
  const taille = scene.taille;
  els.scene.style.setProperty('--cols', String(taille));
  els.scene.style.setProperty('--lignes', String(taille));
  els.scene.replaceChildren();
  els.calqueNoms.replaceChildren();

  pieceTable = new Array(taille * taille).fill(-1);
  for (const piece of scene.pieces) {
    for (const c of piece.cellules) pieceTable[c] = piece.id;
  }

  const bloquees = new Set((scene.interdites ?? []).map((i) => i.cellule));
  const objetParCellule = new Map();
  for (const o of scene.objets) objetParCellule.set(o.cellule, o);

  const pieceIdEn = (index) => pieceTable[index];

  for (let index = 0; index < taille * taille; index++) {
    const ligne = Math.floor(index / taille);
    const colonne = index % taille;
    const piece = pieceIdEn(index);

    const cell = document.createElement('div');
    cell.className = 'cellule';
    cell.dataset.index = String(index);
    cell.dataset.piece = String(piece ?? 0);
    if (bloquees.has(index)) cell.classList.add('bloquee');

    // Contour épais là où la pièce change : c'est ce qui fait lire la carte
    // comme un plan plutôt qu'une grille de cases.
    const bords = [];
    if (ligne === 0 || pieceIdEn(index - taille) !== piece) bords.push('haut');
    if (ligne === taille - 1 || pieceIdEn(index + taille) !== piece) bords.push('bas');
    if (colonne === 0 || pieceIdEn(index - 1) !== piece) bords.push('gauche');
    if (colonne === taille - 1 || pieceIdEn(index + 1) !== piece) bords.push('droite');
    if (bords.length) cell.dataset.bord = bords.join(' ');

    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('aria-label', `Ligne ${ligne + 1}, colonne ${colonne + 1}`);

    const objet = objetParCellule.get(index);
    if (objet) {
      const span = document.createElement('span');
      span.className = 'objet';
      span.textContent = objet.emoji;
      span.title = `${objet.article} ${objet.nom}`;
      cell.append(span);
    }

    const badge = document.createElement('div');
    badge.className = 'badge-personne';
    badge.hidden = true;

    const candBadges = document.createElement('div');
    candBadges.className = 'cand-badges';
    candBadges.hidden = true;

    cell.append(badge, candBadges);
    cell.addEventListener('pointerdown', (evt) => {
      evt.preventDefault();
      pointeurEnfonce = true;
      surVISEE(index, cell);
    });
    cell.addEventListener('pointerenter', () => {
      if (pointeurEnfonce) surVISEE(index, cell);
    });
    cell.addEventListener('pointerup', () => { pointeurEnfonce = false; });
    cell.addEventListener('click', () => validerClic(index));
    cell.addEventListener('contextmenu', (evt) => {
      evt.preventDefault();
      basculerOutilX();
      onCelluleClick(index);
    });
    els.scene.append(cell);
  }

  poserNomsPieces();
  rendre();
}

/** Noms des pièces, centrés sur leur zone. */
function poserNomsPieces() {
  const scene = state.affaire.scene;
  const taille = scene.taille;
  els.calqueNoms.replaceChildren();

  for (const piece of scene.pieces) {
    const colonnes = piece.cellules.map((c) => c % taille);
    const lignes = piece.cellules.map((c) => Math.floor(c / taille));
    const centreL = (Math.min(...lignes) + Math.max(...lignes) + 1) / 2 / taille;
    const centreC = (Math.min(...colonnes) + Math.max(...colonnes) + 1) / 2 / taille;

    const mots = piece.nom.split(/\s+/);
    const rang = ['LE', 'LA', 'LES', "L'"].includes(mots[0]) ? 1 : 0;

    const label = document.createElement('span');
    label.className = 'nom-piece';
    if (piece.cellules.length <= 6) label.classList.add('serré');
    label.textContent = mots.slice(rang).join(' ');
    label.style.left = `${centreC * 100}%`;
    label.style.top = `${centreL * 100}%`;
    els.calqueNoms.append(label);
  }
}

let pointeurEnfonce = false;
let celluleVisee = null;

/**
 * Survol « maintien » : on montre la case visée avant de placer, pour éviter
 * les poses accidentelles. Un simple survol n'engage rien.
 */
function surVISEE(index, cell) {
  if (state.terminee || state.enPause) return;
  if (celluleVisee === index) return;
  celluleVisee = index;
  for (const autre of els.scene.children) autre.classList.remove('visée');
  if (state.tool === 'personne') cell.classList.add('visée');
}

function validerClic(index) {
  if (state.terminee || state.enPause) return;
  onCelluleClick(index);
}

function basculerOutilX() {
  state.tool = state.tool === 'x' ? 'personne' : 'x';
  majOutils();
}

function majOutils() {
  els.btnOutX.setAttribute('aria-pressed', String(state.tool === 'x'));
  els.btnOutEffacer.setAttribute('aria-pressed', String(state.tool === 'effacer'));
}

function rendre() {
  if (!state.affaire) return;
  const scene = state.affaire.scene;
  const taille = scene.taille;
  const cells = [...els.scene.children];
  const pbc = personByCell();

  for (let index = 0; index < cells.length; index++) {
    const cell = cells[index];
    cell.classList.remove('personne', 'victime', 'x-mark');
    const badge = cell.querySelector('.badge-personne');
    badge.hidden = true;
    badge.classList.remove('victime');

    if (state.xMarks.has(index) && !personByCell().has(index)) cell.classList.add('x-mark');

    if (personByCell().has(index)) {
      const p = personByCell().get(index);
      cell.classList.add('personne');
      if (p === state.affaire.victime) cell.classList.add('victime');
      badge.hidden = false;
      badge.textContent = scene.lettres[p];
      if (p === state.affaire.victime) badge.classList.add('victime');
    }
  }

  // suspects list state
  for (let p = 0; p < state.placements.length; p++) {
    const carte = document.querySelector(`.suspect-carte[data-personne="${p}"]`);
    if (!carte) return;
    carte.classList.toggle('selectionne', p === state.selectedPerson);
    carte.classList.toggle('place', state.placements[p] !== -1);
  }

  els.chrono.textContent = formatDuration(tempsEcoule());
  els.boutonSoumettre.disabled = state.placements.some((p) => p === -1) || state.terminee;
  els.boutonAnnuler.disabled = state.historique.length === 0;
  els.boutonRetablir.disabled = state.futur.length === 0;
  els.boutonPause.setAttribute('aria-pressed', String(state.enPause));
  els.voile.hidden = !state.enPause;

  els.listeSuspects.replaceChildren();
  construireListeSuspects();
  chargerListeIndices();
}

function chargerListeIndices() {
  els.listeIndices.replaceChildren();
  let trouve = false;
  for (const c of (state.affaire.clues ?? [])) {
    const global = (c.sujets ?? []).length === 0;
    if (!global) continue;
    const li = document.createElement('li');
    li.innerHTML = enrichir(c.titre, state.affaire.scene);
    els.listeIndices.append(li);
    trouve = true;
  }
  els.videIndices.hidden = trouve;
}

function construireListeSuspects() {
  const affaire = state.affaire;
  const scene = affaire.scene;
  els.listeSuspects.replaceChildren();

  for (let p = 0; p < scene.noms.length; p++) {
    const mesIndices = (affaire.clues ?? []).filter((c) => (c.sujets ?? []).includes(p));
    const teinte = `var(--sus-${p % 8})`;

    const li = document.createElement('li');

    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'suspect';
    bouton.dataset.personne = String(p);
    bouton.style.setProperty('--teinte', teinte);
    bouton.setAttribute('aria-pressed', String(p === state.selectedPerson));

    const portrait = document.createElement('span');
    portrait.className = 'portrait';
    portrait.textContent = PORTRAITS[p % PORTRAITS.length];

    const pastille = document.createElement('span');
    pastille.className = 'marque-place';
    pastille.textContent = scene.lettres[p];

    const nom = document.createElement('span');
    nom.className = 'nom';
    nom.textContent = scene.noms[p];

    portrait.append(pastille);
    bouton.append(portrait, nom);
    bouton.addEventListener('click', () => choisirPersonne(p));

    const carte = document.createElement('p');
    carte.className = 'carte-indice';
    carte.style.setProperty('--teinte', teinte);
    if (p === affaire.victime) {
      carte.classList.add('victime');
      carte.innerHTML = '<strong>La victime.</strong> Elle était <strong>seule</strong> avec le meurtrier.';
    } else if (mesIndices.length) {
      carte.innerHTML = mesIndices.map((c) => enrichir(c.titre, scene)).join('<br>');
    } else {
      carte.classList.add('vide');
      carte.textContent = 'Aucun indice direct — déduisez de la scène.';
    }

    li.append(bouton, carte);
    els.listeSuspects.append(li);
    majEtatSuspect(p);
  }
}

function majEtatSuspect(p) {
  const carte = els.listeSuspects.querySelector(`.suspect[data-personne="${p}"]`);
  if (!carte) return;
  carte.classList.toggle('placé', state.placements[p] !== -1);
  carte.setAttribute('aria-pressed', String(p === state.selectedPerson));
}

function chargerRecordsUI() {
  const records = chargerRecords();
  els.records.replaceChildren();
  for (const d of DIFFICULTIES) {
    const dt = document.createElement('dt');
    dt.textContent = d.label;
    const dd = document.createElement('dd');
    const t = records[d.id];
    dd.textContent = typeof t === 'number' ? formatDuration(t) : '—';
    els.records.append(dt, dd);
  }
}

function restaurer(partie) {
  try {
    const affaire = {
      scene: partie.scene,
      arrangement: partie.arrangement,
      clues: partie.clues,
      victime: partie.victime,
      meurtrier: partie.meurtrier,
      taille: partie.taille,
      seed: partie.seed,
    };
    state.affaire = affaire;
    state.difficulty = partie.difficulte;
    state.placements = (partie.placements ?? []).slice();
    state.xMarks = new Set(partie.xMarks ?? []);
    state.candidats = Array.from({ length: (partie.scene?.lettres?.length ?? 0) }, (_, i) =>
      Array.isArray(partie.candidats?.[i]) ? partie.candidats[i].slice() : [],
    );
    state.selectedPerson = (Number.isInteger(partie.selectionPersonne) ? partie.selectionPersonne : 0);
    state.indices = Number(partie.indices) || 0;
    state.elapsedMs = partie.elapsedMs ?? 0;
    state.runningSince = partie.runningSince ?? null;
    state.enPause = partie.enPause === true;
    state.terminee = partie.terminee === true;
    state.meurtrierRevele = partie.meurtrierRevele === true;
    state.historique = partie.historique ?? [];
    state.futur = [];
    state.lettresAffaire = affaire.scene.lettres;

    els.titreAffaire.textContent = affaire.scene.titre + (state.meurtrierRevele ? ' (résolu)' : '');
    const di = DIFFICULTIES.find((d) => d.id === state.difficulty) ?? DIFFICULTIES[0];
    els.selectDifficulte.value = state.difficulty;
    chargerListeIndices();
    construireListeSuspects();
    reconstruireScene();

    if (!state.terminee && !state.enPause && state.runningSince === null) {
      state.runningSince = now();
    }

    state.chronoHandle = window.setInterval(() => {
      if (!state.enPause && !state.terminee && state.runningSince !== null) {
        els.chrono.textContent = formatDuration(tempsEcoule());
      }
    }, 500);

    renderAll();
    state.chronoHandle = state.chronoHandle;
    chargerRecordsUI();
    els.chrono.textContent = formatDuration(tempsEcoule());

    if (state.meurtrierRevele) {
      const meurtrier = state.lettresAffaire[state.affaire.meurtrier];
      const victime = state.lettresAffaire[state.affaire.victime];
      els.reveal.innerHTML = `<strong>Meurtrier : ${meurtrier}</strong><br/>La victime <strong>${victime}</strong> est restée seule avec lui.`;
      els.finTitre.textContent = `Résolu — ${formatDuration(state.elapsedMs)}`;
      els.finSousTitre.textContent = '';
      els.fin.hidden = false;
    }

    els.voile.hidden = !state.enPause;
    els.boutonPause.setAttribute('aria-pressed', String(state.enPause));
  } catch (err) {
    console.error(err);
    nouvelleAffaire('debutant');
  }
}

function renderAll() {
  mettreAjourUISelection();
  els.chrono.textContent = formatDuration(tempsEcoule());
  mettreAjourValidation();
}

function mettreAjourUISelection() {
  for (let p = 0; p < state.placements.length; p++) majEtatSuspect(p);
}

function mettreAjourValidation() {
  els.boutonSoumettre.disabled = state.placements.some((p) => p === -1) || state.terminee;
  els.boutonAnnuler.disabled = state.historique.length === 0;
  els.boutonRetablir.disabled = state.futur.length === 0;
}

function choisirPersonne(p) {
  state.selectedPerson = p;
  mettreAjourUISelection();
}

function onCelluleClick(index) {
  if (state.terminee || state.enPause) return;
  const scene = state.affaire.scene;
  if ((scene.interdites ?? []).some((i) => i.cellule === index)) return;

  const avant = {
    placements: state.placements.slice(),
    xMarks: [...state.xMarks],
    candidats: snapCandidats(state.candidats),
  };

  if (state.tool === 'x') {
    if (state.xMarks.has(index)) state.xMarks.delete(index); else state.xMarks.add(index);
    if (!state.xMarks.has(index)) {
      if (!state.candidats[index]) state.candidats[index] = [];
    } else if (state.candidats[index]) {
      state.candidats[index] = [];
    }
  } else if (state.tool === 'effacer') {
    if (state.xMarks.has(index)) state.xMarks.delete(index);
    for (let pp = 0; pp < state.placements.length; pp++) if (state.placements[pp] === index) state.placements[pp] = -1;
    if (state.candidats[index]) state.candidats[index] = [];
  } else if (state.tool === 'candidat') {
    const person = state.selectedPerson;
    if (!state.candidats[index]) state.candidats[index] = [];
    const set = state.candidats[index];
    const i = set.indexOf(person);
    if (i === -1) set.push(person); else set.splice(i, 1);
  } else {
    const person = state.selectedPerson;
    for (let pp = 0; pp < state.placements.length; pp++) if (state.placements[pp] === index) state.placements[pp] = -1;
    state.placements[person] = index;
    state.xMarks.delete(index);
    if (state.candidats[index]) state.candidats[index] = [];
    for (let c = 0; c < state.candidats.length; c++) {
      if (Array.isArray(state.candidats[c])) {
        const i = state.candidats[c].indexOf(person);
        if (i !== -1) state.candidats[c].splice(i, 1);
      }
    }
  }

  state.historique.push(avant);
  if (state.historique.length > 250) state.historique.shift();
  state.futur = [];

  majOutils();
  rendreScene();
  sauvegarderDifferé();
  mettreAjourValidation();
}

function snapCandidats(arr) {
  return arr.map((c) => (Array.isArray(c) ? c.slice() : []));
}

function rendreScene() {
  const cells = [...els.scene.children];
  const pbCell = personByCell();
  const scene = state.affaire.scene;

  for (let index = 0; index < cells.length; index++) {
    const cell = cells[index];
    cell.classList.remove('personne', 'victime', 'x-mark', 'has-candidat');
    cell.style.removeProperty('--teinte');
    const badge = cell.querySelector('.badge-personne');
    badge.hidden = true;
    badge.classList.remove('victime');
    const candBadges = cell.querySelector('.cand-badges');
    if (candBadges) { candBadges.replaceChildren(); candBadges.hidden = true; }

    if (state.xMarks.has(index) && !pbCell.has(index)) cell.classList.add('x-mark');

    if (pbCell.has(index)) {
      const pp = pbCell.get(index);
      cell.classList.add('personne');
      cell.style.setProperty('--teinte', `var(--sus-${pp % 8})`);
      if (pp === state.affaire.victime) cell.classList.add('victime');
      badge.hidden = false;
      badge.textContent = scene.lettres[pp];
    } else {
      const candidats = state.candidats[index] ?? [];
      if (candidats.length) {
        cell.classList.add('has-candidat');
        if (candBadges) {
          candBadges.hidden = false;
          for (const pp of candidats) {
            const span = document.createElement('span');
            span.className = 'cand';
            span.textContent = scene.lettres[pp];
            candBadges.append(span);
          }
        }
      }
    }
  }

  construireListeSuspects();
  mettreAjourValidation();
  majCompteurs();
  majOutils();
  els.chrono.textContent = formatDuration(tempsEcoule());
}

function personByCell() {
  const m = new Map();
  for (let p = 0; p < state.placements.length; p++) {
    if (state.placements[p] !== -1) m.set(state.placements[p], p);
  }
  return m;
}

function undo() {
  if (!state.historique.length) return;
  state.futur.push({ placements: state.placements.slice(), xMarks: [...state.xMarks], candidats: snapCandidats(state.candidats), indices: state.indices });
  const precedent = state.historique.pop();
  state.placements = precedent.placements.slice();
  state.xMarks = new Set(precedent.xMarks);
  state.candidats = snapCandidats(precedent.candidats ?? []);
  state.indices = precedent.indices ?? state.indices;
  rendreScene();
  majCompteurs();
  sauvegarderDifferé();
  mettreAjourValidation();
  annonce('Coup annulé');
}

function redo() {
  if (!state.futur.length) return;
  state.historique.push({ placements: state.placements.slice(), xMarks: [...state.xMarks], candidats: snapCandidats(state.candidats), indices: state.indices });
  const futur = state.futur.pop();
  state.placements = futur.placements.slice();
  state.xMarks = new Set(futur.xMarks);
  state.candidats = snapCandidats(futur.candidats ?? []);
  state.indices = futur.indices ?? state.indices;
  rendreScene();
  majCompteurs();
  sauvegarderDifferé();
  mettreAjourValidation();
  annonce('Coup rétabli');
}

function verifierCases() {
  const fautes = [];
  for (let p = 0; p < state.placements.length; p++) {
    if (state.placements[p] !== state.affaire.arrangement[p]) fautes.push(p);
  }
  if (fautes.length === 0) annonce('Toutes les déductions sont correctes.');
  else annonce(`${fautes.length} placement${fautes.length > 1 ? 's' : ''} à revoir.`);
}

function soumettre() {
  if (state.placements.some((p) => p === -1) || state.terminee) return;
  const fautes = [];
  for (let p = 0; p < state.placements.length; p++) if (state.placements[p] !== state.affaire.arrangement[p]) fautes.push(p);

  if (fautes.length === 0) {
    state.terminee = true;
    state.elapsedMs = tempsEcoule();
    state.runningSince = null;
    state.meurtrierRevele = true;
    // Un temps obtenu avec des indices n'est pas un record honnête.
    const record = state.indices === 0 && enregistrerRecord(state.difficulty, state.elapsedMs);
    if (record) chargerRecordsUI();

    const indices = state.indices > 0 ? ` · ${state.indices} indice${state.indices > 1 ? 's' : ''}` : '';
    els.finTitre.textContent = `Résolu — ${formatDuration(state.elapsedMs)}`;
    els.finSousTitre.textContent = indices
      ? `${indices.slice(3)} — temps non retenu pour le record.`
      : 'Toutes les déductions étaient justes.';
    const meurtrier = lettres()[state.affaire.meurtrier];
    const victime = lettres()[state.affaire.victime];
    els.reveal.innerHTML = `<strong>Meurtrier : ${meurtrier}</strong><br/>La victime <strong>${victime}</strong> est restée seule avec lui.`;
    els.fin.hidden = false;
    annonce(`Affaire résolue en ${formatDuration(state.elapsedMs)}`);
    sauvegarder();
  } else {
    annonce(`${fautes.length} placement${fautes.length > 1 ? 's' : ''} à revoir : ${fautes.map((p) => lettres()[p]).join(', ')}`);
  }
}

function donnerIndice() {
  if (state.terminee || state.enPause || !state.affaire) return;
  const affaire = state.affaire;

  // Un indice ne sert à rien si tout le monde est déjà bien placé.
  let cible = -1;
  for (let p = 0; p < state.placements.length; p++) {
    if (state.placements[p] !== affaire.arrangement[p]) { cible = p; break; }
  }
  if (cible === -1) {
    annonce('Tous les suspects sont déjà à leur place.');
    return;
  }

  // Photo avant l'indice, pour que la touche Annuler le reprenne.
  const avant = {
    placements: state.placements.slice(),
    xMarks: [...state.xMarks],
    candidats: snapCandidats(state.candidats),
    indices: state.indices,
  };

  // Si le suspect est posé ailleurs, on libère sa case d'abord : impossible
  // d'avoir deux personnes sur la même ligne et colonne.
  for (let p = 0; p < state.placements.length; p++) {
    if (state.placements[p] === affaire.arrangement[cible]) state.placements[p] = -1;
  }

  state.placements[cible] = affaire.arrangement[cible];
  state.xMarks.delete(affaire.arrangement[cible]);
  state.indices = (state.indices ?? 0) + 1;
  state.elapsedMs += diffInfo().penaliteIndice;
  state.selectedPerson = cible;

  state.historique.push(avant);
  if (state.historique.length > 250) state.historique.shift();
  state.futur = [];

  rendreScene();
  mettreAjourUISelection();
  majCompteurs();
  sauvegarder();
  annonce(
    `Indice : ${lettres()[cible]} est dans ${etiquetteCellule(affaire.arrangement[cible])}. Pénalité ${Math.round(diffInfo().penaliteIndice / 1000)} s.`,
  );
  if (state.placements.every((x, i) => x === affaire.arrangement[i])) soumettre();
}

/** « ligne 3, colonne 5 », en base 1 comme le joueur les compte. */
function etiquetteCellule(cellule) {
  const n = state.affaire.scene.taille;
  return `ligne ${Math.floor(cellule / n) + 1}, colonne ${(cellule % n) + 1}`;
}

function majCompteurs() {
  if (!els.compteurIndices) return;
  els.compteurIndices.textContent = String(state.indices ?? 0);
  // Un indice coûte cher : on le décourage une fois la partie engagée.
  const outilPossible = state.indices >= 3;
  els.boutonIndice.disabled = state.terminee || state.enPause || outilPossible;
}

function basculerPause(force) {
  if (state.terminee) return;
  state.enPause = typeof force === 'boolean' ? force : !state.enPause;
  if (state.enPause) {
    state.elapsedMs = tempsEcoule();
    state.runningSince = null;
  } else if (state.runningSince === null) {
    state.runningSince = now();
  }
  els.voile.hidden = !state.enPause;
  els.boutonPause.setAttribute('aria-pressed', String(state.enPause));
  sauvegarder();
  annonce(state.enPause ? 'En pause' : 'Reprise');
}

function appliquerTheme(theme) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  els.themeIcone.textContent = theme === 'sombre' ? '☾' : '☀';
  sauverTheme(theme);
}


function nouvelleAffaire(difficulte = state.difficulty, tente = 0) {
  if (tente >= 3) {
    annonce('Impossible de générer une affaire pour cette taille.');
    els.chargement.hidden = true;
    return;
  }
  els.chargement.hidden = false;
  state.difficulty = difficulte;

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      try {
        const taille = (DIFFICULTIES.find((d) => d.id === difficulte) ?? DIFFICULTIES[0]).taille;
        const affaire = genererAffaireAuHasard(taille, (Date.now() % 99999) + 1);
        if (!affaire) {
          els.chargement.hidden = true;
          nouvelleAffaire(difficulte, tente + 1);
          return;
        }
        state.affaire = affaire;
        state.placements = new Array(affaire.scene.lettres.length).fill(-1);
        state.candidats = Array.from({ length: affaire.scene.lettres.length }, () => []);
        state.xMarks = new Set();
        state.selectedPerson = 0;
        state.tool = 'personne';
        state.elapsedMs = 0;
        state.runningSince = now();
        state.enPause = false;
        state.terminee = false;
        state.meurtrierRevele = false;
        state.historique = [];
        state.futur = [];
        state.indices = 0;
        els.titreAffaire.textContent = affaire.scene.titre;
        els.selectDifficulte.value = difficulte;
        state.lettresAffaire = affaire.scene.lettres;

        if (state.chronoHandle !== null) clearInterval(state.chronoHandle);
        state.chronoHandle = window.setInterval(() => {
          if (!state.enPause && !state.terminee && state.runningSince !== null) {
            els.chrono.textContent = formatDuration(tempsEcoule());
          }
        }, 500);

        construireListeSuspects();
        chargerListeIndices();
        reconstruireScene();
        chargerRecordsUI();
        majOutils();
        els.chargement.hidden = true;
        els.fin.hidden = true;
        mettreAjourUISelection();
        mettreAjourValidation();
        sauvegarder();
      } catch (err) {
        console.error(err);
        els.chargement.hidden = true;
        nouvelleAffaire(difficulte, tente + 1);
      }
    });
  });
}

function brancher() {
  // Outils du bandeau droit
  els.btnOutX.addEventListener('click', () => { state.tool = 'x'; majOutils(); });
  els.btnOutEffacer.addEventListener('click', () => { state.tool = 'effacer'; majOutils(); });

  els.boutonPause.addEventListener('click', () => basculerPause());
  els.boutonReprendre.addEventListener('click', () => basculerPause(false));
  els.boutonTheme.addEventListener('click', () => appliquerTheme(state.theme === 'clair' ? 'sombre' : 'clair'));
  els.boutonAnnuler.addEventListener('click', undo);
  els.boutonRetablir.addEventListener('click', redo);
  els.boutonIndice.addEventListener('click', donnerIndice);
  els.boutonSoumettre.addEventListener('click', soumettre);
  els.boutonNouvelle.addEventListener('click', () => { els.fin.hidden = true; nouvelleAffaire(state.difficulty); });
  els.boutonRevoir.addEventListener('click', () => { els.fin.hidden = true; });
  els.boutonFermerFin.addEventListener('click', () => { els.fin.hidden = true; });
  els.boutonAide.addEventListener('click', () => { els.aide.hidden = false; });
  els.boutonFermerAide.addEventListener('click', () => { els.aide.hidden = true; });
  els.aide.addEventListener('click', (e) => { if (e.target === els.aide) els.aide.hidden = true; });

  els.selectDifficulte.addEventListener('change', (e) => nouvelleAffaire(e.target.value));

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      return;
    }
    switch (e.key) {
      case 'p': case 'P': basculerPause(); break;
      case 't': case 'T': appliquerTheme(state.theme === 'clair' ? 'sombre' : 'clair'); break;
      case 'x': case 'X': state.tool = 'x'; majOutils(); break;
      case 'c': case 'C': state.tool = 'candidat'; majOutils(); break;
      case 'h': case 'H': donnerIndice(); break;
      case 'Escape': state.tool = 'personne'; majOutils(); break;
      case '?': els.aide.hidden = !els.aide.hidden; break;
      default:
        if (e.key >= '1' && e.key <= '8') {
          const p = Number(e.key) - 1;
          if (p < state.placements.length) choisirPersonne(p);
        }
    }
  });

  appliquerTheme(chargerTheme());
  els.selectDifficulte.value = state.difficulty;

  const partie = chargerPartie();
  if (partie) restaurer(partie);
  else nouvelleAffaire(state.difficulty);
}

brancher();