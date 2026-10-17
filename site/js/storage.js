/**
 * Mordoku — persistance locale (localStorage).
 * Tout reste dans le navigateur ; stockage indisponible => repli silencieux.
 */

const CLE_PARTIE = 'mordoku.partie.v1';
const CLE_RECORDS = 'mordoku.records.v1';
const CLE_THEME = 'mordoku.theme.v1';

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

export function chargerPartie() {
  const partie = lire(CLE_PARTIE, null);
  if (!partie || typeof partie !== 'object') return null;
  if (!partie.scene || typeof partie.seed !== 'number') return null;
  return partie;
}

export function sauverPartie(partie) {
  return ecrire(CLE_PARTIE, partie);
}

export function effacerPartie() {
  try {
    window.localStorage.removeItem(CLE_PARTIE);
  } catch {
    /* stockage indisponible */
  }
}

export function chargerRecords() {
  const records = lire(CLE_RECORDS, {});
  return records && typeof records === 'object' ? records : {};
}

export function enregistrerRecord(difficulte, millisecondes) {
  const records = chargerRecords();
  const actuel = records[difficulte];
  if (typeof actuel === 'number' && actuel <= millisecondes) return false;
  records[difficulte] = millisecondes;
  ecrire(CLE_RECORDS, records);
  return true;
}

const THEMES_VALIDES = ['sombre', 'clair'];

export function chargerTheme() {
  const theme = lire(CLE_THEME, 'clair');
  return THEMES_VALIDES.includes(theme) ? theme : 'clair';
}

export function sauverTheme(theme) {
  ecrire(CLE_THEME, THEMES_VALIDES.includes(theme) ? theme : 'sombre');
}