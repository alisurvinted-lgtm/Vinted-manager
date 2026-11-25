# Vinted Manager V2

Une application personnelle et gratuite pour suivre ses achats, son stock et ses ventes de vêtements. Interface en français, montants en euros, pensée pour iPhone et utilisable sur ordinateur.

**Sans compte, abonnement, API Vinted, publicité, connexion Gmail ni serveur de données.** Aucune donnée comptable ni phrase secrète n’est envoyée à un service externe par l’application. Les accès aux fichiers statiques restent visibles par l’hébergeur. L’hébergement sert uniquement les fichiers statiques. Aucun article de démonstration n’est inséré.

## Démarrage

Installer **Node.js 22.12 ou plus récent** (Node 24 convient), puis depuis le dossier du projet :

```bash
npm ci
npm run dev
```

Ouvrir l’adresse affichée par Vite. Pour vérifier la version de production :

```bash
npm run build
npm run preview
```

Le dossier `dist/` contient l’application complète à héberger. Le service worker fonctionne dans le build de production, pas dans le serveur de développement.

## Utilisation au quotidien

1. Touchez **Ajouter un article**, indiquez son nom et son coût d’achat TTC. Le genre, la catégorie et la date sont déjà sélectionnés et restent modifiables.
2. Ajoutez, si nécessaire, un ou plusieurs frais de **Boost Vinted** ou de **Nettoyage**.
3. Depuis **Mes articles**, ouvrez un article et choisissez **Marquer comme vendu**. Indiquez le prix et la date de vente.
4. Consultez immédiatement le chiffre d’affaires, le bénéfice, les cotisations et le stock dans **Accueil**. Le sélecteur permet de changer de mois et d’année. Le bilan détaille les ventes, le prix moyen, le coût des articles vendus, les frais de boost/nettoyage et la comparaison avec le mois précédent.

Les articles peuvent être recherchés, filtrés, modifiés, remis en stock ou supprimés avec confirmation. Le retour en stock efface le prix et la date de vente. L’historique de l’accueil montre les cinq dernières opérations réellement enregistrées, y compris une suppression.

**Statistiques** affiche les douze mois de l’année sélectionnée, un graphique consultable au clavier ou au toucher, les ventes, les moyennes et le stock actuel. Un mois sans vente reste à zéro. Le tableau mensuel fournit aussi les valeurs du graphique en texte.

Le graphique de l’accueil permet de sélectionner un mois. Dans l’historique des statistiques, toucher le nom d’un mois ouvre son bilan. Les douze mois sont calculés automatiquement, sans créer d’archives supplémentaires.

**Mes articles → Importer depuis Vinted** explique comment demander une copie officielle des données. Aucun format transactionnel de compte classique français n’est confirmé à ce stade : l’import reste désactivé et aucun fichier n’est lu. Les sauvegardes Vinted Manager se restaurent toujours dans les paramètres. Voir [VINTED_IMPORT.md](./VINTED_IMPORT.md) pour les sources officielles et les limites.

Les paramètres sont accessibles depuis l’icône en haut à droite ou depuis la barre latérale sur ordinateur.

## Calculs

Les montants sont enregistrés **en centimes entiers** et le taux en centièmes de pourcentage (`1230` = `12,30 %`). Les saisies acceptent une virgule ou un point et au plus deux décimales. Les montants négatifs, les valeurs non finies et les ventes antérieures à l’achat sont refusés. Une vente à 0 € reste possible.

```text
Cotisations estimées = arrondi au centime(prix de vente × taux)
Bénéfice estimé = prix de vente − achat TTC − somme des frais − cotisations
```

L’arrondi est effectué **vente par vente**, au centime le plus proche, avec arrondi supérieur à un demi-centime. Les moyennes sont également arrondies au centime.

Exemple : achat de 15 €, vente de 35 €, boost de 2 €, nettoyage de 1 €, taux de 12,3 % → cotisations de **4,31 €**, bénéfice de **12,69 €**.

- Les **achats TTC du mois** suivent la date d’achat, y compris pour les articles encore en stock. Le **coût des articles vendus** suit la date de vente, même si leur achat a eu lieu un autre mois ou une autre année. Ces deux montants ne sont jamais additionnés pour calculer le bénéfice.
- Les frais de boost/nettoyage du bilan sont ceux des articles vendus durant le mois. Le modèle existant ne contient pas de date de paiement des frais : aucune date n’est inventée.
- La comparaison montre les valeurs des deux mois et leur écart. Un pourcentage n’est affiché que pour une référence strictement positive et une valeur courante non négative.
- Le chiffre d’affaires et les bénéfices utilisent la **date de vente**, jamais la date d’achat.
- Les articles en stock n’entrent ni dans le chiffre d’affaires ni dans le bénéfice réalisé.
- Le taux initial est **12,3 %**. Sa modification recalcule **toutes les ventes, passées incluses** ; aucun historique fiscal de taux n’est conservé.
- Le nombre d’articles en stock et l’investissement dans ce stock décrivent le **stock actuel, toutes années confondues**. L’investissement inclut les achats TTC et les frais déjà engagés sur ces articles.
- Le prix de vente moyen et le bénéfice moyen concernent les ventes de l’année sélectionnée.
- Les bénéfices et cotisations sont des **estimations de gestion**, pas une déclaration ni un bénéfice fiscal officiel. Le taux initial n’est pas un conseil sur votre régime fiscal.

## Stockage et sauvegardes

Les données sont conservées dans **IndexedDB avec Dexie**, dans la base `vinted-manager`. Les écritures d’articles et leur historique sont transactionnelles. Le schéma dispose de versions : v1 (articles, paramètres), v2 (ajout de l’historique). La migration v1 → v2 conserve les articles et paramètres existants. **La version 2.0 de l’application ne change pas le schéma IndexedDB v2, le nom de la base ni le format des sauvegardes.** Le bilan est calculé en lecture seule à partir des articles existants.

### Exporter et restaurer

Dans **Paramètres → Sauvegardes & données** :

- **Exporter une sauvegarde chiffrée** produit un fichier `.vmbackup` protégé par une phrase secrète confirmée. Le chiffrement local utilise AES-256-GCM et PBKDF2-HMAC-SHA-256 à 600 000 itérations, avec un sel et un IV neufs à chaque export.
- La phrase n’est jamais enregistrée par l’application. Choisissez au moins 16 caractères et de préférence cinq ou six mots aléatoires. Sans la phrase, il n’existe pas de récupération de l’ancien fichier. Si vos données sont encore dans l’application, vous pouvez créer une nouvelle sauvegarde avec une autre phrase.
- **Importer une sauvegarde** reconnaît le contenu chiffré, demande sa phrase, vérifie son intégrité puis sa structure. Un mauvais secret ou une altération ne modifie aucune donnée. Une confirmation est demandée avant le remplacement transactionnel de la base.
- Les anciens JSON non chiffrés restent compatibles, avec un avertissement. Leur export et l’export CSV sont regroupés sous **Ancien format et CSV non chiffrés**. Ces fichiers sont lisibles sans phrase secrète et ne doivent jamais être envoyés sur GitHub.
- Limites : 20 Mo pour le JSON clair, 30 Mo pour le fichier chiffré, 100 000 articles, 200 000 opérations et 100 frais par article.

Dans Fichiers, choisissez **Sur mon iPhone** si vous voulez éviter la synchronisation iCloud Drive. Le lieu de téléchargement et les sauvegardes système restent contrôlés par iOS et le navigateur. Conservez votre phrase séparément du fichier.

Les protections, leurs paramètres et les risques résiduels sont décrits dans [SECURITE.md](./SECURITE.md). **La base IndexedDB active n’est pas chiffrée par cette application** ; le chiffrement protège les fichiers de sauvegarde. Protégez également l’accès à votre iPhone et à Safari.

### Limites à connaître

Les données **ne sont pas sauvegardées dans le cloud** et ne sont pas synchronisées entre iPhone et ordinateur. Pour les transférer, exportez la sauvegarde chiffrée puis importez-la sur l’autre appareil. Un import remplace toute la base : choisissez une copie de référence pour éviter d’écraser des saisies plus récentes.

Effacer les données du navigateur, utiliser une navigation privée, changer de navigateur, de profil ou d’adresse du site peut rendre la base indisponible. iOS peut aussi libérer du stockage local en cas de manque d’espace. L’application demande la persistance du stockage si le navigateur le permet ; **cela ne garantit pas la conservation des données**. Une sauvegarde chiffrée régulière reste indispensable.

## Déploiement gratuit en HTTPS

Aucun serveur Node, aucune clé API et aucune variable d’environnement à configurer dans le navigateur ne sont nécessaires. La base de compilation est `/` par défaut. Pour un sous-dossier, fournissez `PAGES_BASE_PATH=/nom-du-depot/` lors du build. Le workflow GitHub Pages obtient automatiquement le bon chemin auprès de GitHub, y compris pour un site à la racine.

### Netlify : dépôt manuel du build

1. Exécutez `npm ci`, puis `npm run build`.
2. Connectez-vous à Netlify et choisissez le déploiement manuel d’un dossier.
3. Déposez **le dossier `dist/`**, et non les sources.
4. Ouvrez l’adresse HTTPS fournie. Le domaine gratuit du fournisseur suffit.
5. Pour une mise à jour, reconstruisez puis déposez le nouveau `dist/` sur **le même site**.

Le compte de l’hébergeur sert à publier les fichiers ; l’application elle-même ne demande aucun compte.

### Cloudflare Pages : connexion à GitHub

1. Poussez les sources dans votre dépôt GitHub.
2. Créez un projet Pages connecté à ce dépôt.
3. Commande de build : `npm run build` ; dossier de sortie : `dist` ; version de Node : `22` ou `24`.
4. Déployez sur le domaine HTTPS gratuit fourni.

### GitHub Pages : déploiement automatique

Le guide complet est dans [DEPLOIEMENT_GITHUB_PAGES.md](./DEPLOIEMENT_GITHUB_PAGES.md).

1. Utilisez un dépôt **public** pour bénéficier de GitHub Pages gratuitement sans abonnement.
2. Placez les fichiers sources à la racine de la branche `main`, y compris `.github/workflows/deploy-pages.yml`.
3. Dans **Settings → Pages → Build and deployment → Source**, sélectionnez **GitHub Actions**. Ce réglage est déjà actif dans le dépôt existant. Le workflow consulte Pages avec `enablement: false` ; il ne tente pas de recréer le site.
4. Chaque push sur `main` déclenche les tests, le build avec le bon chemin, la vérification des fichiers statiques, les tests Chromium/WebKit puis le déploiement.
5. **Actions → Déployer sur GitHub Pages → Run workflow** permet également un lancement manuel.
6. L’URL effective apparaît dans le job `deploy` et dans **Settings → Pages**.

Le workflow publie uniquement `dist/`, après vérification du nom du dépôt demandé. Les profils de navigateur, rapports de tests, exports CSV, sauvegardes JSON et archives de livraison sont exclus. `npm run verify:dist` bloque la publication si un fichier non autorisé est présent, par exemple un export comptable copié dans `public/`.

```bash
# Vérifier localement un site de projet GitHub Pages
PAGES_BASE_PATH=/Vinted-manager/ npm run build
PAGES_BASE_PATH=/Vinted-manager/ npm run test:e2e
```

Le manifeste, les icônes, le script d’enregistrement, le scope du service worker et le repli hors ligne sont vérifiés sous ce chemin. Gardez la même adresse après installation ; un changement d’origine requiert de transférer la sauvegarde chiffrée.

Pour tous les hébergeurs : servez les fichiers JavaScript, le manifeste et `sw.js` avec leurs types MIME normaux ; évitez un cache immuable sur `index.html`, `sw.js` et `manifest.webmanifest`. Les assets contenant un hash peuvent être mis en cache longtemps. Conservez la même adresse d’application pour retrouver vos données locales.

Le dépôt existant est [alisurvinted-lgtm/Vinted-manager](https://github.com/alisurvinted-lgtm/Vinted-manager). L’adresse du site conserve la casse réelle : **https://alisurvinted-lgtm.github.io/Vinted-manager/**. Ne renommez pas le dépôt et n’effacez pas les données Safari pour appliquer une mise à jour. L’état vérifié de cette livraison est décrit dans [VALIDATION.md](./VALIDATION.md).

## Installation sur iPhone

1. Déployez l’application en HTTPS, puis ouvrez son adresse dans **Safari** en navigation normale.
2. Attendez la fin du premier chargement avec une connexion Internet.
3. Touchez **Partager**, puis **Sur l’écran d’accueil** (ou « Ajouter à l’écran d’accueil » selon iOS).
4. Validez **Ajouter**, puis ouvrez **Vinted Manager** depuis son icône.
5. Vérifiez le mode hors ligne en activant le mode avion après ce premier chargement complet.

Manifest, icônes PNG 192/512, icône maskable, icône Apple 180, affichage standalone, service worker et zones de sécurité iPhone sont configurés. Aucune police ou image distante n’est nécessaire au fonctionnement.

Une bannière propose d’**actualiser** lorsqu’une nouvelle version est prête. La mise à jour ne supprime jamais IndexedDB. L’actualisation est volontaire ; fermez ou enregistrez un formulaire avant d’actualiser. Le nouveau cache remplace l’ancien et les migrations de base sont séparées du cache des ressources.

Cible : Safari/iOS modernes (iOS 16.4+ recommandé), Chrome/Edge/Firefox récents sur ordinateur. Les tests WebKit simulent un iPhone ; ils ne remplacent pas une vérification sur votre appareil physique, notamment pour l’installation, le clavier et les téléchargements.

## Tests et vérifications

```bash
npm test
npm run build
npx playwright install --with-deps chromium webkit
npm run test:e2e
```

`npm run check` enchaîne tests unitaires, build et tests navigateur (une fois les navigateurs installés). Les navigateurs ne sont nécessaires qu’au développement.

- **Vitest + fake-indexeddb** : création, modification, suppression, changement de statut, calculs exacts, taux de 12,3 %, frais multiples, CA mensuel, exclusion du stock, changement de date de vente, décimales, moyennes, pertes, export/restauration JSON, validation, annulation transactionnelle, persistance après réouverture et migration de schéma.
- **V2** : achats d’un mois vendus l’année suivante, distinction achats/coût des ventes, frais rattachés à la vente, mois vides, comparaison, changements d’année et conservation intégrale d’une ancienne base après consultation et sélection répétée de fichiers non pris en charge.
- **Playwright** : parcours complet dans Chromium et WebKit au format iPhone ; sauvegarde téléchargée puis réimportée, confirmation et annulation, fichier invalide, rechargement, calculs visibles, filtres et recherche, statistiques, absence de débordement horizontal et rechargement/ajout hors ligne sur le build de production.

Les tests navigateur vérifient aussi le manifeste et la portée du service worker, ainsi que la conservation d’IndexedDB après fermeture complète et relance du navigateur avec le même profil. Les données de test sont isolées et ne sont pas intégrées à l’application livrée.

Voir [VALIDATION.md](./VALIDATION.md) pour les résultats réellement exécutés et leurs limites.

## Organisation du code

```text
src/
  App.tsx                      Navigation, accueil, articles et statistiques
  components/
    ArticleForm.tsx            Formulaire d’ajout, édition et vente
    ArticleDetail.tsx          Fiche et actions sur un article
    MonthlyChart.tsx           Graphique SVG léger, sélection du mois
    MonthlyReport.tsx          Bilan détaillé et comparaison mensuelle
    VintedImport.tsx           Guide officiel, état de prise en charge explicite
    Settings.tsx               Taux, export, import, aide à l’installation
    ui.tsx                     Éléments d’interface partagés
  lib/
    model.ts                   Types et valeurs autorisées
    paths.ts                   Normalisation du chemin de déploiement Pages
    accounting.ts              Calculs monétaires et agrégations
    periods.ts                 Mois, années et changement d’année
    vinted-import.ts           Sources vérifiées, refus des formats non confirmés
    crypto-backup.ts           AES-256-GCM, PBKDF2 et enveloppe authentifiée
    validation.ts              Validation métier et sauvegardes
    db.ts                      IndexedDB, migrations et écritures
    backup.ts                  Sauvegarde, restauration et CSV
  main.tsx                     Démarrage et gestion d’erreur globale
  styles.css                   Tailwind CSS et styles responsive
scripts/                       Contrôle des fichiers avant publication
.github/workflows/             Compilation, tests et déploiement automatique
public/                        Icônes locales et favicon
tests/                         Tests de calcul et de stockage
e2e/                           Tests des parcours utilisateur
vite.config.ts                 Build et PWA
```

React, TypeScript, Vite, Tailwind CSS, Lucide React, Dexie et vite-plugin-pwa. Le graphique SVG évite une dépendance supplémentaire. Les seuls accès réseau de l’application chargent ou mettent à jour ses propres fichiers statiques.

## Test personnel de connexion Gmail

Le [prototype de connexion personnelle](./prototypes/gmail-oauth/README.md) dispose d’une page distincte à `/Vinted-manager/gmail-prototype/`, avec son manifeste « Test Gmail ». Le propriétaire a fourni son identifiant client public et confirmé le mode personnel, l’activation de Gmail API et le scope `gmail.readonly`. La page ne lit aucun message et ne modifie aucune donnée comptable : elle vérifie uniquement l’accès à un champ du profil Gmail, à la demande. Le jeton reste en mémoire et n’entre jamais dans les sauvegardes. Le fonctionnement OAuth réel dans Safari et la PWA installée doit encore être confirmé sur l’iPhone du propriétaire.
