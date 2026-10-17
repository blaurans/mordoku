/**
 * Test E2E : la lettre affichée doit être l'initiale du prénom (navigateur
 * headless via CDP).
 *
 * Prérequis : le site servi en HTTP, par ex.
 *   node /tmp/opencode/serve.mjs site 8947
 *
 * Exécution :
 *   URL=http://127.0.0.1:8947/ node tests/e2e-initiales.mjs
 */
const BASE = process.env.URL ?? 'http://127.0.0.1:8947/';
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

// La lettre de chaque carte doit être l'initiale de son prénom.
const paires = await ev(`(() => {
  const s = JSON.parse(localStorage.getItem('mordoku.partie.v1'));
  const cartes = [...document.querySelectorAll('.suspect')];
  return cartes.map((b) => ({
    nom: b.querySelector('.nom').textContent,
    lettre: b.dataset.personne !== null ? s.scene.lettres[Number(b.dataset.personne)] : '?',
  }));
})()`);
console.log('  paires :', paires.map((p) => p.lettre + '.' + p.nom).join(' '));

const sansAccent = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').charAt(0).toUpperCase();
const mauvais = paires.filter((p) => sansAccent(p.nom) !== p.lettre);
ok('lettre = initiale du prénom', mauvais.length === 0, JSON.stringify(mauvais));

const doublons = paires.filter((p, i) => paires.findIndex((q) => q.lettre === p.lettre) !== i);
ok('aucun doublon d initiale', doublons.length === 0, JSON.stringify(doublons));

// La lettre affichée sur la case posée doit être celle du suspect.
await ev(`(() => {
  const s = JSON.parse(localStorage.getItem('mordoku.partie.v1'));
  for (let p = 0; p < s.arrangement.length; p++) {
    document.querySelector('.suspect[data-personne="' + p + '"]').click();
    document.querySelector('.cellule[data-index="' + s.arrangement[p] + '"]').click();
  }
  return true;
})()`);
await pause(600);

const coherence = await ev(`(() => {
  const s = JSON.parse(localStorage.getItem('mordoku.partie.v1'));
  const fautes = [];
  for (const cell of document.querySelectorAll('.cellule.personne')) {
    const idx = Number(cell.dataset.index);
    const p = s.arrangement.indexOf(idx);
    if (p === -1) { fautes.push('case ' + idx + ' sans suspect'); continue; }
    const affiche = cell.querySelector('.badge-personne').textContent;
    if (affiche !== s.scene.lettres[p]) fautes.push(affiche + ' != ' + s.scene.lettres[p]);
  }
  return fautes;
})()`);
ok('lettre sur la case = lettre du suspect', coherence.length === 0, JSON.stringify(coherence));
ok('les six sont poses', (await ev(`document.querySelectorAll('.cellule.personne').length`)) === 6);

await ev(`document.getElementById('bouton-soumettre').click()`);
await pause(500);
ok('affaire resolue', !(await ev(`document.getElementById('fin').hidden`)));

const mdp = await ev(`(async () => {
  document.getElementById('bouton-fermer-fin').click();
  document.getElementById('bouton-solution').click();
  const i = document.getElementById('motdepasse');
  i.value = 'mdp';
  document.getElementById('formulaire-mdp').dispatchEvent(new Event('submit', {cancelable:true, bubbles:true}));
  await new Promise(r => setTimeout(r, 400));
  return document.getElementById('reveal-solution').textContent;
})()`);
ok('solution : le meurtrier est designe par son nom', /Meurtrier : \w/.test(mdp), mdp.slice(0, 40));

console.log('\nerreurs console :', errs.length, errs.join(' | '));
console.log(ko.length === 0 && errs.length === 0 ? '\nTOUT PASSE\n' : `\nECHECS: ${ko.join(', ')}\n`);
ws.close(); process.exit(ko.length === 0 && errs.length === 0 ? 0 : 1);