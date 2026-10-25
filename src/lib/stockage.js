// Petit stockage clé/valeur dans IndexedDB (copie locale des données).
// En cas d'indisponibilité, repli silencieux sur localStorage.

const BASE = 'page-maman';
const MAGASIN = 'donnees';
let ouverture;

function ouvrir() {
  if (!ouverture) {
    ouverture = new Promise((resolve, reject) => {
      const req = indexedDB.open(BASE, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(MAGASIN);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return ouverture;
}

export async function lire(cle) {
  try {
    const db = await ouvrir();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(MAGASIN).objectStore(MAGASIN).get(cle);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    try { return JSON.parse(localStorage.getItem(`${BASE}:${cle}`)); } catch { return null; }
  }
}

export async function ecrire(cle, valeur) {
  try { localStorage.setItem(`${BASE}:${cle}`, JSON.stringify(valeur)); } catch { /* plein ou bloqué */ }
  try {
    const db = await ouvrir();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(MAGASIN, 'readwrite');
      tx.objectStore(MAGASIN).put(valeur, cle);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* le repli localStorage suffit */ }
}

// Demande au navigateur de ne jamais effacer ces données pour faire de la place.
export async function demanderStockagePersistant() {
  try { if (navigator.storage?.persist) await navigator.storage.persist(); } catch { /* sans effet */ }
}
