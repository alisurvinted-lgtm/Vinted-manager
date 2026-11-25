# Test personnel Gmail — phase 1

Configuration du 25 novembre 2026 dans le dépôt existant. Le propriétaire a fourni son **identifiant client public** et confirmé le mode personnel, l’activation de Gmail API et le scope `gmail.readonly`. Ces réglages sont rapportés par le propriétaire ; l’agent ne dispose pas d’un accès authentifié à sa console Google. Aucun mot de passe, secret client ou jeton réel n’a été communiqué.

## Périmètre autorisé

La page de test séparée est prévue à **https://alisurvinted-lgtm.github.io/Vinted-manager/gmail-prototype/**. Son manifeste porte le nom **Test Gmail** et n’écrase pas celui de Vinted Manager. L’état réellement déployé doit être contrôlé dans le workflow du commit et sur cette URL ; un build local ne démontre pas une publication.

- Le scope demandé est exclusivement `https://www.googleapis.com/auth/gmail.readonly`, avec `include_granted_scopes: false`. Tout scope supplémentaire reçu est refusé.
- L’autorisation Google porte sur toute la boîte ; le mode personnel limite le compte pouvant autoriser l’application à celui qui a créé le projet. La page statique est publique, sans héberger d’e-mails.
- Aucun message, objet, corps, extrait, adresse e-mail ou pièce jointe n’est demandé. Seule l’action **Vérifier l’accès Gmail** effectue `GET /gmail/v1/users/me/profile?fields=historyId` sur `gmail.googleapis.com`. La réponse partielle est validée puis abandonnée ; seule une réussite booléenne est affichée.
- Aucun import comptable n’est développé. Les modules de base, articles, sauvegardes et calculs sont inchangés et ne sont pas importés dans le prototype.

## Mémoire et révocation

Le jeton reste dans une fermeture JavaScript, jamais dans React State, une URL applicative, IndexedDB, le stockage Web, un fichier ou un journal applicatif. Il est effacé à l’expiration, en quittant la page, à la déconnexion, à la révocation et après une erreur de vérification. Les requêtes en cours sont annulées et les réponses tardives sont ignorées. Les buffers de la réponse de profil sont nettoyés après validation.

La déconnexion locale ne révoque pas le consentement Google. La révocation utilise la méthode officielle GIS, qui effectue une requête POST vers `https://oauth2.googleapis.com/revoke`. La réussite n’est affichée qu’après confirmation explicite de Google. Sinon, un message et le lien `https://myaccount.google.com/connections` permettent de retirer l’accès manuellement. La révocation peut supprimer toutes les autorisations du projet : ce projet doit rester dédié au test.

Les références en mémoire, les copies de chaînes et la bibliothèque Google ne peuvent pas être effacées avec une garantie absolue par JavaScript. Le SDK Google est du code de confiance chargé uniquement après un accord et l’action de préparation. Les autres pages du même domaine GitHub Pages partagent une origine et peuvent constituer un risque : ce chemin n’isole pas cryptographiquement IndexedDB. Aucun appel à la base comptable n’est présent dans le prototype.

## Configuration et CSP

`config.json` contient l’identifiant client public fourni et les confirmations, sans secret. L’origine est fixée à `https://alisurvinted-lgtm.github.io`, avec HTTPS obligatoire. La vérification de build lie le client à l’identifiant transmis et refuse toute activation sans confirmation de mode personnel et revue du code. Aucun paramètre d’URL ni réglage utilisateur ne permet de modifier ces choix. Pour désactiver le test, mettre `enabled: false` et retirer l’étape d’assemblage du prototype avant de reconstruire.

La CSP de **l’application comptable** reste `connect-src 'none'`. Celle du **prototype** autorise seulement :

- le script `https://accounts.google.com/gsi/client` ;
- les communications GIS sous `https://accounts.google.com/gsi/` ;
- les frames sous `https://accounts.google.com/gsi/` et le pont `https://accounts.google.com/o/oauth2/iframe` ;
- le point de profil Gmail exact et le point de révocation OAuth exact.

Aucun joker, script inline, `eval`, connexion générale à Google APIs, formulaire réseau ou tracker applicatif n’est ajouté. Le SDK Google et ses pages d’autorisation peuvent traiter les métadonnées normales de connexion ; cela ne constitue pas une promesse d’absence de métadonnées chez Google. Le point de révocation est maintenant explicitement autorisé, après inspection de la bibliothèque GIS publique actuelle qui le contacte en POST.

Le build séparé réside dans `.prototype-build/gmail-oauth/`. `pages:package` vérifie d’abord les 13 fichiers comptables, puis les quatre seuls fichiers autorisés du prototype (HTML, manifeste, JS et CSS), sa CSP exacte, le client compilé et l’absence de signatures de secrets/données de test. Seul cet assemblage fermé est transféré à Pages. Aucun rapport, profil de navigateur, export, sauvegarde ou source map n’est publié.

Le worker comptable exclut `/gmail-prototype/` du repli hors ligne afin de ne pas remplacer ce test par l’accueil comptable. Il ne supprime aucune base. Si un ancien worker affiche l’accueil au lieu du test, actualiser d’abord la version de l’application via sa bannière, sans effacer les données Safari. Le prototype nécessite Internet ; la comptabilité conserve son fonctionnement hors ligne.

## Tests et limites

Les tests unitaires utilisent des doubles, les tests navigateur interceptent Google avec des réponses synthétiques. Ils vérifient le scope unique, l’accord préalable, les refus, l’expiration, les retours tardifs, les erreurs de révocation, le profil partiel, l’absence de jeton dans le DOM ou le stockage et les réponses de page abandonnée. Les parcours navigateur existent pour Chromium et WebKit au format iPhone ; un mode standalone simulé n’est pas une installation physique.

Le serveur local fournit un en-tête COOP adapté ; Pages ne permet pas sa configuration libre. Il faudra vérifier le retour OAuth réel sur l’iPhone dans Safari normal puis depuis l’icône **Test Gmail**, dans le même contexte mémoire. La présence du SDK et la réussite des tests simulés ne démontrent ni le consentement réel, ni l’accès réel à Gmail. Aucun consentement n’est donné à la place de l’utilisateur et aucun mot de passe n’est demandé à l’agent. Ne pas conserver de HAR, trace, capture de jeton ou enregistrement de message pendant les essais réels.

Commandes :

```bash
npm run verify:source
npm test
npm run gmail:build
npm run gmail:test:browser
PAGES_BASE_PATH=/Vinted-manager/ npm run build
PAGES_BASE_PATH=/Vinted-manager/ npm run test:e2e
npm run pages:package
```

Les dépendances de production ont été auditées le 25 novembre : aucun signalement. Aucune dépendance supplémentaire ou service payant n’est ajouté. Les règles Google et quotas restent susceptibles de changer. Aucun serveur ne traite les données. Un futur import comptable nécessiterait un accord distinct et une protection au repos des données dérivées ; cette phase ne l’autorise pas.

## Vérifications exécutées le 25 novembre 2026

- **134 tests unitaires réussis** sur huit fichiers.
- **8 tests navigateur du prototype réussis**, quatre Chromium et quatre WebKit iPhone, avec fournisseur OAuth simulé sur l’origine autorisée et refus sur l’origine locale.
- **24 tests navigateur comptables réussis**, dont douze WebKit iPhone : persistance, chiffrement, restauration, CSP, calculs et hors ligne préservés.
- Builds TypeScript/Vite du site et du prototype réussis. Le JavaScript et le CSS comptables gardent les mêmes fichiers que la V2 publiée ; leurs modules source sont inchangés.
- Contrôles de publication réussis : treize fichiers comptables plus quatre fichiers de prototype. Un fichier supplémentaire et une CSP élargie ont été volontairement soumis à l’assemblage puis refusés, avant restauration du build correct.
- Aucun signalement dans les audits npm de production et complet. Aucun nouveau paquet ajouté.
- Un essai WebKit séparé charge le SDK Google officiel et ouvre la page Google de saisie d’identifiant. Aucun compte n’est saisi et aucun consentement n’est donné. La fermeture annule le test sans accès Gmail.

**Ces résultats ne démontrent pas un consentement réel ni une connexion réussie sur un iPhone physique.** Il faut attendre le test manuel du propriétaire dans Safari et depuis l’icône installée. Les bibliothèques de navigateur locales sont utilisées sans ignorer de test ; aucune trace contenant un jeton réel n’est créée.

## Sources officielles revérifiées

- Mode personnel : https://support.google.com/cloud/answer/15549945?hl=en
- Scopes Gmail : https://developers.google.com/workspace/gmail/api/auth/scopes
- Jetons GIS et révocation : https://developers.google.com/identity/oauth2/web/guides/use-token-model
- API JavaScript : https://developers.google.com/identity/oauth2/web/reference/js-reference
- Origines, CSP et COOP : https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid
- Profil partiel : https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/getProfile
- Bibliothèque GIS publique inspectée : https://accounts.google.com/gsi/client
