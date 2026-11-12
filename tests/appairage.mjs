import { PGlite } from '@electric-sql/pglite';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)('playwright');
const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true });
const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin;`);
await db.exec(fs.readFileSync('./supabase/migrations/001_schema.sql', 'utf8'));
await db.exec(`grant usage on schema public to anon;`);
const jA = (await db.query(`select admin_creer_acces_aidant('f') j`)).rows[0].j;
const jT = (await db.query(`select admin_creer_appareil('Tablette salon') j`)).rows[0].j;
await db.query(`select aidant_enregistrer_rdv($1,'S',$2)`, [jA, JSON.stringify({ titre: 'Coiffeur', date_debut: '2026-11-13', heure_debut: '10:00', repetition: 'aucune' })]);
await db.query(`select aidant_enregistrer_note($1,'S','Bonjour Maman','Test')`, [jA]);
async function backend(route) {
  const fn = new URL(route.request().url()).pathname.split('/').pop();
  const p = JSON.parse(route.request().postData() || '{}'); const k = Object.keys(p);
  try { await db.exec('set role anon'); const r = await db.query(`select public.${fn}(${k.map((n, i) => `${n} => $${i + 1}`).join(',')}) r`, k.map((n) => p[n])); await db.exec('reset role');
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r.rows[0].r) });
  } catch (e) { await db.exec('reset role'); return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ message: e.message }) }); }
}
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
const p = await ctx.newPage();
await p.clock.install({ time: new Date('2026-11-12T22:40:00+01:00') });
await ctx.route('**/rest/v1/rpc/**', backend);
await p.goto('http://localhost:4173/');
await p.getByText("Cet appareil n'est pas relié").waitFor();
await p.screenshot({ path: `${OUT}/1-non-relie.png` });
await p.getByRole('link', { name: 'Relier cet appareil' }).click();
await p.getByText("Collez le code d'appareil").waitFor();
await p.screenshot({ path: `${OUT}/2-saisie.png` });
await p.locator('textarea').fill(jA);                 // erreur fréquente : code aidant
await p.getByRole('button', { name: 'Valider' }).click();
await p.getByText("Il faut un code d'appareil").waitFor();
await p.screenshot({ path: `${OUT}/3-code-aidant.png` });
await p.locator('textarea').fill(` "${jT}" `);
await p.getByRole('button', { name: 'Valider' }).click();
await p.getByText('Cet appareil est relié').waitFor();
await p.getByRole('link', { name: 'Afficher la page Maman' }).click();
await p.getByText('Coiffeur').waitFor();
assert.equal(await p.getByRole('link', { name: 'Relier cet appareil' }).count(), 0);
assert.match(await p.locator('.maman').innerText(), /Bonjour Maman/);
await p.screenshot({ path: `${OUT}/4-relie.png` });
await b.close(); console.log('APPAIRAGE OK');
