import { createRoot } from 'react-dom/client';
import './global.css';
import PageMaman from './maman/PageMaman.jsx';
import Appairage from './Appairage.jsx';
import EspaceAidant from './aidant/EspaceAidant.jsx';
import { demarrerServiceWorker } from './lib/miseAJour.js';

// Adresses :
//   /                 → page Maman (tablette et téléphone de la personne)
//   /appairer#JETON   → relie l'appareil (lien généré par l'administrateur)
//   /aidant#JETON     → espace aidant (lien partagé entre aidants)
// Le jeton est placé après « # » : il n'est jamais envoyé à l'hébergeur ni journalisé.
const chemin = window.location.pathname.replace(/\/+$/, '') || '/';

let page;
if (chemin === '/aidant') page = <EspaceAidant />;
else if (chemin === '/appairer') page = <Appairage />;
else page = <PageMaman />;

demarrerServiceWorker({ immediat: chemin !== '/' });
createRoot(document.getElementById('racine')).render(page);
