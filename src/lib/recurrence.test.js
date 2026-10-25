import { describe, it, expect } from 'vitest';
import { occurrencesDuJour, etatsSelonHeure, seProduitLe } from './recurrence.js';
import { ajouterJours, heureLisible, dateLongue, nomJour } from './dates.js';

const kine = { id: 'k', titre: 'Kiné', date_debut: '2026-10-20', heure_debut: '10:00:00', heure_fin: '10:45:00',
  lieu: 'Cabinet', repetition: 'hebdo', fin_serie: '2026-12-31' };
const dentiste = { id: 'd', titre: 'Dentiste', date_debut: '2026-10-27', heure_debut: '14:30:00', repetition: 'aucune' };
const coiffeur = { id: 'c', titre: 'Coiffeur', date_debut: '2026-01-31', heure_debut: '09:00:00', repetition: 'mensuel', fin_serie: '2026-12-31' };
const aide = { id: 'a', titre: 'Aide ménagère', date_debut: '2026-10-21', heure_debut: '08:30:00', repetition: 'bihebdo', fin_serie: '2027-06-30' };

describe('séries', () => {
  it('hebdomadaire, y compris après le changement d’heure (25/10/2026)', () => {
    expect(seProduitLe(kine, '2026-10-20')).toBe(true);
    expect(seProduitLe(kine, '2026-10-27')).toBe(true); // après le passage à l'heure d'hiver
    expect(seProduitLe(kine, '2026-03-31')).toBe(false); // avant le début
    expect(seProduitLe(kine, '2026-10-21')).toBe(false);
    expect(seProduitLe(kine, '2027-01-05')).toBe(false); // après la fin de série
    expect(occurrencesDuJour([kine], [], '2026-10-27')[0].heure_debut).toBe('10:00');
  });
  it('toutes les 2 semaines', () => {
    expect(seProduitLe(aide, '2026-10-21')).toBe(true);
    expect(seProduitLe(aide, '2026-10-28')).toBe(false);
    expect(seProduitLe(aide, '2026-11-04')).toBe(true);
    expect(seProduitLe(aide, '2027-03-31')).toBe(false);
    expect(seProduitLe(aide, '2027-03-24')).toBe(true); // traverse le changement d'heure de mars
  });
  it('mensuelle, avec repli sur le dernier jour du mois', () => {
    expect(seProduitLe(coiffeur, '2026-02-28')).toBe(true);
    expect(seProduitLe(coiffeur, '2026-04-30')).toBe(true);
    expect(seProduitLe(coiffeur, '2026-05-31')).toBe(true);
    expect(seProduitLe(coiffeur, '2026-05-30')).toBe(false);
  });
  it('sur 52 semaines, une occurrence par semaine exactement', () => {
    const serie = { ...kine, fin_serie: null };
    let n = 0;
    for (let i = 0; i < 364; i++) if (seProduitLe(serie, ajouterJours('2026-10-20', i))) n++;
    expect(n).toBe(52);
  });
});

describe('exceptions', () => {
  it('occurrence annulée', () => {
    const e = [{ rdv_id: 'k', date_occurrence: '2026-10-27', annulee: true }];
    expect(occurrencesDuJour([kine], e, '2026-10-27')).toHaveLength(0);
    expect(occurrencesDuJour([kine], e, '2026-11-03')).toHaveLength(1);
  });
  it('occurrence modifiée', () => {
    const e = [{ rdv_id: 'k', date_occurrence: '2026-10-27', annulee: false, titre: 'Kiné (remplaçant)', heure_debut: '11:00:00', heure_fin: null, lieu: null }];
    const [o] = occurrencesDuJour([kine], e, '2026-10-27');
    expect(o).toMatchObject({ titre: 'Kiné (remplaçant)', heure_debut: '11:00', heure_fin: null, lieu: null, exception: true });
  });
  it('occurrence déplacée à un autre jour', () => {
    const e = [{ rdv_id: 'k', date_occurrence: '2026-10-27', annulee: false, date_nouvelle: '2026-10-28', titre: 'Kiné', heure_debut: '15:00:00' }];
    expect(occurrencesDuJour([kine], e, '2026-10-27')).toHaveLength(0);
    const [o] = occurrencesDuJour([kine], e, '2026-10-28');
    expect(o).toMatchObject({ heure_debut: '15:00', date_occurrence: '2026-10-27', jour: '2026-10-28' });
  });
  it('rendez-vous supprimé ignoré, tri par heure', () => {
    const occ = occurrencesDuJour([dentiste, kine, { ...dentiste, id: 'x', supprime: true }], [], '2026-10-27');
    expect(occ.map((o) => o.titre)).toEqual(['Kiné', 'Dentiste']);
  });
});

describe('état selon l’heure', () => {
  const occ = occurrencesDuJour([dentiste, kine], [], '2026-10-27');
  it('avant tout', () => {
    expect(etatsSelonHeure(occ, '08:00').map((o) => o.etat)).toEqual(['prochain', 'a-venir']);
  });
  it('pendant le premier', () => {
    expect(etatsSelonHeure(occ, '10:15').map((o) => o.etat)).toEqual(['en-cours', 'a-venir']);
  });
  it('entre les deux', () => {
    expect(etatsSelonHeure(occ, '12:00').map((o) => o.etat)).toEqual(['passe', 'prochain']);
  });
  it('sans heure de fin : passé 1 h après le début', () => {
    expect(etatsSelonHeure(occ, '15:29').map((o) => o.etat)).toEqual(['passe', 'en-cours']);
    expect(etatsSelonHeure(occ, '15:30').map((o) => o.etat)).toEqual(['passe', 'passe']);
  });
});

describe('formats', () => {
  it('français', () => {
    expect(heureLisible('14:30:00')).toBe('14 h 30');
    expect(heureLisible('09:00')).toBe('9 h');
    expect(dateLongue('2026-11-01')).toBe('1er novembre 2026');
    expect(nomJour('2026-10-25')).toBe('dimanche');
  });
});
