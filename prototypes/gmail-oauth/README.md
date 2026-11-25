# Gmail personnel — import confirmé (phase 3)

Phase 3 autorisée par le propriétaire le 25 novembre 2026. Elle ajoute l’enregistrement des transactions qu’il vérifie, avec une confirmation finale distincte. La connexion, les recherches et l’analyse restent locales ; aucun e-mail réel n’a été consulté par l’agent.

## Utilisation sur iPhone

Ouvrir **l’application Vinted Manager habituelle**, puis **Importer depuis Gmail** à l’accueil. Après la connexion Google, choisir le mois, rechercher et compléter les lignes utiles. Cocher les lignes vérifiées ; cette case confirme aussi que les champs de frais laissés vides signifient aucun frais supplémentaire. Toucher **Vérifier l’enregistrement des lignes cochées**. Choisir de créer un article, de vendre un article déjà en stock ou de relier une transaction déjà enregistrée, puis **Confirmer et enregistrer**. Un dialogue final permet encore d’annuler.

Le chemin `/gmail-prototype/` et l’ancienne icône « Test Gmail » servent toujours au test de lecture. Pour enregistrer dans la bonne base, passer par l’application principale installée : Safari et les PWA peuvent disposer de contextes de stockage distincts. Ne jamais effacer les données Safari pour actualiser l’application.

## Frontière entre Gmail et comptabilité

Le module Google est chargé dans une frame de même origine, seulement après l’ouverture volontaire de l’import. Le SDK ne se charge qu’après le consentement et « Préparer le test ». La CSP principale conserve `connect-src 'none'` et autorise uniquement la frame au chemin HTTPS exact du prototype ; aucun endpoint Google ou script tiers n’est ajouté à son bundle.

Le transfert utilise `postMessage` vers l’origine exacte, avec contrôle de `event.origin`, `event.source`, version et nonce aléatoire propre à l’ouverture. Aucun jeton, objet, texte, adresse ou identifiant Gmail en clair ne traverse ce protocole. Seuls les champs comptables saisis/vérifiés et les empreintes SHA-256 du message et, si présente, de sa référence/type, sont acceptés. Les champs étrangers sont refusés. Le module Gmail reste sans accès à une base, au stockage Web ou aux sauvegardes. La page comptable revalide chaque sélection et exige une confirmation avant toute écriture.

Cette séparation de code et de CSP **n’est pas une isolation cryptographique** : le SDK Google est du code de confiance sur la même origine, susceptible d’accéder techniquement au DOM ou à IndexedDB. Une mise à jour compromise, un appareil compromis ou une extension malveillante reste un risque. Le protocole ne protège pas contre un code malveillant déjà autorisé sur cette origine. Google reçoit les requêtes normales de recherche/lecture et leurs métadonnées ; aucune comptabilité ne lui est envoyée par le code applicatif.

## Données enregistrées et calculs

- Seuls les champs normalisés confirmés sont persistés dans IndexedDB, jamais les messages ou jetons. **La base active reste non chiffrée par l’application**, comme auparavant ; sa confidentialité dépend de l’iPhone/Safari. Les sauvegardes restent chiffrées par AES-256-GCM, PBKDF2-SHA-256 à 600 000 itérations.
- Migration additive du schéma v2 vers v3 : ajout de `imports` et d’un index unique de suivi, sans réécriture ni suppression d’article, frais, réglage ou opération existants. Les articles historiques complets restent identiques.
- Le coût et la date d’achat absents restent `null`. Une vente finalisée exige un prix et une date de vente confirmés ; elle compte dans le CA et les cotisations, mais son bénéfice et les agrégats de bénéfice restent « À compléter » tant que le coût manque. Le graphique ne trace pas un bénéfice inconnu comme zéro. Les achats sans date sont signalés et exclus des dépenses mensuelles jusqu’à saisie de leur date.
- Un achat confirmé crée du stock sans CA. Le capital reste à compléter si un coût de stock est inconnu. Genre et catégorie par défaut Unisexe / Autre sont annoncés et modifiables ensuite.
- Une annonce de vente, annulation, remboursement ou transaction incomplète reste dans **Notifications à vérifier**, sans effet automatique sur les ventes ou le stock. « Classer sans effet comptable » n’effectue aucune correction financière. La correction éventuelle d’un article reste explicite dans sa fiche.
- Les identifiants hachés évitent la répétition du même message ; une référence/type commune permet un contrôle supplémentaire. Sans référence, le rapprochement métier n’est pas garanti. Une ressemblance avec les articles manuels exige un rattachement ou la confirmation d’un article distinct. Les références ambiguës, lots de plusieurs articles et montants divergents sont refusés plutôt que fusionnés. Les lots demandent une vérification/saisie manuelle.
- Vendre un article existant conserve ses coûts connus, sa classification et ses frais, puis ajoute seulement les frais annoncés comme supplémentaires. Relier une vente déjà enregistrée ne modifie aucun montant ; prix et date doivent correspondre. Une modification concurrente de la fiche bloque l’opération. Le lot est transactionnel : une erreur annule toutes ses écritures.
- Un enregistrement finalisé est corrigé dans la fiche de l’article, pas en réimportant son e-mail. Une notification non financière déjà suivie n’est pas automatiquement convertie en article : terminer la vérification et saisir/corriger explicitement la fiche si nécessaire.

Les sauvegardes comptables exportées utilisent le **format interne v2**, incluant le suivi des imports et les coûts inconnus, à l’intérieur de l’enveloppe chiffrée v1 inchangée. Les anciennes sauvegardes v1 complètes restent restaurables. Elles ne contiennent pas de suivi Gmail : un avertissement le précise avant remplacement pour inviter à vérifier les doublons ultérieurs. Aucune sauvegarde n’est restaurée automatiquement.

## Contrôles et limites

Tests unitaires de migration v1/v2, conservation des articles, centimes, inconnus, doublons et concurrence, refus de données malformées, lots ambigus et restauration chiffrée avec suivi. Parcours Chromium et WebKit iPhone : lecture simulée, correction, confirmation annulée puis acceptée, écriture locale hors ligne, persistance, réimport sans doublon, complément du coût et refus des messages de transfert étrangers. Les contrôles de cache, réseau, fichiers publiables et imports de sauvegarde restent actifs. Résultats détaillés : [VALIDATION.md](../../VALIDATION.md).

Un essai anonyme séparé sous WebKit charge le vrai SDK Google dans la frame et ouvre sa page d’identifiant, puis ferme la fenêtre sans compte, consentement ou lecture Gmail. Il ne prouve pas le retour OAuth complet sur un iPhone physique. La connexion Safari/PWA de phase 1 et l’aperçu de phase 2 ont été rapportés fonctionnels par le propriétaire ; le nouveau parcours intégré doit encore être essayé par lui.

Aucune dépendance, serveur ou prestation payante n’a été ajouté. Le mode personnel OAuth existant et le scope `gmail.readonly` restent inchangés. Les limites de couverture des notifications et les sources officielles ci-dessous restent applicables. Ne pas redéployer une ancienne version de l’application qui ignore le schéma v3 ou les coûts inconnus ; pour retirer la fonction, conserver le schéma et les lecteurs actuels et désactiver son point d’entrée. Aucun retour arrière ne doit effacer la base.

## Historique : périmètre de la phase 2 (remplacé par la phase 3 ci-dessus)

### Rapport de la phase 2

Livraison du 25 novembre 2026 dans le dépôt existant. Le propriétaire a validé la phase 2 : repérer les notifications Vinted et présenter un aperçu corrigible, **sans enregistrement comptable**. La connexion et la révocation de phase 1 ont été confirmées par le propriétaire sur Safari iPhone et depuis l’icône installée. Cela ne démontre pas encore une lecture réelle de notifications avec cette nouvelle version.

## Périmètre

Page distincte : **https://alisurvinted-lgtm.github.io/Vinted-manager/gmail-prototype/**. Le manifeste « Test Gmail » reste distinct de Vinted Manager. La publication doit être vérifiée dans Actions et sur le site ; un build local ne suffit pas.

- Client OAuth public fourni par le propriétaire, mode personnel, Gmail API et scope `gmail.readonly` attestés par lui ; aucun accès de l’agent à sa console Google.
- Le scope donne une lecture de toute la boîte, pas seulement de Vinted. `include_granted_scopes: false` et refus de tout scope supplémentaire reçu. Le mode personnel Google doit rester réservé au créateur du projet.
- Aucun mot de passe ni secret client ; aucun jeton dans une URL applicative, React State, les sauvegardes, IndexedDB, le stockage Web ou les journaux. Pas de refresh token ni de connexion permanente.
- Aucun accès aux modules ou à la base comptable. Pas de migration, import, export de messages, rapprochement avec les articles existants, calcul de bénéfice ou modification des statistiques.
- Les prix d’achat, vente, frais, dates et noms restent à saisir. Un coût inconnu n’est jamais zéro. Les corrections et la case de vérification restent dans l’aperçu temporaire.

## Lecture déclenchée manuellement

Après accord, préparation et connexion Google, **Vérifier l’accès Gmail** vérifie uniquement le champ `historyId` du profil. Une action distincte **Rechercher les notifications Vinted** lit le mois de réception choisi, par lots de 20, jusqu’à 200 identifiants par recherche. Chaque lot suivant exige un geste. Aucun polling, synchronisation au lancement ou activité en arrière-plan.

1. Recherche `from:(@vinted.fr)`, hors spam et corbeille. Les bornes du mois sont converties en secondes Unix depuis le fuseau du navigateur pour éviter l’interprétation PST des dates Gmail.
2. Lecture bornée des métadonnées : identifiant, date interne Gmail, labels, From, Subject, Authentication-Results. Les expéditeurs personnels, domaines ressemblants, dates hors période ou formats invalides sont écartés avant la lecture du corps.
3. Le corps n’est demandé que pour un expéditeur exact `@vinted.fr`, un résultat DKIM/DMARC aligné rapporté par `mx.google.com`, et un objet évoquant une transaction. Sinon, seule une ligne d’avertissement est présentée.
4. Le texte MIME est traité localement. Aucun document HTML n’est créé : ni script, image distante, lien actif, style ou pièce jointe ne sont exécutés. Aucun point API de téléchargement de pièce jointe n’est appelé ; les parties portant un nom de fichier sont ignorées. Les réponses Gmail peuvent toutefois contenir des parties intégrées, bornées et ignorées selon leur type.
5. Les montants effectivement présents sont affichés avec leur contexte, sans affectation automatique à un prix. Les types proposés proviennent uniquement de mots dans l’objet et restent des **pistes**, sans prouver la finalisation d’une vente. La date du message ne devient jamais une date de transaction.

La source officielle française de Vinted confirme le domaine `@vinted.fr`, **aucun modèle exhaustif de notifications comptables n’est confirmé**. Les modèles réels peuvent ne pas être reconnus. Une notification, même authentifiée, ne prouve ni un encaissement définitif ni le sens achat/vente. Les transferts, langues, anciens domaines et résultats d’authentification absents peuvent produire des refus prudents. Le programme ne vérifie pas cryptographiquement DKIM lui-même et les résultats d’en-tête ne sont pas une garantie absolue d’authenticité.

Les identifiants Gmail déjà examinés sont dédupliqués dans la recherche en cours. Une référence explicitement libellée commune à plusieurs messages déclenche un avertissement de rapprochement, sans fusion ou annulation automatique. Il n’existe pas encore de détection de doublons avec la comptabilité : aucun import n’est autorisé dans cette phase.

## Limites et effacement

Réponses bornées : liste/métadonnées 32 Kio, message 512 Kio, texte décodé 200 000 caractères, extrait conservé 12 000 caractères, structure MIME bornée. Encodages, identifiants, pagination, dates et entrées monétaires sont validés. Une lecture dépassant 60 secondes est annulée. Une erreur de recherche efface l’accès et l’aperçu, sans afficher de réponse privée dans le message d’erreur.

Les jetons restent dans une fermeture JavaScript ; les seuls résultats affichables restent dans React en mémoire. La déconnexion, révocation, expiration, sortie de page et restauration depuis le cache de navigation effacent ces références et annulent les requêtes. Les réponses tardives sont ignorées. **Effacer uniquement l’aperçu** conserve seulement l’accès temporaire et retire les corrections. Une nouvelle recherche remplace l’aperçu ; charger la suite conserve les corrections déjà saisies. Aucun mot de passe, message, jeton ou aperçu n’est écrit dans un stockage applicatif.

L’effacement des références ne garantit pas l’effacement physique immédiat de toutes les copies de chaînes en mémoire. La conservation par le navigateur, le système, les extensions, les outils de diagnostic ou Google ne peut pas être entièrement contrôlée par cette PWA. Ne pas enregistrer de HAR, trace ou capture contenant un jeton ou des messages réels.

La révocation utilise le SDK officiel GIS, qui transmet le jeton en POST à `https://oauth2.googleapis.com/revoke`. Seule une confirmation `successful: true` affiche une réussite. En cas d’échec, le lien https://myaccount.google.com/connections permet de retirer l’accès. La déconnexion locale seule ne révoque pas le consentement. Le projet Google doit rester dédié, car la révocation peut supprimer toutes ses autorisations.

## CSP et publication

La CSP comptable conserve `connect-src 'none'`. Le prototype autorise uniquement le script GIS exact, ses communications et frames, le profil Gmail, la collection `/gmail/v1/users/me/messages`, ses chemins de messages et le point de révocation exact. Aucun joker, script inline, `eval`, ouverture générale de Google APIs ou tracker. Les requêtes Gmail sont uniquement des GET, sans cookies, avec Bearer en en-tête, sans referrer, sans cache et sans redirection ; les chemins de pièces jointes et écritures sont refusés.

Les données ne sont envoyées ni à l’agent, ni à GitHub, ni à un analyseur distant. La lecture et l’autorisation impliquent naturellement Google, qui peut traiter ses métadonnées habituelles. Le SDK Google est du code tiers de confiance. Les pages du même domaine Pages partagent une origine : ce chemin ne fournit **aucune isolation cryptographique d’IndexedDB**. Le prototype n’accède pas à la base, mais une future mise à jour compromise reste un risque. IndexedDB comptable active n’est pas chiffrée ; seules ses sauvegardes le sont.

`pages:package` assemble seulement les 13 fichiers comptables et les quatre fichiers compilés du prototype après validation fermée des chemins, CSP et signatures de données de test/secrets. Aucun profil, sauvegarde, export, journal, rapport ou source map n’est publié. Le worker comptable exclut le prototype du repli hors ligne et ne met aucune réponse Gmail en cache. La comptabilité fonctionne hors ligne ; la connexion et la lecture Gmail nécessitent Internet.

GitHub Pages ne permet pas de définir librement les en-têtes serveur, dont COOP et `frame-ancestors`. Le retour OAuth réel a été rapporté fonctionnel par le propriétaire dans Safari et dans la PWA. La lecture de nouveaux formats Gmail doit encore être essayée par lui ; aucun message réel n’a été consulté par l’agent.

## Vérification

Tests exclusivement synthétiques, OAuth et Gmail simulés : sélection des expéditeurs, authentification ambiguë, absence de lecture des corps personnels/non reconnus, bornes de mois/changement d’année/heure, MIME/HTML inerte, décimales, inconnus, doublons, pagination, erreurs, tailles limites, effacement et retours tardifs. Les parcours comptables continuent à vérifier la persistance, la migration historique, le chiffrement/restauration, les chemins Pages et le hors ligne. Les résultats exécutés figurent dans [VALIDATION.md](../../VALIDATION.md).

```bash
npm run verify:source
npm test
npm run gmail:build
npm run gmail:test:browser
PAGES_BASE_PATH=/Vinted-manager/ npm run build
PAGES_BASE_PATH=/Vinted-manager/ npm run test:e2e
npm run pages:package
```

Aucune dépendance ajoutée, aucun serveur ni abonnement. Les règles et quotas Google peuvent évoluer. Pour désactiver le test, mettre `enabled: false` dans `config.json`, reconstruire et publier. Cela ne révoque pas les autorisations Google : les retirer séparément si nécessaire. Une future phase d’import persistant exige un accord distinct et une conception qui protège les données dérivées au repos.

## Sources officielles consultées

- Vinted, expéditeurs et hameçonnage : https://www.vinted.fr/help/552/628-recognise-spoof-and-phishing-messages
- Gmail, authentification des messages : https://support.google.com/mail/answer/180707?hl=fr
- Recherche et fuseau PST : https://developers.google.com/workspace/gmail/api/guides/filtering
- Liste : https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list
- Lecture et formats : https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get
- Structure MIME : https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages
- Mode personnel : https://support.google.com/cloud/answer/15549945?hl=en
- Scopes : https://developers.google.com/workspace/gmail/api/auth/scopes
- GIS et révocation : https://developers.google.com/identity/oauth2/web/guides/use-token-model
- Origines et CSP : https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid
