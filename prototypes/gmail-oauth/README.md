# Prototype Gmail — phase 1, désactivée

Préparation du 18 novembre 2026 dans le dépôt Vinted Manager existant. Aucun client OAuth réel n’est configuré, aucune connexion Gmail n’est activée et aucune publication du prototype n’est autorisée à ce stade. Les tests utilisent exclusivement des doubles locaux et des valeurs synthétiques.

## Limites du prototype

- Uniquement une autorisation `gmail.readonly`, sans cumul avec des autorisations anciennes (`include_granted_scopes: false`). Tout scope supplémentaire reçu est refusé.
- La première action prépare la bibliothèque officielle Google. Une seconde action utilisateur ouvre OAuth de façon synchrone, pour éviter l’ouverture d’une fenêtre après une attente réseau dans Safari.
- Une action distincte peut confirmer l’accès via `GET https://gmail.googleapis.com/gmail/v1/users/me/profile?fields=historyId`. Le profil partiel est validé et jeté ; seule une réussite booléenne est affichée. Aucune adresse du compte, aucun message, objet, corps, aperçu ou pièce jointe n’est demandé.
- Aucune importation comptable. Les modules d’articles, IndexedDB, sauvegardes et calculs ne sont pas importés. Le schéma de la base reste inchangé.
- Le jeton est conservé uniquement dans une fermeture JavaScript, jamais dans React State, une URL applicative, un fichier, une base, le stockage Web ou un journal. Il est supprimé à l’expiration, en quittant la page, à la déconnexion, à la révocation ou en cas d’échec de vérification. Les requêtes en cours sont annulées et les réponses tardives sont ignorées.
- Effacer la référence en mémoire ne garantit pas l’effacement immédiat de toutes les copies par JavaScript ou par la bibliothèque Google. Les extensions, les scripts de même origine et un appareil compromis restent des risques.
- Déconnecter localement ne révoque pas le consentement. La révocation utilise la méthode officielle GIS et doit recevoir `successful: true`. Échec ou absence de réponse donnent un message explicite et un lien vers la gestion des accès Google. Ce lien fonctionne également après perte du jeton.
- La révocation peut concerner toutes les autorisations du projet OAuth : le futur projet doit être dédié à ce test personnel.

## Verrous avant activation

`config.json` est livré avec `enabled: false`, un identifiant client vide et les confirmations de mode personnel et de revue de sécurité à `false`. Aucun paramètre d’URL, configuration utilisateur ou variable d’environnement ne permet de contourner ces verrous. L’origine autorisée est précisément `https://alisurvinted-lgtm.github.io`.

`npm run gmail:verify` et le début du build refusent une configuration activée. Leur évolution nécessitera une revue explicite après création du client OAuth personnel et validation de l’utilisateur. Les valeurs de confirmation seules ne démontrent pas le réglage effectif du projet Google : celui-ci doit être vérifié dans la console du propriétaire. Seul l’identifiant client public sera utilisable dans le navigateur ; jamais le secret client ou le JSON d’identifiants complet.

Le compte autorisé par le mode personnel est exclusivement celui qui a créé l’application Google. Le mode personnel ne peut pas être ajouté à un projet externe ou interne existant et son choix est irréversible. Il ne dispense pas des règles Google sur les données. Les jetons restent temporaires même si le mode personnel évite l’expiration d’autorisation à sept jours du mode test.

## Séparation du site publié

Le build habituel, le workflow Pages et sa CSP `connect-src 'none'` restent séparés du prototype. Le contrôle de `dist/` refuse aussi toute inclusion du code de connexion Gmail. L’unique changement préparatoire du worker comptable exclut la navigation `/gmail-prototype/` de son repli vers l’accueil ; il ne supprime aucun cache ni aucune base. Cette exclusion sera utile seulement si une future publication de la page de test est autorisée.

Le prototype possède un build distinct dans `.prototype-build/gmail-oauth/`, exclu de Git et du workflow Pages, et un manifeste distinct avec le nom « Test Gmail ». Aucun service worker n’y enregistre de messages ou de jetons ; ce test OAuth exige Internet. Les fonctionnalités comptables locales gardent leur worker hors ligne habituel.

La CSP du build désactivé n’autorise aucun accès réseau, iframe ni script distant. Le code de préparation prévoit, uniquement après validation, des permissions précises pour la bibliothèque et les frames `accounts.google.com/gsi/` et le seul point d’accès de profil Gmail. Aucun joker d’hôte, script inline, `eval` ou service tiers n’est autorisé. Les origines effectivement requises par la révocation GIS devront être vérifiées ; si cette CSP la bloque, l’interface indique l’échec au lieu de prétendre avoir révoqué.

## Vérifications locales

```bash
npm run verify:source
npm run gmail:verify
npm test
npm run gmail:build
npm run gmail:test:browser
PAGES_BASE_PATH=/Vinted-manager/ npm run build
PAGES_BASE_PATH=/Vinted-manager/ npm run test:e2e
```

Le serveur de prévisualisation du prototype fournit `Cache-Control: no-store` et `Cross-Origin-Opener-Policy: same-origin-allow-popups`. GitHub Pages ne permet pas de configurer librement cet en-tête : ces tests locaux ne démontrent pas que le parcours OAuth réel fonctionnera sur Pages. Aucune simulation ne remplace une autorisation sur un iPhone physique, dans Safari normal puis depuis l’icône installée, avec retour réussi dans la même fenêtre et dans le même contexte mémoire.

Avant de poursuivre, il faudra vérifier le mode personnel Google, l’origine réelle du client, le scope unique, le retour de fenêtre, les refus/annulations, la révocation réelle et les requêtes réseau, sans conserver de trace, HAR, capture de jeton ou contenu personnel. Une redirection dans Safari ne doit jamais être supposée partager la base ou la mémoire de la PWA installée. En cas d’échec fiable, on conserve l’import local comme alternative. Ne pas contourner les restrictions Google, demander un secret ou effacer les données Safari.

Le prototype ne conserve aucune donnée provenant de Gmail au repos. Un futur import comptable nécessiterait une étude et une protection au repos des données dérivées ; il n’est pas couvert par cette phase.

## Résultats exécutés le 18 novembre 2026

- **134 tests unitaires réussis**, dont **39 nouveaux** pour le contrôleur OAuth simulé et la requête minimale de profil.
- **4 tests navigateur du prototype désactivé réussis** : Chromium et WebKit au format iPhone, aucune requête Google, aucune ouverture de base par le prototype, conservation d’un article synthétique préexistant après rechargement, aucune valeur stockée dans le stockage Web et contrôles de CSP/manifeste.
- **24 tests navigateur de l’application comptable réussis**, dont 12 WebKit iPhone : sauvegardes chiffrées, refus d’altération/mauvais secret, conservation des données, hors ligne, CSP, calculs mensuels et exclusion du prototype du repli du worker.
- TypeScript, build du prototype désactivé et build de production réussis. L’application comptable conserve exactement ses bundles JavaScript et CSS précédents ; seul le worker reçoit l’exclusion de navigation préparatoire.
- Contrôles de sources et des 13 fichiers statiques de production réussis ; le prototype n’entre pas dans `dist/`.
- Audit npm des dépendances de production : **0 signalement**. Aucune nouvelle dépendance n’est ajoutée.

Dans cet environnement, les navigateurs utilisent les bibliothèques locales installées dans `/tmp/vinted-browsers` ; le contrôle préalable du cache système est désactivé, sans ignorer aucun test.

**Aucune connexion OAuth réelle, aucun consentement Google, aucune révocation réelle ni installation physique iPhone n’ont été exécutés.** Les doubles de test ne démontrent pas la compatibilité du retour OAuth réel. Aucune modification ne sera envoyée sur `main` ni déployée dans cette phase. La préparation est conservée sur une branche séparée du même dépôt, `prototype/gmail-oauth-phase-1`.

## Sources officielles revérifiées

- Mode personnel, compte créateur unique et parcours de création : https://support.google.com/cloud/answer/15544987?hl=en
- Scopes Gmail : https://developers.google.com/workspace/gmail/api/auth/scopes
- Modèle de jeton GIS, geste utilisateur et révocation : https://developers.google.com/identity/oauth2/web/guides/use-token-model
- Paramètres du client, `include_granted_scopes` et réponse de révocation : https://developers.google.com/identity/oauth2/web/reference/js-reference
- Origines, CSP et COOP : https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid
- Profil Gmail partiel et scope de lecture : https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/getProfile
- Attention : le point de révocation OAuth historique ne propose pas CORS ; ne pas remplacer la méthode GIS par une requête navigateur supposée fonctionner : https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow#tokenrevoke
- Quotas standard gratuits et dépassements : https://developers.google.com/workspace/gmail/api/reference/quota

## Première manipulation pour le propriétaire

Ouvrir dans Safari **https://console.cloud.google.com/auth/overview/personal**, se connecter au compte Gmail qui reçoit les notifications Vinted, puis s’arrêter sur cette page. Ne pas cliquer sur « Continuer », activer une facturation ni partager d’identifiants à cette étape. La suite attend sa confirmation.
