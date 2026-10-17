/**
 * Test E2E : infobulle au survol des objets (navigateur headless via CDP).
 *
 * Prérequis : le site servi en HTTP, par ex.
 *   node /tmp/opencode/serve.mjs site 8948
 *
 * Exécution :
 *   URL=http://127.0.0.1:8948/ node tests/e2e-infobulle.mjs
 */
const BASE = process.env.URL ?? 'http://127.0.0.1:8948/';
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
await send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 980, deviceScaleFactor: 2, mobile: false });
await send('Page.enable');
await send('Page.navigate', { url: BASE });
const errs = [];
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(m.params.args.map((x) => x.value || x.description).join(' ')); if (m.method === 'Runtime.exceptionThrown') errs.push('EXC:' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)); });
await pause(1500);
await ev('localStorage.clear()');
await send('Page.navigate', { url: BASE });
// Au premier lancement le jeu affiche l'accueil : on choisit une affaire.
await pause(1200);
await ev(`document.querySelector('#accueil [data-difficulte]').click()`);
await pause(9000);

const ko = [];
const ok = (n, c, d = '') => { console.log(`${c ? '  ok  ' : ' ECHEC'} ${n}${d ? ' -- ' + d : ''}`); if (!c) ko.push(n); };

// Une case contenant un objet
const cible = await ev(`(() => {
  const s = JSON.parse(localStorage.getItem('mordoku.partie.v1'));
  const o = s.scene.objets[0];
  const attendu = (o.article + ' ' + o.nom).trim();
  return { index: o.cellule, attendu };
})()`);
console.log('  objet attendu :', JSON.stringify(cible));

// survol simulé
await ev(`(() => {
  const cell = document.querySelector('.cellule[data-index="${cible.index}"]');
  cell.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
  return true;
})()`);
await pause(250);

const bulle = await ev(`(() => {
  const b = document.querySelector('#calque-infos .infobulle');
  if (!b) return null;
  const r = b.getBoundingClientRect();
  const scene = document.getElementById('scene').getBoundingClientRect();
  return {
    texte: b.textContent,
    visible: r.width > 0 && r.height > 0,
    dansScene: r.left >= scene.left - 1 && r.right <= scene.right + 1 && r.top >= scene.top - 1 && r.bottom <= scene.bottom + 1,
  };
})()`);
console.log('  bulle :', JSON.stringify(bulle));
ok('une infobulle apparait au survol', bulle !== null);
ok('elle porte le bon nom', bulle && bulle.texte === cible.attendu, bulle && bulle.texte);
ok('elle est visible', bulle && bulle.visible);
ok('elle ne sort pas de la scene', bulle && bulle.dansScene);

// la bulle disparait quand on quitte
await ev(`(() => {
  const cell = document.querySelector('.cellule[data-index="${cible.index}"]');
  cell.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }));
  return true;
})()`);
await pause(250);
ok('elle disparait a la sortie', (await ev(`document.querySelectorAll('#calque-infos .infobulle').length`)) === 0);

// une case sans objet affiche le nom de la piece
const vide = await ev(`(() => {
  const s = JSON.parse(localStorage.getItem('mordoku.partie.v1'));
  const occupees = new Set([...s.scene.objets.map(o => o.cellule), ...s.scene.interdites.map(i => i.cellule)]);
  for (let c = 0; c < s.scene.decalage; c++) if (!occupees.has(c)) return c;
  return 0;
})()`);
await ev(`document.querySelector('.cellule[data-index="${vide}"]').dispatchEvent(new PointerEvent('pointerenter',{bubbles:true}))`);
await pause(200);
const nomPiece = await ev(`document.querySelector('#calque-infos .infobulle')?.textContent ?? null`);
ok('sur une case vide, le nom de la piece', typeof nomPiece === 'string' && nomPiece.length > 0, String(nomPiece));

// capture avec la bulle visible
await ev(`document.querySelector('.cellule[data-index="${cible.index}"]').dispatchEvent(new PointerEvent('pointerenter',{bubbles:true}))`);
await pause(300);
const shot = await send('Page.captureScreenshot', { format: 'png' });
const fs = await import('node:fs/promises');
await fs.writeFile('/tmp/opencode/mordoku-infobulle.png', Buffer.from(shot.result.data, 'base64'));

console.log('\nerreurs console :', errs.length, errs.join(' | '));
console.log(ko.length === 0 && errs.length === 0 ? '\nTOUT PASSE\n' : `\nECHECS: ${ko.join(', ')}\n`);
ws.close(); process.exit(ko.length === 0 && errs.length === 0 ? 0 : 1);