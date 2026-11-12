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

// Variables CSS pour un jour (indice 0 = dimanche, comme Date.getDay()).
export function styleJour(indiceJour) {
  const c = COULEURS_JOURS[indiceJour];
  return { '--jour-vive': c.vive, '--jour-teinte': c.teinte };
}
