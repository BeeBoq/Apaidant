// Une couleur fixe par jour de la semaine (le lundi est toujours jaune, etc.).
//
// Choix fondés sur la littérature :
//  - Maladie d'Alzheimer : déficit sélectif sur l'axe bleu-jaune (tritan) —
//    Cronin-Golomb et al., Neurobiol Aging 1993 ; erreurs surtout dans les bleus et
//    les verts, meilleure discrimination des jaunes, des rouges et des différences de
//    clarté — Wijk et al., Int J Geriatr Psychiatry 1999.
//  - Vieillissement du cristallin : bleus, verts et violets plus difficiles à distinguer ;
//    couleurs chaudes plus faciles à repérer — guide DSDC, Université de Stirling.
//  - La couleur n'est jamais seule : le nom du jour est toujours écrit.
//  - Pas de rouge vif (réservé aux alertes, à éviter selon le cahier des charges).
//
// Palette vérifiée par simulation (déficit tritan à 50 % et 80 %, colorspacious) :
// écart minimal entre deux jours ΔE(CAM02-UCS) ≥ 13, nettement distinguable.
// Le texte reste toujours foncé sur fond clair (teinte) pour un contraste maximal.

export const COULEURS_JOURS = [
  { jour: 'dimanche', vive: '#7A5230', teinte: '#DFD3C7' }, // brun
  { jour: 'lundi',    vive: '#F5C400', teinte: '#FAEDBC' }, // jaune
  { jour: 'mardi',    vive: '#F08A24', teinte: '#F9E0C4' }, // orange
  { jour: 'mercredi', vive: '#5DB548', teinte: '#D8E9CC' }, // vert
  { jour: 'jeudi',    vive: '#E8649E', teinte: '#F7D7DF' }, // rose
  { jour: 'vendredi', vive: '#4A86E0', teinte: '#D4DFED' }, // bleu
  { jour: 'samedi',   vive: '#9B6BD0', teinte: '#E6D9EA' }, // violet
];

const FOND = '#FBF8F1';

// Mélange deux couleurs hexadécimales (part = proportion de la couleur a).
function melanger(a, b, part) {
  const ca = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const cb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${ca.map((v, i) => Math.round(v * part + cb[i] * (1 - part)).toString(16).padStart(2, '0')).join('')}`;
}

// Intensité de la couleur selon l'éloignement (0 = aujourd'hui, 1 = demain… 6) :
// plus le jour est loin, plus sa couleur s'estompe. Le texte, lui, reste toujours noir.
const INTENSITE_BANDE = [1, 0.92, 0.8, 0.68, 0.56, 0.46, 0.38];
const INTENSITE_FOND  = [0.22, 0.3, 0.25, 0.2, 0.16, 0.12, 0.09];

// Variables CSS pour un jour (indice 0 = dimanche, comme Date.getDay()).
export function styleJour(indiceJour, eloignement = 0) {
  const c = COULEURS_JOURS[indiceJour];
  const e = Math.max(0, Math.min(6, eloignement));
  return {
    '--jour-vive': e === 0 ? c.vive : melanger(c.vive, FOND, INTENSITE_BANDE[e]),
    '--jour-teinte': e === 0 ? c.teinte : melanger(c.vive, FOND, INTENSITE_FOND[e]),
  };
}
