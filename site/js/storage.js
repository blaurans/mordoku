/**
 * Mordoku — persistance locale (localStorage).
 *
 * Tout reste dans le navigateur : aucun compte, aucun serveur. Si le stockage
 * est indisponible (mode privé strict, quota, etc.), les fonctions renvoient
 * une valeur par défaut au lieu de lever : le jeu reste jouable, simplement
 * sans reprise.
 */

const CLE_PARTIE = 'mordoku.partie.v1';
const CLE_RECORDS = 'mordoku.records.v1';
const CLE_THEME = 'mordoku.theme.v1';
const CLE_NOTES_MODE = 'mordoku.mode-notes.v1';

const PREFIXE = 'mordoku.';

/** Enveloppe tolérante aux pannes de localStorage. */
function lire(cle, valeurParDefaut) {
  try {
    const brut = window.localStorage.getItem(cle);
    if (brut === null) return valeurParDefaut;
    return JSON.parse(brut);
  } catch {
    return valeurParDefaut;
  }
}

function ecrire(cle, valeur) {
  try {
    window.localStorage.setItem(cle, JSON.stringify(valeur));
    return true;
  } catch {
    return false;
  }
}

/** Efface toute la sauvegarde du jeu. */
function nettoyer() {
  try {
    for (const cle of Object.keys(window.localStorage)) {
      if (cle.startsWith(PREFIXE)) window.localStorage.removeItem(cle);
    }
  } catch {
    /* stockage indisponible : rien à nettoyer */
  }
}

/* ------------------------------------------------------------------ */
/* Partie en cours                                                    */
/* ------------------------------------------------------------------ */

/** Charge la partie en cours, ou null si aucune (ou illisible). */
export function chargerPartie() {
  const partie = lire(CLE_PARTIE, null);
  if (!partie || typeof partie !== 'object') return null;
  if (typeof partie.puzzle !== 'string' || partie.puzzle.length !== 81) return null;
  if (typeof partie.grille !== 'string' || partie.grille.length !== 81) return null;
  return partie;
}

/** Enregistre la partie en cours. */
export function sauverPartie(partie) {
  return ecrire(CLE_PARTIE, partie);
}

/** Supprime la partie en cours. */
export function effacerPartie() {
  try {
    window.localStorage.removeItem(CLE_PARTIE);
  } catch {
    /* stockage indisponible */
  }
}

/* ------------------------------------------------------------------ */
/* Records                                                            */
/* ------------------------------------------------------------------ */

/** Records : { [difficulte]: millisecondes }. */
export function chargerRecords() {
  const records = lire(CLE_RECORDS, {});
  return records && typeof records === 'object' ? records : {};
}

/**
 * Enregistre un temps s'il bat le record de la difficulté.
 * @returns {boolean} true si c'est un nouveau record
 */
export function enregistrerRecord(difficulte, millisecondes) {
  const records = chargerRecords();
  const actuel = records[difficulte];
  if (typeof actuel === 'number' && actuel <= millisecondes) return false;
  records[difficulte] = millisecondes;
  ecrire(CLE_RECORDS, records);
  return true;
}

/* ------------------------------------------------------------------ */
/* Préférences                                                        */
/* ------------------------------------------------------------------ */

const THEMES = ['sombre', 'clair'];

/** Thème mémorisé, 'sombre' par défaut. */
export function chargerTheme() {
  const theme = lire(CLE_THEME, 'sombre');
  return THEMES.includes(theme) ? theme : 'sombre';
}

export function sauverTheme(theme) {
  ecrire(CLE_THEME, THEMES.includes(theme) ? theme : 'sombre');
}

/** Le mode notes était-il actif la dernière fois ? */
export function chargerModeNotes() {
  return lire(CLE_NOTES_MODE, false) === true;
}

export function sauverModeNotes(actif) {
  ecrire(CLE_NOTES_MODE, actif === true);
}

export { nettoyer };