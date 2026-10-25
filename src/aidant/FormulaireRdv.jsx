// Formulaire d'ajout / modification d'un rendez-vous (F8, F9).
//   mode = 'nouveau'     : nouveau rendez-vous, unique ou en série
//   mode = 'serie'       : modifier un rendez-vous unique ou toute une série
//   mode = 'occurrence'  : modifier une seule occurrence d'une série
import { useState } from 'react';
import { ajouterJours, minutes, dateCourte } from '../lib/dates.js';

export const REPETITIONS = {
  aucune: 'Une seule fois',
  hebdo: 'Chaque semaine',
  bihebdo: 'Toutes les 2 semaines',
  mensuel: 'Chaque mois',
};

const court = (v) => (v ? String(v).slice(0, 10) : '');
const hm = (v) => (v ? String(v).slice(0, 5) : '');

export default function FormulaireRdv({ mode, initial, aujourdhui, onValider, onAnnuler }) {
  const [v, setV] = useState(() => ({
    titre: initial?.titre || '',
    date: court(initial?.date) || aujourdhui,
    heure_debut: hm(initial?.heure_debut),
    heure_fin: hm(initial?.heure_fin),
    lieu: initial?.lieu || '',
    detail: initial?.detail || '',
    repetition: initial?.repetition || 'aucune',
    fin_serie: court(initial?.fin_serie),
  }));
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const maj = (champ) => (e) => setV((p) => ({ ...p, [champ]: e.target.value }));
  const enSerie = v.repetition !== 'aucune';

  const valider = async (e) => {
    e.preventDefault();
    if (!v.titre.trim()) return setErreur('Indiquez un titre.');
    if (!v.date) return setErreur('Indiquez la date.');
    if (!v.heure_debut) return setErreur("Indiquez l'heure de début.");
    if (v.heure_fin && minutes(v.heure_fin) <= minutes(v.heure_debut)) {
      return setErreur("L'heure de fin doit être après l'heure de début.");
    }
    if (mode !== 'occurrence' && enSerie) {
      if (!v.fin_serie) return setErreur('Choisissez la date de fin de la série.');
      if (v.fin_serie < v.date) return setErreur('La fin de la série doit être après la première date.');
    }
    setErreur('');
    setEnvoi(true);
    try {
      await onValider({
        ...v,
        titre: v.titre.trim(),
        fin_serie: enSerie ? v.fin_serie : null,
      });
    } finally {
      setEnvoi(false);
    }
  };

  const titreForm = mode === 'nouveau' ? 'Nouveau rendez-vous'
    : mode === 'occurrence' ? `Modifier le ${dateCourte(court(initial.date_occurrence))} seulement`
      : initial?.repetition && initial.repetition !== 'aucune' ? 'Modifier toute la série' : 'Modifier le rendez-vous';

  return (
    <form className="formulaire" onSubmit={valider} noValidate>
      <h2>{titreForm}</h2>

      <label>Titre
        <input value={v.titre} onChange={maj('titre')} maxLength={120} placeholder="Ex. : Dentiste" autoFocus={mode === 'nouveau'} />
      </label>

      <div className="ligne">
        <label>{mode !== 'occurrence' && enSerie ? 'Première date' : 'Date'}
          <input type="date" value={v.date} onChange={maj('date')} />
        </label>
      </div>
      <div className="ligne">
        <label>Début
          <input type="time" value={v.heure_debut} onChange={maj('heure_debut')} />
        </label>
        <label>Fin <span className="facultatif">(facultatif)</span>
          <input type="time" value={v.heure_fin} onChange={maj('heure_fin')} />
        </label>
      </div>

      <label>Lieu <span className="facultatif">(facultatif)</span>
        <input value={v.lieu} onChange={maj('lieu')} maxLength={200} placeholder="Ex. : Cabinet du Dr Martin" />
      </label>

      <label>Détail <span className="facultatif">(facultatif, non affiché sur la page Maman)</span>
        <textarea value={v.detail} onChange={maj('detail')} maxLength={1000} rows={2} />
      </label>

      {mode !== 'occurrence' && (
        <div className="ligne">
          <label>Répétition
            <select value={v.repetition} onChange={(e) => {
              const repetition = e.target.value;
              setV((p) => ({
                ...p,
                repetition,
                fin_serie: repetition !== 'aucune' && !p.fin_serie ? ajouterJours(p.date || aujourdhui, 182) : p.fin_serie,
              }));
            }}>
              {Object.entries(REPETITIONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          {enSerie && (
            <label>Jusqu'au
              <input type="date" value={v.fin_serie} min={v.date} onChange={maj('fin_serie')} />
            </label>
          )}
        </div>
      )}
      {mode !== 'occurrence' && v.repetition === 'mensuel' && (
        <p className="aide">Même numéro de jour chaque mois (le 31 tombe le dernier jour des mois plus courts).</p>
      )}

      {erreur && <p className="alerte" role="alert">{erreur}</p>}

      <div className="actions">
        <button type="button" className="bouton" onClick={onAnnuler} disabled={envoi}>Annuler</button>
        <button type="submit" className="bouton bouton--principal" disabled={envoi}>
          {envoi ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  );
}
