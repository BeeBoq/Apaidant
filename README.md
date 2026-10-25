# Apaidant – Page Maman

Une page unique, très lisible, affichée en permanence sur une tablette (et sur le téléphone de la personne) :
**l'heure et la date, les rendez-vous du jour et un mot des aidants**. Les aidants gèrent rendez-vous et note
depuis leur propre téléphone. L'affichage fonctionne sans Internet (copie locale + horloge de l'appareil).

Cahier des charges : `Annot CDC.docx` (version 0.5 du 24 octobre 2026).

## Adresses

| Adresse | Pour qui | Rôle |
|---|---|---|
| `/` | Tablette et téléphone de la personne | Page Maman (lecture seule, aucune interaction) |
| `/appairer#JETON` | Administrateur | Relie un appareil de la personne |
| `/aidant#JETON` | Aidants | Rendez-vous, note, aperçu, appareils, historique |

Le jeton est placé après `#` : il n'est jamais envoyé au serveur d'hébergement ni enregistré dans ses journaux,
et il est retiré de la barre d'adresse dès l'ouverture.

## Architecture

- **Interface** : React + Vite, application web progressive (PWA, `vite-plugin-pwa`), hébergée sur Netlify.
- **Données** : Supabase (PostgreSQL, région UE). La clé publique (« publishable ») ne donne accès à **aucune table** :
  tout passe par des fonctions SQL qui vérifient un jeton secret (`supabase/migrations/001_schema.sql`).
  - `aidant_*` : lien aidant (lecture + écriture), avec historique et annulation.
  - `appareil_synchroniser` : jeton d'appairage (lecture seule) ; enregistre la dernière synchronisation (alerte 48 h).
  - `admin_*` : création / renouvellement des liens, uniquement depuis l'éditeur SQL de Supabase.
- **Hors ligne** : service worker (fichiers de l'application) + IndexedDB (données). Synchronisation toutes les
  10 minutes, au retour du réseau et au retour au premier plan. Les rendez-vous récurrents sont stockés comme règles et
  dépliés sur l'appareil, donc l'appareil tient des semaines sans réseau.
- **Heures** : stockées en heure locale « murale » (Europe/Paris) ; l'appareil doit rester en heure automatique.
- **Mises à jour** : la page Maman n'applique une nouvelle version qu'entre 3 h et 5 h ; l'espace aidant tout de suite.

Arborescence utile :

```
src/maman/AffichageMaman.jsx   affichage (utilisé aussi par l'aperçu aidant)
src/maman/PageMaman.jsx        horloge, synchronisation, écran allumé
src/aidant/EspaceAidant.jsx    espace aidant (onglets)
src/aidant/FormulaireRdv.jsx   formulaire de rendez-vous
src/lib/recurrence.js          dépliage des séries + exceptions (testé)
src/lib/api.js                 appels aux fonctions Supabase
src/config.js                  URL, clé publique, délais
supabase/migrations/           schéma SQL
```

## Mise en service (une seule fois)

### 1. Base de données (Supabase)
1. Supabase → **SQL Editor** → *New query* → coller tout `supabase/migrations/001_schema.sql` → **Run**.
2. Créer le lien aidant (noter le résultat, il n'est stocké nulle part en clair) :
   ```sql
   select admin_creer_acces_aidant('famille');
   ```
3. Créer un jeton par appareil :
   ```sql
   select admin_creer_appareil('Tablette salon');
   select admin_creer_appareil('Téléphone de Maman');
   ```

### 2. Hébergement (Netlify)
1. Netlify → *Add new site* → *Import from GitHub* → dépôt `BeeBoq/Apaidant`.
   La configuration est lue dans `netlify.toml` (commande `npm run build`, dossier `dist`).
2. Facultatif : *Site configuration → Environment variables* → `VITE_SUPABASE_URL` et `VITE_SUPABASE_KEY`
   (sinon les valeurs de `src/config.js` sont utilisées).
3. Chaque `git push` sur `main` redéploie le site automatiquement.

### 3. Liens à distribuer
Avec `https://VOTRE-SITE.netlify.app` :
- Aidants : `https://VOTRE-SITE.netlify.app/aidant#LIEN_AIDANT` — à transmettre individuellement, jamais dans un groupe ouvert.
- Chaque appareil : `https://VOTRE-SITE.netlify.app/appairer#JETON_APPAREIL` — à ouvrir **sur l'appareil lui-même**.

### 4. Tablette
1. Ouvrir le lien `/appairer#…` dans Chrome → « Cet appareil est relié ».
2. Menu Chrome ⋮ → **Installer l'application** / **Ajouter à l'écran d'accueil**, puis lancer « Maman ».
3. Android : heure automatique activée ; *Options pour les développeurs → Rester activé* (pendant la charge) ;
   désactiver l'optimisation de batterie pour Chrome ; si besoin, épinglage d'écran.
4. Vérifier dans l'espace aidant, onglet **Appareils**, que la dernière mise à jour est récente.

## Gestion courante (administrateur)

```sql
-- Lien aidant compromis ou départ d'un aidant : l'ancien lien cesse de fonctionner
select admin_renouveler_acces_aidant('famille v2');
-- Appareil perdu ou remplacé (ses données sont effacées à sa prochaine connexion)
select admin_revoquer_appareil('Téléphone de Maman');
```

Sauvegarde : onglet **Réglages → Exporter les données** (JSON), en plus des sauvegardes Supabase.

## Développement

```bash
npm install
cp .env.example .env.local   # facultatif
npm run dev                  # http://localhost:5173
npm test                     # tests de la logique de récurrence
npm run test:sql             # tests du schéma SQL (PostgreSQL embarqué PGlite)
```

`tests/e2e.mjs` est un banc d'essai complet dans un navigateur : ajout de rendez-vous, série, exception, note,
annulation, appairage, coupure réseau de nuit, bascule de minuit, rechargement hors ligne, synchronisation,
révocation. Voir l'en-tête du fichier pour le lancer.

## Limites connues (v1)

- Une occurrence modifiée seule garde ses valeurs si la série est modifiée ensuite.
- Pas de notification en temps réel : une modification apparaît en 10 minutes au plus sur un appareil connecté.
- Le redémarrage automatique de la page après un redémarrage de la tablette dépend du modèle (à vérifier en recette).
