/**
 * Smoke test E2E de Mordoku.
 * Pilote un Chromium headless via le CDP (aucune dépendance npm).
 *
 * ⚠ Vide le localStorage de l'origine testée.
 *
 * Préparation :
 *   chromium --headless=new --no-sandbox --remote-debugging-port=9222 \
 *            --user-data-dir=/tmp/murdoku-chrome about:blank &
 *
 * Exécution :
 *   MORDOKU_URL=http://127.0.0.1:8933/ node tests/e2e.mjs
 */
const BASE = process.env.MORDOKU_URL ?? 'http://127.0.0.1:8933/';
const CDP = process.env.CDP_URL ?? 'http://127.0.0.1:9222';

const page = await (await fetch(`${CDP}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const attentes = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && attentes.has(m.id)) { attentes.get(m.id)(m); attentes.delete(m.id); } });
await new Promise((r) => ws.addEventListener('open', r));
const send = (m, p = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method: m, params: p })); return new Promise((r) => attentes.set(i, r)); };
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url: BASE });
const erreurs = []; ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') erreurs.push(m.params.args.map((x) => x.value || x.description).join(' ')); if (m.method === 'Runtime.exceptionThrown') erreurs.push('EXC:' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)); });
await pause(2000);
await ev('localStorage.clear()');
await send('Page.navigate', { url: BASE });
await pause(30000); // laisser l'affaire se générer (jusqu'à 8×8 en ~5 s)

const snapshot = await ev(`({
  cells: document.querySelectorAll('.cellule').length,
  suspects: document.querySelectorAll('.suspect-carte').length,
  IndicesGeneraux: document.getElementById('liste-indices')?.children?.length ?? 0,
  titre: (document.getElementById('titre-affaire') || {}).textContent || '',
  terminee: false,
})`);
console.log(JSON.stringify(snapshot));

// Première interaction : sélectionner puis placer
await ev('document.querySelector(\".suspect-carte\")?.click()');
const premierLibre = await ev('document.querySelector(\".cellule:not(.bloquee)\")?.dataset?.index');
await ev(`document.querySelector('.cellule[data-index=\"${premierLibre}\"]')?.click()`);
await pause(200);
const apres = await ev('document.querySelectorAll(\".cellule.personne\").length');
console.log('aprés placement d\'une personne :', apres);
ws.close(); process.exit(0);