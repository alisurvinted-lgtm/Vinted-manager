# Vinted Manager

Application personnelle en français pour gérer achats, stock, ventes et bénéfices estimés, sur iPhone et ordinateur. Sans abonnement, serveur de données, publicité, API Vinted ou télémétrie. Aucun article de démonstration n’est inséré.

Adresse conservée : **https://alisurvinted-lgtm.github.io/Vinted-manager/** (V majuscule). Les preuves de livraison figurent dans [VALIDATION.md](./VALIDATION.md).

## Première ouverture après la mise à jour

Si un coffre existe déjà, **déverrouillez-le avec votre phrase habituelle** : le schéma v4 et son format chiffré sont conservés. La création d’une phrase est réservée à une première utilisation ou à la protection d’anciennes données en clair. Dans ce cas, choisissez une **phrase secrète d’au moins 16 caractères**, de préférence cinq mots aléatoires, puis confirmez l’avertissement. Ne la communiquez à personne. Elle protège la base locale active, pas seulement les sauvegardes.

Si des données anciennes sont détectées, une sauvegarde chiffrée préalable est proposée. La migration vérifie la copie chiffrée avant de vider les anciens enregistrements en clair. Une interruption peut être reprise avec la même phrase. **N’effacez pas les données Safari et ne désinstallez pas l’application pour réparer une migration.** Fermez les anciens onglets avant de commencer.

La perte de la phrase peut rendre le coffre irrécupérable. Aucun service, e-mail ou code PIN ne permet de la récupérer. Conservez-la séparément de vos sauvegardes. Une sauvegarde exportée avec une autre phrase conserve sa propre protection.

## Utilisation sur iPhone

1. Ouvrez l’adresse ci-dessus dans Safari, en navigation normale. **Partager → Sur l’écran d’accueil → Ajouter** ; activez « Ouvrir en tant qu’app » si proposé.
2. Déverrouillez votre espace. Touchez **Ajouter un article**, ou **Synchroniser Gmail** pour préparer des opérations.
3. Consultez les quatre indicateurs principaux, puis le bilan et la comparaison mensuelle. Les mois civils et dates proposées utilisent **Europe/Paris**, même si l’appareil est réglé autrement.
4. Exportez régulièrement une sauvegarde chiffrée depuis **Paramètres**.

Le bouton **Verrouiller**, le rechargement et la fermeture abandonnent les références en mémoire. L’inactivité verrouille après cinq minutes par défaut (paramétrable à 1, 5 ou 15 minutes). Le passage en arrière-plan dispose de 30 secondes ; une autorisation Google en cours a une grâce limitée à cinq minutes, sans dépasser le délai d’inactivité. Le retour tardif impose un nouveau déverrouillage. JavaScript/iOS peuvent suspendre les temporisateurs : les échéances absolues sont aussi vérifiées à la reprise.

Après le premier chargement complet et la création du coffre, les fonctions comptables locales restent accessibles **hors ligne après déverrouillage**. Gmail nécessite Internet. Les mises à jour du service worker demandent une actualisation et ne réinitialisent pas IndexedDB. Avant une mise à jour importante, exportez une sauvegarde chiffrée et fermez les autres fenêtres de l’application. Enregistrez les formulaires ouverts avant d’actualiser.

## Synchroniser Gmail

L’intégration officielle existante est réutilisée : OAuth Google Identity Services, **gmail.readonly uniquement**, client public personnel déjà fourni. Aucun mot de passe Gmail/Vinted, secret client ou jeton de renouvellement. L’autorisation couvre techniquement **toute la boîte**, même si le code limite les recherches aux notifications Vinted.

Choisissez un mois, acceptez la lecture puis touchez **Synchroniser Gmail**. Vérifiez les anomalies, touchez **Valider les opérations fiables**, puis **Confirmer l’importation** dans le même écran. Le récapitulatif peut être quitté sans enregistrer ; aucun formulaire individuel n’est imposé pour les opérations reconnues. Les lignes compactes affichent article, type, montant, date et statut ; les détails et modifications sont dépliables. Après analyse, le bloc de connexion se replie pour montrer les opérations ; période et révocation restent accessibles. Les opérations ambiguës et corrections sont conservées dans le coffre, sans effet financier automatique, pour être examinées séparément.

- **Reçu d’achat** : le libellé « Montant payé » fournit le coût TTC. Le port et la protection déjà inclus ne sont jamais déduits une seconde fois.
- **Vente annoncée** : reste en attente et n’entre pas dans le chiffre d’affaires.
- **Transaction finalisée** : le contenu doit confirmer le rôle vendeur et un paiement crédité. Une finalisation acheteur ne crée aucune nouvelle dépense.
- Les bordereaux, expéditions, livraisons, offres, favoris, messages et promotions sont exclus de l’interface comptable principale.
- Les annulations et remboursements nécessitent une confirmation dédiée. Un retour physique peut remettre le bien en stock ou retirer un achat rendu au vendeur, en conservant l’historique.
- Les dates explicites priment. Sinon, la date Gmail est proposée avec la mention **estimée** ; aucun encaissement n’est reconnu sans confirmation suffisante de l’événement.
- Les références communes rapprochent annonce et encaissement, y compris dans un même lot ou de part et d’autre d’un changement de mois. Un nom seul ne suffit jamais. Une ressemblance avec un article manuel nécessite un choix rapide.
- Un achat inconnu reste inconnu : CA/cotisations possibles, **Bénéfice à compléter**, puis saisie rapide dans la fiche article ou la section dédiée. Les bénéfices connus sont distingués du total indéterminé.
- Un lot conserve son total et sa fiche originale archivée ; sa répartition est facultative et exige des coûts explicites dont la somme correspond au total, sans prix individuel inventé. Un lot déjà remboursé ou retourné reste indivisé pour préserver les corrections ; les corrections d’un lot réparti demandent une vérification manuelle.

La lecture est manuelle, paginée par 20, plafonnée à 200 identifiants et dix pages par lancement. Les empreintes des messages connus évitent leur relecture. Un curseur de reprise chiffré n’est conservé qu’à la validation. Le mode **Historique** repart du début du mois choisi ; parcourez les autres mois pour les périodes antérieures. Une interruption ou un plafond est signalé comme parcours partiel. Aucun service de synchronisation permanent.

Les corps d’e-mails et jetons restent en mémoire dans le lecteur sans stockage. La fermeture, le verrouillage, la déconnexion ou l’expiration les abandonnent. Seules les données comptables normalisées et le suivi nécessaire sont conservés **chiffrés**, après validation. La section **Connexion et révocation** permet de retirer l’accès ; [Google](https://myaccount.google.com/connections) fournit aussi la gestion des autorisations.

Aucun modèle universel de notifications Vinted n’est garanti. Les tests n’utilisent que des exemples synthétiques. Un modèle réel non reconnu reste à vérifier ; aucun prix absent n’est déduit. L’import de fichiers officiels Vinted reste préparé sans faux analyseur : voir [VINTED_IMPORT.md](./VINTED_IMPORT.md).

## Comptabilité

Montants en centimes entiers, taux en centièmes de pourcentage (`1230` = 12,3 %). Virgule ou point accepté, deux décimales maximum. Arrondi au centime **vente par vente**, au plus proche, demi-centime vers le haut.

```text
Cotisations estimées = encaissement × taux (12,3 % initialement)
Bénéfice estimé = encaissement − coût d’acquisition total − frais − cotisations
```

Les achats TTC suivent la date d’achat ; le coût des articles vendus suit l’encaissement, même si l’acquisition est antérieure. Ces deux montants ne sont pas additionnés dans le bénéfice. Les ventes en attente et invendus sont exclus du CA. Les remboursements de ventes corrigent les encaissements à leur propre date, sans effacer la vente initiale. Les remboursements d’achat diminuent le coût net du bien et figurent dans les dépenses à leur date ; compléter ce coût peut réviser les bénéfices historiques correspondants.

Le stock et son capital décrivent la **situation actuelle**, toutes années confondues ; les attentes peuvent être consultées à la fin du mois choisi. Le capital inclut TTC et frais enregistrés. Le flux « encaissements − achats » est incomplet pour les dates de paiement des boosts/nettoyages, absentes du modèle historique : elles ne sont pas inventées. Les dates d’acquisition inconnues sont signalées et exclues des dépenses mensuelles jusqu’à leur saisie.

Le changement de taux recalcule toutes les estimations, passées incluses ; aucun historique fiscal des taux. Les ajustements de cotisations après remboursement doivent être vérifiés pour votre déclaration. **Estimations de gestion, aucune certification fiscale.**

## Stockage et sauvegardes

IndexedDB/Dexie garde le même nom `vinted-manager`. Le schéma v4 ajoute un coffre AES-256-GCM et conserve les tables historiques uniquement pour la migration. Après validation, toutes les données comptables persistées sont dans le coffre chiffré : articles, frais, dates, historique, importations, rapprochements, curseurs et réglages. La clé aléatoire de 256 bits est protégée par PBKDF2-SHA-256 à 600 000 itérations ; la clé déverrouillée est non extractible et uniquement en mémoire. Voir [SECURITE.md](./SECURITE.md).

Dans **Paramètres → Sauvegardes & données** :

- Export complet `.vmbackup` : AES-256-GCM, PBKDF2 600 000, nouveau sel et IV, phrase confirmée. Aucun jeton ni clé du coffre.
- Restauration : authentification, validation stricte, puis confirmation avant remplacement atomique. Les anciennes sauvegardes internes v1/v2 restent compatibles ; le nouveau contenu v3 préserve les nouvelles métadonnées. L’enveloppe chiffrée reste au format v1.
- Les anciens JSON et CSV existent toujours avec un avertissement explicite : **ces fichiers ne sont pas chiffrés**.
- Limites : 20 Mo de JSON clair, 30 Mo d’enveloppe ; la taille réellement chiffrée est contrôlée avant écriture. Le coffre réécrit un instantané à chaque transaction : architecture destinée à une activité personnelle, pas à une base massive.

Dans Fichiers, choisissez **Sur mon iPhone** pour éviter une synchronisation volontaire avec iCloud Drive. iOS peut aussi sauvegarder l’appareil ; la PWA ne contrôle pas ces mécanismes. Le coffre n’est pas un service de sauvegarde : effacement Safari, pression sur le stockage ou changement d’origine peuvent rendre la copie locale inaccessible. Les appareils ne sont pas synchronisés. Pour la procédure de récupération et les limites du retour arrière, consultez [SECURITE.md](./SECURITE.md#mise-à-jour-et-récupération-sans-effacement).

Le chiffrement protège les données au repos, pas une session déverrouillée sur un appareil compromis ou face à un script autorisé malveillant. Le navigateur ne garantit pas l’effacement physique des anciennes pages de stockage ni de toutes les copies en mémoire. Aucune récupération automatique ou biométrie simulée n’est proposée.

## Développement et déploiement gratuit

React, TypeScript, Vite, Tailwind, Lucide, Dexie et vite-plugin-pwa. Node.js 22.12 minimum ; workflow Node 24. Dépendances verrouillées par `package-lock.json`.

```bash
npm ci
npm run dev
# Production sous le chemin existant
PAGES_BASE_PATH=/Vinted-manager/ npm run build
npm run gmail:build
npm run verify:source
npm test
npx playwright install --with-deps chromium webkit
PAGES_BASE_PATH=/Vinted-manager/ npm run test:e2e
npm run gmail:test:browser
npm run pages:package
```

Le workflow existant compile, audite, teste Chromium/WebKit, puis publie uniquement les 13 fichiers statiques comptables et quatre fichiers du lecteur depuis `.pages-build`. Aucun export, profil de navigateur, trace ou archive personnelle. Les instructions et limites de GitHub Pages figurent dans [DEPLOIEMENT_GITHUB_PAGES.md](./DEPLOIEMENT_GITHUB_PAGES.md).
