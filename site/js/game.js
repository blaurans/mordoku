/**
 * Mordoku — contrôleur du jeu : affaire, scène, sélection, action.
 * Tout reste dans le navigateur.
 */

import { genererAffaireAuHasard } from './murdoku/generator.js';
import { CAS_PRECALCULES, reconstruireCas } from './murdoku/cas.js';
import { enrichir } from './murdoku/clues.js';
import { avecArticle } from './murdoku/scene.js';
import { deduire, position, nomInterdit } from './murdoku/solution.js';

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
  calqueInfos: document.getElementById('calque-infos'),
  titreAffaire: document.getElementById('titre-affaire'),
  selectDifficulte: document.getElementById('select-difficulte'),
  listeSuspects: document.getElementById('liste-suspects'),
  listeIndices: document.getElementById('liste-indices'),
  videIndices: document.getElementById('vide-indices'),
  records: document.getElementById('records'),
  accueil: document.getElementById('accueil'),
  listeCas: document.getElementById('liste-cas'),
  boutonAccueil: document.getElementById('bouton-accueil'),
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
  boutonSolution: document.getElementById('bouton-solution'),
  solution: document.getElementById('solution'),
  boutonFermerSolution: document.getElementById('bouton-fermer-solution'),
  solutionVerrou: document.getElementById('solution-verrou'),
  solutionContenu: document.getElementById('solution-contenu'),
  formulaireMdp: document.getElementById('formulaire-mdp'),
  motdepasse: document.getElementById('motdepasse'),
  messageMdp: document.getElementById('message-mdp'),
  raisonnement: document.getElementById('raisonnement'),
  listeSolution: document.getElementById('liste-solution'),
  revealSolution: document.getElementById('reveal-solution'),
};

/** Portraits : un par suspect, tirés une fois pour l'affaire. */
const PORTRAITS = ['👩🏻', '👨🏾', '👩🏼', '👨🏻', '👩🏽', '👨🏼', '👩🏿', '👨🏽'];

const state = {
  affaire: null,
  difficulty: 'debutant',
  casId: null,
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

/** Les cas pré-calculés ne sont pas des difficultés : ils ont leur propre
 *  pénalité d'indice et n'entrent jamais dans les records, qui ne
 *  compareraient pas des grilles différentes. */
const INFO_CAS = { id: 'cas', label: 'Cas pré-calculé', taille: 6, penaliteIndice: 60000 };

function diffInfo() {
  if (state.difficulty === 'cas') return INFO_CAS;
  return DIFFICULTIES.find((d) => d.id === state.difficulty) ?? DIFFICULTIES[0];
}

function lettres() { return state.affaire.scene.lettres; }
function N() { return state.affaire.scene.taille; }

/* ---------- Sauvegarde ---------- */

function sauvegarder() {
  if (!state.affaire) return;
  sauverPartie({
    version: 1,
    difficulte: state.difficulty,
    casId: state.casId,
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

let solutionOuverte = false;

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
  // `--cols` est posé sur l'hôte : la feuille en a besoin pour dimensionner
  // la scène, et une propriété personnalisée ne remonte pas vers le parent.
  const hote = els.scene.parentElement;
  hote.style.setProperty('--cols', String(taille));
  hote.style.setProperty('--lignes', String(taille));
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
      span.title = avecArticle(objet);
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
    cell.addEventListener('pointerenter', () => montrerInfo(index));
    cell.addEventListener('pointerleave', () => { if (!pointeurEnfonce) cacherInfo(); });
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
    const texte = mots.slice(rang).join(' ');
    // Nom long ou petite pièce : on réduit pour ne pas déborder sur la voisine.
    if (piece.cellules.length <= 6 || texte.length > 12) label.classList.add('serré');
    label.textContent = texte;
    label.style.left = `${centreC * 100}%`;
    label.style.top = `${centreL * 100}%`;
    els.calqueNoms.append(label);
  }
}

let pointeurEnfonce = false;
let celluleVisee = null;
let minuteurInfo = null;

/** Affiche le nom de l'objet contenu dans une case, à la volée. */
function montrerInfo(index) {
  const cell = els.scene.children[index];
  if (!cell) return;
  const objet = state.affaire.scene.objets.find((o) => o.cellule === index);
  const piece = state.affaire.scene.pieces.find((p) => p.cellules.includes(index));
  els.calqueInfos.replaceChildren();
  if (!objet && !piece) return;

  const N = state.affaire.scene.taille;
  const ligne = Math.floor(index / N);
  const colonne = index % N;

  const bulle = document.createElement('span');
  bulle.className = 'infobulle';
  bulle.style.left = `${((colonne + 0.5) / N) * 100}%`;
  bulle.style.top = `${((ligne + 0.5) / N) * 100}%`;
  if (objet) bulle.textContent = avecArticle(objet);
  else bulle.textContent = piece.nom;
  bulle.dataset.objet = objet ? '1' : '0';
  els.calqueInfos.append(bulle);

  // Au survol la bulle suit le pointeur ; au doigt elle reste 2 s.
  if (objet) bulle.classList.add('est-objet');
  // Rangée du haut : on retourne la bulle vers le bas, sinon elle sort du cadre.
  if (ligne === 0) bulle.classList.add('haut');

  window.clearTimeout(minuteurInfo);
  if (pointeurEnfonce) {
    minuteurInfo = window.setTimeout(cacherInfo, 2000);
  }
}

function cacherInfo() {
  els.calqueInfos.replaceChildren();
  window.clearTimeout(minuteurInfo);
  minuteurInfo = null;
}

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

    // La victime garde ses indices : sans eux, on ne peut pas la placer.
    // On se contente de dire qu'elle était seule avec le meurtrier.
    const morceaux = [];
    if (p === affaire.victime) {
      carte.classList.add('victime');
      morceaux.push('La victime — elle était seule avec le meurtrier.');
    }
    if (mesIndices.length) morceaux.push(...mesIndices.map((c) => enrichir(c.titre, scene)));
    if (morceaux.length) carte.innerHTML = morceaux.join('<br>');
    else {
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
    state.casId = partie.casId ?? null;
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

    const estCas = Boolean(state.casId);
    els.selectDifficulte.hidden = estCas;
    els.titreAffaire.textContent =
      (estCas
        ? `${affaire.scene.titre} · palier ${brutNiveau(state.casId)}`
        : affaire.scene.titre) + (state.meurtrierRevele ? ' (résolu)' : '');
    if (!estCas) els.selectDifficulte.value = state.difficulty;
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
      els.reveal.innerHTML = `<strong>Meurtrier : ${meurtrier}</strong><br/><strong>${meurtrier}</strong> et <strong>${victime}</strong> ont fini seuls dans la même zone.`;
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
    // Un temps sur un dossier figé ne se compare pas à un temps sur un
    // dossier aléatoire : on ne l'enregistre pas.
    const record =
      state.indices === 0 && !state.casId && enregistrerRecord(state.difficulty, state.elapsedMs);
    if (record) chargerRecordsUI();

    const indices = state.indices > 0 ? ` · ${state.indices} indice${state.indices > 1 ? 's' : ''}` : '';
    els.finTitre.textContent = `Résolu — ${formatDuration(state.elapsedMs)}`;
    els.finSousTitre.textContent = indices
      ? `${indices.slice(3)} — temps non retenu pour le record.`
      : 'Toutes les déductions étaient justes.';
    const meurtrier = lettres()[state.affaire.meurtrier];
    const victime = lettres()[state.affaire.victime];
    els.reveal.innerHTML = `<strong>Meurtrier : ${meurtrier}</strong><br/><strong>${meurtrier}</strong> et <strong>${victime}</strong> ont fini seuls dans la même zone.`;
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


/**
 * Installe une affaire dans l'état du jeu et rafraîchit l'écran.
 * Commun aux deux entrées : affaires pré-calculées et génération.
 */
function installerAffaire(affaire, difficulte, casId = null) {
  state.affaire = affaire;
  state.difficulty = difficulte;
  state.casId = casId;
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
  state.lettresAffaire = affaire.scene.lettres;

  els.titreAffaire.textContent = affaire.scene.titre;
  // Les cas pré-calculés ont leur propre progression : le sélecteur de
  // difficulté n'a pas de sens pour eux et afficherait une valeur fausse.
  const estCas = Boolean(casId);
  els.selectDifficulte.hidden = estCas;
  els.titreAffaire.textContent = estCas
    ? `${affaire.scene.titre} · palier ${brutNiveau(casId)}`
    : affaire.scene.titre;
  if (!estCas) els.selectDifficulte.value = difficulte;

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
}

/** Lance une affaire pré-calculée de la liste d'accueil. */
function demarrerCasPrecalcule(brut) {
  els.chargement.hidden = false;
  try {
    const affaire = reconstruireCas(brut);
    // Les cas figés n'appartiennent à aucune difficulté de jeu : ils ont
    // leur propre niveau, et ne doivent pas entrer dans les records.
    installerAffaire(affaire, 'cas', brut.id);
    fermerAccueil();
  } catch (err) {
    console.error(err);
    els.chargement.hidden = true;
    annonce("Ce dossier n'a pas pu être chargé.");
  }
}

/* ---------- Accueil : affaires pré-calculées ou génération ---------- */

function construireListeCas() {
  els.listeCas.replaceChildren();
  for (const brut of CAS_PRECALCULES) {
    const li = document.createElement('li');
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'cas';
    bouton.dataset.cas = brut.id;

    const entete = document.createElement('span');
    entete.className = 'cas-entete';

    const niveau = document.createElement('span');
    niveau.className = 'cas-niveau';
    niveau.textContent = brut.niveau === 1 ? 'Pour commencer' : `Palier ${brut.niveau}`;

    const titre = document.createElement('strong');
    titre.className = 'cas-titre';
    titre.textContent = `${brut.scene.titre} · ${brut.taille}×${brut.taille}`;

    entete.append(niveau, titre);

    const resume = document.createElement('span');
    resume.className = 'cas-resume';
    resume.textContent = brut.resume ?? '';

    const detail = document.createElement('span');
    detail.className = 'cas-detail';
    detail.textContent = `${brut.indices.length} indices · résolution expliquée étape par étape`;

    bouton.append(entete, resume, detail);
    bouton.addEventListener('click', () => demarrerCasPrecalcule(brut));

    li.append(bouton);
    els.listeCas.append(li);
  }
}

function ouvrirAccueil() {
  construireListeCas();
  els.accueil.hidden = false;
  const premier = els.listeCas.querySelector('button');
  if (premier) premier.focus();
}

function fermerAccueil() {
  els.accueil.hidden = true;
}

/** Palier d'un cas pré-calculé, pour l'afficher dans le titre. */
function brutNiveau(casId) {
  return CAS_PRECALCULES.find((c) => c.id === casId)?.niveau ?? '?';
}

function nouvelleAffaire(difficulte = state.difficulty, tente = 0) {
  if (tente >= 3) {
    annonce('Impossible de générer une affaire pour cette taille.');
    els.chargement.hidden = true;
    cacherInfo();
    return;
  }
  els.chargement.hidden = false;

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
        installerAffaire(affaire, difficulte, null);
        fermerAccueil();
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
  els.boutonNouvelle.addEventListener('click', () => { els.fin.hidden = true; ouvrirAccueil(); });
  els.boutonRevoir.addEventListener('click', () => { els.fin.hidden = true; });
  els.boutonFermerFin.addEventListener('click', () => { els.fin.hidden = true; });
  els.boutonAide.addEventListener('click', () => { els.aide.hidden = false; });
  els.boutonSolution.addEventListener('click', ouvrirSectionSolution);
  els.boutonFermerSolution.addEventListener('click', () => { els.solution.hidden = true; });
  els.solution.addEventListener('click', (e) => { if (e.target === els.solution) els.solution.hidden = true; });
  els.formulaireMdp.addEventListener('submit', (e) => {
    e.preventDefault();
    if (empreinte(els.motdepasse.value) === EMPREINTE_MDP) {
      solutionOuverte = true;
      els.messageMdp.hidden = true;
      els.solutionVerrou.hidden = true;
      els.solutionContenu.hidden = false;
      afficherSolution();
    } else {
      els.messageMdp.hidden = false;
      els.motdepasse.select();
    }
  });
  els.boutonFermerAide.addEventListener('click', () => { els.aide.hidden = true; });
  els.aide.addEventListener('click', (e) => { if (e.target === els.aide) els.aide.hidden = true; });

  els.selectDifficulte.addEventListener('change', (e) => nouvelleAffaire(e.target.value));

  els.boutonAccueil.addEventListener('click', ouvrirAccueil);
  els.accueil.addEventListener('click', (e) => {
    if (e.target !== els.accueil) return;
    if (!state.affaire) return; // premier lancement : il faut choisir
    fermerAccueil();
  });
  for (const bouton of els.accueil.querySelectorAll('[data-difficulte]')) {
    bouton.addEventListener('click', () => nouvelleAffaire(bouton.dataset.difficulte));
  }

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
      case 'a': case 'A': ouvrirAccueil(); break;
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

  construireListeCas();
  const partie = chargerPartie();
  if (partie) restaurer(partie);
  else ouvrirAccueil(); // premier lancement : on laisse le choix
}

brancher();
/* ------------------------------------------------------------------ */
/* Section « solution », protégée par mot de passe                      */
/* ------------------------------------------------------------------ */

/**
 * Empreinte du mot de passe (djb2). Ce n'est PAS du chiffrement : le
 * jeu tourne entièrement dans le navigateur, et quiconque ouvre les
 * outils de développement voit ce fichier. Le but est d'éviter que le
 * mot de passe saute aux yeux et d'en faire un garde-fou, pas un verrou.
 */
const EMPREINTE_MDP = (() => {
  const secret = ['md', 'p'].join('');
  let h = 5381;
  for (let i = 0; i < secret.length; i++) h = ((h * 33) ^ secret.charCodeAt(i)) >>> 0;
  return h;
})();

function empreinte(texte) {
  let h = 5381;
  for (let i = 0; i < texte.length; i++) h = ((h * 33) ^ texte.charCodeAt(i)) >>> 0;
  return h;
}

function ouvrirSectionSolution() {
  els.solution.hidden = false;
  if (!solutionOuverte) {
    els.solutionVerrou.hidden = false;
    els.solutionContenu.hidden = true;
    els.motdepasse.value = '';
    els.motdepasse.focus();
  }
}

/** « L2 C3, L2 C5, L4 C1… » — jusqu'à 6 cases, puis le compte du reste. */
function listerCases(scene, cellules) {
  if (cellules.length <= 6) return cellules.map((c) => position(scene, c)).join(', ');
  return `${cellules.slice(0, 6).map((c) => position(scene, c)).join(', ')} et ${cellules.length - 6} autres`;
}

/**
 * Les pièces sont stockées en majuscules (« LE WAGON-RESTAURANT ») : c'est
 * lisible sur la grille, criard dans une phrase. On ne met en minuscules que
 * les mots qui ne sont pas un prénom, le début de phrase restant intact.
 */
function enMinuscules(texte) {
  return texte
    .split(' ')
    .map((mot) => (/^[A-ZÉÈÊÀÎÔÛÇ'’-]{2,}$/.test(mot) ? mot.toLowerCase() : mot))
    .join(' ');
}

/** Citation d'indice puis effet, les deux sur la même ligne. */
function citation(scene, d, precision = '') {
  const el = document.createElement('span');
  const guillemet = document.createElement('em');
  guillemet.className = 'cause-indice';
  // Les pièces sont stockées en majuscules pour la grille ; en prose on
  // préfère « le wagon-restaurant ».
  guillemet.textContent = `« ${enMinuscules(d.titre)} »`;
  const effet = effetIndice(scene, d);
  el.append(
    guillemet,
    document.createTextNode(precision ? ` ${effet} — ${precision}.` : ` ${effet}.`),
  );
  return el;
}

/** Une ligne « cause → effet » dans le détail d'une étape. */
function ligneCause(cause, effet) {
  const li = document.createElement('li');
  const qui = document.createElement('span');
  qui.className = 'cause-qui';
  qui.textContent = cause;
  li.append(qui);
  if (typeof effet === 'string') li.append(document.createTextNode(` ${effet}`));
  else li.append(document.createTextNode(' '), effet);
  return li;
}

/**
 * Phrase d'effet d'un indice. Quand il ne reste que quelques cases, on dit
 * ce qu'il laisse : c'est le cœur du raisonnement. Sinon on dit ce qu'il
 * écarte, en plafonnant la liste.
 */
function effetIndice(scene, d) {
  const reste = d.garde?.length ?? 0;
  if (reste === 0) return `ne laisse aucune place`;
  if (reste === 1) return `ne laisse que la case ${position(scene, d.garde[0])}`;
  if (reste <= 6) return `ne laisse que ${reste} cases : ${d.garde.map((c) => position(scene, c)).join(', ')}`;
  return `écarte ${listerCases(scene, d.eliminees)}`;
}

/**
 * Une étape du raisonnement, avec pour chaque élimination sa cause : quel
 * indice écarte quelles cases, quelle ligne ou colonne déjà prise, quelle
 * case hors-jeu. C'est la question « pourquoi cette case et pas une autre ».
 */
function construireEtape(scene, etape) {
  const d = etape.detail;
  const qui = scene.noms[etape.personne];
  const N = scene.taille;

  const li = document.createElement('li');
  li.className = 'etape';

  const tete = document.createElement('p');
  tete.className = 'etape-tete';
  const tag = document.createElement('span');
  tag.className = 'etiquette-regle';
  tag.textContent = etape.regle === 'case-unique' ? 'Case unique' : 'Position forcée';
  tete.append(
    tag,
    document.createTextNode(`${qui} n’a plus qu’une place possible : `),
    Object.assign(document.createElement('strong'), { textContent: position(scene, etape.cellule) }),
  );
  li.append(tete);

  // Où partait le raisonnement avant de conclure.
  const part = document.createElement('p');
  part.className = 'etape-part';
  if (etape.regle === 'case-unique') {
    const avant = d.sesIndices.length || d.autresIndices.length || d.lignesPrises.length || d.interdites.length
      ? `Les ${N * N} cases de la scène se réduisent une à une jusqu’à ${etape.candidates.length} :`
      : `Sur les ${N * N} cases, une seule satisfait tous les indices :`;
    part.textContent = avant;
  } else {
    part.textContent =
      `${etape.candidates.length} cases semblaient possibles (${listerCases(scene, etape.candidates)}). ` +
      `Mais en essayant toutes les autres, aucune ne permet de placer les suspects qui restent : ` +
      `chacune bloque quelqu’un d’autre. C’est donc une position forcée.`;
  }
  li.append(part);

  const causes = document.createElement('ul');
  causes.className = 'etape-causes';

  for (const s of d.sesIndices) {
    causes.append(ligneCause('Son indice', citation(scene, s, '')));
  }
  for (const a of d.autresIndices) {
    // Un indice qui nomme le suspect est aussi le sien : « Thérèse et
    // Séverin sont dans la clairière » le concerne au premier chef.
    const commun = (a.sujets ?? []).includes(etape.personne);
    causes.append(
      ligneCause(commun ? 'Le concerning' : 'Un autre indice', citation(scene, a, commun ? '' : 'pour ce suspect')),
    );
  }
  for (const l of d.lignesPrises) {
    causes.append(ligneCause('Déjà placé', `${l.par} tient la ligne ${l.ligne + 1} : toute la ligne est écartée`));
  }
  for (const c of d.colonnesPrises) {
    causes.append(ligneCause('Déjà placé', `${c.par} tient la colonne ${c.colonne + 1} : toute la colonne est écartée`));
  }
  for (const c of d.interdites) {
    causes.append(ligneCause('Hors-jeu', `${position(scene, c)} — ${nomInterdit(scene, c)} : case inutilisable.`));
  }
  li.append(causes);

  const conclusion = document.createElement('p');
  conclusion.className = 'etape-conclusion';
  conclusion.append(
    document.createTextNode('Au total, une seule case survit : '),
    Object.assign(document.createElement('strong'), { textContent: position(scene, etape.cellule) }),
    document.createTextNode('. Tout le reste était impossible.'),
  );
  li.append(conclusion);

  return li;
}

function afficherSolution() {
  const affaire = state.affaire;
  const scene = affaire.scene;
  const deduction = deduire(scene, affaire.clues, affaire.arrangement);

  // Raisonnement : uniquement les étapes prouvées, dans l'ordre.
  els.raisonnement.replaceChildren();
  if (deduction.etapes.length === 0) {
    const vide = document.createElement('p');
    vide.className = 'avertissement';
    vide.textContent =
      "Aucune déduction isolée n'est évidente dès le départ : il faut combiner plusieurs indices à la fois.";
    els.raisonnement.append(vide);
  } else {
    if (!deduction.complet) {
      const avert = document.createElement('div');
      avert.className = 'avertissement';

      const intro = document.createElement('p');
      intro.style.margin = '0 0 8px';
      const nb = deduction.etapes.length;
      intro.textContent =
        `${nb} position${nb > 1 ? 's' : ''} se dédui${nb > 1 ? 'sent' : 't'} ainsi, en n'utilisant qu'un indice à la fois. ` +
        `Ensuite, plus aucun suspect n'a de case unique : il faut croiser plusieurs indices simultanément.`;
      avert.append(intro);

      const reste = deduction.restants ?? [];
      if (reste.length) {
        const detail = document.createElement('p');
        detail.style.margin = '0';
        const grands = reste.filter((r) => r.cellules.length > 1).map((r) => `${r.nom} (${r.cellules.length})`);
        detail.textContent =
          `Il reste ${reste.length} suspect${reste.length > 1 ? 's' : ''} à placer : ` +
          (grands.length ? `${grands.join(', ')} — c'est le nombre de cases encore ouvertes pour chacun.` : 'aucune n’a de place unique.');
        avert.append(detail);
      }

      const note = document.createElement('p');
      note.style.margin = '8px 0 0';
      note.textContent =
        "Je m'arrête là : expliquer la suite supposerait d'inventer un raisonnement que je ne peux pas vérifier.";
      avert.append(note);

      els.raisonnement.append(avert);
    }
    const liste = document.createElement('ol');
    liste.className = 'liste-etapes';
    for (const etape of deduction.etapes) {
      liste.append(construireEtape(scene, etape));
    }
    els.raisonnement.append(liste);
  }

  // Position finale de chacun.
  els.listeSolution.replaceChildren();
  for (let p = 0; p < scene.noms.length; p++) {
    const cellule = affaire.arrangement[p];
    const N = scene.taille;
    const li = document.createElement('li');
    const nom = document.createElement('strong');
    nom.textContent = scene.noms[p];
    li.append(
      nom,
      document.createTextNode(
        ` — ligne ${Math.floor(cellule / N) + 1}, colonne ${(cellule % N) + 1}` +
          (p === affaire.victime ? ' (victime)' : ''),
      ),
    );
    els.listeSolution.append(li);
  }

  els.revealSolution.innerHTML =
    `<strong>Meurtrier : ${scene.noms[affaire.meurtrier]}</strong><br/>` +
    `${scene.noms[affaire.meurtrier]} et ${scene.noms[affaire.victime]} ont fini seuls dans la même zone.`;
}
