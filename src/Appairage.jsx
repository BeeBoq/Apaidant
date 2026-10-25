// Appairage d'un appareil de la personne aidée (F15), fait par l'administrateur.
import { useEffect, useState } from 'react';
import { ecrire, demanderStockagePersistant } from './lib/stockage.js';
import { synchroniserAppareil, messageErreur } from './lib/api.js';
import { jetonDepuisAdresse } from './lib/jeton.js';
import { SaisieLien } from './aidant/EspaceAidant.jsx';
import './aidant/aidant.css';

export default function Appairage() {
  const [etat, setEtat] = useState({ statut: 'en-cours' });

  const relier = async (jeton) => {
    setEtat({ statut: 'en-cours' });
    if (!jeton) { setEtat({ statut: 'erreur', message: "Lien incomplet : le code après « # » est absent ou tronqué." }); return; }
    try {
      const r = await synchroniserAppareil(jeton);
      await ecrire('jeton-appareil', jeton);
      await ecrire('donnees', { note: r.note, rdvs: r.rdvs, exceptions: r.exceptions, recu_le: new Date().toISOString() });
      await demanderStockagePersistant();
      setEtat({ statut: 'ok', nom: r.appareil });
    } catch (err) {
      setEtat({ statut: 'erreur', message: messageErreur(err) });
    }
  };

  useEffect(() => {
    relier(jetonDepuisAdresse('/appairer'));
    // Lien collé dans la barre d'adresse alors que la page est déjà ouverte
    const surChangement = () => { const j = jetonDepuisAdresse('/appairer'); if (j) relier(j); };
    window.addEventListener('hashchange', surChangement);
    return () => window.removeEventListener('hashchange', surChangement);
  }, []);

  return (
    <main className="aidant aidant--etroit">
      <h1>Relier cet appareil</h1>
      {etat.statut === 'en-cours' && <p>Vérification du lien…</p>}
      {etat.statut === 'erreur' && (
        <>
          <p className="alerte">{etat.message}</p>
          <SaisieLien onValider={relier} libelle="Collez ici le lien d'appairage de cet appareil (ou le code seul)" />
        </>
      )}
      {etat.statut === 'ok' && (
        <>
          <p className="succes">Cet appareil est relié : <strong>{etat.nom}</strong>.</p>
          <ol className="etapes">
            <li>Dans le menu de Chrome (⋮), choisissez <strong>Ajouter à l'écran d'accueil</strong> ou <strong>Installer l'application</strong>.</li>
            <li>Ouvrez « Maman » depuis l'écran d'accueil : la page s'affiche en plein écran.</li>
            <li>Sur la tablette, activez dans Android l'option <em>Rester activé pendant la charge</em> (options pour les développeurs) et, si besoin, l'épinglage d'écran.</li>
          </ol>
          <a className="bouton bouton--principal" href="/">Afficher la page Maman</a>
        </>
      )}
    </main>
  );
}
