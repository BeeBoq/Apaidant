// Dates « murales » au format AAAA-MM-JJ et heures au format HH:MM, sans fuseau :
// l'appareil est réglé sur Europe/Paris et c'est son horloge qui fait foi.

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const deux = (n) => String(n).padStart(2, '0');

export function versJour(date) {
  return `${date.getFullYear()}-${deux(date.getMonth() + 1)}-${deux(date.getDate())}`;
}

export function versHeure(date) {
  return `${deux(date.getHours())}:${deux(date.getMinutes())}`;
}

export function decomposer(jour) {
  const [a, m, j] = jour.split('-').map(Number);
  return { a, m, j };
}

// Nombre de jours depuis l'origine, insensible aux changements d'heure.
export function numeroJour(jour) {
  const { a, m, j } = decomposer(jour);
  return Math.round(Date.UTC(a, m - 1, j) / 86400000);
}

export function ajouterJours(jour, n) {
  const { a, m, j } = decomposer(jour);
  const d = new Date(Date.UTC(a, m - 1, j + n));
  return `${d.getUTCFullYear()}-${deux(d.getUTCMonth() + 1)}-${deux(d.getUTCDate())}`;
}

export function joursDansMois(a, m) {
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

export function jourSemaine(jour) {
  const { a, m, j } = decomposer(jour);
  return new Date(Date.UTC(a, m - 1, j)).getUTCDay();
}

// « 14:30:00 » ou « 14:30 » → minutes depuis minuit
export function minutes(heure) {
  if (!heure) return null;
  const [h, mn] = heure.split(':').map(Number);
  return h * 60 + mn;
}

export function heureCourte(heure) {
  return heure ? heure.slice(0, 5) : '';
}

// « 14 h 30 », « 9 h » pour les rendez-vous
export function heureLisible(heure) {
  if (!heure) return '';
  const [h, mn] = heure.split(':').map(Number);
  return mn === 0 ? `${h} h` : `${h} h ${deux(mn)}`;
}

// « 14 h 30 » pour l'horloge (format 24 h, minutes toujours affichées)
export function horlogeLisible(date) {
  return `${date.getHours()} h ${deux(date.getMinutes())}`;
}

export function nomJour(jour) {
  return JOURS[jourSemaine(jour)];
}

export function dateLongue(jour) {
  const { a, m, j } = decomposer(jour);
  return `${j === 1 ? '1er' : j} ${MOIS[m - 1]} ${a}`;
}

export function dateCourte(jour) {
  const { m, j } = decomposer(jour);
  return `${nomJour(jour)} ${j === 1 ? '1er' : j} ${MOIS[m - 1]}`;
}

export function majuscule(t) {
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

export function momentDeLaJournee(date) {
  const h = date.getHours();
  if (h >= 5 && h < 12) return 'le matin';
  if (h >= 12 && h < 18) return "l'après-midi";
  if (h >= 18 && h < 22) return 'le soir';
  return 'la nuit';
}
