/**
 * Test E2E : l'écran d'accueil et les affaires pré-calculées (navigateur
 * headless via CDP).
 *
 * Prérequis : le site servi en HTTP, par ex.
 *   node /tmp/opencode/serve.mjs site 8950
 *
 * Exécution :
 *   URL=http://127.0.0.1:8950/ node tests/e2e-accueil.mjs
 *
 * ⚠ Vide le localStorage de l'origine testée.
 */
const BASE = process.env.URL ?? 'http://127.0.0.1:8950/';
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
await send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1050, deviceScaleFactor: 2, mobile: false });
await send('Page.enable');
const errs = [];
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(m.params.args.map((x) => x.value || x.description).join(' ')); if (m.method === 'Runtime.exceptionThrown') errs.push('EXC:' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)); });
await send('Page.navigate', { url: BASE });
await pause(1500);
await ev('localStorage.clear()');
await send('Page.navigate', { url: BASE });
await pause(3000);

const ko = [];
const ok = (n, c, d = '') => { console.log(`${c ? '  ok  ' : ' ECHEC'} ${n}${d ? ' -- ' + d : ''}`); if (!c) ko.push(n); };

// 1. Au premier lancement, l'accueil s'ouvre et rien n'est joué.
ok("l'accueil est ouvert au premier lancement", !(await ev(`document.getElementById('accueil').hidden`)));
ok('aucune affaire encore jouée', (await ev(`document.querySelectorAll('.cellule').length`)) === 0);

const cas = await ev(`(() => [...document.querySelectorAll('#liste-cas .cas')].map(b => ({
  id: b.dataset.cas,
  // Pas de regex dans ce gabarit : antislash-s y deviendrait la lettre s.
  texte: b.textContent.trim(),
})))()`);
console.log('\n  ' + cas.map((c) => c.texte).join('\n  ') + '\n');
ok('six cas proposes', cas.length === 6, String(cas.length));
ok('le premier est etiquette « Pour commencer »', /Pour commencer/.test(cas[0].texte));
ok('chaque cas annonce ses indices', cas.every((c) => /\d+ indices/.test(c.texte)));

// 2. Le premier cas se lance et se résout en suivant les indices.
await ev(`document.querySelector('#liste-cas .cas').click()`);
await pause(900);
ok("l'accueil se referme", await ev(`document.getElementById('accueil').hidden`));

const tete = await ev(`document.getElementById('titre-affaire').textContent`);
console.log('  titre :', tete);
ok('le titre annonce le palier', /palier 1/.test(tete));
ok('le select de difficulte est masque', await ev(`document.getElementById('select-difficulte').hidden`));

const taille = await ev(`document.querySelectorAll('.cellule').length`);
ok('grille 4x4', taille === 16, String(taille));
ok('quatre suspects', (await ev(`document.querySelectorAll('.suspect').length`)) === 4);
const nbIndices = await ev(`(() => {
  const s = JSON.parse(localStorage.getItem('mordoku.partie.v1'));
  return { clues: s.clues.length, cartes: document.querySelectorAll('.carte-indice').length };
})()`);
console.log('  indices du cas :', JSON.stringify(nbIndices));
ok('les huit indices sont charged', nbIndices.clues === 8, String(nbIndices.clues));
ok('chaque suspect a sa carte d indices', nbIndices.cartes === 4, String(nbIndices.cartes));

// On applique la solution du cas : chaque déduction doit suivre.
const pose = await ev(`(() => {
  const s = JSON.parse(localStorage.getItem('mordoku.partie.v1'));
  for (let p = 0; p < s.arrangement.length; p++) {
    document.querySelector('.suspect[data-personne="' + p + '"]').click();
    document.querySelector('.cellule[data-index="' + s.arrangement[p] + '"]').click();
  }
  return s.arrangement.length;
})()`);
await pause(500);
ok('les quatre sont posés', (await ev(`document.querySelectorAll('.cellule.personne').length`)) === pose);
await ev(`document.getElementById('bouton-soumettre').click()`);
await pause(500);
ok("l'affaire se conclut", !(await ev(`document.getElementById('fin').hidden`)));
const fin = await ev(`document.getElementById('reveal').textContent`);
console.log('  fin :', fin.replace(/\s+/g, ' '));
ok('un meurtrier est designe', /Meurtrier : \w/.test(fin));

// 3. La solution d'un cas pré-calculé est complète (aucun avertissement).
const trace = await ev(`(async () => {
  document.getElementById('bouton-fermer-fin').click();
  document.getElementById('bouton-solution').click();
  const i = document.getElementById('motdepasse');
  i.value = 'mdp';
  document.getElementById('formulaire-mdp').dispatchEvent(new Event('submit', {cancelable:true, bubbles:true}));
  await new Promise(r => setTimeout(r, 700));
  return {
    etapes: document.querySelectorAll('.liste-etapes .etape').length,
    avert: document.querySelector('#raisonnement .avertissement')?.textContent.trim() ?? '',
  };
})()`);
console.log('  etapes de solution :', trace.etapes);
ok('la solution est detaillee', trace.etapes >= 4, String(trace.etapes));
ok("elle est complete : aucun avertissement", trace.avert === '', trace.avert.slice(0, 60));

await ev(`document.getElementById('bouton-fermer-solution').click();
          document.getElementById('bouton-accueil').click();
          await new Promise(r => setTimeout(r, 300));
          document.querySelector('#liste-cas .cas[data-cas="premier-pas"]').click();`);
await pause(1000);

// 4. Retour à l'accueil, on choisit une affaire au hasard.
await ev(`document.getElementById('bouton-fermer-solution').click();
          document.getElementById('bouton-accueil').click();`);
await pause(300);
ok('le bouton accueil rouvre la liste', !(await ev(`document.getElementById('accueil').hidden`)));
await ev(`document.querySelector('#accueil [data-difficulte="debutant"]').click()`);
await pause(9000);
ok("l'affaire generee est en 6x6", (await ev(`document.querySelectorAll('.cellule').length`)) === 36);
ok('le select de difficulte revient', !(await ev(`document.getElementById('select-difficulte').hidden`)));

// 5. La partie en cours est rechargée intacte.
await ev(`document.querySelector('.suspect[data-personne="0"]').click();
          document.querySelector('.cellule[data-index="7"]').click();`);
await pause(400);
await send('Page.navigate', { url: BASE });
await pause(2500);
ok('la partie est restauree au rechargement', (await ev(`document.querySelectorAll('.cellule.personne').length`)) === 1);
ok("et le menu ne s'ouvre pas", await ev(`document.getElementById('accueil').hidden`));

// 6. Les six dossiers se lancent, se résolvent et s'expliquent entièrement.
const bilan = [];
for (const id of ['premier-pas', 'croisements', 'le-bureau', 'la-villa', 'le-theatre', 'la-plage']) {
  const r = await ev(`(async () => {
    document.getElementById('bouton-fermer-solution')?.click();
    document.getElementById('bouton-accueil').click();
    await new Promise(r => setTimeout(r, 200));
    const bouton = document.querySelector('#liste-cas .cas[data-cas="' + ${JSON.stringify(id)} + '"]');
    if (!bouton) return { erreur: 'absent de la liste' };
    bouton.click();
    await new Promise(r => setTimeout(r, 900));
    const s = JSON.parse(localStorage.getItem('mordoku.partie.v1'));
    for (let p = 0; p < s.arrangement.length; p++) {
      document.querySelector('.suspect[data-personne="' + p + '"]').click();
      document.querySelector('.cellule[data-index="' + s.arrangement[p] + '"]').click();
    }
    document.getElementById('bouton-soumettre').click();
    await new Promise(r => setTimeout(r, 300));
    const resolue = !document.getElementById('fin').hidden;

    document.getElementById('bouton-fermer-fin').click();
    document.getElementById('bouton-solution').click();
    document.getElementById('motdepasse').value = 'mdp';
    document.getElementById('formulaire-mdp').dispatchEvent(new Event('submit', {cancelable:true, bubbles:true}));
    await new Promise(r => setTimeout(r, 700));
    return {
      resolue,
      taille: s.scene.taille,
      indices: s.clues.length,
      etapes: document.querySelectorAll('.liste-etapes .etape').length,
      avertissement: (document.querySelector('#raisonnement .avertissement')?.textContent ?? '').trim(),
    };
  })()`);
  bilan.push({ id, ...r });
  const bon = r.taille && r.resolue && r.etapes === r.taille && r.avertissement === '';
  console.log(`${bon ? '  ok  ' : ' ECHEC'} ${id.padEnd(13)} ${r.taille}×${r.taille} ${r.indices} indices, ${r.etapes} étapes${r.avertissement ? ' — AVERTISSEMENT' : ''}`);
  if (!bon) ko.push(`cas ${id}`);
}

const shot = await send('Page.captureScreenshot', { format: 'png' });
const fs = await import('node:fs/promises');
await fs.writeFile('/tmp/opencode/mordoku-accueil.png', Buffer.from(shot.result.data, 'base64'));

console.log('\nerreurs console :', errs.length, errs.join(' | '));
console.log(ko.length === 0 && errs.length === 0 ? '\nTOUT PASSE\n' : `\nECHECS: ${ko.join(', ')}\n`);
ws.close(); process.exit(ko.length === 0 && errs.length === 0 ? 0 : 1);