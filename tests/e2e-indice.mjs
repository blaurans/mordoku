/**
 * Test E2E de la fonction Indice (navigateur headless via CDP).
 *
 * Prérequis : le site servi en HTTP, par ex.
 *   node /tmp/opencode/serve.mjs site 8940
 *
 * Exécution :
 *   URL=http://127.0.0.1:8940/ node tests/e2e-indice.mjs
 *
 * Vide le localStorage de l'origine testée.
 */
const BASE = process.env.URL ?? 'http://127.0.0.1:8940/';
const CDP = 'http://127.0.0.1:9222';
const page = await (await fetch(`${CDP}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const a = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && a.has(m.id)) { a.get(m.id)(m); a.delete(m.id); } });
await new Promise((r) => ws.addEventListener('open', r));
const send = (m, p = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method: m, params: p })); return new Promise((r) => a.set(i, r)); };
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url: BASE });
await pause(1500);
// Repart d'un profil vierge, sinon on retombe sur la partie du run précédent.
await ev(`localStorage.clear()`);
await send('Page.navigate', { url: BASE });
await pause(25000);
const errs = []; ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(m.params.args.map((x) => x.value || x.description).join(' ')); if (m.method === 'Runtime.exceptionThrown') errs.push('EXC:' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)); });
await pause(25000);

const ko = [];
const ok = (nom, cond, det = '') => { console.log(`${cond ? '  ok  ' : ' ECHEC'} ${nom}${det ? ' -- ' + det : ''}`); if (!cond) ko.push(nom); };

const lire = () => ev(`(() => {
  const s = JSON.parse(localStorage.getItem('mordoku.partie.v1'));
  return {
    poses: document.querySelectorAll('.cellule.personne').length,
    total: s.arrangement.length,
    indices: document.getElementById('compteur-indices').textContent,
    chrono: document.getElementById('chrono').textContent,
    juste: (() => {
      const s = JSON.parse(localStorage.getItem('mordoku.partie.v1'));
      // On ne contrôle que les suspects effectivement posés à l'écran.
      return [...document.querySelectorAll('.cellule.personne')].every((cell) => {
        const idx = Number(cell.dataset.index);
        const attendu = s.arrangement.indexOf(idx);
        return attendu !== -1 && cell.querySelector('.badge-personne').textContent === s.scene.lettres[attendu];
      });
    })(),
  };
})()`);

console.log('\n-- indice --');
const a1 = await lire();
ok('depart: rien de pose', a1.poses === 0, JSON.stringify(a1));

await ev(`document.getElementById('bouton-indice').click()`);
await pause(400);
const a2 = await lire();
ok('un suspect est pose', a2.poses === 1, `${a2.poses}`);
ok('et a la bonne place', a2.juste);
ok('compteur d indices = 1', a2.indices === '1', a2.indices);
ok('chrono penalise', a2.chrono !== a1.chrono, `${a1.chrono} -> ${a2.chrono}`);
ok('annuler actif', await ev(`!document.getElementById('bouton-annuler').disabled`));

console.log('\n-- indice repete --');
await ev(`document.getElementById('bouton-indice').click()`);
await pause(300);
await ev(`document.getElementById('bouton-indice').click()`);
await pause(400);
const a3 = await lire();
ok('trois suspects poses', a3.poses === 3, `${a3.poses}`);
ok('tous bien places', a3.juste);
ok('compteur = 3', a3.indices === '3', a3.indices);
ok('bouton indice desactive apres 3', await ev(`document.getElementById('bouton-indice').disabled`));

console.log('\n-- annulation d un indice --');
await ev(`document.getElementById('bouton-annuler').click()`);
await pause(300);
const a4 = await lire();
ok('retour a deux poses', a4.poses === 2, `${a4.poses}`);
ok('compteur redescend a 2', a4.indices === '2', a4.indices);

await ev(`document.getElementById('bouton-retablir').click()`);
await pause(300);
const a5 = await lire();
ok('retablissement rejoue l indice', a5.poses === 3, `${a5.poses}`);
ok('compteur rebascule a 3', a5.indices === '3', a5.indices);

console.log('\n--Indices jusqu au bout : pas de record --');
await ev(`
  (() => {
    const s = JSON.parse(localStorage.getItem('mordoku.partie.v1'));
    for (let p = 0; p < s.arrangement.length; p++) {
      document.querySelector('.suspect-carte[data-personne="' + p + '"]').click();
      document.querySelector('.cellule[data-index="' + s.arrangement[p] + '"]').click();
    }
    return true;
  })()
`);
await pause(500);
await ev(`document.getElementById('bouton-soumettre').click()`);
await pause(400);
const fin = await ev(`({ visible: !document.getElementById('fin').hidden, sous: document.getElementById('fin-sous-titre').textContent, records: document.getElementById('records').textContent })`);
ok('ecran de victoire affiche', fin.visible, JSON.stringify(fin));
ok('mentionne le temps non retenu', /non retenu/.test(fin.sous), fin.sous);
ok('aucun record ecrit', !/\d\d:\d\d/.test(fin.records), fin.records);

console.log('\nconsole errs:', errs.length, errs.join(' | '));
console.log(ko.length === 0 && errs.length === 0 ? '\nTOUT PASSE\n' : `\nECHECS: ${ko.join(', ')}\n`);
ws.close(); process.exit(ko.length === 0 && errs.length === 0 ? 0 : 1);