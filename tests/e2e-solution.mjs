/**
 * Test E2E de la section « solution » protégée (navigateur headless via CDP).
 *
 * Prérequis : le site servi en HTTP, par ex.
 *   node /tmp/opencode/serve.mjs site 8946
 *
 * Exécution :
 *   URL=http://127.0.0.1:8946/ node tests/e2e-solution.mjs
 */
const BASE = process.env.URL ?? 'http://127.0.0.1:8946/';
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

console.log('\n-- verrou --');
await ev(`document.getElementById('bouton-solution').click()`);
await pause(300);
ok('modale ouverte', !(await ev(`document.getElementById('solution').hidden`)));
ok('champ mot de passe visible', !(await ev(`document.getElementById('solution-verrou').hidden`)));
ok('contenu masque', await ev(`document.getElementById('solution-contenu').hidden`));
// La source servie ne doit pas contenir le mot de passe en clair.
const sourceJs = await (await fetch(BASE + 'js/game.js')).text();
const litteralEnClair = ["'mdp'", '"mdp"', '`mdp`'].some((m) => sourceJs.includes(m));
ok('le mot de passe n est pas en clair dans le JS servi', !litteralEnClair);

console.log('\n-- mauvais mot de passe --');
await ev(`(() => { const i = document.getElementById('motdepasse'); i.value = 'faux'; document.getElementById('formulaire-mdp').dispatchEvent(new Event('submit', {cancelable:true, bubbles:true})); })()`);
await pause(300);
ok('refusé', await ev(`!document.getElementById('message-mdp').hidden`));
ok('contenu toujours masqué', await ev(`document.getElementById('solution-contenu').hidden`));

console.log('\n-- bon mot de passe --');
await ev(`(() => { const i = document.getElementById('motdepasse'); i.value = 'mdp'; document.getElementById('formulaire-mdp').dispatchEvent(new Event('submit', {cancelable:true, bubbles:true})); })()`);
await pause(500);
ok('contenu affiché', !(await ev(`document.getElementById('solution-contenu').hidden`)));
ok('verrou masqué', await ev(`document.getElementById('solution-verrou').hidden`));

const contenu = await ev(`({
  etapes: document.querySelectorAll('#raisonnement li').length,
  avert: document.querySelectorAll('.avertissement').length,
  suspects: document.querySelectorAll('#liste-solution li').length,
  meurtrier: (document.getElementById('reveal-solution').textContent || '').slice(0, 60),
  premier: (document.querySelector('#raisonnement li')?.textContent || '').slice(0, 90),
})`);
console.log('  contenu :', JSON.stringify(contenu));
ok('liste des positions complete', contenu.suspects === 6, String(contenu.suspects));
ok('meurtier designe', /Meurtrier/.test(contenu.meurtrier), contenu.meurtrier);

console.log('\n-- coherence avec la verite --');
const verif = await ev(`(() => {
  const s = JSON.parse(localStorage.getItem('mordoku.partie.v1'));
  const lignes = [...document.querySelectorAll('#liste-solution li')].map(li => li.textContent);
  let faux = 0;
  for (let p = 0; p < s.arrangement.length; p++) {
    const N = s.scene.taille;
    const attendu = 'ligne ' + (Math.floor(s.arrangement[p] / N) + 1) + ', colonne ' + (s.arrangement[p] % N + 1);
    if (!lignes[p].includes(attendu)) faux++;
  }
  return faux;
})()`);
ok('chaque position annoncee est la bonne', verif === 0, String(verif));

await ev(`document.getElementById('bouton-fermer-solution').click()`);
ok('fermeture', await ev(`document.getElementById('solution').hidden`));

console.log('\nerreurs console :', errs.length, errs.join(' | '));
console.log(ko.length === 0 && errs.length === 0 ? '\nTOUT PASSE\n' : `\nECHECS: ${ko.join(', ')}\n`);
ws.close(); process.exit(ko.length === 0 && errs.length === 0 ? 0 : 1);