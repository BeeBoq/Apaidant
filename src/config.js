// Paramètres du service géré (Supabase).
// La clé « publishable » est publique : elle ne donne accès qu'aux fonctions
// qui vérifient un jeton secret (lien aidant ou jeton d'appairage).
export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || 'https://birdzxiqzdtxompxebnq.supabase.co').replace(/\/$/, '');
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_PHxdhgxQSPBxpJRCEu122w_KKeBe7DT';

export const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

// Fréquence de récupération des données sur les appareils de la personne aidée.
// 10 min garantit le critère « moins de 15 minutes » avec de la marge.
export const INTERVALLE_SYNCHRO_MS = 10 * 60 * 1000;

// Au-delà de ce délai sans synchronisation, les aidants sont alertés (F13).
export const ALERTE_APPAREIL_HEURES = 48;

// Plage horaire où la page Maman peut appliquer une mise à jour de l'application.
export const FENETRE_MISE_A_JOUR = { debut: 3, fin: 5 };
