// Espace aidant (F7 à F14).
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as api from '../lib/api.js';
import { occurrencesEntre } from '../lib/recurrence.js';
import { versJour, versHeure, ajouterJours, dateCourte, heureLisible, majuscule } from '../lib/dates.js';
import { ALERTE_APPAREIL_HEURES, VERSION } from '../config.js';
import FormulaireRdv, { REPETITIONS } from './FormulaireRdv.jsx';
import AffichageMaman from '../maman/AffichageMaman.jsx';
import './aidant.css';

const CLE_JETON = 'apaidant:jeton-aidant';
const CLE_NOM = 'apaidant:nom';
const lireLocal = (c) => { try { return localStorage.getItem(c); } catch { return null; } };
const ecrireLocal = (c, v) => { try { localStorage.setItem(c, v); } catch { /* ignoré */ } };

function jetonInitial() {
  const depuisLien = window.location.hash.slice(1);
  if (depuisLien.length >= 32) {
    ecrireLocal(CLE_JETON, depuisLien);
    window.history.replaceState(null, '', '/aidant');
    return depuisLien;
  }
  return lireLocal(CLE_JETON);
}

const ONGLETS = [
  ['rdv', 'Rendez-vous'],
  ['note', 'Note'],
  ['apercu', 'Aperçu'],
  ['appareils', 'Appareils'],
  ['historique', 'Historique'],
  ['reglages', 'Réglages'],
];

export default function EspaceAidant() {
  const [jeton] = useState(jetonInitial);
  const [nom, setNom] = useState(() => lireLocal(CLE_NOM) || '');
  const [etat, setEtat] = useState(null);
  const [erreurAcces, setErreurAcces] = useState('');
  const [onglet, setOnglet] = useState('rdv');
  const [message, setMessage] = useState(null);

  const informer = useCallback((texte, type = 'succes') => {
    setMessage({ texte, type, id: Date.now() });
  }, []);
  useEffect(() => {
    if (!message) return undefined;
    const t = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(t);
  }, [message]);

  const recharger = useCallback(async () => {
    if (!jeton) return;
    try {
      setEtat(await api.etatAidant(jeton));
      setErreurAcces('');
    } catch (err) {
      if (err.code === 'acces_refuse') setErreurAcces(api.messageErreur(err));
      else informer(api.messageErreur(err), 'alerte');
    }
  }, [jeton, informer]);

  useEffect(() => {
    recharger();
    const auRetour = () => { if (document.visibilityState === 'visible') recharger(); };
    document.addEventListener('visibilitychange', auRetour);
    return () => document.removeEventListener('visibilitychange', auRetour);
  }, [recharger]);

  // Exécute une modification puis recharge l'état.
  const agir = useCallback(async (fn, succes) => {
    try {
      await fn();
      informer(succes);
      await recharger();
      return true;
    } catch (err) {
      informer(api.messageErreur(err), 'alerte');
      if (err.code === 'rdv_introuvable') await recharger();
      return false;
    }
  }, [informer, recharger]);

  if (!jeton) {
    return (
      <main className="aidant aidant--etroit">
        <h1>Espace aidant</h1>
        <p>Pour accéder à cet espace, ouvrez le lien d'accès que l'administrateur vous a transmis.</p>
      </main>
    );
  }
  if (erreurAcces) {
    return (
      <main className="aidant aidant--etroit">
        <h1>Espace aidant</h1>
        <p className="alerte">{erreurAcces}</p>
      </main>
    );
  }
  if (!nom) return <SaisieNom onValider={(n) => { ecrireLocal(CLE_NOM, n); setNom(n); }} />;

  const appareilsEnAlerte = (etat?.appareils || []).filter(enAlerte);

  return (
    <main className="aidant">
      <header className="entete">
        <h1>Page Maman <span className="entete__sous">· espace aidant</span></h1>
        <p className="entete__nom">Connecté : <strong>{nom}</strong></p>
      </header>

      {appareilsEnAlerte.length > 0 && (
        <button type="button" className="bandeau-alerte" onClick={() => setOnglet('appareils')}>
          {appareilsEnAlerte.map((a) => a.nom).join(', ')} : pas de nouvelles depuis plus de {ALERTE_APPAREIL_HEURES} h.
          Vérifiez que l'appareil est allumé et connecté au wifi.
        </button>
      )}

      <nav className="onglets" aria-label="Sections">
        {ONGLETS.map(([cle, libelle]) => (
          <button key={cle} type="button" className={onglet === cle ? 'actif' : ''}
            aria-current={onglet === cle ? 'page' : undefined} onClick={() => setOnglet(cle)}>
            {libelle}
          </button>
        ))}
      </nav>

      {!etat ? <p>Chargement…</p> : (
        <>
          {onglet === 'rdv' && <OngletRdv etat={etat} jeton={jeton} nom={nom} agir={agir} />}
          {onglet === 'note' && <OngletNote etat={etat} jeton={jeton} nom={nom} agir={agir} />}
          {onglet === 'apercu' && <OngletApercu etat={etat} />}
          {onglet === 'appareils' && <OngletAppareils etat={etat} />}
          {onglet === 'historique' && <OngletHistorique etat={etat} jeton={jeton} nom={nom} agir={agir} />}
          {onglet === 'reglages' && (
            <OngletReglages jeton={jeton} nom={nom} agir={agir} informer={informer}
              changerNom={(n) => { ecrireLocal(CLE_NOM, n); setNom(n); informer('Nom enregistré.'); }} />
          )}
        </>
      )}

      {message && <div key={message.id} className={`message message--${message.type}`} role="status">{message.texte}</div>}
    </main>
  );
}

function enAlerte(appareil) {
  if (!appareil.derniere_synchro) return true;
  return Date.now() - new Date(appareil.derniere_synchro).getTime() > ALERTE_APPAREIL_HEURES * 3600 * 1000;
}

function SaisieNom({ onValider, initial = '', libelleBouton = 'Continuer' }) {
  const [n, setN] = useState(initial);
  return (
    <main className="aidant aidant--etroit">
      <h1>Bienvenue</h1>
      <form className="formulaire" onSubmit={(e) => { e.preventDefault(); if (n.trim()) onValider(n.trim().slice(0, 60)); }}>
        <label>Votre prénom
          <input value={n} onChange={(e) => setN(e.target.value)} maxLength={60} autoFocus placeholder="Ex. : Sophie" />
        </label>
        <p className="aide">Il sera enregistré avec chacune de vos modifications, pour que les autres aidants sachent qui a fait quoi.</p>
        <div className="actions"><button className="bouton bouton--principal" disabled={!n.trim()}>{libelleBouton}</button></div>
      </form>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Rendez-vous
// ---------------------------------------------------------------------------

function libelleJour(jour, aujourdhui) {
  if (jour === aujourdhui) return `Aujourd'hui – ${dateCourte(jour)}`;
  if (jour === ajouterJours(aujourdhui, 1)) return `Demain – ${dateCourte(jour)}`;
  return majuscule(dateCourte(jour));
}

function OngletRdv({ etat, jeton, nom, agir }) {
  const aujourdhui = versJour(new Date());
  const [horizon, setHorizon] = useState(60);
  const [edition, setEdition] = useState(null);   // { mode, initial }
  const [choix, setChoix] = useState(null);       // occurrence sélectionnée
  const [confirmation, setConfirmation] = useState(null);

  const rdvParId = useMemo(() => new Map(etat.rdvs.map((r) => [r.id, r])), [etat.rdvs]);
  const jours = useMemo(
    () => occurrencesEntre(etat.rdvs, etat.exceptions, aujourdhui, horizon),
    [etat.rdvs, etat.exceptions, aujourdhui, horizon],
  );

  const fermer = () => { setEdition(null); setChoix(null); setConfirmation(null); };

  if (edition) {
    return (
      <FormulaireRdv mode={edition.mode} initial={edition.initial} aujourdhui={aujourdhui} onAnnuler={fermer}
        onValider={async (v) => {
          let ok;
          if (edition.mode === 'occurrence') {
            ok = await agir(() => api.exceptionOccurrence(jeton, nom, edition.initial.rdv_id, edition.initial.date_occurrence, {
              date: v.date, titre: v.titre, heure_debut: v.heure_debut, heure_fin: v.heure_fin || null, lieu: v.lieu, detail: v.detail,
            }), 'Rendez-vous modifié pour ce jour-là.');
          } else {
            ok = await agir(() => api.enregistrerRdv(jeton, nom, {
              id: edition.initial?.id || null, titre: v.titre, date_debut: v.date, heure_debut: v.heure_debut,
              heure_fin: v.heure_fin || null, lieu: v.lieu, detail: v.detail, repetition: v.repetition, fin_serie: v.fin_serie,
            }), edition.mode === 'nouveau' ? 'Rendez-vous ajouté.' : 'Rendez-vous modifié.');
          }
          if (ok) fermer();
        }} />
    );
  }

  const serie = choix ? rdvParId.get(choix.rdv_id) : null;

  return (
    <section>
      <div className="barre">
        <button type="button" className="bouton bouton--principal"
          onClick={() => setEdition({ mode: 'nouveau', initial: null })}>+ Ajouter un rendez-vous</button>
      </div>

      {jours.length === 0 && <p className="vide">Aucun rendez-vous dans les {horizon} prochains jours.</p>}

      {jours.map(({ jour, occurrences }) => (
        <div key={jour} className="jour">
          <h3>{libelleJour(jour, aujourdhui)}</h3>
          <ul className="occurrences">
            {occurrences.map((o) => (
              <li key={o.cle}>
                <button type="button" className="occurrence" onClick={() => setChoix(o)}>
                  <span className="occurrence__heure">
                    {heureLisible(o.heure_debut)}{o.heure_fin ? ` – ${heureLisible(o.heure_fin)}` : ''}
                  </span>
                  <span className="occurrence__corps">
                    <span className="occurrence__titre">{o.titre}</span>
                    {o.lieu && <span className="occurrence__lieu">{o.lieu}</span>}
                    {(o.serie || o.exception) && (
                      <span className="occurrence__badges">
                        {o.serie && <span className="badge">{REPETITIONS[rdvParId.get(o.rdv_id)?.repetition]}</span>}
                        {o.exception && <span className="badge badge--modif">modifié ce jour-là</span>}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {horizon < 365 && (
        <div className="barre">
          <button type="button" className="bouton" onClick={() => setHorizon((h) => Math.min(365, h + 90))}>Voir plus loin</button>
        </div>
      )}

      {choix && !confirmation && serie && (
        <Fenetre titre={`${choix.titre} – ${dateCourte(choix.jour)} à ${heureLisible(choix.heure_debut)}`} onFermer={fermer}>
          {choix.detail && <p className="detail">{choix.detail}</p>}
          <p className="aide">
            Ajouté par {serie.cree_par}{serie.modifie_par !== serie.cree_par ? `, modifié par ${serie.modifie_par}` : ''}.
            {choix.serie && ` ${REPETITIONS[serie.repetition]} jusqu'au ${dateCourte(String(serie.fin_serie).slice(0, 10))}.`}
          </p>
          <div className="actions actions--colonne">
            {choix.serie ? (
              <>
                <button type="button" className="bouton" onClick={() => setEdition({ mode: 'occurrence', initial: { ...choix, date: choix.jour } })}>
                  Modifier ce jour-là seulement</button>
                <button type="button" className="bouton" onClick={() => setEdition({ mode: 'serie', initial: { ...serie, date: serie.date_debut } })}>
                  Modifier toute la série</button>
                <button type="button" className="bouton bouton--danger" onClick={() => setConfirmation('occurrence')}>
                  Supprimer ce jour-là seulement</button>
                <button type="button" className="bouton bouton--danger" onClick={() => setConfirmation('serie')}>
                  Supprimer toute la série</button>
              </>
            ) : (
              <>
                <button type="button" className="bouton" onClick={() => setEdition({ mode: 'serie', initial: { ...serie, date: serie.date_debut } })}>
                  Modifier</button>
                <button type="button" className="bouton bouton--danger" onClick={() => setConfirmation('serie')}>Supprimer</button>
              </>
            )}
            <button type="button" className="bouton bouton--discret" onClick={fermer}>Fermer</button>
          </div>
        </Fenetre>
      )}

      {confirmation && (
        <Fenetre titre="Confirmer la suppression" onFermer={fermer}>
          <p>
            {confirmation === 'occurrence'
              ? `Supprimer « ${choix.titre} » du ${dateCourte(choix.jour)} seulement ? Les autres dates de la série sont conservées.`
              : choix.serie
                ? `Supprimer toute la série « ${choix.titre} » (${REPETITIONS[serie.repetition].toLowerCase()}) ?`
                : `Supprimer « ${choix.titre} » du ${dateCourte(choix.jour)} ?`}
          </p>
          <p className="aide">Une suppression peut être annulée depuis l'onglet Historique.</p>
          <div className="actions">
            <button type="button" className="bouton" onClick={() => setConfirmation(null)}>Retour</button>
            <button type="button" className="bouton bouton--danger" onClick={async () => {
              const ok = confirmation === 'occurrence'
                ? await agir(() => api.exceptionOccurrence(jeton, nom, choix.rdv_id, choix.date_occurrence, null), 'Rendez-vous supprimé pour ce jour-là.')
                : await agir(() => api.supprimerRdv(jeton, nom, choix.rdv_id), 'Rendez-vous supprimé.');
              if (ok) fermer();
            }}>Oui, supprimer</button>
          </div>
        </Fenetre>
      )}
    </section>
  );
}

function Fenetre({ titre, onFermer, children }) {
  useEffect(() => {
    const echap = (e) => { if (e.key === 'Escape') onFermer(); };
    document.addEventListener('keydown', echap);
    return () => document.removeEventListener('keydown', echap);
  }, [onFermer]);
  return (
    <div className="voile" onClick={onFermer}>
      <div className="fenetre" role="dialog" aria-modal="true" aria-label={titre} onClick={(e) => e.stopPropagation()}>
        <h2>{titre}</h2>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Note (F11)
// ---------------------------------------------------------------------------

function OngletNote({ etat, jeton, nom, agir }) {
  const [titre, setTitre] = useState(etat.note?.titre || '');
  const [texte, setTexte] = useState(etat.note?.texte || '');
  const [envoi, setEnvoi] = useState(false);
  const modifie = titre !== (etat.note?.titre || '') || texte !== (etat.note?.texte || '');

  return (
    <section>
      <form className="formulaire" onSubmit={async (e) => {
        e.preventDefault();
        setEnvoi(true);
        await agir(() => api.enregistrerNote(jeton, nom, titre, texte), 'Note enregistrée.');
        setEnvoi(false);
      }}>
        <h2>Note affichée sur la page Maman</h2>
        <label>Titre
          <input value={titre} onChange={(e) => setTitre(e.target.value)} maxLength={80} placeholder="Ex. : Bonjour Maman" />
        </label>
        <label>Message <span className="facultatif">({texte.length}/600)</span>
          <textarea value={texte} onChange={(e) => setTexte(e.target.value)} maxLength={600} rows={5}
            placeholder="Ex. : Sophie passe te voir à midi. Bisous." />
        </label>
        <p className="aide">Phrases courtes et simples. Un seul message à la fois : il reste affiché jusqu'à la prochaine modification.</p>
        {etat.note?.modifie_par && etat.note.modifie_par !== 'système' && (
          <p className="aide">Dernière modification par {etat.note.modifie_par}, {quand(etat.note.modifie_le)}.</p>
        )}
        <div className="actions">
          <button type="button" className="bouton" disabled={!modifie || envoi}
            onClick={() => { setTitre(etat.note?.titre || ''); setTexte(etat.note?.texte || ''); }}>Annuler</button>
          <button className="bouton bouton--principal" disabled={!modifie || envoi}>{envoi ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </form>
      <h3 className="sous-titre">Aperçu</h3>
      <div className="apercu apercu--paysage">
        <AffichageMaman apercu maintenant={new Date()} donnees={{ ...etat, note: { titre, texte } }} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Aperçu (F12)
// ---------------------------------------------------------------------------

function OngletApercu({ etat }) {
  const maintenant = new Date();
  const [jour, setJour] = useState(versJour(maintenant));
  const [heure, setHeure] = useState(versHeure(maintenant));
  const [format, setFormat] = useState('paysage');
  const [a, m, j] = jour.split('-').map(Number);
  const [h, mn] = (heure || '00:00').split(':').map(Number);
  const simule = new Date(a, m - 1, j, h, mn);

  return (
    <section>
      <div className="ligne ligne--outils">
        <label>Jour <input type="date" value={jour} onChange={(e) => e.target.value && setJour(e.target.value)} /></label>
        <label>Heure <input type="time" value={heure} onChange={(e) => e.target.value && setHeure(e.target.value)} /></label>
        <label>Écran
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="paysage">Tablette</option>
            <option value="portrait">Téléphone</option>
          </select>
        </label>
      </div>
      <div className={`apercu apercu--${format}`}>
        <AffichageMaman apercu maintenant={simule} donnees={etat} />
      </div>
      <p className="aide">C'est exactement ce que verra la personne. Les tablettes et téléphones se mettent à jour en moins de 15 minutes lorsqu'ils sont connectés.</p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Appareils (F13)
// ---------------------------------------------------------------------------

function quand(iso) {
  if (!iso) return 'jamais';
  const d = new Date(iso);
  const ecart = (Date.now() - d.getTime()) / 60000;
  if (ecart < 1) return "à l'instant";
  if (ecart < 60) return `il y a ${Math.round(ecart)} min`;
  if (ecart < 24 * 60) return `il y a ${Math.round(ecart / 60)} h`;
  return `le ${dateCourte(versJour(d))} à ${heureLisible(versHeure(d))}`;
}

function OngletAppareils({ etat }) {
  return (
    <section>
      <h2>Appareils de la personne</h2>
      {etat.appareils.length === 0 && <p className="vide">Aucun appareil relié pour l'instant.</p>}
      <ul className="liste-simple">
        {etat.appareils.map((a) => (
          <li key={a.id} className={enAlerte(a) ? 'en-alerte' : ''}>
            <strong>{a.nom}</strong>
            <span>Dernière mise à jour : {quand(a.derniere_synchro)}</span>
            {enAlerte(a) && <span className="alerte">Pas de nouvelles depuis plus de {ALERTE_APPAREIL_HEURES} h : vérifiez qu'il est allumé, branché et connecté au wifi.</span>}
          </li>
        ))}
      </ul>
      <p className="aide">Un appareil connecté se met à jour toutes les 10 minutes environ. La nuit, sans wifi, c'est normal qu'il ne se mette pas à jour : il continue d'afficher l'heure et les rendez-vous enregistrés.</p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Historique (F14)
// ---------------------------------------------------------------------------

function OngletHistorique({ etat, jeton, nom, agir }) {
  const [aAnnuler, setAAnnuler] = useState(null);
  return (
    <section>
      <h2>Historique des modifications</h2>
      {etat.historique.length === 0 && <p className="vide">Aucune modification pour l'instant.</p>}
      <ul className="liste-simple">
        {etat.historique.map((h) => (
          <li key={h.id} className={h.annule ? 'annule' : ''}>
            <span className="historique__quand">{quand(h.quand)} · {h.auteur}</span>
            <span>{h.resume}</span>
            {h.annule && <span className="aide">Action annulée</span>}
            {!h.annule && h.action !== 'annulation' && h.objet_id && (
              <button type="button" className="bouton bouton--petit" onClick={() => setAAnnuler(h)}>Annuler cette action</button>
            )}
          </li>
        ))}
      </ul>
      {aAnnuler && (
        <Fenetre titre="Annuler cette action ?" onFermer={() => setAAnnuler(null)}>
          <p>{aAnnuler.resume}</p>
          <p className="aide">L'élément revient à l'état d'avant cette action. Si quelqu'un l'a modifié depuis, ces modifications plus récentes seront aussi remplacées.</p>
          <div className="actions">
            <button type="button" className="bouton" onClick={() => setAAnnuler(null)}>Retour</button>
            <button type="button" className="bouton bouton--principal" onClick={async () => {
              if (await agir(() => api.annulerAction(jeton, nom, aAnnuler.id), 'Action annulée.')) setAAnnuler(null);
            }}>Oui, annuler</button>
          </div>
        </Fenetre>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Réglages : nom, export, effacement
// ---------------------------------------------------------------------------

function OngletReglages({ jeton, nom, agir, informer, changerNom }) {
  const [nouveauNom, setNouveauNom] = useState(nom);
  const [effacer, setEffacer] = useState(false);
  const [mot, setMot] = useState('');

  const exporter = async () => {
    try {
      const donnees = await api.exporter(jeton);
      const blob = new Blob([JSON.stringify(donnees, null, 2)], { type: 'application/json' });
      const lien = document.createElement('a');
      lien.href = URL.createObjectURL(blob);
      lien.download = `page-maman-export-${versJour(new Date())}.json`;
      lien.click();
      URL.revokeObjectURL(lien.href);
      informer('Export téléchargé.');
    } catch (err) {
      informer(api.messageErreur(err), 'alerte');
    }
  };

  return (
    <section className="reglages">
      <form className="formulaire" onSubmit={(e) => { e.preventDefault(); if (nouveauNom.trim()) changerNom(nouveauNom.trim().slice(0, 60)); }}>
        <h2>Votre prénom</h2>
        <label>Prénom affiché dans l'historique
          <input value={nouveauNom} onChange={(e) => setNouveauNom(e.target.value)} maxLength={60} />
        </label>
        <div className="actions"><button className="bouton" disabled={!nouveauNom.trim() || nouveauNom.trim() === nom}>Enregistrer</button></div>
      </form>

      <div className="formulaire">
        <h2>Données</h2>
        <p>Télécharger une copie complète (rendez-vous, note, historique) au format JSON.</p>
        <div className="actions"><button type="button" className="bouton" onClick={exporter}>Exporter les données</button></div>
        <p>Effacer définitivement tous les rendez-vous, la note et l'historique.</p>
        <div className="actions"><button type="button" className="bouton bouton--danger" onClick={() => setEffacer(true)}>Tout effacer…</button></div>
      </div>

      <div className="formulaire">
        <h2>Lien d'accès</h2>
        <p className="aide">Ce lien donne accès aux rendez-vous : ne le publiez pas et ne l'envoyez pas dans une conversation de groupe ouverte. En cas de doute, demandez à l'administrateur de le renouveler.</p>
        <p className="aide">Version {VERSION}</p>
      </div>

      {effacer && (
        <Fenetre titre="Tout effacer ?" onFermer={() => { setEffacer(false); setMot(''); }}>
          <p>Cette action est <strong>définitive</strong> et ne peut pas être annulée. Pensez à exporter les données avant.</p>
          <label>Tapez <strong>EFFACER</strong> pour confirmer
            <input value={mot} onChange={(e) => setMot(e.target.value)} autoComplete="off" />
          </label>
          <div className="actions">
            <button type="button" className="bouton" onClick={() => { setEffacer(false); setMot(''); }}>Retour</button>
            <button type="button" className="bouton bouton--danger" disabled={mot !== 'EFFACER'} onClick={async () => {
              if (await agir(() => api.toutEffacer(jeton, nom, mot), 'Toutes les données ont été effacées.')) { setEffacer(false); setMot(''); }
            }}>Effacer définitivement</button>
          </div>
        </Fenetre>
      )}
    </section>
  );
}
