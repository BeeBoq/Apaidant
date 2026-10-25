// Dépliage des rendez-vous (uniques ou en série) en occurrences pour un jour donné.
// Fonctionne entièrement hors ligne, à partir de la copie locale.
import { decomposer, joursDansMois, minutes, numeroJour, ajouterJours } from './dates.js';

const court = (d) => (d ? String(d).slice(0, 10) : null);

// Le rendez-vous « rdv » a-t-il une occurrence prévue (avant exceptions) le jour « jour » ?
export function seProduitLe(rdv, jour) {
  const debut = court(rdv.date_debut);
  const fin = court(rdv.fin_serie);
  if (jour < debut) return false;
  switch (rdv.repetition || 'aucune') {
    case 'aucune':
      return jour === debut;
    case 'hebdo':
    case 'bihebdo': {
      if (fin && jour > fin) return false;
      const pas = rdv.repetition === 'hebdo' ? 7 : 14;
      return (numeroJour(jour) - numeroJour(debut)) % pas === 0;
    }
    case 'mensuel': {
      if (fin && jour > fin) return false;
      // Même numéro de jour chaque mois ; s'il n'existe pas (31 → avril),
      // le rendez-vous a lieu le dernier jour du mois.
      const d = decomposer(debut);
      const c = decomposer(jour);
      return c.j === Math.min(d.j, joursDansMois(c.a, c.m));
    }
    default:
      return false;
  }
}

function indexerExceptions(exceptions) {
  const parCle = new Map();
  for (const e of exceptions || []) parCle.set(`${e.rdv_id}|${court(e.date_occurrence)}`, e);
  return parCle;
}

// Une occurrence modifiée est enregistrée complète (titre, heures, lieu, détail) :
// ses valeurs remplacent celles de la série, champs vides compris.
function construire(rdv, dateOccurrence, jour, e) {
  const src = e && !e.annulee && e.heure_debut ? e : rdv;
  return {
    cle: `${rdv.id}|${dateOccurrence}`,
    rdv_id: rdv.id,
    date_occurrence: dateOccurrence,
    jour,
    serie: (rdv.repetition || 'aucune') !== 'aucune',
    exception: src === e,
    titre: src.titre || rdv.titre,
    heure_debut: src.heure_debut.slice(0, 5),
    heure_fin: src.heure_fin ? src.heure_fin.slice(0, 5) : null,
    lieu: src.lieu || null,
    detail: src.detail || null,
  };
}

// Toutes les occurrences du jour, triées par heure.
export function occurrencesDuJour(rdvs, exceptions, jour) {
  const exc = indexerExceptions(exceptions);
  const resultat = [];

  for (const rdv of rdvs || []) {
    if (rdv.supprime) continue;
    if (seProduitLe(rdv, jour)) {
      const e = exc.get(`${rdv.id}|${jour}`);
      const deplacee = e?.date_nouvelle && court(e.date_nouvelle) !== jour;
      if (!e?.annulee && !deplacee) resultat.push(construire(rdv, jour, jour, e));
    }
  }

  // Occurrences déplacées vers ce jour depuis un autre jour de la série
  const parId = new Map((rdvs || []).map((r) => [r.id, r]));
  for (const e of exceptions || []) {
    if (e.annulee || !e.date_nouvelle) continue;
    const origine = court(e.date_occurrence);
    if (court(e.date_nouvelle) !== jour || origine === jour) continue;
    const rdv = parId.get(e.rdv_id);
    if (rdv && !rdv.supprime && seProduitLe(rdv, origine)) {
      resultat.push(construire(rdv, origine, jour, e));
    }
  }

  return resultat.sort((a, b) => minutes(a.heure_debut) - minutes(b.heure_debut)
    || a.titre.localeCompare(b.titre, 'fr'));
}

// Occurrences sur une plage de jours (pour l'espace aidant)
export function occurrencesEntre(rdvs, exceptions, premierJour, nbJours) {
  const jours = [];
  for (let i = 0; i < nbJours; i++) {
    const jour = ajouterJours(premierJour, i);
    const occ = occurrencesDuJour(rdvs, exceptions, jour);
    if (occ.length) jours.push({ jour, occurrences: occ });
  }
  return jours;
}

// État de chaque occurrence par rapport à l'heure actuelle (F3).
// Un rendez-vous sans heure de fin est considéré passé 1 heure après son début.
export function etatsSelonHeure(occurrences, heureActuelle) {
  const maintenant = minutes(heureActuelle);
  let prochainTrouve = false;
  return occurrences.map((o) => {
    const fin = o.heure_fin ? minutes(o.heure_fin) : minutes(o.heure_debut) + 60;
    const passe = maintenant >= fin;
    let etat = passe ? 'passe' : 'a-venir';
    if (!passe && !prochainTrouve) {
      prochainTrouve = true;
      etat = maintenant >= minutes(o.heure_debut) ? 'en-cours' : 'prochain';
    }
    return { ...o, etat };
  });
}
