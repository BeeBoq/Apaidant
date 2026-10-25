// Appels aux fonctions de la base (Supabase, API REST « rpc »).
import { SUPABASE_URL, SUPABASE_KEY, VERSION } from '../config.js';

export class ErreurApi extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

const MESSAGES = {
  acces_refuse: "Ce lien d'accès n'est plus valable. Demandez le nouveau lien à l'administrateur.",
  nom_requis: 'Indiquez votre prénom.',
  rdv_introuvable: "Ce rendez-vous n'existe plus (il a peut-être été supprimé par un autre aidant).",
  deja_annulee: 'Cette action a déjà été annulée.',
  confirmation_requise: 'Tapez EFFACER pour confirmer.',
  reseau: 'Pas de connexion Internet. Réessayez dans un moment.',
};

export function messageErreur(err) {
  return MESSAGES[err?.code] || "Une erreur s'est produite. Réessayez.";
}

async function rpc(fonction, params, { delaiMs = 15000 } = {}) {
  const ctrl = new AbortController();
  const minuterie = setTimeout(() => ctrl.abort(), delaiMs);
  let reponse;
  try {
    reponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fonction}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: ctrl.signal,
      cache: 'no-store',
    });
  } catch {
    throw new ErreurApi('reseau');
  } finally {
    clearTimeout(minuterie);
  }
  const texte = await reponse.text();
  const corps = texte ? JSON.parse(texte) : null;
  if (!reponse.ok) {
    const brut = corps?.message || '';
    const code = Object.keys(MESSAGES).find((c) => brut.includes(c)) || 'serveur';
    throw new ErreurApi(code, brut);
  }
  return corps;
}

// --- Appareils de la personne aidée ---
export const synchroniserAppareil = (jeton) =>
  rpc('appareil_synchroniser', { p_jeton: jeton, p_version: VERSION });

// --- Espace aidant ---
export const etatAidant = (jeton) => rpc('aidant_etat', { p_jeton: jeton });

export const enregistrerRdv = (jeton, auteur, rdv) =>
  rpc('aidant_enregistrer_rdv', { p_jeton: jeton, p_auteur: auteur, p_rdv: rdv });

export const supprimerRdv = (jeton, auteur, id) =>
  rpc('aidant_supprimer_rdv', { p_jeton: jeton, p_auteur: auteur, p_id: id });

// modif = null pour supprimer cette seule occurrence
export const exceptionOccurrence = (jeton, auteur, rdvId, date, modif) =>
  rpc('aidant_exception_occurrence', { p_jeton: jeton, p_auteur: auteur, p_rdv_id: rdvId, p_date: date, p_modif: modif });

export const enregistrerNote = (jeton, auteur, titre, texte) =>
  rpc('aidant_enregistrer_note', { p_jeton: jeton, p_auteur: auteur, p_titre: titre, p_texte: texte });

export const annulerAction = (jeton, auteur, historiqueId) =>
  rpc('aidant_annuler_action', { p_jeton: jeton, p_auteur: auteur, p_historique_id: historiqueId });

export const exporter = (jeton) => rpc('aidant_exporter', { p_jeton: jeton }, { delaiMs: 30000 });

export const toutEffacer = (jeton, auteur, confirmation) =>
  rpc('aidant_tout_effacer', { p_jeton: jeton, p_auteur: auteur, p_confirmation: confirmation });
