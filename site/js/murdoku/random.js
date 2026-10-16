/**
 * Mordoku — utilitaires aléatoires.
 *
 * Générateur déterministe (mulberry32) : à seed fixé, une affaire se
 * rejoue à l'identique. Indispensable pour déboguer un cas qui ne se résout
 * pas, et pour les tests.
 */

/** Crée une fonction pseudo-aléatoire dans [0, 1). */
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

/** Copie mélangée (Fisher-Yates). */
export function shuffled(items, random) {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Entier dans [0, borne[). */
export function entier(borne, random) {
  return Math.floor(random() * borne);
}

/** Élément au hasard. */
export function choisir(items, random) {
  return items[Math.floor(random() * items.length)];
}