/**
 * Smoke test E2E de Mordoku.
 *
 * Pilote un Chromium headless via le protocole DevTools (aucune dépendance
 * npm : on parle directement en WebSocket au CDP). Vérifie le rendu, la
 * saisie clavier, les notes, l'annulation, la victoire, la persistance et
 * l'absence d'erreur console.
 *
 * ATTENTION : le test vide le localStorage de l'origine visée. Ne jamais le
 * lancer contre un profil de navigateur qui contient une vraie partie en cours.
 *
 * Préparation :
 *   chromium --headless=new --no-sandbox --remote-debugging-port=9222 \
 *            --user-data-dir=/tmp/mordoku-chrome about:blank &
 *
 * Exécution (le site doit être servi en HTTP, pas en file://) :
 *   MORDOKU_URL=https://mordoku.laurans.org/ node tests/e2e.mjs
 *
 * Variables d'environnement :
 *   MORDOKU_URL  URL testée  (défaut http://127.0.0.1:8932/)
 *   CDP_URL      point d'entrée du CDP (défaut http://127.0.0.1:9222)
 */

const BASE = process.env.MORDOKU_URL ?? 'http://127.0.0.1:8932/';
const CDP = process.env.CDP_URL ?? 'http://127.0.0.1:9222';

const page = await (
  await fetch(`${CDP}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })
).json();
const ws = new WebSocket(page.webSocketDebuggerUrl);

let idMessage = 0;
const attentes = new Map();
const erreursConsole = [];
const exceptions = [];

ws.addEventListener('message', (evenement) => {
  const message = JSON.parse(evenement.data);
  if (message.id && attentes.has(message.id)) {
    attentes.get(message.id)(message);
    attentes.delete(message.id);
    return;
  }
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    erreursConsole.push(message.params.args.map((a) => a.value ?? a.description ?? a.type).join(' '));
  }
  if (message.method === 'Runtime.exceptionThrown') {
    exceptions.push(
      message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text,
    );
  }
});

await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve);
  ws.addEventListener('error', reject);
});

function envoyer(method, params = {}) {
  const id = ++idMessage;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => attentes.set(id, resolve));
}

async function evaluer(expression) {
  const reponse = await envoyer('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  const echec = reponse.result?.exceptionDetails;
  if (echec) throw new Error(echec.exception?.description ?? echec.text);
  return reponse.result?.result?.value;
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const touche = (key, mods = '') =>
  evaluer(
    `document.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)},bubbles:true${mods}}))`,
  );
const ctrlZ = () => touche('z', ',ctrlKey:true');
const cliquerCase = (index) => evaluer(`document.querySelector('.case[data-index="${index}"]').click()`);
const valeurCase = (index) =>
  evaluer(`document.querySelector('.case[data-index="${index}"] .valeur').textContent`);
const notesVisibles = (index) =>
  evaluer(
    `[...document.querySelector('.case[data-index="${index}"] .notes').children].filter((s)=>!s.hidden).map((s)=>s.textContent).join('')`,
  );
const premierIndexLibre = () =>
  evaluer(`[...document.querySelectorAll('.case')].find((c)=>!c.classList.contains('donne')).dataset.index`);

const echecs = [];
function verifier(nom, condition, detail = '') {
  const ok = Boolean(condition);
  console.log(`${ok ? '  ok  ' : ' ÉCHEC'} ${nom}${detail ? ` — ${detail}` : ''}`);
  if (!ok) echecs.push(nom);
}

await envoyer('Runtime.enable');
await envoyer('Page.enable');
await envoyer('Page.navigate', { url: BASE });
await pause(1200);

// Le profil Chromium est partagé entre les exécutions : on repart du zéro.
await evaluer(`localStorage.clear()`);
await envoyer('Page.navigate', { url: BASE });
await pause(1800);

console.log('\n--- rendu ---');
verifier('81 cases rendues', (await evaluer(`document.querySelectorAll('.case').length`)) === 81);
verifier('9 rangées ARIA', (await evaluer(`document.querySelectorAll('.rangee[role="row"]').length`)) === 9);
const donnes = await evaluer(`document.querySelectorAll('.case.donne').length`);
verifier('indices donnés visibles', donnes > 20 && donnes < 60, `${donnes} donnés`);
verifier(
  'valeur affichée dans les cases données',
  /^[1-9]$/.test(await evaluer(`document.querySelector('.case.donne .valeur').textContent`)),
);
verifier('chrono au format mm:ss', /^\d{2}:\d{2}$/.test(await evaluer(`document.getElementById('chrono').textContent`)));
verifier('thème sombre par défaut', (await evaluer(`document.documentElement.dataset.theme`)) === 'sombre');
verifier('4 difficultés proposées', (await evaluer(`document.getElementById('difficulte').options.length`)) === 4);
verifier('9 pavés de saisie', (await evaluer(`document.querySelectorAll('.pave-chiffres .touche').length`)) === 9);

console.log('\n--- saisie clavier ---');
const libre = Number(await premierIndexLibre());
await cliquerCase(libre);
verifier(
  'case sélectionnée après clic',
  (await evaluer(`document.querySelector('.case.selection').dataset.index`)) === String(libre),
);
await touche('7');
await pause(120);
verifier('chiffre posé', (await valeurCase(libre)) === '7');
verifier(
  'aria-label mis à jour',
  /chiffre 7/.test(
    await evaluer(`document.querySelector('.case[data-index="${libre}"]').getAttribute('aria-label')`),
  ),
);
const curseurApresChiffre = await evaluer(`document.querySelector('.case.selection').dataset.index`);
console.log(`  info  curseur après saisie : case ${libre} -> ${curseurApresChiffre}`);
await cliquerCase(libre);
await touche('7');
await pause(120);
verifier('represser le même chiffre garde la valeur', (await valeurCase(libre)) === '7');
await cliquerCase(libre);
await touche('Backspace');
await pause(120);
verifier('effacement au clavier', (await valeurCase(libre)) === '');
verifier('curseur non avancé après effacement', (await evaluer(`document.querySelector('.case.selection').dataset.index`)) === String(libre));

console.log('\n--- notes ---');
await touche('n');
verifier('mode notes activé', (await evaluer(`document.getElementById('bouton-notes').getAttribute('aria-pressed')`)) === 'true');
for (const chiffre of ['1', '4', '7']) {
  await cliquerCase(libre);
  await touche(chiffre);
}
await pause(120);
verifier('notes candidates affichées', (await notesVisibles(libre)) === '147', `"${await notesVisibles(libre)}"`);
await cliquerCase(libre);
await touche('4');
await pause(120);
verifier('note retirée au second appui', (await notesVisibles(libre)) === '17');

// La sauvegarde est différée de 400 ms : on attend avant de relire le stockage.
await pause(700);
const notesStockees = await evaluer(
  `JSON.parse(localStorage.getItem('mordoku.partie.v1')).notes[${libre}]`,
);
verifier('notes persistées dans le stockage local', notesStockees === '17', `"${notesStockees}"`);

await touche("n");
await cliquerCase(libre);
await touche('Backspace');
await pause(120);
verifier('notes effacées', (await notesVisibles(libre)) === '');

// La sauvegarde est différée de 400 ms : on attend avant de la relire.
await pause(700);
const stockApresNotes = await evaluer(
  `JSON.parse(localStorage.getItem('mordoku.partie.v1')).notes.filter((n) => n !== '').length`,
);
verifier('notes persistées dans le stockage local', typeof stockApresNotes === 'number');

console.log('\n--- undo / redo ---');
await cliquerCase(libre);
await touche('3');
await pause(100);
verifier('chiffre posé', (await valeurCase(libre)) === '3');
verifier('annuler actif', await evaluer(`!document.getElementById('bouton-annuler').disabled`));
verifier('rétablir inactif après un coup neuf', await evaluer(`document.getElementById('bouton-retablir').disabled`));
await ctrlZ();
await pause(100);
verifier('Ctrl+Z annule le coup', (await valeurCase(libre)) === '');
verifier('rétablir actif après annulation', await evaluer(`!document.getElementById('bouton-retablir').disabled`));
await evaluer(`document.getElementById('bouton-retablir').click()`);
await pause(100);
verifier('rétablir rejoue le coup', (await valeurCase(libre)) === '3');
await ctrlZ();
await pause(100);
verifier('Ctrl+Z après rétablissement', (await valeurCase(libre)) === '');
await touche('Backspace');
await pause(100);
verifier('effacement au clavier', (await valeurCase(libre)) === '');

console.log('\n--- pause ---');
await touche('p');
await pause(100);
verifier('voile de pause affiché', (await evaluer(`document.getElementById('voile').hidden`)) === false);
await evaluer(`document.getElementById('bouton-reprendre').click()`);
await pause(100);
verifier('reprise', (await evaluer(`document.getElementById('voile').hidden`)) === true);

console.log('\n--- indice et vérification ---');
const chronoAvant = await evaluer(`document.getElementById('chrono').textContent`);
await evaluer(`document.getElementById('bouton-indice').click()`);
await pause(150);
verifier('compteur d’indices incrémenté', (await evaluer(`document.getElementById('compteur-indices').textContent`)) === '1');
verifier('chrono pénalisé par l’indice', (await evaluer(`document.getElementById('chrono').textContent`)) !== chronoAvant);
verifier('case d’indice stylée', (await evaluer(`document.querySelectorAll('.case.indice').length`)) === 1);
const valeurIndice = await evaluer(`document.querySelector('.case.indice .valeur').textContent`);
verifier('indice = valeur de la solution', /^[1-9]$/.test(valeurIndice), valeurIndice);

await evaluer(`document.getElementById('bouton-verifier').click()`);
await pause(150);
console.log(`  info  cases signalées en erreur : ${await evaluer(`document.querySelectorAll('.case.erreur').length`)}`);
await pause(2700);
verifier('signalement temporaire expiré', (await evaluer(`document.querySelectorAll('.case.erreur').length`)) === 0);

console.log('\n--- victoire ---');
const victoire = await evaluer(`
  (async () => {
    const sudoku = await import('./js/sudoku.js');
    const stock = JSON.parse(localStorage.getItem('mordoku.partie.v1'));
    const solution = sudoku.solve(Uint8Array.from(stock.puzzle, Number));
    for (const c of [...document.querySelectorAll('.case')]) {
      if (c.classList.contains('donne')) continue;
      c.click();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: String(solution[Number(c.dataset.index)]), bubbles: true }));
      await new Promise((r) => setTimeout(r, 4));
    }
    await new Promise((r) => setTimeout(r, 300));
    return {
      fin: document.getElementById('fin').hidden === false,
      detail: document.getElementById('fin-detail').textContent,
      records: document.getElementById('records').textContent,
    };
  })()
`);
verifier('écran de victoire affiché', victoire.fin, victoire.detail);
verifier('temps de résolution affiché', /\d{2}:\d{2}/.test(victoire.detail), victoire.detail);
verifier('indice mentionné dans le bilan', /indice/.test(victoire.detail), victoire.detail);
verifier('aucun record enregistré avec indice', /—/.test(victoire.records), victoire.records);

console.log('\n--- thème et rechargement ---');
await evaluer(`document.getElementById('bouton-theme').click()`);
verifier('bascule vers le thème clair', (await evaluer(`document.documentElement.dataset.theme`)) === 'clair');
await evaluer(`location.reload()`);
await pause(1800);
const apres = await evaluer(`({
  cases: document.querySelectorAll('.case').length,
  theme: document.documentElement.dataset.theme,
  difficulte: document.getElementById('difficulte').value,
  termine: document.getElementById('fin').hidden === false,
})`);
verifier('grille restaurée après rechargement', apres.cases === 81, JSON.stringify(apres));
verifier('thème mémorisé', apres.theme === 'clair');
verifier('grille terminée restaurée', apres.termine);

console.log('\n--- nouvelle partie ---');
await evaluer(`document.getElementById('difficulte').value = 'expert'`);
await evaluer(`document.getElementById('bouton-nouvelle').click()`);
await pause(500);
const expert = await evaluer(`({
  donnees: document.querySelectorAll('.case.donne').length,
  diff: document.getElementById('difficulte').value,
  fin: document.getElementById('fin').hidden,
  chrono: document.getElementById('chrono').textContent,
})`);
verifier('expert : peu d’indices', expert.donnees <= 32, `${expert.donnees} donnés`);
verifier('difficulté appliquée', expert.diff === 'expert');
verifier('chrono remis à zéro', /^00:0\d$/.test(expert.chrono), expert.chrono);
verifier('écran de victoire masqué', expert.fin);
verifier('grille symétrique en expert', await evaluer(`
  (() => {
    const cases = [...document.querySelectorAll('.case')];
    return cases.every((c, i) => c.classList.contains('donne') === cases[80 - i].classList.contains('donne'));
  })()
`));

console.log('\n--- console ---');
verifier('aucune erreur console', erreursConsole.length === 0, erreursConsole.join(' | '));
verifier('aucune exception JS', exceptions.length === 0, exceptions.join(' | '));

console.log(`\n${echecs.length === 0 ? 'TOUT PASSE' : `ECHECS (${echecs.length}): ${echecs.join(', ')}`}\n`);
ws.close();
process.exit(echecs.length === 0 ? 0 : 1);