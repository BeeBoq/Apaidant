// Lecture tolérante d'un jeton d'accès (64 caractères hexadécimaux).
// Accepte le lien complet ou le jeton seul, avec espaces, guillemets, retours à la ligne
// ou encodage d'URL, placé après « # » ou dans « ?cle= ».

export function extraireJeton(texte) {
  if (!texte) return null;
  let t = String(texte);
  try { t = decodeURIComponent(t); } catch { /* texte déjà décodé */ }
  const m = t.replace(/\s+/g, '').match(/[0-9a-f]{64}/i);
  return m ? m[0].toLowerCase() : null;
}

// Jeton présent dans l'adresse de la page ; le retire ensuite de la barre d'adresse.
export function jetonDepuisAdresse(chemin) {
  const jeton = extraireJeton(`${window.location.hash} ${window.location.search}`);
  if (window.location.hash || window.location.search) window.history.replaceState(null, '', chemin);
  return jeton;
}
