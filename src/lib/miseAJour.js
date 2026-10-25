// Enregistrement du service worker et application des mises à jour.
//  - Page Maman : la nouvelle version n'est appliquée que la nuit (FENETRE_MISE_A_JOUR),
//    pour ne jamais interrompre l'affichage en journée.
//  - Espace aidant : appliquée immédiatement.
import { registerSW } from 'virtual:pwa-register';
import { FENETRE_MISE_A_JOUR } from '../config.js';

let miseAJourEnAttente = false;
let appliquer = null;

export function demarrerServiceWorker({ immediat }) {
  if (!('serviceWorker' in navigator)) return;
  appliquer = registerSW({
    immediate: true,
    onNeedRefresh() {
      miseAJourEnAttente = true;
      if (immediat) appliquer(true);
    },
    onRegisteredSW(_url, enregistrement) {
      // Vérifie toutes les heures si une nouvelle version est publiée.
      if (enregistrement) setInterval(() => enregistrement.update().catch(() => {}), 60 * 60 * 1000);
    },
  });
}

// Appelée chaque minute par la page Maman.
export function appliquerSiLaNuit(maintenant = new Date()) {
  const h = maintenant.getHours();
  if (miseAJourEnAttente && appliquer && h >= FENETRE_MISE_A_JOUR.debut && h < FENETRE_MISE_A_JOUR.fin) {
    miseAJourEnAttente = false;
    appliquer(true);
  }
}
