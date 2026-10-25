// Page Maman : construite uniquement depuis la copie locale et l'horloge de l'appareil.
// Le réseau sert seulement à rafraîchir la copie locale, en silence (F6).
import { useEffect, useRef, useState } from 'react';
import AffichageMaman from './AffichageMaman.jsx';
import { lire, ecrire, demanderStockagePersistant } from '../lib/stockage.js';
import { synchroniserAppareil } from '../lib/api.js';
import { appliquerSiLaNuit } from '../lib/miseAJour.js';
import { INTERVALLE_SYNCHRO_MS } from '../config.js';

export default function PageMaman() {
  const [maintenant, setMaintenant] = useState(() => new Date());
  const [donnees, setDonnees] = useState(null);
  const [jeton, setJeton] = useState(undefined); // undefined = pas encore lu
  const synchroEnCours = useRef(false);

  // 1. Lecture de la copie locale au démarrage
  useEffect(() => {
    (async () => {
      const [j, d] = await Promise.all([lire('jeton-appareil'), lire('donnees')]);
      if (d) setDonnees(d);
      setJeton(j || null);
    })();
    demanderStockagePersistant();
  }, []);

  // 2. Horloge : recalcul à chaque changement de minute (et donc à minuit)
  useEffect(() => {
    let minuterie;
    const tic = () => {
      const d = new Date();
      setMaintenant(d);
      appliquerSiLaNuit(d);
      minuterie = setTimeout(tic, 60000 - (d.getSeconds() * 1000 + d.getMilliseconds()) + 50);
    };
    tic();
    // Les navigateurs peuvent ralentir les minuteries : on se recale au retour au premier plan.
    const auRetour = () => { if (document.visibilityState === 'visible') { clearTimeout(minuterie); tic(); } };
    document.addEventListener('visibilitychange', auRetour);
    return () => { clearTimeout(minuterie); document.removeEventListener('visibilitychange', auRetour); };
  }, []);

  // 3. Synchronisation silencieuse
  useEffect(() => {
    if (!jeton) return undefined;
    const synchroniser = async () => {
      if (synchroEnCours.current) return;
      synchroEnCours.current = true;
      try {
        const r = await synchroniserAppareil(jeton);
        const d = { note: r.note, rdvs: r.rdvs, exceptions: r.exceptions, recu_le: new Date().toISOString() };
        await ecrire('donnees', d);
        setDonnees(d);
      } catch (err) {
        if (err.code === 'acces_refuse') {
          // Appareil révoqué : on efface les données sensibles, sans message.
          const vide = { note: null, rdvs: [], exceptions: [], recu_le: null };
          await ecrire('donnees', vide);
          setDonnees(vide);
        }
        // Toute autre erreur (réseau coupé, serveur) : on garde la copie locale.
      } finally {
        synchroEnCours.current = false;
      }
    };
    synchroniser();
    const intervalle = setInterval(synchroniser, INTERVALLE_SYNCHRO_MS);
    const auRetour = () => { if (document.visibilityState === 'visible') synchroniser(); };
    window.addEventListener('online', synchroniser);
    document.addEventListener('visibilitychange', auRetour);
    return () => {
      clearInterval(intervalle);
      window.removeEventListener('online', synchroniser);
      document.removeEventListener('visibilitychange', auRetour);
    };
  }, [jeton]);

  // 4. Écran toujours allumé, aucun geste n'a d'effet (F5)
  useEffect(() => {
    let verrou = null;
    const demander = async () => {
      try {
        if ('wakeLock' in navigator && document.visibilityState === 'visible') {
          verrou = await navigator.wakeLock.request('screen');
        }
      } catch { /* refusé (batterie faible…) : l'option Android « rester activé » prend le relais */ }
    };
    demander();
    const auRetour = () => { if (document.visibilityState === 'visible') demander(); };
    document.addEventListener('visibilitychange', auRetour);

    const bloquer = (e) => e.preventDefault();
    document.addEventListener('contextmenu', bloquer);
    document.addEventListener('dblclick', bloquer);
    document.addEventListener('gesturestart', bloquer);
    document.documentElement.classList.add('mode-maman');
    const viewport = document.querySelector('meta[name=viewport]');
    const viewportAvant = viewport?.content;
    if (viewport) viewport.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';

    return () => {
      document.removeEventListener('visibilitychange', auRetour);
      document.removeEventListener('contextmenu', bloquer);
      document.removeEventListener('dblclick', bloquer);
      document.removeEventListener('gesturestart', bloquer);
      document.documentElement.classList.remove('mode-maman');
      if (viewport && viewportAvant) viewport.content = viewportAvant;
      verrou?.release().catch(() => {});
    };
  }, []);

  return <AffichageMaman maintenant={maintenant} donnees={donnees} nonRelie={jeton === null} />;
}
