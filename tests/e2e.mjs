// Banc d'essai complet : nécessite « npm i -D playwright && npx playwright install chromium »,
// puis « npm run build && npx vite preview --port 4173 » dans un autre terminal.
// Test de bout en bout : application compilée + schéma SQL réel (PGlite) à la place de Supabase.
import { PGlite } from '@electric-sql/pglite';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';
import assert from 'node:assert/strict';

const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });
const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin;`);
await db.exec(fs.readFileSync('./supabase/migrations/001_schema.sql', 'utf8'));
await db.exec(`grant usage on schema public to anon;`);
const jA = (await db.query(`select admin_creer_acces_aidant('famille') j`)).rows[0].j;
const jT = (await db.query(`select admin_creer_appareil('Tablette salon') j`)).rows[0].j;
await db.query(`select admin_creer_appareil('Téléphone de Maman')`);

let horsLigne = false;
let appels = 0;
async function backend(route) {
  if (horsLigne) return route.abort('internetdisconnected');
  appels++;
  const req = route.request();
  assert.ok(req.headers()['apikey'].startsWith('sb_publishable_'));
  const fn = new URL(req.url()).pathname.split('/').pop();
  const params = JSON.parse(req.postData() || '{}');
  const noms = Object.keys(params);
  const sql = `select public.${fn}(${noms.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as r`;
  const valeurs = noms.map((n) => (params[n] !== null && typeof params[n] === 'object' ? JSON.stringify(params[n]) : params[n]));
  try {
    await db.exec('set role anon');
    const res = await db.query(sql, valeurs);
    await db.exec('reset role');
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(res.rows[0].r ?? null) });
  } catch (e) {
    await db.exec('reset role');
    return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: e.message }) });
  }
}

const b = await chromium.launch();
const base = 'http://localhost:4173';
const erreursConsole = [];

// --------- Aidant (téléphone) ---------
const ctxA = await b.newContext({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
const pA = await ctxA.newPage();
pA.on('pageerror', (e) => erreursConsole.push('aidant: ' + e.message));
await pA.clock.install({ time: new Date('2026-10-26T08:00:00+01:00') });
await ctxA.route('**/rest/v1/rpc/**', backend);
// Lien sans code : la page propose de coller le lien (ici avec guillemets et espace)
await pA.goto(`${base}/aidant`);
await pA.getByText("ouvrez le lien d'accès").waitFor();
await pA.locator('textarea').fill(`"https://pagemamanfamille.netlify.app/aidant# ${jA}" `);
await pA.getByRole('button', { name: 'Valider' }).click();
await pA.getByLabel('Votre prénom').waitFor();
// Lien direct, code en majuscules
await pA.goto(`${base}/aidant#${jA.toUpperCase()}`);
await pA.getByLabel('Votre prénom').fill('Sophie');
await pA.getByRole('button', { name: 'Continuer' }).click();
assert.ok(!(await pA.evaluate(() => location.hash)), 'jeton retiré de la barre d’adresse');

async function ajouter({ titre, date, debut, fin, lieu, rep, finSerie }) {
  await pA.getByRole('button', { name: '+ Ajouter un rendez-vous' }).click();
  await pA.getByLabel('Titre').fill(titre);
  await pA.locator('input[type=date]').first().fill(date);
  await pA.getByLabel('Début').fill(debut);
  if (fin) await pA.getByLabel(/^Fin/).fill(fin);
  if (lieu) await pA.getByLabel(/^Lieu/).fill(lieu);
  if (rep) {
    await pA.getByLabel('Répétition').selectOption(rep);
    if (finSerie) await pA.getByLabel("Jusqu'au").fill(finSerie);
  }
  await pA.getByRole('button', { name: 'Enregistrer' }).click();
  await pA.getByRole('button', { name: '+ Ajouter un rendez-vous' }).waitFor();
}
await ajouter({ titre: 'Kinésithérapeute', date: '2026-10-19', debut: '09:30', fin: '10:15', lieu: 'Cabinet Lemoine, 12 rue des Lilas', rep: 'hebdo' });
await ajouter({ titre: 'Déjeuner avec Paul', date: '2026-10-26', debut: '12:00', lieu: 'À la maison' });
await ajouter({ titre: 'Dentiste', date: '2026-10-26', debut: '15:30', lieu: 'Dr Martin' });
await ajouter({ titre: 'Coiffeur', date: '2026-10-27', debut: '10:00' });

// Modifier une seule occurrence du kiné (2 novembre → 11 h)
await pA.getByRole('button', { name: /Kinésithérapeute/ }).nth(1).click();
await pA.getByRole('button', { name: 'Modifier ce jour-là seulement' }).click();
await pA.getByLabel('Début').fill('11:00');
await pA.getByLabel(/^Fin/).fill('');
await pA.getByRole('button', { name: 'Enregistrer' }).click();
await pA.getByText('modifié ce jour-là').waitFor();

// Supprimer le coiffeur
await pA.getByRole('button', { name: /Coiffeur/ }).click();
await pA.getByRole('button', { name: 'Supprimer', exact: true }).click();
await pA.getByRole('button', { name: 'Oui, supprimer' }).click();
await pA.getByText('Rendez-vous supprimé.').waitFor();
await pA.screenshot({ path: `${OUT}/aidant-rdv.png`, fullPage: true });

// Note
await pA.getByRole('button', { name: 'Note', exact: true }).click();
await pA.getByLabel('Titre').fill('Bonjour Maman');
await pA.getByLabel(/^Message/).fill('Paul arrive à midi pour déjeuner avec toi. Je t\'appelle ce soir. Bisous, Sophie');
await pA.getByRole('button', { name: 'Enregistrer' }).click();
await pA.getByText('Note enregistrée.').waitFor();

// Historique : annuler la suppression du coiffeur
await pA.getByRole('button', { name: 'Historique' }).click();
await pA.locator('li', { hasText: 'Suppression de « Coiffeur »' }).getByRole('button', { name: 'Annuler cette action' }).click();
await pA.getByRole('button', { name: 'Oui, annuler' }).click();
await pA.getByText('Action annulée.').waitFor();
await pA.screenshot({ path: `${OUT}/aidant-historique.png`, fullPage: true });
await pA.getByRole('button', { name: 'Rendez-vous' }).click();
await pA.getByRole('button', { name: /Coiffeur/ }).waitFor();

// --------- Tablette ---------
const ctxT = await b.newContext({ viewport: { width: 1280, height: 800 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
const pT = await ctxT.newPage();
pT.on('pageerror', (e) => erreursConsole.push('tablette: ' + e.message));
await pT.clock.install({ time: new Date('2026-10-26T13:05:00+01:00') });
await ctxT.route('**/rest/v1/rpc/**', backend);
await pT.goto(`${base}/appairer#${jT}`);
await pT.getByText('Cet appareil est relié').waitFor();
await pT.screenshot({ path: `${OUT}/appairage.png` });
await pT.getByRole('link', { name: 'Afficher la page Maman' }).click();
await pT.getByText('Dentiste').waitFor();
await pT.waitForTimeout(500);
await pT.screenshot({ path: `${OUT}/maman-tablette-13h05.png` });
const texte = await pT.locator('.maman').innerText();
assert.match(texte, /Lundi/);
assert.match(texte, /26 octobre 2026/);
assert.match(texte, /13 h 05/);
assert.match(texte, /Prochain rendez-vous/);
assert.match(texte, /Bonjour Maman/);
assert.ok(!texte.includes('Coiffeur'));

// Un toucher ne déclenche rien
const urlAvant = pT.url();
await pT.mouse.click(640, 400);
assert.equal(pT.url(), urlAvant);

// --------- Coupure : hors ligne toute la nuit ---------
horsLigne = true;
await pT.clock.fastForward('11:00:00'); // → 00:05 le 27
await pT.waitForTimeout(300);
let t2 = await pT.locator('.maman').innerText();
assert.match(t2, /Mardi/, 'bascule de minuit hors ligne');
assert.match(t2, /0 h 05/);
assert.match(t2, /Coiffeur/);
// Rechargement complet hors ligne (service worker + copie locale)
await pT.clock.fastForward('09:00:00'); // → 09:05
await pT.reload();
await pT.getByText('Coiffeur').waitFor();
t2 = await pT.locator('.maman').innerText();
assert.match(t2, /9 h 05/);
assert.ok(!/erreur|connexion/i.test(t2), 'aucun message d’erreur');
await pT.screenshot({ path: `${OUT}/maman-tablette-horsligne-mardi.png` });

// Le lundi suivant (2 nov.), kiné déplacé à 11 h
await pT.clock.setSystemTime(new Date('2026-11-02T08:00:00+01:00'));
await pT.clock.runFor(61000);
t2 = await pT.locator('.maman').innerText();
assert.match(t2, /Kinésithérapeute/);
assert.match(t2, /11 h/);
await pT.screenshot({ path: `${OUT}/maman-tablette-2nov.png` });

// Retour du réseau : une modification aidant arrive à la synchro suivante
horsLigne = false;
await pA.getByRole('button', { name: 'Note', exact: true }).click();
await pA.getByLabel('Titre').fill('Bon lundi Maman');
await pA.getByRole('button', { name: 'Enregistrer' }).click();
await pA.getByText('Note enregistrée.').waitFor();
let recu = false;
for (let i = 0; i < 140 && !recu; i++) {
  await pT.clock.runFor(5000);
  await pT.waitForTimeout(60);
  recu = (await pT.locator('.maman').innerText()).includes('Bon lundi Maman');
}
assert.ok(recu, 'modification reçue en moins de 12 min');
await pT.getByText('Bon lundi Maman').waitFor({ timeout: 5000 });

// --------- Téléphone de Maman (portrait) ---------
const ctxP = await b.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
const pP = await ctxP.newPage();
await pP.clock.install({ time: new Date('2026-10-26T13:05:00+01:00') });
await ctxP.route('**/rest/v1/rpc/**', backend);
const jP = (await db.query(`select admin_creer_appareil('Téléphone 2') j`)).rows[0].j;
await pP.goto(`${base}/appairer#${jP}`);
await pP.getByText('Cet appareil est relié').waitFor();
await pP.goto(`${base}/`);
await pP.getByText('Dentiste').waitFor();
await pP.waitForTimeout(400);
await pP.screenshot({ path: `${OUT}/maman-telephone.png` });

// Aidant : appareils + aperçu
await pA.clock.setSystemTime(new Date('2026-10-26T13:05:00+01:00'));
await pA.getByRole('button', { name: 'Appareils' }).click();
await pA.screenshot({ path: `${OUT}/aidant-appareils.png`, fullPage: true });
await pA.getByRole('button', { name: 'Aperçu' }).click();
await pA.screenshot({ path: `${OUT}/aidant-apercu.png`, fullPage: true });

// Révocation : l'ancien lien aidant ne fonctionne plus
await db.query(`select admin_renouveler_acces_aidant('v2')`);
await pA.reload();
await pA.getByText("n'est plus valable").waitFor();

await b.close();
assert.deepEqual(erreursConsole, []);
console.log('E2E OK –', appels, 'appels serveur');
