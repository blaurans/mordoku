/**
 * Mordoku — contrôleur du jeu : affaire, scène, sélection, action.
 * Tout reste dans le navigateur.
 */

import {
  genererAffaire,
  genererAffaireAuHasard,
} from './murdoku/generator.js';

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
  { id: 'facile', label: 'Facile', taille: 7, penaliteIndice: 90000 },
  { id: 'intermediaire', label: 'Intermédiaire', taille: 8, penaliteIndice: 120000 },
];

const els = {
  scene: document.getElementById('scene'),
  titreAffaire: document.getElementById('titre-affaire'),
  numeroCase: document.getElementById('numero-case'),
  labelDifficulte: document.getElementById('label-difficulte'),
  selectDifficulte: document.getElementById('select-difficulte'),
  listeSuspects: document.getElementById('liste-suspects'),
  listeIndices: document.getElementById('liste-indices'),
  videIndices: document.getElementById('vide-indices'),
  records: document.getElementById('records'),
  voile: document.getElementById('voile'),
  chargement: document.getElementById('chargement'),
  chrono: document.getElementById('chrono'),
  annoce: document.getElementById('annonce'),
  boutonPause: document.getElementById('bouton-pause'),
  boutonTheme: document.getElementById('bouton-theme'),
  boutonReprendre: document.getElementById('bouton-reprendre'),
  boutonAnnuler: document.getElementById('bouton-annuler'),
  boutonRetablir: document.getElementById('bouton-retablir'),
  boutonIndice: document.getElementById('bouton-indice'),
  compteurIndices: document.getElementById('compteur-indices'),
  boutonVerifier: document.getElementById('bouton-verifier'),
  boutonSoumettre: document.getElementById('bouton-soumettre'),
  btnOutOutil: [...document.querySelectorAll('.outil')],
  btnOutSelection: document.getElementById('bouton-outil-selection'),
  btnOutX: document.getElementById('bouton-outil-x'),
  btnOutCand: document.getElementById('bouton-outil-cand'),
  btnOutEffacer: document.getElementById('bouton-effacer'),
  themeIcone: document.getElementById('theme-icone'),
  fin: document.getElementById('fin'),
  finTitre: document.getElementById('fin-titre'),
  finSousTitre: document.getElementById('fin-sous-titre'),
  reveal: document.getElementById('reveal'),
  boutonFermerFin: document.getElementById('bouton-fermer-fin'),
  boutonNouvelle: document.getElementById('bouton-nouvelle'),
};

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
  els.annoce.textContent = msg;
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

  pieceTable = new Array(taille * taille).fill(-1);
  for (const piece of scene.pieces) {
    for (const c of piece.cellules) pieceTable[c] = piece.id;
  }

  const bloquees = new Set((scene.interdites ?? []).map((i) => i.cellule));
  const objetParCellule = new Map();
  for (const o of scene.objets) objetParCellule.set(o.cellule, o);

  for (let index = 0; index < taille * taille; index++) {
    const cell = document.createElement('div');
    cell.className = 'cellule';
    cell.dataset.index = String(index);
    cell.dataset.piece = String(pieceTable[index] ?? 0);
    if (bloquees.has(index)) cell.classList.add('bloquee');
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('aria-label', `Case ${Math.floor(index / taille) + 1}-${index % taille + 1}`);

    const interieur = document.createElement('div');
    interieur.className = 'cellule-interieur';

    const objet = objetParCellule.get(index);
    if (objet) {
      const span = document.createElement('span');
      span.className = 'objet';
      span.textContent = objet.emoji;
      span.title = objet.nom;
      interieur.append(span);
    }

    const piece = scene.pieces.find((p) => p.id === pieceTable[index]);
    if (piece && piece.cellules[0] === index) {
      const lp = document.createElement('span');
      lp.className = 'label-piece';
      const mots = piece.nom.split(/\s+/);
      const rang = (mots[0] === 'LE' || mots[0] === 'LA' || mots[0] === 'LES' || mots[0] === "L'") ? 1 : 0;
      lp.textContent = mots.slice(rang).join(' ');
      interieur.append(lp);
    }

    const badge = document.createElement('div');
    badge.className = 'badge-personne';
    badge.hidden = true;

    const candBadges = document.createElement('div');
    candBadges.className = 'cand-badges';
    candBadges.hidden = true;

    cell.append(interieur, badge, candBadges);
    cell.addEventListener('click', (evt) => {
      evt.preventDefault();
      onCelluleClick(index);
    });
    els.scene.append(cell);
  }

  requestAnimationFrame(() => stabiliserPièces());
  rendre();
}

function stabiliserPièces() {
  if (!state.affaire) return;
  const cells = [...els.scene.children];
  const tableau = pieceTable;
  // On force l'affichage sur la première case et on calcule la largeur
  // matérielle de la pièce pour que les longs noms soient coupés par le
  // navigateur au bon endroit (wrap) au lieu de déborder sans limite.
  for (const piece of state.affaire.scene.pieces) {
    const premiere = cells[piece.cellules[0]];
    if (!premiere) continue;
    const lp = premiere.querySelector('.label-piece');
    if (!lp) continue;
    const cellRect = premiere.getBoundingClientRect();
    const taillePiece = (Math.max(...piece.cellules.map((c) => c % state.affaire.scene.taille)) - Math.min(...piece.cellules.map((c) => c % state.affaire.scene.taille)) + 1);
    const largeur = Math.max(1, taillePiece);
    lp.style.maxWidth = `${Math.max(40, cellRect.width * largeur - 4)}px`;
    lp.style.whiteSpace = 'normal';
    lp.style.wordBreak = 'break-word';
    lp.style.overflowWrap = 'break-word';
    lp.style.textAlign = 'center';
  }
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
    const global = c.masques && c.masques.every((m) => m === null);
    if (!global) continue;
    const li = document.createElement('li');
    li.textContent = c.titre.replace(/^«\s*/, '').replace(/\s*»$/, '');
    els.listeIndices.append(li);
    trouve = true;
  }
  els.videIndices.hidden = trouve;
}

function construireListeSuspects() {
  const affaire = state.affaire;
  els.listeSuspects.replaceChildren();
  for (let p = 0; p < affaire.scene.lettres.length; p++) {
    const indices = (affaire.clues ?? []).filter((c) => c.masques && c.masques[p]);
    const premiere = indices.length ? indices[0].titre.replace(/^«\\s*/, '').replace(/\\s*»$/, '') : 'Aucun indice direct.';
    const li = document.createElement('li');
    const carte = document.createElement('div');
    carte.className = 'suspect-carte';
    carte.dataset.personne = String(p);
    carte.innerHTML = `
      <div class="badge-personne ${p === affaire.victime ? 'victime' : ''}">${affaire.scene.lettres[p]}</div>
      <div>
        <div class="suspect-titre">${affaire.scene.lettres[p]}${p === affaire.victime ? ' <span class="victime-label">Victime</span>' : ''}</div>
        <p class="suspect-clue">${premiere}</p>
        ${indices.length > 1 ? `<p class="suspect-clue-plus">+ ${indices.length - 1} indice${indices.length - 1 > 1 ? 's' : ''}</p>` : ''}
      </div>
    `;
    carte.addEventListener('click', () => choisirPersonne(p));
    li.append(carte);
    els.listeSuspects.append(li);
    carte.classList.toggle('selectionne', p === state.selectedPerson);
    carte.classList.toggle('place', state.placements[p] !== -1);
  }
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
    if (els.labelDifficulte) els.labelDifficulte.textContent = di.label;
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

function mettreAjourOutilsUI() {
  document.querySelectorAll('.outil').forEach((b) => b.classList.toggle('actif', b.dataset.outil === state.tool));
}

function mettreAjourUISelection() {
  document.querySelectorAll('.suspect-carte').forEach((c) => {
    const p = Number(c.dataset.personne);
    c.classList.toggle('selectionne', p === state.selectedPerson);
    c.classList.toggle('place', state.placements[p] !== -1);
  });
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

  mettreAjourOutilsUI();
  rendreScene();
  sauvegarderDifferé();
  mettreAjourValidation();
}

function snapCandidats(arr) {
  return arr.map((c) => (Array.isArray(c) ? c.slice() : []));
}

function rendreScene() {
  // re-apply classes on existing cellules
  const cells = [...els.scene.children];
  const pbCell = personByCell();
  for (let index = 0; index < cells.length; index++) {
    const cell = cells[index];
    cell.classList.remove('personne', 'victime', 'x-mark', 'has-candidat');
    const badge = cell.querySelector('.badge-personne');
    badge.hidden = true;
    badge.classList.remove('victime');
    const candBadges = cell.querySelector('.cand-badges');
    if (candBadges) { candBadges.replaceChildren(); candBadges.hidden = true; }

    if (state.xMarks.has(index) && !pbCell.has(index)) cell.classList.add('x-mark');
    if (pbCell.has(index)) {
      const pp = pbCell.get(index);
      cell.classList.add('personne');
      if (pp === state.affaire.victime) cell.classList.add('victime');
      badge.hidden = false;
      badge.textContent = state.affaire.scene.lettres[pp];
      if (pp === state.affaire.victime) badge.classList.add('victime');
    } else {
      const candidats = state.candidats[index] ?? [];
      if (candidats.length) {
        cell.classList.add('has-candidat');
        if (candBadges) {
          candBadges.hidden = false;
          for (const pp of candidats) {
            const span = document.createElement('span');
            span.className = 'cand';
            span.dataset.personne = String(pp);
            span.textContent = state.affaire.scene.lettres[pp];
            candBadges.append(span);
          }
        }
      }
    }
  }  
  state.xMarks && state.xMarks; // noop
  construireListeSuspects();
  mettreAjourUISelection();
  mettreAjourValidation();
  majCompteurs();
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
  annoncer(state.enPause ? 'En pause' : 'Reprise');
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
  if (els.labelDifficulte) els.labelDifficulte.textContent = (DIFFICULTIES.find((d) => d.id === difficulte) ?? DIFFICULTIES[0]).label;

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
        els.numeroCase.textContent = 'CAS';
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
        mettreAjourOutilsUI();
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
  els.btnOutSelection.addEventListener('click', () => { state.tool = 'personne'; els.btnOutOutil.forEach((b) => b.classList.toggle('actif', b.dataset.outil === state.tool)); });
  els.btnOutX.addEventListener('click', () => { state.tool = 'x'; els.btnOutOutil.forEach((b) => b.classList.toggle('actif', b.dataset.outil === state.tool)); });
  els.btnOutEffacer.addEventListener('click', () => { state.tool = 'effacer'; els.btnOutOutil.forEach((b) => b.classList.toggle('actif', b.dataset.outil === state.tool)); });
  els.btnOutCand.addEventListener('click', () => { state.tool = 'candidat'; els.btnOutOutil.forEach((b) => b.classList.toggle('actif', b.dataset.outil === state.tool)); });

  els.boutonPause.addEventListener('click', () => basculerPause());
  els.boutonReprendre.addEventListener('click', () => basculerPause(false));
  els.boutonTheme.addEventListener('click', () => appliquerTheme(state.theme === 'sombre' ? 'clair' : 'sombre'));
  els.boutonAnnuler.addEventListener('click', undo);
  els.boutonRetablir.addEventListener('click', redo);
  els.boutonIndice.addEventListener('click', donnerIndice);
  els.boutonVerifier.addEventListener('click', verifierCases);
  els.boutonSoumettre.addEventListener('click', soumettre);
  els.boutonNouvelle.addEventListener('click', () => nouvelleAffaire(state.difficulty));
  els.selectDifficulte.addEventListener('change', (e) => {
    state.difficulty = e.target.value;
    nouvelleAffaire(state.difficulty);
  });
  els.boutonFermerFin.addEventListener('click', () => { els.fin.hidden = true; });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'p' || e.key === 'P') basculerPause();
    if (e.key === 't' || e.key === 'T') appliquerTheme(state.theme === 'sombre' ? 'clair' : 'sombre');
    if (e.key === 'x' || e.key === 'X') { state.tool = 'x'; els.btnOutOutil.forEach((b) => b.classList.toggle('actif', b.dataset.outil === state.tool)); }
    if (e.key === 'c' || e.key === 'C') { state.tool = 'candidat'; els.btnOutOutil.forEach((b) => b.classList.toggle('actif', b.dataset.outil === state.tool)); }
    if (e.key === 'Escape') { state.tool = 'personne'; els.btnOutOutil.forEach((b) => b.classList.toggle('actif', b.dataset.outil === state.tool)); }
  });

  appliquerTheme(chargerTheme());
  els.selectDifficulte.value = state.difficulty;

  const partie = chargerPartie();
  if (partie) {
    restaurer(partie);
  } else {
    nouvelleAffaire(state.difficulty);
  }

  els.annoce = document.getElementById('annonce');
}

brancher();