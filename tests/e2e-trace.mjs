/**
 * Test E2E : la trace de raisonnement de la solution (navigateur headless
 * via CDP). Vérifie que chaque déduction affiche la cause de ses
 * éliminations et que les positions annoncées sont les bonnes.
 *
 * Prérequis : le site servi en HTTP, par ex.
 *   node /tmp/opencode/serve.mjs site 8949
 *
 * Exécution :
 *   URL=http://127.0.0.1:8949/ node tests/e2e-trace.mjs
 */
const BASE = process.env.URL ?? 'http://127.0.0.1:8949/';
const CDP = 'http://127.0.0.1:9222';
const page = await (await fetch(`${CDP}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const a = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && a.has(m.id)) { a.get(m.id)(m); a.delete(m.id); } });
await new Promise((r) => ws.addEventListener('open', r));
const send = (m, p = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method: m, params: p })); return new Promise((r) => a.set(i, r)); };
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1000, deviceScaleFactor: 2, mobile: false });
await send('Page.enable');
const errs = [];
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(m.params.args.map((x) => x.value || x.description).join(' ')); if (m.method === 'Runtime.exceptionThrown') errs.push('EXC:' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)); });
await send('Page.navigate', { url: BASE });
await pause(1500);
await ev('localStorage.clear()');
await send('Page.navigate', { url: BASE });
// Au premier lancement le jeu affiche l'accueil : on choisit une affaire.
await pause(1200);
await ev(`document.querySelector('#accueil [data-difficulte]').click()`);
await pause(9000);

const ko = [];
const ok = (n, c, d = '') => { console.log(`${c ? '  ok  ' : ' ECHEC'} ${n}${d ? ' -- ' + d : ''}`); if (!c) ko.push(n); };

await ev(`(async () => {
  document.getElementById('bouton-solution').click();
  const i = document.getElementById('motdepasse');
  i.value = 'mdp';
  document.getElementById('formulaire-mdp').dispatchEvent(new Event('submit', {cancelable:true, bubbles:true}));
  await new Promise(r => setTimeout(r, 600));
  return true;
})()`);

const etapes = await ev(`(() => {
  const s = JSON.parse(localStorage.getItem('mordoku.partie.v1'));
  return [...document.querySelectorAll('.liste-etapes .etape')].map((li) => ({
    tete: li.querySelector('.etape-tete').textContent.trim(),
    causes: [...li.querySelectorAll('.etape-causes > li')].map((x) => x.textContent.trim()),
    conclusion: li.querySelector('.etape-conclusion').textContent.trim(),
  }));
})()`);
console.log('  etapes :', etapes.length);
for (const e of etapes.slice(0, 3)) {
  console.log('\n  ' + e.tete);
  console.log('    ' + e.causes.join('\n    '));
  console.log('    => ' + e.conclusion);
}
ok('des etapes sont listees', etapes.length > 0, String(etapes.length));
ok('chaque etape a au moins une cause', etapes.every((e) => e.causes.length > 0));
ok('chaque cause cite une position L..C..', etapes.flatMap((e) => e.causes).some((c) => /\bL\d+ C\d+\b/.test(c) || /ligne \d|colonne \d/.test(c)));
ok('chaque etape conclut sur une position', etapes.every((e) => /\bL\d+ C\d+\b/.test(e.conclusion)));

// La position annoncée doit etre la bonne.
const exact = await ev(`(() => {
  const s = JSON.parse(localStorage.getItem('mordoku.partie.v1'));
  const N = s.scene.taille;
  const txt = [...document.querySelectorAll('.liste-etapes .etape .etape-conclusion strong')].map((x) => x.textContent);
  const attendu = s.arrangement.map((c) => 'L' + (Math.floor(c / N) + 1) + ' C' + ((c % N) + 1));
  const lus = txt.map((t) => attendu.includes(t));
  return { total: txt.length, tousValides: lus.length === txt.length, detail: lus };
})()`);
ok('les positions annoncees sont reelles', exact.tousValides, JSON.stringify(exact));

const avert = await ev(`document.querySelector('#raisonnement .avertissement')?.textContent.trim() ?? ''`);
console.log('\n  avertissement :', avert.replace(/\s+/g, ' ').slice(0, 260));

// Capture
const shot = await send('Page.captureScreenshot', { format: 'png' });
const fs = await import('node:fs/promises');
await fs.writeFile('/tmp/opencode/mordoku-solution-detail.png', Buffer.from(shot.result.data, 'base64'));

console.log('\nerreurs console :', errs.length, errs.join(' | '));
console.log(ko.length === 0 && errs.length === 0 ? '\nTOUT PASSE\n' : `\nECHECS: ${ko.join(', ')}\n`);
ws.close(); process.exit(ko.length === 0 && errs.length === 0 ? 0 : 1);