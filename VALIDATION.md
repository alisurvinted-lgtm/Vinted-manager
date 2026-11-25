# Validation de Vinted Manager

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
