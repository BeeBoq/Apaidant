// Affichage pur de la page Maman (version 2 : semaine glissante).
// Utilisé par la page elle-même et par l'aperçu de l'espace aidant (F12).
import { useLayoutEffect, useRef, useState } from 'react';
import { occurrencesDuJour, etatsSelonHeure } from '../lib/recurrence.js';
import { versJour, versHeure, nomJour, dateLongue, horlogeLisible, heureLisible,
  momentDeLaJournee, majuscule, ajouterJours, jourSemaine, decomposer } from '../lib/dates.js';
import { styleJour } from '../lib/couleurs.js';
import './maman.css';

export const NB_JOURS = 7; // aujourd'hui + les 6 jours suivants

// Pas de défilement possible : si le contenu ne tient pas, on réduit par paliers.
const PALIERS = [
  'complet',
  'un-seul-passe',     // aujourd'hui : on ne garde que le dernier rendez-vous passé
  'aucun-passe',       // aujourd'hui : on retire les rendez-vous passés
  'semaine-dense',     // jours suivants : taille légèrement réduite
  'aujourdhui-dense',  // aujourd'hui : rendez-vous en taille réduite
  'semaine-resumee',   // jours suivants : 1 rendez-vous affiché + « et 2 autres »
  'note-reduite',      // note en taille réduite
];

function deborde(el) {
  return Boolean(el) && el.scrollHeight > el.clientHeight + 1;
}

export default function AffichageMaman({ maintenant, donnees, apercu = false, nonRelie = false }) {
  const jour = versJour(maintenant);
  const aujourdhui = etatsSelonHeure(
    occurrencesDuJour(donnees?.rdvs, donnees?.exceptions, jour),
    versHeure(maintenant),
  );
  const suivants = Array.from({ length: NB_JOURS - 1 }, (_, i) => {
    const j = ajouterJours(jour, i + 1);
    return { jour: j, rdvs: occurrencesDuJour(donnees?.rdvs, donnees?.exceptions, j) };
  });
  const note = donnees?.note;
  const aUneNote = Boolean(note?.titre?.trim() || note?.texte?.trim());

  // --- Ajustement automatique à l'écran ---
  const racine = useRef(null);
  const [taille, setTaille] = useState('');
  const signature = [taille, jour, aujourdhui.map((r) => r.cle + r.etat).join(','),
    suivants.map((s) => s.rdvs.map((r) => r.cle).join(',')).join('|'), note?.titre, note?.texte].join('#');
  const [reduction, setReduction] = useState({ signature, niveau: 0 });
  const niveau = reduction.signature === signature ? reduction.niveau : 0;
  const palier = (nom) => niveau >= PALIERS.indexOf(nom);

  let rdvsJour = aujourdhui;
  const passes = aujourdhui.filter((r) => r.etat === 'passe');
  if (palier('un-seul-passe') && passes.length > 1) {
    rdvsJour = aujourdhui.filter((r) => r.etat !== 'passe' || r === passes[passes.length - 1]);
  }
  if (palier('aucun-passe')) rdvsJour = aujourdhui.filter((r) => r.etat !== 'passe');
  const maxParJour = palier('semaine-resumee') ? 1 : 2;

  useLayoutEffect(() => {
    const el = racine.current;
    if (!el || niveau >= PALIERS.length - 1) return;
    const zones = ['.maman__agenda', '.maman__gauche', '.maman__note', '.aujourdhui', '.semaine'];
    if (zones.some((z) => deborde(el.querySelector(z)))) setReduction({ signature, niveau: niveau + 1 });
  });

  useLayoutEffect(() => {
    const el = racine.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const obs = new ResizeObserver(([e]) => {
      setTaille(`${Math.round(e.contentRect.width)}x${Math.round(e.contentRect.height)}`);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const classes = ['maman', apercu && 'maman--apercu',
    palier('aujourdhui-dense') && 'maman--jour-dense',
    palier('semaine-dense') && 'maman--semaine-dense',
    palier('note-reduite') && 'maman--note-reduite'].filter(Boolean).join(' ');

  return (
    <div ref={racine} className={classes} aria-live="off">
      <div className="maman__cadre">
        {/* Colonne de gauche : heure, date, note */}
        <section className="maman__gauche">
          <div className="maman__temps">
            <p className="maman__jour">{majuscule(nomJour(jour))}</p>
            <p className="maman__date">{dateLongue(jour)}</p>
            <p className="maman__heure">{horlogeLisible(maintenant)}</p>
            <p className="maman__moment">C'est {momentDeLaJournee(maintenant)}</p>
          </div>
          {aUneNote && (
            <div className="maman__note">
              {note.titre?.trim() && <p className="note__titre">{note.titre}</p>}
              {note.texte?.trim() && <p className="note__texte">{note.texte}</p>}
            </div>
          )}
        </section>

        {/* Colonne de droite : aujourd'hui en grand, puis les 6 jours suivants */}
        <section className="maman__agenda">
          <div className="aujourdhui" style={styleJour(jourSemaine(jour))}>
            <h2 className="aujourdhui__titre">
              <span className="pastille">Aujourd'hui</span>
              <span>{nomJour(jour)} {decomposer(jour).j === 1 ? '1er' : decomposer(jour).j}</span>
            </h2>
            {rdvsJour.length === 0 ? (
              <p className="maman__aucun">Pas de rendez-vous aujourd'hui</p>
            ) : (
              <ul className="maman__liste">
                {rdvsJour.map((r) => (
                  <li key={r.cle} className={`rdv rdv--${r.etat}`}>
                    {(r.etat === 'prochain' || r.etat === 'en-cours') && (
                      <span className="rdv__etiquette">
                        {r.etat === 'en-cours' ? 'En ce moment' : 'Prochain rendez-vous'}
                      </span>
                    )}
                    <span className="rdv__heure">{heureLisible(r.heure_debut)}</span>
                    <span className="rdv__texte">
                      <span className="rdv__titre">{r.titre}</span>
                      {r.lieu && <span className="rdv__lieu">{r.lieu}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <ul className="semaine">
            {suivants.map(({ jour: j, rdvs }, i) => {
              const affiches = rdvs.slice(0, maxParJour);
              const reste = rdvs.length - affiches.length;
              return (
                <li key={j} className="semaine__jour" style={styleJour(jourSemaine(j), i + 1)}>
                  <span className="semaine__nom">
                    {j === ajouterJours(jour, 1) ? 'Demain' : majuscule(nomJour(j))}
                    <span className="semaine__num"> {decomposer(j).j === 1 ? '1er' : decomposer(j).j}</span>
                  </span>
                  <span className="semaine__rdvs">
                    {rdvs.length === 0 ? <span className="semaine__rien">Rien de prévu</span> : (
                      <>
                        {affiches.map((r) => (
                          <span key={r.cle} className="semaine__rdv">
                            <strong>{heureLisible(r.heure_debut)}</strong> {r.titre}
                          </span>
                        ))}
                        {reste > 0 && <span className="semaine__reste">et {reste} autre{reste > 1 ? 's' : ''}</span>}
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
      {nonRelie && (
        <div className="maman__non-relie">
          <p>Cet appareil n'est pas relié : il n'affiche ni les rendez-vous ni la note.</p>
          {/* Visible seulement avant l'appairage : une fois relié, la page n'a plus aucun bouton (F5). */}
          {!apercu && <a className="maman__relier" href="/appairer">Relier cet appareil</a>}
        </div>
      )}
    </div>
  );
}
