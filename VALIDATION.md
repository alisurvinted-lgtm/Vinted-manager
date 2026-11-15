# Validation de Vinted Manager : confidentialité et déploiement

Contrôles exécutés le **15 novembre 2026**, sous Linux Codex avec Node.js **24.22.1**.

## Résultats réellement exécutés

| Contrôle                                          | Résultat                                                                                                                                        |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Vérification du code et sélection de publication  | 46 fichiers sources autorisés ; pas de signature de secret détectée ; pas d’API réseau ou d’exécution HTML/JS dynamique dans le code applicatif |
| Vitest 5.1                                        | **67 tests réussis**, 4 fichiers                                                                                                                |
| TypeScript strict                                 | Réussi avec `tsc -b`                                                                                                                            |
| Build Vite / PWA                                  | Réussi sous **`/vinted-manager/`**                                                                                                              |
| Contrôle de l’artefact statique                   | **13 fichiers autorisés**, environ 449 Kio précachés ; aucun export, profil de navigateur ou fichier de données                                 |
| Playwright Chromium                               | **9 tests réussis**                                                                                                                             |
| Playwright WebKit au format iPhone 13             | **9 tests réussis**                                                                                                                             |
| Audit npm des dépendances de production déclarées | **0 signalement** avec `--omit=dev`                                                                                                             |
| Audit npm complet                                 | **0 critique, élevé ou modéré ; 4 faibles** dans la même chaîne de compilation liée à deepmerge                                                 |

La commande complète exécutée sur les sources finales :

```bash
PAGES_BASE_PATH=/vinted-manager/ npm run check
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

Le manifeste, son `start_url`, son `scope`, les icônes Apple/manifest, le script et la portée du worker sont vérifiés sous `/vinted-manager/`. Le rechargement et l’ajout d’articles sans réseau sont testés après le premier chargement complet.

## Contrôles négatifs des fichiers publiés

Les contrôles de publication ont été volontairement soumis à :

- un JSON, un CSV et un fichier `.vmbackup` ajoutés à `dist/` ;
- un fichier JS contenant un marqueur synthétique de données privées dans le build ;
- une signature synthétique de token dans un fichier source temporaire.

Tous ont été **refusés**. Les fichiers temporaires ont été retirés et les contrôles normaux passent de nouveau. Ces vérifications ne remplacent pas une revue humaine et ne détectent pas tous les secrets possibles ; les fichiers réellement sélectionnés ont aussi été inspectés par leur rôle et leur contenu source.

## Dépôt et état du déploiement

Le dépôt existant inspecté est **alisurvinted-lgtm/Vinted-manager-**, identifiant stable **1459243181**, public et initialement vide. Il est éligible au mode gratuit prévu ; aucun second dépôt n’est créé.

Le nom diffère du nom `vinted-manager` nécessaire à l’adresse demandée. La tentative de renommage de **ce même dépôt** a reçu **HTTP 403 — Resource not accessible by integration**. Les droits de modification de code et de workflow ne donnent pas à l’intégration le droit d’administration du dépôt.

Le code et la configuration ont été envoyés sur **`main`**, commit initial **`b0800c99183342899fb4957d40e28e7019aff42d`**. L’arbre distant a été comparé à la sélection des 46 fichiers sources : aucun export, profil ni résultat de test n’y figure.

La [première exécution Actions](https://github.com/alisurvinted-lgtm/Vinted-manager-/actions/runs/43764369777) s’est bien déclenchée, puis s’est arrêtée au contrôle du nom dans le job `configure`. La configuration Pages, le build GitHub et le déploiement n’ont pas été exécutés. Les **67 tests unitaires, 18 parcours navigateur et le build rapportés ici ont été exécutés et réussis localement dans Codex**.

Le workflow contrôle le nom attendu et s’arrête avant Pages tant qu’il n’est pas corrigé. Le renommage manuel et le lancement du workflow sont décrits dans [DEPLOIEMENT_GITHUB_PAGES.md](./DEPLOIEMENT_GITHUB_PAGES.md).

**Aucun fonctionnement d’un site HTTPS public n’est revendiqué tant que le déploiement n’a pas réussi et que l’adresse n’a pas été vérifiée.** L’état du commit envoyé et du workflow est indiqué dans le compte rendu final de la session.

## Limites

- IndexedDB active n’est **pas chiffrée par l’application**. Le chiffrement concerne les fichiers de sauvegarde.
- La conservation et la confidentialité locales dépendent de l’iPhone, de Safari, des profils/extensions et des sauvegardes système ; aucune sécurité absolue n’est garantie.
- Une phrase oubliée ne peut pas être récupérée. Les chaînes JavaScript ne peuvent pas toutes être effacées immédiatement de la mémoire avec certitude.
- Les tests WebKit ne remplacent pas le geste d’installation sur un iPhone physique, les réglages Fichiers/iCloud ou le clavier natif.
- Le site statique et ses mises à jour restent un code de confiance. Une CSP meta sur Pages n’offre pas tous les en-têtes serveur, notamment `frame-ancestors`.
- Les parcours testés ne constituent pas une preuve d’absence de fuite pour tout état futur du code ou de l’appareil.
- Les 4 avis npm faibles restants et les limites de GitHub Pages sont détaillés dans [SECURITE.md](./SECURITE.md).
