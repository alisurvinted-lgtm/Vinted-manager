# Sécurité et confidentialité de Vinted Manager

Ce document décrit des protections vérifiables et leurs limites. Il ne garantit pas une sécurité absolue.

## Où vont les données ?

Les articles, montants, frais, ventes et opérations restent dans IndexedDB, dans le navigateur de l’appareil. Le nom et les versions de la base sont inchangés : cette mise à jour ne supprime aucune base existante. Il n’existe aucun serveur de données, compte applicatif, tracker, service analytique, publicité, télémétrie ou API Vinted.

Le code de l’application n’utilise aucune API d’envoi réseau. Une CSP du document de production impose `connect-src 'none'` pour bloquer notamment fetch, XHR, WebSocket et Beacon depuis la page. Le service worker charge les ressources statiques de l’application et ses mises à jour ; aucun enregistrement comptable n’est ajouté à son cache. Les seuls téléchargements déclenchés par l’utilisateur sont des fichiers locaux via une URL Blob.

GitHub sert les fichiers statiques et peut journaliser les accès HTTP habituels (adresse IP, navigateur, date, chemin demandé). Le projet ne lui transmet ni les articles ni les phrases secrètes. Ce n’est pas une absence totale de métadonnées chez l’hébergeur.

## Sauvegardes chiffrées

Le choix principal est **Paramètres → Exporter une sauvegarde chiffrée**. Le fichier porte l’extension `.vmbackup` et contient uniquement une enveloppe JSON de chiffrement ; les articles et leurs métadonnées sont à l’intérieur du texte chiffré.

| Élément          | Paramètre du format v1                                               |
| ---------------- | -------------------------------------------------------------------- |
| Chiffrement      | AES-256-GCM, clé de 256 bits                                         |
| Authentification | Tag GCM de 128 bits, contenu et en-tête canonique authentifiés       |
| Dérivation       | PBKDF2-HMAC-SHA-256, 600 000 itérations                              |
| Sel              | 32 octets aléatoires, nouveau à chaque export                        |
| IV               | 12 octets aléatoires, nouveau à chaque export                        |
| Aléatoire        | `crypto.getRandomValues`                                             |
| Clé              | Web Crypto, non extractible                                          |
| Phrase           | UTF-8 exact, sans suppression des espaces ni normalisation implicite |
| Taille           | JSON clair jusqu’à 20 Mo UTF-8 ; fichier chiffré jusqu’à 30 Mo       |

La taille du fichier et la date figurant dans son nom restent visibles ; elles ne sont pas des données chiffrées.

Les 600 000 itérations ralentissent les essais de phrases. Le sel évite les tables de dérivation réutilisables ; le couple sel/clé et l’IV sont renouvelés pour chaque chiffrement. Les paramètres sont fixés par la version : les paramètres affaiblis ou excessifs sont refusés avant dérivation pour limiter les imports malveillants. GCM refuse un contenu, un sel ou un IV altéré ainsi qu’une mauvaise phrase. Les champs inconnus et encodages non canoniques sont refusés.

Une nouvelle phrase doit contenir au moins 16 caractères. Préférez **cinq ou six mots aléatoires**, uniques, qui ne constituent pas une citation ou une phrase prévisible. Le nombre minimal de caractères ne garantit pas une bonne entropie.

La phrase doit être confirmée à l’export. Elle ne va ni dans IndexedDB, ni dans localStorage/sessionStorage, ni dans un fichier, ni sur le réseau. Les champs sont vidés après une tentative cryptographique et à la fermeture du formulaire. Les buffers modifiables sont effacés après usage lorsque possible. JavaScript et son ramasse-miettes ne permettent pas de garantir l’effacement immédiat de toutes les copies de chaînes en mémoire ; l’appareil, le clavier et le navigateur restent des composants de confiance.

### Restaurer

1. Choisir le fichier `.vmbackup` dans **Importer une sauvegarde**.
2. Renseigner sa phrase exacte.
3. L’application authentifie et déchiffre, puis valide le schéma complet.
4. Une confirmation distincte est demandée avant tout remplacement.
5. La restauration se fait en une seule transaction IndexedDB. Une erreur annule la transaction et conserve l’ancien contenu.

Une mauvaise phrase et un contenu altéré donnent une erreur générique. Aucun remplacement n’est effectué lors de ces erreurs. La fonction de déchiffrement ne modifie jamais la base.

### Phrase oubliée

Il n’existe **aucune clé de récupération, porte dérobée ou récupération par email**. Sans la phrase, l’ancien fichier est irrécupérable par l’application. Si les données sont encore présentes sur votre iPhone, vous pouvez les exporter à nouveau avec une nouvelle phrase ; cela ne déchiffre pas l’ancien fichier. Conservez la phrase séparément de la sauvegarde, par exemple dans un gestionnaire de mots de passe de votre choix ou sur un support hors ligne protégé.

### Anciens JSON et CSV

L’ancien JSON reste compatible mais n’est pas une sauvegarde chiffrée. Un avertissement précède son export et sa restauration. Les exports JSON/CSV sont rangés dans **Ancien format et CSV non chiffrés**. Le CSV comporte lui aussi un avertissement. Ces fichiers restent lisibles par toute personne qui les possède. Une sauvegarde chiffrée créée ensuite ne sécurise pas rétroactivement les copies en clair déjà présentes dans Fichiers ou ailleurs. L’application n’efface aucun fichier existant.

Le navigateur et l’app **Fichiers** décident du lieu de téléchargement. Un emplacement iCloud Drive ou un fournisseur de fichiers peut synchroniser le fichier par son propre fonctionnement ; choisissez **Sur mon iPhone** si vous voulez le garder uniquement sur l’appareil. Vinted Manager ne déclenche pas cette synchronisation. Le fichier chiffré reste protégé par la phrase, sous réserve de sa qualité.

## Stockage local : limites importantes

**IndexedDB n’est pas chiffrée par cette application.** Le chiffrement concerne les fichiers de sauvegarde, pas la base active. Toute personne pouvant utiliser l’application sur un appareil déverrouillé peut voir les articles. Un code PIN d’interface n’a pas été ajouté ni présenté comme du chiffrement.

Protégez l’iPhone par un code robuste et Face ID/Touch ID, maintenez iOS/Safari à jour et limitez l’accès aux profils, extensions et appareils de confiance. Les protections matérielles d’iOS dépendent aussi de cette configuration. Une compromission de l’appareil, une extension autorisée ou un code malveillant exécuté sous la même origine peut accéder aux données et aux phrases pendant leur utilisation.

Les projets `*.github.io` d’un même compte partagent une origine. Les chemins PWA séparent les ressources et la portée du service worker, mais **ne constituent pas une isolation de sécurité d’IndexedDB** entre sites du même compte. Gardez les autres sites hébergés sous ce compte fiables. Changer d’origine rend l’ancienne base inaccessible depuis la nouvelle adresse ; un transfert par sauvegarde est alors nécessaire.

L’application ne contrôle pas les sauvegardes système iCloud ou les copies de l’iPhone sur ordinateur. Vérifiez aussi ces réglages si vous ne souhaitez aucune copie hors de l’appareil.

Safari peut supprimer des données locales ou les rendre indisponibles après un effacement, un changement de profil, la navigation privée ou une pression sur le stockage. La demande de stockage persistant n’est pas une garantie. Les sauvegardes régulières restent nécessaires, et leur conservation repose sur vous.

## XSS, import et requêtes

- Les noms sont rendus comme texte par React ; aucun HTML fourni par un article n’est interprété. Pas de `dangerouslySetInnerHTML`, d’eval ou de constructeur Function dans le code applicatif.
- Validation des types, enums, dates, montants en centimes, identifiants, doublons et limites avant écriture ou import. Les propriétés importées sont reconstruites à partir des seuls champs connus.
- Limites d’articles/opérations/frais et de taille avant restauration. Les paramètres cryptographiques ne sont pas pilotables librement par un fichier.
- Les noms interprétables comme formules de tableur sont neutralisés dans le CSV.
- Pas de journal applicatif de données privées. Les appels console/debugger sont retirés du bundle et aucun gestionnaire d’erreur ne journalise l’objet d’erreur.
- Les seules permissions utilisées concernent le stockage local/persistant et le service worker. Pas de caméra, microphone, localisation, notifications ni contacts.

## Import Vinted : état de préparation

Aucun analyseur de transactions Vinted n’est activé sans format officiel réellement vérifié. Le guide utilise uniquement deux liens d’aide officiels fixes, ouverts à la demande dans un nouvel onglet avec `noopener noreferrer`. L’application n’accède pas au compte et ne demande aucun identifiant Vinted.

Le sélecteur de fichier n’examine que les métadonnées de taille (20 Mo maximum) et refuse ensuite tous les formats comme non pris en charge. Il ne lit, n’affiche, n’extrait, n’exécute, n’enregistre et ne transmet aucun contenu. Il n’appelle aucune écriture IndexedDB. Une extension ou un type MIME ne suffit pas à établir la provenance ou la structure d’un fichier. Il n’y a donc actuellement ni aperçu des transactions, ni détection métier de doublons, ni import de remboursement/annulation : ces fonctions attendent un format confirmé. La sélection répétée ne peut pas créer de doublons puisqu’aucune transaction n’est importée.

La préparation du futur analyseur et les exigences de validation sont décrites dans [VINTED_IMPORT.md](./VINTED_IMPORT.md). Ne publiez jamais d’archive personnelle sur GitHub ; un exemple minimal entièrement anonymisé suffit à étudier la structure. Les sauvegardes de Vinted Manager restent traitées séparément, avec leurs protections cryptographiques existantes.

## CSP et limites de GitHub Pages

La CSP est insérée tôt dans le HTML de production :

```text
default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data:; font-src 'self'; connect-src 'none'; worker-src 'self';
manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'
```

Elle interdit les scripts inline et eval, les objets, les soumissions de formulaires et les connexions de la page. Les styles inline sont permis pour le fonctionnement de l’interface. Une politique de referrer `no-referrer` est aussi configurée.

GitHub Pages ne permet pas de définir librement tous les en-têtes HTTP de sécurité. Les fichiers `_headers` ne sont pas appliqués par Pages. Une CSP via meta ne fournit pas `frame-ancestors`, l’équivalent complet d’un en-tête CSP ni tous les contrôles serveur possibles. Aucune protection anti-iframe par en-tête ou HSTS configurée par ce projet n’est revendiquée. HTTPS est fourni par GitHub Pages.

La CSP est une défense supplémentaire ; elle ne garantit pas l’absence de fuite face à une application ou une mise à jour compromise. Elle ne chiffre pas IndexedDB. Le code public peut être copié, mais le dépôt ne contient pas votre base locale. Protégez votre compte GitHub avec l’authentification à deux facteurs et contrôlez les personnes autorisées à modifier `main` : une mise à jour de l’application est du code de confiance exécuté sur l’iPhone.

## Publication et chaîne de compilation

- Sélection fermée de fichiers sources, détection de signatures usuelles de secrets sans afficher leur contenu, exclusion des sauvegardes/CSV/profils/archives.
- Contrôle fermé de `dist/` : seuls HTML, JS/CSS compilés, manifeste, worker et icônes connus sont publiables. Un fichier JSON comptable copié dans `public/` bloque la publication.
- Aucun fichier de test n’est importé dans l’application. Les marqueurs de données synthétiques sont interdits dans le bundle.
- `npm ci` et le lockfile fixent l’arbre de dépendances et leurs intégrités. Les actions GitHub officielles sont épinglées à des commits vérifiés ; les permissions d’écriture Pages sont limitées au job de déploiement (configuration en lecture seule).
- Les jetons de checkout ne sont pas conservés dans la configuration Git. Aucun artefact de tests, capture, trace ou profil de navigateur n’est publié. Seul `dist/` est transféré à Pages.
- Le workflow refuse les dépôts privés pour rester dans l’utilisation gratuite prévue. Aucun autre dépôt n’est créé et aucun service payant n’est ajouté.

### Audit des dépendances effectué le 15 novembre 2026

Avant correction : 9 signalements npm, dont 2 critiques (outils de test), 5 modérés et 2 faibles. Vitest a été mis à jour en 5.1, vite-plugin-pwa en 2.0, et Glob en 14.0.6 via un override documenté du lockfile. Les tests et le build sont vérifiés avec ces versions.

Après correction : **aucun signalement critique, élevé ou modéré**. L’audit `npm audit --omit=dev` ne signale aucune vulnérabilité dans les dépendances de production déclarées. Il reste **4 signalements faibles liés à une seule vulnérabilité `deepmerge` (GHSA-gcqx-w48m-w2h4), propagée dans la chaîne de compilation Workbox/Rollup/PWA**. La dernière version publiée de deepmerge reste concernée ; une rétrogradation vers une ancienne chaîne PWA n’a pas été appliquée. Cette dépendance de compilation ne s’exécute pas dans l’application publiée et ne traite pas vos sauvegardes. Le risque n’est pas déclaré nul ; il faut suivre la correction amont. Le workflow bloque les signalements npm de niveau modéré ou supérieur.

Un audit npm dépend de la base d’avis connue au moment du contrôle. Un résultat sans signalement ne prouve pas l’absence de vulnérabilité.

## Vérifications

Les tests utilisent exclusivement des données synthétiques et des bases/profils temporaires. Ils couvrent le chiffrement et une vérification indépendante par Node/OpenSSL, les mauvais secrets, les altérations, la restauration complète, les requêtes et journaux lors des parcours, la CSP, l’échappement HTML, le contenu du cache, les chemins Pages, le hors ligne et la fermeture complète du navigateur. Ils sont exécutés dans Chromium et WebKit au format iPhone.

L’installation physique sur votre iPhone et les politiques propres à votre appareil ne sont pas vérifiables depuis cet environnement. Les résultats d’exécution et l’état du déploiement figurent dans [VALIDATION.md](./VALIDATION.md).
