import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin;`);
await db.exec(fs.readFileSync('./supabase/migrations/001_schema.sql', 'utf8'));
// Rejouable ?
await db.exec(fs.readFileSync('./supabase/migrations/001_schema.sql', 'utf8'));
await db.exec(`grant usage on schema public to anon;`);

const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const jetonA = (await one(`select admin_creer_acces_aidant('famille') j`)).j;
const jetonT = (await one(`select admin_creer_appareil('Tablette salon') j`)).j;
assert.equal(jetonA.length, 64);

// En tant qu'anon
await db.exec(`set role anon`);
await assert.rejects(db.query(`select * from rdv`), /permission denied/);
await assert.rejects(db.query(`select admin_creer_acces_aidant('x')`), /permission denied/);
await assert.rejects(db.query(`select aidant_etat('mauvais-jeton-mauvais-jeton-mauvais')`), /acces_refuse/);
await assert.rejects(db.query(`select appareil_synchroniser($1,'1')`, [jetonA]), /acces_refuse/);

const id1 = (await one(`select aidant_enregistrer_rdv($1,'Sophie',$2) id`, [jetonA,
  { titre: 'Dentiste', date_debut: '2026-10-27', heure_debut: '14:30', lieu: 'Dr Martin' }])).id;
const id2 = (await one(`select aidant_enregistrer_rdv($1,'Paul',$2) id`, [jetonA,
  { titre: 'Kiné', date_debut: '2026-10-20', heure_debut: '10:00', repetition: 'hebdo', fin_serie: '2026-12-31' }])).id;
await assert.rejects(db.query(`select aidant_enregistrer_rdv($1,'',$2)`, [jetonA, { titre: 'x', date_debut: '2026-10-27', heure_debut: '10:00' }]), /nom_requis/);
await assert.rejects(db.query(`select aidant_enregistrer_rdv($1,'P',$2)`, [jetonA, { titre: ' ', date_debut: '2026-10-27', heure_debut: '10:00' }]), /check/);

await db.query(`select aidant_enregistrer_rdv($1,'Paul',$2)`, [jetonA, { id: id1, titre: 'Dentiste (contrôle)', date_debut: '2026-10-27', heure_debut: '15:00' }]);
await db.query(`select aidant_exception_occurrence($1,'Paul',$2,'2026-10-27',null)`, [jetonA, id2]);
await db.query(`select aidant_exception_occurrence($1,'Paul',$2,'2026-11-03',$3)`, [jetonA, id2, { heure_debut: '11:00' }]);
await db.query(`select aidant_enregistrer_note($1,'Sophie','Bonjour Maman','Sophie passe à midi.')`, [jetonA]);
await db.query(`select aidant_supprimer_rdv($1,'Sophie',$2)`, [jetonA, id1]);

let etat = (await one(`select aidant_etat($1) e`, [jetonA])).e;
assert.equal(etat.rdvs.length, 1);
assert.equal(etat.exceptions.length, 2);
assert.equal(etat.note.titre, 'Bonjour Maman');
assert.equal(etat.historique.length, 7);

// Annuler la suppression du dentiste, puis la modif de la note (pas d'avant → reset vide)
const hSupp = etat.historique.find(h => h.action === 'suppression' && h.objet_type === 'rdv');
await db.query(`select aidant_annuler_action($1,'Sophie',$2)`, [jetonA, hSupp.id]);
await assert.rejects(db.query(`select aidant_annuler_action($1,'Sophie',$2)`, [jetonA, hSupp.id]), /deja_annulee/);
const hNote = etat.historique.find(h => h.objet_type === 'note');
await db.query(`select aidant_annuler_action($1,'Sophie',$2)`, [jetonA, hNote.id]);
const hOcc = etat.historique.find(h => h.objet_type === 'occurrence' && h.action === 'suppression');
await db.query(`select aidant_annuler_action($1,'Sophie',$2)`, [jetonA, hOcc.id]);
etat = (await one(`select aidant_etat($1) e`, [jetonA])).e;
assert.equal(etat.rdvs.length, 2);
assert.equal(etat.rdvs.find(r => r.id === id1).titre, 'Dentiste (contrôle)');
assert.equal(etat.note.titre, '');
assert.equal(etat.exceptions.length, 1);
// Annuler la création du kiné
const hCrea = etat.historique.find(h => h.action === 'creation' && h.objet_id === id2);
await db.query(`select aidant_annuler_action($1,'Sophie',$2)`, [jetonA, hCrea.id]);

// Synchro appareil
const s = (await one(`select appareil_synchroniser($1,'0.1.0') s`, [jetonT])).s;
assert.equal(s.appareil, 'Tablette salon');
assert.ok(Array.isArray(s.rdvs));
etat = (await one(`select aidant_etat($1) e`, [jetonA])).e;
assert.ok(etat.appareils[0].derniere_synchro);

// Export / effacement
const ex = (await one(`select aidant_exporter($1) x`, [jetonA])).x;
assert.equal(ex.rdvs.length, 2);
await assert.rejects(db.query(`select aidant_tout_effacer($1,'S','oui')`, [jetonA]), /confirmation_requise/);
await db.query(`select aidant_tout_effacer($1,'S','EFFACER')`, [jetonA]);
etat = (await one(`select aidant_etat($1) e`, [jetonA])).e;
assert.equal(etat.rdvs.length, 0);

// Renouvellement : l'ancien lien cesse de fonctionner
await db.exec(`reset role`);
const jetonB = (await one(`select admin_renouveler_acces_aidant('nouveau') j`)).j;
await db.exec(`set role anon`);
await assert.rejects(db.query(`select aidant_etat($1)`, [jetonA]), /acces_refuse/);
await db.query(`select aidant_etat($1)`, [jetonB]);
await db.exec(`reset role`);
await db.query(`select admin_revoquer_appareil('Tablette salon')`);
await db.exec(`set role anon`);
await assert.rejects(db.query(`select appareil_synchroniser($1,'1')`, [jetonT]), /acces_refuse/);
console.log('SQL OK');
