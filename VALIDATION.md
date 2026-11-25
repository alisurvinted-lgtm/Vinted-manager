# Validation de Vinted Manager

## Phase 5 — validation globale et livraison finale

Point de départ vérifié : `eca6eceafb2e4f69dd052fdedc8c09d4ab242679` sur `feature/phase4-interface`. Continuité directe : `4045eeb` (coffre déjà publié), `007bcc0` (filtrage/extraction), `533d6ba` (rapprochement), `eca6ece` (parcours/tableau de bord), puis branche `release/phase5-validation`. Aucun développement n'a été reconstruit depuis `main`.

### Audit et correction de livraison

Revue des primitives du coffre, du stockage transactionnel/migrations, des sauvegardes, du verrouillage, de la frontière Gmail/OAuth, du parsing MIME/HTML, des calculs, du cache et du workflow. Aucun changement de format cryptographique, de schéma IndexedDB v4, de périmètre OAuth ou de règles de rapprochement. Les quatre phases sont conservées.

Un contrôle de mise à jour ajouté a révélé un cas de premier lancement : Workbox pouvait activer le nouveau worker sans recharger l'écran, car l'événement n'était pas qualifié `isUpdate`. Le bouton « Actualiser » pilote maintenant l'activation du worker en attente, attend `controllerchange`, verrouille le coffre puis recharge. Aucun effacement de données, rechargement automatique sans validation ou contournement CSP. Les profils de test principal et du lecteur utilisent désormais **iPhone 15**. La première CI a bloqué le déploiement sur deux contrôles de géométrie WebKit avec ses polices de secours : le slogan mobile est maintenant conservé pour les lecteurs d’écran sans occuper l’espace des indicateurs, et l’ouverture de la liste fiable la place sous l’en-tête du dialogue. Les seuils de visibilité et les cibles tactiles ne sont pas réduits ; les diagnostics de test affichent leurs boîtes en cas d’échec.

| Contrôle exécuté                                     | Résultat                                                                                                              |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Suite unitaire complète                              | **372 réussis**, 13 fichiers                                                                                          |
| Application, tous les parcours existants             | **46 réussis**, 23 Chromium + 23 WebKit iPhone 15                                                                     |
| Mise à jour/récupération depuis les fichiers publiés | **2 réussis**, Chromium + WebKit iPhone 15                                                                            |
| Lecteur Gmail séparé                                 | **10 réussis**, 5 Chromium + 5 WebKit iPhone 15                                                                       |
| Total navigateur                                     | **58 cas**, dont **29 WebKit iPhone 15**                                                                              |
| Audit npm complet                                    | **0 vulnérabilité connue signalée**, toutes gravités                                                                  |
| Sources, format et artefacts                         | Sélection fermée ; 13 fichiers statiques comptables et 4 du lecteur, aucun export ni donnée de test dans les bundles  |
| TypeScript / builds                                  | Application et lecteur compilés ; base `/Vinted-manager/` conservée                                                   |
| Historique Git                                       | Aucune signature reconnue de clé privée, jeton GitHub, clé AWS, jeton d'accès Google ou secret client Google détectée |

Les cas unitaires vérifient AES-256-GCM, PBKDF2-SHA-256 à 600 000, IV neufs/collision refusée, AAD/métadonnées, clé non exportable, mauvaise phrase, altérations, écritures tardives/concurrentes, migration v1/v2/v3 et interruption/reprise, récupération chiffrée, anciennes sauvegardes, suivi des doublons restauré, inconnus `null`, calculs et corrections. Les tests de navigateur contrôlent aussi les différents espaces de stockage, les requêtes/URL/journaux synthétiques, la CSP/XSS, les caches statiques, les sauvegardes, la fermeture complète et les quatre indicateurs iPhone.

L'évolution v4 est testée en téléchargeant seulement les fichiers statiques HTTPS du site avant publication (livraison `4045eeb`, script `assets/index-KWSBDyED.js`), puis en les servant à un profil de test isolé. Un article vendu avec ses frais et un export chiffré sont créés synthétiquement : nouvelle version activée sur la même origine de test, coffre comparé octet pour octet, module JS de la nouvelle version vérifié, ouverture, retour de secours v4, restauration du fichier ancien et offline. Un second contexte neuf vérifie le cas de première installation du worker. Aucun stockage ni e-mail de l'iPhone du propriétaire n'est lu ou modifié. Les empreintes des ressources publiques figurent dans la pièce de test `versions-statiques` ; aucune donnée comptable n'y figure.

Le premier téléchargement automatisé a nécessité le proxy/CA de l'environnement Cloud ; le test respecte ces paramètres sans ignorer TLS. Les tests Gmail gardent le worker bloqué uniquement pour l'interception des messages synthétiques ; les tests PWA utilisent le vrai worker. Navigateurs locaux installés dans `/tmp/vinted-browsers`, validation du cache système des bibliothèques désactivée pour cet environnement ; aucun test ignoré. La CI exécute à nouveau l'ensemble des 48 parcours de l'application, les 10 du lecteur et les 372 tests avant son étape de publication.

### Publication et récupération

Le dépôt public existant `alisurvinted-lgtm/Vinted-manager` (`1459243181`), la branche de production et les autorisations admin/push/Pages ont été vérifiés. Avant intégration, `main` est encore `4045eeb`, ancêtre de toutes les phases. L'intégration finale doit rester une avance rapide si cette situation ne change pas ; tout changement concurrent doit être examiné avant le push. Le workflow existant garde ses permissions limitées par job et `enablement: false` ; seule la sélection statique contrôlée est publiée.

La publication ne peut être déclarée réussie qu'après le succès du workflow du commit final et un contrôle HTTPS des ressources réellement servies à **https://alisurvinted-lgtm.github.io/Vinted-manager/**. Le compte rendu final fournit le commit et le lien du workflow effectivement observé ; les résultats locaux de cette section ne sont pas, seuls, une preuve de déploiement.

Procédure documentée dans [SECURITE.md](./SECURITE.md#mise-à-jour-et-récupération-sans-effacement) : export chiffré préalable, même phrase pour un coffre existant, reprise de migration sans effacer Safari, retour du code de secours v4 pour lecture/export seulement, puis retour à la version corrigée. Ne jamais revenir avant v4 ni abaisser la version IndexedDB. Une restauration nécessite la phrase de la sauvegarde et une confirmation ; elle revient à l'état du fichier, sans inventer les opérations ultérieures. Aucun reset destructeur ni récupération serveur ajouté.

### Risques résiduels et validation physique

Le chiffrement protège le stockage persistant, pas un appareil compromis, un script autorisé malveillant ou une mise à jour compromise pendant une session ouverte. Le SDK Google et les autres projets de la même origine GitHub Pages restent une frontière de confiance. L'effacement immédiat de toutes les copies mémoire ou de la flash n'est pas garanti ; les IV plus anciens reposent sur l'aléa cryptographique et le remplacement complet par une ancienne copie valide n'est pas détectable de façon fiable. Safari peut évincer le stockage. Pas de récupération garantie sans phrase ni sauvegarde déchiffrable. Les exports JSON/CSV classiques restent explicitement non chiffrés.

Google reçoit les échanges OAuth/Gmail nécessaires ; `gmail.readonly` couvre techniquement toute la boîte. Les jetons restent en mémoire et aucun contenu n'est envoyé à un analyseur tiers. Aucun secret client, tracker, serveur de données ou abonnement ajouté. GitHub Pages peut journaliser les accès aux fichiers statiques et ne permet pas tous les en-têtes de sécurité ; aucune protection absolue anti-iframe n'est revendiquée.

Le compte Google réel, les modèles réels d'e-mails, le geste d'installation, le retour OAuth et les téléchargements sur l'iPhone 15 physique restent à confirmer par le propriétaire. L'application reste gratuite pour le dépôt public et l'usage personnel prévu ; ces tests ne garantissent pas la permanence des politiques de Google/GitHub. Les limites de reconnaissance, d'association sans référence et d'estimations de gestion/fiscales restent décrites dans README/SECURITE.

---

## Phase 4 indépendante — parcours compact et tableau de bord, non déployée

Départ vérifié : `533d6ba71b782e6e331e2eba75ec9b16e088f52e` sur `feature/phase3-rapprochement`. Branche de cette phase : `feature/phase4-interface`, créée directement depuis ce commit. La phase 3 et `main` restent inchangées. Aucun déploiement ou travail de phase 5 n'est lancé.

### Changements livrés sur la branche

- Synchroniser Gmail devient l'action principale de l'accueil ; l'ajout manuel reste disponible juste après les quatre indicateurs. Résumé compact des achats détectés, annonces, ventes finalisées, opérations à actualiser, corrections et informations à compléter. Un événement ambigu n'est pas présenté comme une vente finalisée confirmée ; les coûts manquants d'une annonce/finalisation partageant la même référence ne sont pas comptés deux fois dans ce résumé.
- Opérations fiables préremplies et repliées par défaut, détails facultatifs dans le même écran ; anomalies visibles dans « À vérifier », annulations/remboursements dans leur section dédiée. Les notifications à examiner déjà conservées sont regroupées dans un volet à l'accueil. Aucun champ genre/catégorie obligatoire ajouté à l'import.
- Confirmation globale dans le même dialogue, avec lot figé uniquement en mémoire, nombre d'opérations comptables, éléments à vérifier conservés sans effet et coûts inconnus explicités. Retour possible sans écriture. L'enregistrement exige un second geste réel sur « Confirmer l'importation » ; le contrôle transactionnel et les versions d'articles de phase 3 restent appliqués. Le verrouillage, l'effacement des propositions du lecteur, une erreur d'analyse du lecteur ou de nouvelles propositions abandonnent cette confirmation temporaire. Les corrections financières gardent leur confirmation individuelle existante.
- Prix d'achat inconnu marqué « Prix d'achat à compléter », sans bloquer une vente encaissée. Le champ rapide existant est réutilisé dans la fiche article ; seul le coût manquant est modifié, dans une transaction, sur la dernière fiche disponible. Un coût déjà complété, y compris par une saisie concurrente, ne peut pas être remplacé par cette action. Dates, frais, références et corrections sont conservés. Aucun prix ni date inventés.
- Mois courant déterminé à Paris à l'ouverture ; bornes civiles réelles, y compris février bissextile, au lieu d'un jour fictif 31 pour l'attente en fin de mois. Navigation des mois conservée. Le bilan distingue nombre/montant en attente, ventes finalisées, stock actuel, capital actuel, achats du mois, coût des ventes, nettoyage/boost, bénéfice calculable et nombre de résultats inconnus. Le bénéfice total reste « Total à compléter » s'il est incomplet ; la part connue de l'accueil est explicitement marquée partielle. Comparaison et explications accessibles à la demande, graphique existant conservé.
- Identité visuelle conservée, boutons de navigation mensuelle et de fermeture de 44 px, titres de lignes bornés avec nom complet dans les détails, une seule zone principale de défilement. Espacements ajustés pour garder les quatre indicateurs au-dessus de la navigation, même avec le bénéfice partiel et une hauteur réduite. Zones de sécurité existantes conservées.

Le schéma IndexedDB v4, le format du coffre, les migrations, les sauvegardes, OAuth, les scopes, CSP et la configuration PWA sont identiques à la base. `src/lib/gmail-import.ts`, l'analyseur de phase 2 et les primitives cryptographiques ne changent pas. Les seules évolutions de stockage fonctionnel sont l'action atomique de complément d'un coût et l'utilisation des écritures déjà existantes après confirmation. Aucun contenu Gmail brut, jeton ou nouvelle donnée sensible persistante ajouté.

### Vérifications exécutées

| Contrôle ciblé                     | Résultat                                                                                                                                            |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tests unitaires                    | **188 réussis**, 7 fichiers ; **15 cas ajoutés** sur périodes, résultats incomplets et coût rapide                                                  |
| Parcours Gmail                     | **16 cas validés**, 8 Chromium et 8 WebKit ; dont 4 nouveaux scénarios exécutés dans les deux moteurs                                               |
| Parcours de non-régression UI/PWA  | **12 réussis**, 6 Chromium et 6 WebKit                                                                                                              |
| Total navigateur ciblé             | **28 cas validés**, dont **14 WebKit**                                                                                                              |
| Builds et TypeScript               | Application sous `/Vinted-manager/` et lecteur compilés avec succès                                                                                 |
| Contrôles des sources et artefacts | Sources, configuration du lecteur et build vérifiés ; 13 fichiers comptables statiques autorisés, aucun fichier de données comptables dans le build |

Les contrôles navigateur couvrent confirmation globale sans écriture préalable, retour, séparation des anomalies, corrections dédiées, absence de recette pour une annonce, bénéfice à compléter, complément depuis la fiche, absence de champs secondaires imposés, modification de la date estimée, changement de mois/année, conservation des corrections, verrouillage pendant la confirmation, réouverture, manifeste, fermeture complète et hors ligne. Un test a détecté un chevauchement de quelques pixels en hauteur réduite ; les espacements et l'en-tête compact ont été corrigés. Le contrôle WebKit du contenu et des boutons Gmail a été réexécuté après le dernier ajustement de texte : il passe. Le bilan des 28 cas correspond aux derniers résultats de chacun des cas ciblés, avec cette reprise ciblée, et non à une exécution de la suite complète du projet.

Commandes de validation :

```bash
npx vitest run tests/accounting.test.ts tests/monthly-report.test.ts tests/storage.test.ts tests/gmail-import.test.ts tests/automation.test.ts tests/vault.test.ts tests/crypto-backup.test.ts
npm run gmail:build
PAGES_BASE_PATH=/Vinted-manager/ npm run build
PAGES_BASE_PATH=/Vinted-manager/ npx playwright test e2e/gmail-import.spec.ts --workers=2
# Reprise du contrôle WebKit après le dernier ajustement d'en-tête :
PAGES_BASE_PATH=/Vinted-manager/ npx playwright test e2e/gmail-import.spec.ts --grep 'préremplissage, confirmation groupée' --project=webkit-iphone --workers=1
PAGES_BASE_PATH=/Vinted-manager/ npx playwright test e2e/v2.spec.ts e2e/app.spec.ts e2e/pwa.spec.ts --grep 'bilan mensuel|créer, recharger|PWA disponible|écran mobile|manifeste|fermeture complète' --workers=2
npm run verify:source
npm run gmail:verify
```

Messages et opérations exclusivement synthétiques, comptes OAuth simulés, profils temporaires. Les tests Gmail conservent le worker bloqué pour leur interception ; les tests PWA séparés utilisent le vrai worker. Dans cet environnement, `PLAYWRIGHT_BROWSERS_PATH=/tmp/vinted-browsers` et `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` sont utilisés pour les navigateurs installés ; aucun test ignoré. Vérification WebKit avec profil iPhone et dimensions additionnelles 393 × 852 et 393 × 659 ; cela ne remplace pas un essai sur iPhone 15 physique en mode PWA.

Limites : aucun accès aux véritables e-mails ni à la base du propriétaire ; aucun test de connexion Google avec son compte. Les limites de rapprochement de phase 3 restent applicables. Stock et capital sont explicitement la situation actuelle, même lorsqu'un ancien mois est consulté ; les ventes en attente sont présentées à la fin du mois choisi. Les tests et l'audit exhaustifs ainsi que la publication restent réservés à la phase 5. Le site en ligne ne contient pas ces modifications intermédiaires.

### Point de reprise pour la phase 5

Partir du commit final de `feature/phase4-interface` indiqué dans le bilan, descendant direct de `533d6ba`, sans revenir à `main`. Lire cette section, puis contrôler l'ensemble des phases cumulées : toutes les suites unitaires, navigateurs de l'application et du lecteur, audit des dépendances et de sécurité, artefact statique et cache. Garder les formats IndexedDB v4/coffre/sauvegardes et le chemin `/Vinted-manager/`.

Vérifier particulièrement la confirmation figée dans `GmailImport.tsx`, l'action `completePurchasePrice`, les bornes `monthRange`, les indicateurs partiels et les essais iPhone/hors ligne. Ensuite seulement, selon l'autorisation de phase 5, intégrer dans la branche de production, déclencher Pages et vérifier le workflow ainsi que le site réellement publié. Ne pas déduire un succès de déploiement des validations locales de cette phase. Prévoir une validation du parcours Google et de la PWA sur l'iPhone physique du propriétaire sans demander sa phrase secrète ni accéder à ses messages privés.

---

## Phase 3 indépendante — rapprochement et doublons, non déployée

Départ vérifié : `007bcc0e5ffb40be54074955a0455898579b0f81` sur `feature/phase2-filtrage-extraction`. Le travail de phase 3 est conservé sur `feature/phase3-rapprochement`, issue directement de ce commit. La branche de phase 2 et `main` restent inchangées ; aucun workflow de publication n'est lancé.

Un seul fichier exécuté change : `src/lib/gmail-import.ts`. Les tests de `tests/automation.test.ts` sont enrichis ; ce document constitue le point de reprise. Aucun changement d'interface, de dépendance, d'OAuth, de protocole de transfert, de calcul de cotisations, de schéma IndexedDB v4 ou de format cryptographique/sauvegarde.

- Références d'achat et de revente cloisonnées, y compris pour les anciennes clés d'étape. Une référence d'achat ne vend pas automatiquement ce bien. Les associations manuelles fiables conservent désormais la référence du côté concerné pour les synchronisations suivantes.
- Titres normalisés (accents, espaces et ponctuation), montants et dates utilisés comme indices de vérification seulement, jamais comme preuve suffisante. Deux achats portant le même titre, prix et date mais des références d'achat distinctes restent deux acquisitions. Deux articles partageant une référence exigent une vérification.
- Rapprochement recalculé au moment de l'écriture transactionnelle, pour les notifications du même lot et les aperçus devenus anciens. Les dépendances achat / annonce / encaissement sont traitées avant les corrections, sans changer leurs dates comptables. Une annonce et sa finalisation produisent une seule vente, même entre deux mois ou années et dans l'ordre de réception inverse.
- Détection par source, événement ou référence de la même étape. Les alias de notification sont conservés dans le suivi chiffré et restaurés par la sauvegarde v3 existante. Une copie de l'événement d'origine n'écrase pas un nom, un coût, une date, un prix ou des frais corrigés manuellement. Des dates de réception estimées différentes ne créent pas une seconde vente ; deux dates explicites contradictoires nécessitent une vérification.
- Coût absent toujours `null`, chiffre d'affaires confirmé conservé et bénéfice indéterminé. Un reçu retrouvé ultérieurement peut compléter un coût inconnu après association manuelle, sans créer un deuxième achat ni remplacer un coût connu.
- Annulations et remboursements restent dans le parcours de confirmation dédié. Pas de retour automatique en attente après annulation, ni d'effacement d'un encaissement par une simple annulation. Les remboursements partiels distincts restent possibles, même avec une ancienne clé d'étape partagée ; une répétition montant/date doit être vérifiée ou explicitement confirmée distincte. Le rôle achat/vente ne peut pas contredire une référence non ambiguë. Un remboursement explicitement antérieur à la transaction est refusé.
- Une correction non résolue liée à la transaction empêche sa validation automatique. Un article archivé ou une référence historique sans article disponible n'est pas recréé ou revendu automatiquement. Aucun corps Gmail brut, adresse ou jeton supplémentaire conservé.

| Contrôle ciblé                                | Résultat exécuté                                                                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tests unitaires                               | **244 réussis**, 7 fichiers ; **37 nouveaux cas** dans la suite d'automatisation                                                                 |
| Dont import / rapprochement / comptabilité    | **81 réussis**, `tests/gmail-import.test.ts` et `tests/automation.test.ts`                                                                       |
| Non-régression analyse et lecture Gmail       | **118 réussis**                                                                                                                                  |
| Non-régression coffre, sauvegarde et stockage | **45 réussis**                                                                                                                                   |
| Parcours intégrés Gmail                       | **8 réussis**, 4 Chromium et 4 WebKit iPhone                                                                                                     |
| TypeScript / builds                           | Application et lecteur compilés sous les chemins Pages existants                                                                                 |
| Sources et artefacts                          | Vérifications des sources et du lecteur réussies ; 13 fichiers statiques comptables autorisés, aucun fichier de données comptables dans le build |

Commandes exécutées :

```bash
npx vitest run tests/gmail-import.test.ts tests/automation.test.ts tests/gmail-analysis.test.ts tests/gmail-prototype/preview.test.ts tests/vault.test.ts tests/crypto-backup.test.ts tests/storage.test.ts
npm run gmail:build
PAGES_BASE_PATH=/Vinted-manager/ npm run build
PAGES_BASE_PATH=/Vinted-manager/ npx playwright test e2e/gmail-import.spec.ts --workers=2
npm run verify:source
npm run gmail:verify
```

Les tests utilisent exclusivement des opérations synthétiques, une base isolée et des réponses Google simulées. Les tests navigateur gardent leur configuration existante : service worker bloqué uniquement dans ces tests d'interception Gmail, validation du cache système des bibliothèques désactivée dans cet environnement ; aucun test ignoré. La suite complète, les essais PWA séparés et le vrai compte Gmail n'ont pas été relancés dans cette phase. Aucun accès ni modification aux données de l'iPhone du propriétaire.

Limites : le protocole actuel ne fournit pas d'identifiant d'article Vinted distinct et vérifié ni de champs marque/taille structurés ; ces éléments du titre restent des indices manuels. Sans référence commune, achat et revente ne sont pas fusionnés automatiquement. Les corrections financières ambiguës, les lots et les références manquantes restent à confirmer. Une ancienne sauvegarde dépourvue de suivi ne permet pas de reconstituer les identifiants perdus. La compatibilité du nouveau rapprochement sur l'iPhone physique et ses véritables modèles de messages reste à vérifier lors de la validation finale.

### Point de reprise pour la phase 4

Partir du commit de fin de phase 3 sur `feature/phase3-rapprochement` (hash indiqué dans le bilan), descendant de `007bcc0`, sans revenir à `main`. Réutiliser `reconcile`, `possibleMatches` et les écritures atomiques de `importVerified` ; le suivi `imports` reste dans le coffre et dans les sauvegardes v3. Les champs d'achat inconnus restent `null` et les références d'achat/revente restent séparées.

La phase 4 pourra examiner `src/components/GmailImport.tsx` et les composants du tableau de bord, avec `src/lib/accounting.ts` et les tests associés, pour simplifier les gestes et la présentation sans modifier le chiffrement, les données existantes ou les règles de rapprochement. Conserver les quatre indicateurs iPhone et distinguer attente, encaissement et bénéfice incomplet. Ne pas lancer la phase 5 ou un déploiement intermédiaire automatiquement.

---

## Phase 2 indépendante — filtrage et extraction Gmail, non déployée

Base : `4045eeba6f082fd8facf56c0c76702382ccfbf29`. Branche de travail : `feature/phase2-filtrage-extraction`. Cette section décrit des changements préparés sur la branche dédiée, pas la version actuellement en ligne. Aucune modification de `main` ni aucun déploiement demandé pour cette phase.

Un seul fichier de code exécuté change : `prototypes/gmail-oauth/analyze.ts`. Le filtrage existant avant lecture du corps et la chaîne `analyzeNotification → proposedRow.analysis → proposalSelection` sont réutilisés. Aucun nouveau stockage, réseau, scope, format de protocole ou mécanisme OAuth.

- Objets des trois familles utiles reconnus en début d’objet ; les citations dans une notification sans intérêt comptable ne suffisent plus. Bordereaux annulés et offres commerciales ne deviennent pas des corrections financières. Les demandes de confirmation sont écartées ; une confirmation de paiement déjà acquise n’est pas confondue avec une action à effectuer. Les véritables annulations/remboursements restent des candidats dédiés, à rattacher à une transaction lors de la phase 3.
- Montant payé prioritaire sur les autres totaux d’un reçu ; frais de port/protection conservés séparément sans addition supplémentaire. Un total payé contradictoire, négatif ou invalide reste à vérifier ; aucune substitution par zéro.
- Versements réellement effectués vers le porte-monnaie **ou le solde Vinted** reconnus, avec contrôle des montants concurrents. Un solde global, un versement futur, une négation, un montant tronqué ou un crédit de remboursement ne suffit pas à confirmer une vente.
- Dates propres à l’événement prioritaires, puis date explicite de transaction, puis réception Gmail estimée en Europe/Paris. Dates françaises, premier du mois et horodatages ISO avec fuseau pris en charge. Dates impossibles ou contradictoires à vérifier. Un mois de réception ne remplace pas le mois réel de transaction.
- Nom, prix inconnu nullable, références hachées et indicateur de date estimée transmis par le protocole existant. Aucun corps Gmail brut supplémentaire persisté. Aucune modification du rapprochement, des calculs ou de l’interface.

| Contrôle ciblé                           | Résultat exécuté                                                                                            |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Tests unitaires analyse et lecture Gmail | **118 réussis**, dont 48 cas ajoutés ; 70 tests de référence conservés                                      |
| Parcours intégrés Gmail                  | **8 réussis**, Chromium et WebKit iPhone                                                                    |
| Parcours du lecteur Gmail                | **10 réussis**, Chromium et WebKit iPhone                                                                   |
| TypeScript et builds                     | Application sous `/Vinted-manager/` et lecteur compilés avec succès                                         |
| Conservation de la phase 1               | Fichiers du coffre, IndexedDB v4, migration, sauvegardes, OAuth, CSP et service worker identiques à la base |

Messages exclusivement synthétiques, profils temporaires et réponses Google simulées. Aucun accès au compte ni aux données réelles du propriétaire. La suite complète du projet n’a pas été relancée : les contrôles portent sur les fichiers et parcours concernés. Les tests des fonctions de rapprochement existantes servent uniquement de vérification de non-régression, sans développement de phase 3.

Limites : reconnaissance de formulations françaises explicitement prises en charge, sans certification de tous les modèles officiels Vinted. Un modèle inconnu, une ambiguïté ou une contradiction reste à vérifier. L’iPhone physique, la boîte réelle et le déploiement de cette branche ne sont pas validés dans cette phase.

### Point de reprise pour la phase 3

Partir du commit de fin de phase 2 sur `feature/phase2-filtrage-extraction` (hash fourni dans le bilan), issu de `4045eeb`. Conserver le coffre v1, IndexedDB v4, les sauvegardes et OAuth sans réécriture.

Utiliser les sorties de `proposalSelection` : `sourceKey`, `eventKey`, `referenceKey`, `relatedKeys`, `kind`/`detectedKind`, `confirmed`/`confidence`, montants en centimes éventuellement `null`, `date` et `dateEstimated`. Le parcours actif utilise `analysis`, pas les anciens champs manuels de `PreviewPanel`.

Examiner ensuite `src/lib/gmail-import.ts` et ses tests pour consolider les rapprochements entre notifications et articles existants : références fiables avant noms, annonce/finalisation de part et d’autre d’un mois ou d’une année, répétition de synchronisation, articles homonymes et conservation des corrections manuelles. Les annulations/remboursements ne doivent pas être appliqués sur la seule reconnaissance d’un objet ou d’un montant. Ne pas modifier les phases 4/5 ou déployer automatiquement cette branche.

---

## Livraison du 25 novembre 2026 — coffre actif et automatisation Gmail

Cette section décrit la livraison actuelle ; les sections suivantes sont des états historiques et ne décrivent pas le stockage actuel. Aucun accès aux données du propriétaire ni à ses e-mails réels. Les données de test sont synthétiques, dans des profils de navigateur temporaires.

| Contrôle            | Résultat local exécuté                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Tests unitaires     | **272 réussis**, 13 fichiers                                                                                                         |
| Parcours intégrés   | **36 réussis**, 18 Chromium et 18 WebKit iPhone                                                                                      |
| Lecteur Gmail       | **10 réussis**, 5 Chromium et 5 WebKit iPhone                                                                                        |
| Dépendances         | Audit complet npm : **0 vulnérabilité connue signalée**                                                                              |
| TypeScript / builds | Application et lecteur compilés sous leurs chemins Pages                                                                             |
| Sources / artefacts | Liste fermée ; 13 fichiers comptables + 4 fichiers du lecteur ; aucun export, secret ou marqueur de données de test dans les bundles |

Les tests couvrent le coffre AES-256-GCM, clé non extractible, PBKDF2 600 000, authentification des métadonnées, collision d’IV refusée, mauvais secret, altération, absence de clair dans les quatre tables historiques, paramètres/historique/imports chiffrés, écriture transactionnelle et refus d’écriture concurrente ou tardive après verrouillage. Les anciennes bases v1/v2/v3 et sauvegardes v1/v2 restent compatibles. Une migration interrompue conserve le clair jusqu’au contrôle puis reprend ; si une ancienne fenêtre a modifié le contenu, une copie chiffrée de récupération est gardée.

Les scénarios comptables vérifient TTC prioritaire sans double frais, annonces sans CA, crédit final rapproché dans les deux ordres et entre deux mois, prix d’achat inconnu, lots répartis explicitement, remboursements partiels/successifs, retour physique en stock sans nouvelle acquisition et absence de doublon. Les périodes utilisent Europe/Paris, avec changement d’année et d’heure. Le complément d’un coût inconnu recalcule les résultats et les coûts manquants du même bien retourné.

Gmail est simulé : scopes stricts, expéditeur/domaine/authentification, trois catégories pertinentes, bordereaux et messages personnels exclus avant lecture du corps, MIME/HTML inerte, montants contradictoires, dates estimées et invalides, références ambiguës, pagination plafonnée avec reprise, source connue non relue, expiration, erreur réseau et révocation. Un test a révélé un texte de détail restant affiché après révocation ; ce défaut a été corrigé et le test passe. Aucun corps, objet, adresse ou jeton n’est persisté.

Les navigateurs vérifient la confirmation groupée depuis la page comptable, les corrections séparées, l’annulation sans écriture, le complément rapide du coût, la conservation après fermeture complète, le rechargement verrouillé, la migration interrompue, les sauvegardes chiffrées, CSP/XSS, absence de fuite dans les requêtes synthétiques et caches, ainsi que le mode hors ligne après déverrouillage. Les tests Gmail interceptés bloquent les service workers dans leur contexte ; les parcours PWA séparés gardent le vrai worker.

### Vérification physique et limites

La connexion/révocation Safari et PWA antérieure a été rapportée par le propriétaire. Les nouveaux parcours complets utilisent des OAuth et messages synthétiques : ils ne prouvent pas la compatibilité de tous les modèles réels Vinted ni le retour OAuth du nouvel écran sur l’iPhone du propriétaire. Le propriétaire doit créer sa phrase sur son appareil pour migrer sa propre base, puis essayer une synchronisation réelle. Aucune migration à distance de son iPhone n’est revendiquée.

Le chiffrement au repos ne protège pas une session ouverte contre un appareil, un SDK ou une mise à jour compromis. Aucune biométrie n’est activée, aucune destruction physique de l’ancien clair ou des copies mémoire n’est garantie. GitHub Pages ne permet pas tous les en-têtes de sécurité et partage l’origine entre projets du même compte. Détails dans [SECURITE.md](./SECURITE.md).

### Publication

La livraison applicative `f11cbd3` a été publiée par [GitHub Actions 45626575176](https://github.com/alisurvinted-lgtm/Vinted-manager/actions/runs/45626575176) : **configure, build et deploy réussis**. Les journaux confirment **272 tests unitaires, 36 parcours intégrés et 10 parcours Gmail réussis**, audit npm sans vulnérabilité connue signalée.

Après publication, les **17 fichiers statiques** ont tous répondu HTTP 200 en HTTPS et leurs empreintes SHA-256 correspondent aux fichiers locaux vérifiés : HTML, JavaScript, CSS, manifestes, service worker, Workbox et icônes. Adresse conservée : **https://alisurvinted-lgtm.github.io/Vinted-manager/**.

Sur cette version publiée, WebKit au format iPhone a vérifié, dans une base temporaire : création et déverrouillage du coffre, absence de données comptables en clair dans IndexedDB, export chiffré, refus d’une mauvaise phrase, restauration, accès hors ligne et conservation après fermeture complète puis relance. Le trafic du parcours comptable ne contient que les ressources statiques du site, sans article ni phrase transmise.

Un second parcours publié, avec OAuth et e-mails entièrement synthétiques, a confirmé les achats TTC préremplis, le rapprochement annonce/finalisation dans un même lot, la confirmation groupée, le coût inconnu signalé puis complété, les bénéfices recalculés et l’absence de doublons lors d’une nouvelle synchronisation. Le contrôle de lisibilité porte sur les textes et boutons visibles au-dessus des actions fixes, avec des cibles tactiles de 44 pixels, et non sur les marges vides des cartes.

Le vrai SDK Google a aussi ouvert puis fermé son écran d’identifiant sous WebKit sans saisir de compte, donner de consentement ni lire d’e-mail. Cela ne valide pas le retour OAuth complet sur l’iPhone du propriétaire. L’écran de création de phrase et la migration des données de **son** appareil restent à effectuer par lui ; aucune intervention distante sur ses données réelles n’est revendiquée.

La présente mise à jour du rapport ne modifie aucun fichier applicatif. Les preuves portent sur la livraison applicative ci-dessus.

---

# Historique des validations antérieures

## Livraison du 25 novembre 2026 — import Gmail confirmé, phase 3

Périmètre autorisé : enregistrer les transactions explicitement vérifiées, avec confirmation finale, détection des doublons et coûts d’achat inconnus signalés. Aucun e-mail réel n’a été consulté par l’agent. Les jetons, messages, objets et adresses ne sont pas persistés ; seuls les champs comptables confirmés et les empreintes de suivi rejoignent la base locale existante.

| Contrôle                              | Résultat exécuté                                                                                                                       |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Tests unitaires                       | **205 réussis**, dix fichiers                                                                                                          |
| Parcours comptables et import intégré | **28 réussis**, quatorze Chromium et quatorze WebKit iPhone                                                                            |
| Parcours du module Gmail séparé       | **10 réussis**, cinq Chromium et cinq WebKit iPhone                                                                                    |
| TypeScript et builds                  | Réussis pour les deux pages, sous les chemins Pages attendus                                                                           |
| Publication                           | 83 sources sélectionnées, 13 fichiers statiques comptables et quatre de module Gmail ; aucun export ou donnée de test dans les bundles |
| Audit npm complet                     | **0 signalement**, aucune dépendance ajoutée                                                                                           |
| Formatage et contrôles de sources     | Réussis                                                                                                                                |

Les nouveaux tests couvrent la migration additive d’une base v2 vers v3 sans modification des anciens articles/frais/réglages, la conservation des anciens schémas et sauvegardes, les centimes et cotisations, un coût/date d’achat inconnu, la distinction achat du mois/coût de vente, les annonces, remboursements et annulations sans effet automatique, les doublons par message/référence, les lots ambigus et la concurrence. Une erreur dans le lot annule toutes les écritures. Le rattachement préserve les frais et coûts existants ; une vente manuelle déjà présente n’est pas comptée une seconde fois.

Le parcours navigateur utilise un fournisseur OAuth et des messages exclusivement synthétiques. Il vérifie l’absence d’écriture avant confirmation, l’annulation du dialogue, l’enregistrement local hors ligne, le CA/cotisations avec bénéfice inconnu, la persistance, le réimport, le complément du prix d’achat et la mise à jour du bénéfice. Les transferts de fenêtre étrangère ou avec un mauvais nonce sont refusés. Un test a été corrigé pour attendre la fin de l’enregistrement avant de recharger ; la suite complète passe ensuite dans les deux moteurs. Les tests existants de chiffrement, mauvaise phrase, altération, restauration, CSP, cache et fermeture complète restent actifs.

Les parcours OAuth/Gmail simulés bloquent le worker dans leur seul contexte de test pour empêcher qu’il contourne les interceptions réseau. Les parcours PWA, hors ligne et de persistance séparés utilisent le vrai worker.

Un essai anonyme WebKit séparé a chargé le vrai SDK Google dans la frame intégrée, ouvert la page Google de saisie d’identifiant puis fermé la fenêtre sans compte, consentement ou lecture Gmail. Cela ne prouve pas le retour OAuth complet dans ce nouveau parcours sur iPhone physique. Le propriétaire a confirmé les étapes antérieures de connexion et d’aperçu ; le nouveau parcours reste à essayer par lui.

La page comptable conserve `connect-src 'none'`, sans SDK Google dans son bundle ; sa CSP ajoute uniquement le chemin HTTPS exact de la frame. Le transfert mémoire n’accepte que les champs normalisés connus. Une frame de même origine ne fournit pas d’isolation cryptographique contre le SDK tiers lui-même. La base locale active reste non chiffrée par l’application, les sauvegardes restent AES-256-GCM/PBKDF2 à 600 000 itérations. Le format interne v2 conserve le suivi ; les anciennes sauvegardes v1 complètes restent restaurables après confirmation et avertissement.

Le commit `ee32bb1` a été publié avec succès par [Actions 45533905127](https://github.com/alisurvinted-lgtm/Vinted-manager/actions/runs/45533905127), puis vérifié en HTTPS. Un parcours WebKit iPhone sur les fichiers réellement publiés, avec OAuth/Gmail entièrement simulés et une base temporaire, a confirmé l’enregistrement après confirmation, les trois résultats financiers, la persistance et l’absence de messages/jetons dans la base. Un second parcours publié a vérifié export chiffré, refus de mauvaise phrase, restauration, hors ligne et fermeture complète. Le vrai SDK a aussi ouvert la page Google d’identifiant depuis l’import intégré, sans compte ni consentement. Le nouvel accord OAuth complet sur l’iPhone du propriétaire reste à confirmer. Le correctif suivant ne modifie que l’isolation des tests et ce rapport, sans changement de code exécuté par l’utilisateur.

## Historique — aperçu Gmail phase 2

Périmètre approuvé : recherche manuelle et aperçu corrigible, uniquement en mémoire. Aucun import comptable, aucune migration ou écriture en base. Les fichiers `src/`, `public/`, le schéma IndexedDB et les modules de sauvegarde/chiffrement sont identiques à la phase 1 publiée. Le JS comptable reste `index-CaOfr5xX.js` et son CSS `index-jVtMB30o.css`.

| Contrôle                                     | Résultat exécuté                                                                                                |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Tests unitaires                              | **178 réussis**, neuf fichiers                                                                                  |
| Tests navigateur comptables                  | **24 réussis**, douze Chromium et douze WebKit iPhone                                                           |
| Tests navigateur Gmail simulés               | **10 réussis**, cinq Chromium et cinq WebKit iPhone                                                             |
| TypeScript / builds application et prototype | Réussis sous `/Vinted-manager/` et `/Vinted-manager/gmail-prototype/`                                           |
| Sélection source et artefact                 | 76 sources autorisées ; 13 fichiers statiques comptables et quatre de prototype ; aucun fichier local comptable |
| Audit npm complet et production              | **0 signalement** dans les deux audits du 25 novembre                                                           |
| Formatage                                    | Vérifié avec Prettier                                                                                           |

Les tests Gmail emploient exclusivement des notifications synthétiques et un fournisseur OAuth simulé. Ils vérifient la sélection stricte des expéditeurs, les cas d’authentification absente/ambiguë, le refus de lire les corps personnels ou non reconnus, la lecture bornée, le décodage MIME/en-têtes, le HTML rendu inerte sans requête d’image, les erreurs et expirations, les réponses tardives, les doublons et références communes. Les bornes de mois utilisent le fuseau local et des secondes Unix, y compris changement d’année et d’heure.

Le parcours navigateur de phase 2 conserve un article synthétique et sa version de base existante à l’identique après lecture, correction, révocation et rechargement. Les coûts et dates absents restent vides, les corrections du premier lot sont conservées en chargeant la suite, puis effacées à la révocation. Aucun message ou jeton n’apparaît dans le stockage Web et aucun contenu synthétique n’est envoyé dans les URL ou corps de requêtes. Les tests comptables couvrent toujours la sauvegarde AES-256-GCM, le refus des mauvaises phrases/altérations, la restauration, la persistance après fermeture complète et le hors ligne.

Le propriétaire a confirmé sur son iPhone la connexion Safari/PWA et la révocation de **phase 1**. L’agent n’a lu aucun e-mail réel. Les modèles réels de notifications, leur couverture et leur sens comptable ne sont pas déclarés validés. Le prototype ne peut pas déterminer automatiquement une vente définitive ni dédupliquer avec la comptabilité existante dans cette phase. Les limites de confidentialité et d’origine partagée sont documentées dans [le rapport du prototype](./prototypes/gmail-oauth/README.md).

Le résultat du déploiement doit être vérifié sur le workflow du commit puis en HTTPS. Les résultats locaux ne suffisent pas à déclarer une publication. Le compte rendu de livraison indique le résultat effectivement observé.

## Historique — validation V2 du 16 novembre 2026

Contrôles exécutés le **16 novembre 2026**, sous Linux Codex avec Node.js **24.22.1**.

## Résultats réellement exécutés

| Contrôle                                          | Résultat                                                                                                                                        |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Vérification du code et sélection de publication  | 54 fichiers sources autorisés ; pas de signature de secret détectée ; pas d’API réseau ou d’exécution HTML/JS dynamique dans le code applicatif |
| Vitest 5.1                                        | **95 tests réussis**, 6 fichiers                                                                                                                |
| TypeScript strict                                 | Réussi avec `tsc -b`                                                                                                                            |
| Build Vite / PWA                                  | Réussi sous **`/Vinted-manager/`**                                                                                                              |
| Contrôle de l’artefact statique                   | **13 fichiers autorisés**, environ 465 Kio précachés ; aucun export, profil de navigateur ou fichier de données                                 |
| Playwright Chromium                               | **11 tests réussis**                                                                                                                            |
| Playwright WebKit au format iPhone 13             | **11 tests réussis**                                                                                                                            |
| Audit npm des dépendances de production déclarées | **0 signalement** avec `--omit=dev`                                                                                                             |
| Audit npm complet                                 | **0 critique, élevé ou modéré ; 4 faibles** dans la même chaîne de compilation liée à deepmerge                                                 |

Commandes exécutées sur les sources finales (les étapes de `npm run check`) :

```bash
npm run verify:source
npm test
PAGES_BASE_PATH=/Vinted-manager/ npm run build
PAGES_BASE_PATH=/Vinted-manager/ npm run test:e2e -- --workers=2
```

Dans cet environnement uniquement, les navigateurs étaient installés dans `/tmp/vinted-browsers` et le contrôle préalable du cache système `ldconfig` était désactivé après fourniture locale des bibliothèques manquantes. **Aucun test navigateur n’a été ignoré**. Sur un poste habituel, installer les navigateurs avec `npx playwright install --with-deps chromium webkit`.

## Tests de confidentialité et d’intégrité

- Chiffrement AES-256-GCM et déchiffrement correct de la sauvegarde complète, frais, paramètres et historique compris.
- Déchiffrement indépendant par Node/OpenSSL avec PBKDF2-SHA-256 à 600 000 itérations, clé de 32 octets, IV de 12 octets et tag de 16 octets.
- Sel, IV et texte chiffré différents à chaque export du même contenu.
- Refus d’une mauvaise phrase, d’un texte chiffré, sel ou IV altéré ; aucune écriture en base lors de ces échecs.
- Refus des paramètres de dérivation affaiblis ou excessifs, versions inconnues, champs supplémentaires, encodages invalides, tag tronqué et fichiers trop grands.
- Restauration complète et transactionnelle ; annulation d’une erreur d’écriture sans effacer l’ancien contenu.
- Avertissements explicites et confirmation pour les anciens JSON en clair ; téléchargement et restauration vérifiés dans les deux moteurs.
- Phrase absente d’IndexedDB, de localStorage/sessionStorage, des requêtes et des journaux pendant les parcours testés. Les champs sont vidés après une tentative cryptographique.
- Observation des requêtes : uniquement des GET de ressources statiques du site, aucun article ni phrase dans les URL, corps ou en-têtes des parcours testés.
- CSP effectivement appliquée : connexion fetch refusée et script inline injecté bloqué dans Chromium et WebKit.
- Nom contenant du HTML rendu comme texte ; aucune image ou exécution injectée.
- Cache Service Worker constitué de ressources locales statiques ; aucun JSON comptable, CSV, fichier `.vmbackup`, archive ou source map.

Les données de test sont **entièrement synthétiques**, avec des marqueurs dédiés. Aucune donnée réelle d’un utilisateur n’est utilisée dans les tests, captures, journaux ou profils de test.

## Tests de gestion et PWA

Création, modification, vente, retour en stock, suppression avec confirmation, frais multiples, bénéfices et pertes, cotisations à 12,3 %, centimes exacts, CA par mois de vente, exclusion des invendus et modification de date sont couverts.

La recherche, les filtres, les douze mois de statistiques, l’absence de débordement mobile, les quatre indicateurs visibles au-dessus de la navigation iPhone, la persistance après rechargement et après **fermeture complète puis relance du navigateur** passent.

Le manifeste, son `start_url`, son `scope`, les icônes Apple/manifest, le script et la portée du worker sont vérifiés sous `/Vinted-manager/`. Le rechargement et l’ajout d’articles sans réseau sont testés après le premier chargement complet.

## Contrôles négatifs des fichiers publiés

Les contrôles de publication ont été volontairement soumis à :

- un JSON, un CSV et un fichier `.vmbackup` ajoutés à `dist/` ;
- un fichier JS contenant un marqueur synthétique de données privées dans le build ;
- une signature synthétique de token dans un fichier source temporaire.

Tous ont été **refusés**. Les fichiers temporaires ont été retirés et les contrôles normaux passent de nouveau. Ces vérifications ne remplacent pas une revue humaine et ne détectent pas tous les secrets possibles ; les fichiers réellement sélectionnés ont aussi été inspectés par leur rôle et leur contenu source.

## Tests spécifiques V2

- Achat en décembre 2025 et vente en janvier 2026 : le coût d’acquisition et les frais apparaissent dans le bilan de vente, l’achat TTC dans le mois d’achat ; le stock ne crée aucun CA/bénéfice.
- Séparation de plusieurs boosts et du nettoyage, changement de date de vente, modification du taux, mois vides, moyennes, écarts et absence de pourcentages trompeurs.
- Changement d’année, limites de dates, historique cliquable et sélection de mois dans le graphique. Une année contenant uniquement un achat est disponible dans les statistiques.
- Ancienne base v1 réouverte/migrée par le schéma existant v2 : articles, vente, frais, taux et historique conservés après calculs et sélections répétées de fichiers.
- Base navigateur existante conservée à l’identique après changement de mois/année, consultation des bilans, sélection de fichiers refusés et rechargement hors ligne, dans les deux moteurs.
- Registre de formats Vinted pris en charge vide. Fichiers incomplets, HTML actif, ZIP corrompu, CSV de remboursements/annulations, fichier trop grand et sélection répétée refusés **sans lire le contenu ni écrire en base**. Absence de contenu de fichier dans les requêtes observées.

Ces refus ne prouvent pas un futur analyseur : aucun import de transactions Vinted n’est actuellement activé. L’aperçu, la correction et la détection métier des doublons attendent une structure officielle réelle vérifiée, comme expliqué dans [VINTED_IMPORT.md](./VINTED_IMPORT.md).

La V2 ne change ni le nom ni le schéma v2 d’IndexedDB, ni les formats des sauvegardes. Les modules de base, validation métier et chiffrement ne sont pas modifiés. Les tests de sauvegarde chiffrée et de migration restent actifs.

## Dépôt et état du déploiement

Le dépôt vérifié est **[alisurvinted-lgtm/Vinted-manager](https://github.com/alisurvinted-lgtm/Vinted-manager)**, public, identifiant stable **1459243181**, branche **main**. Aucun second dépôt n’est créé.

Pages est configuré avec `build_type: workflow` et HTTPS. L’URL réelle conserve la casse : **https://alisurvinted-lgtm.github.io/Vinted-manager/**. Le workflow lit le site existant avec `enablement: false` et `pages: read`, sans tentative de création exigeant une permission d’administration. Les contrôles d’identité du dépôt, de visibilité et de chemin restent actifs.

La version précédant la V2 a été publiée avec succès par [cette exécution Actions](https://github.com/alisurvinted-lgtm/Vinted-manager/actions/runs/43786561985) et vérifiée en HTTPS, WebKit iPhone, hors ligne, après redémarrage du navigateur et par export/restauration chiffrée. Ce lien concerne cette version précédente, pas la publication V2.

La publication V2 est déclenchée par le push de ces sources sur `main`. Son résultat doit être contrôlé dans [le workflow du dépôt](https://github.com/alisurvinted-lgtm/Vinted-manager/actions/workflows/deploy-pages.yml), puis sur le site ; les résultats locaux ci-dessus ne suffisent pas à revendiquer une publication. Le compte rendu final précise l’exécution et la vérification du site de cette livraison.

## Limites

- IndexedDB active n’est **pas chiffrée par l’application**. Le chiffrement concerne les fichiers de sauvegarde.
- La conservation et la confidentialité locales dépendent de l’iPhone, de Safari, des profils/extensions et des sauvegardes système ; aucune sécurité absolue n’est garantie.
- Une phrase oubliée ne peut pas être récupérée. Les chaînes JavaScript ne peuvent pas toutes être effacées immédiatement de la mémoire avec certitude.
- Les tests WebKit ne remplacent pas le geste d’installation sur un iPhone physique, les réglages Fichiers/iCloud ou le clavier natif.
- Le site statique et ses mises à jour restent un code de confiance. Une CSP meta sur Pages n’offre pas tous les en-têtes serveur, notamment `frame-ancestors`.
- Les parcours testés ne constituent pas une preuve d’absence de fuite pour tout état futur du code ou de l’appareil.
- Les 4 avis npm faibles restants et les limites de GitHub Pages sont détaillés dans [SECURITE.md](./SECURITE.md).
