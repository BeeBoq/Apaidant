// Affichage pur de la page Maman, à partir d'une heure et de données.
// Utilisé par la page elle-même et par l'aperçu de l'espace aidant (F12).
import { useLayoutEffect, useRef, useState } from 'react';
import { occurrencesDuJour, etatsSelonHeure } from '../lib/recurrence.js';
import { versJour, versHeure, nomJour, dateLongue, horlogeLisible, heureLisible,
  momentDeLaJournee, majuscule } from '../lib/dates.js';
import './maman.css';

// Pas de défilement possible : si le contenu ne tient pas, on réduit par paliers.
//   1 : on ne garde que le dernier rendez-vous passé
//   2 : on retire tous les rendez-vous passés
//   3 : rendez-vous en taille réduite
//   4 : note en taille réduite
const NIVEAU_MAX = 4;

function deborde(el) {
  return el && el.scrollHeight > el.clientHeight + 1;
}

export default function AffichageMaman({ maintenant, donnees, apercu = false, nonRelie = false }) {
  const jour = versJour(maintenant);
  const tous = etatsSelonHeure(
    occurrencesDuJour(donnees?.rdvs, donnees?.exceptions, jour),
    versHeure(maintenant),
  );
  const note = donnees?.note;
  const aUneNote = Boolean(note?.titre?.trim() || note?.texte?.trim());

  const racine = useRef(null);
  const [taille, setTaille] = useState('');
  const signature = `${taille}|${tous.map((r) => r.cle + r.etat).join(',')}|${note?.titre}|${note?.texte}`;
  const [reduction, setReduction] = useState({ signature, niveau: 0 });
  const niveau = reduction.signature === signature ? reduction.niveau : 0;

  let rdvs = tous;
  const passes = tous.filter((r) => r.etat === 'passe');
  if (niveau >= 1 && passes.length > 1) rdvs = tous.filter((r) => r.etat !== 'passe' || r === passes[passes.length - 1]);
  if (niveau >= 2) rdvs = tous.filter((r) => r.etat !== 'passe');
  const densite = niveau >= 3 || rdvs.length >= 5 ? 'dense' : rdvs.length >= 4 ? 'moyen' : '';

  // Mesure après affichage : si quelque chose déborde, palier suivant.
  useLayoutEffect(() => {
    const el = racine.current;
    if (!el || niveau >= NIVEAU_MAX) return;
    if (deborde(el.querySelector('.maman__droite')) || deborde(el.querySelector('.maman__note'))) {
      setReduction({ signature, niveau: niveau + 1 });
    }
  });

  // Une rotation ou un changement de taille d'écran relance le calcul.
  useLayoutEffect(() => {
    const el = racine.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const obs = new ResizeObserver(([e]) => {
      setTaille(`${Math.round(e.contentRect.width)}x${Math.round(e.contentRect.height)}`);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={racine} className={`maman${apercu ? ' maman--apercu' : ''}${niveau >= 4 ? ' maman--note-reduite' : ''}`} aria-live="off">
      <div className="maman__cadre">
        <section className="maman__temps">
          <p className="maman__jour">{majuscule(nomJour(jour))}</p>
          <p className="maman__date">{dateLongue(jour)}</p>
          <p className="maman__heure">{horlogeLisible(maintenant)}</p>
          <p className="maman__moment">C'est {momentDeLaJournee(maintenant)}</p>
        </section>

        <section className="maman__droite">
          <div className={`maman__rdvs ${densite}`}>
            <h2 className="maman__titre-section">Aujourd'hui</h2>
            {rdvs.length === 0 ? (
              <p className="maman__aucun">Pas de rendez-vous aujourd'hui</p>
            ) : (
              <ul className="maman__liste">
                {rdvs.map((r) => (
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

          {aUneNote && (
            <div className="maman__note">
              {note.titre?.trim() && <p className="note__titre">{note.titre}</p>}
              {note.texte?.trim() && <p className="note__texte">{note.texte}</p>}
            </div>
          )}
        </section>
      </div>
      {nonRelie && <p className="maman__non-relie">Appareil à relier</p>}
    </div>
  );
}
