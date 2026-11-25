# Déploiement du dépôt existant et installation iPhone

## Adresse et dépôt

- Dépôt existant public : **[alisurvinted-lgtm/Vinted-manager](https://github.com/alisurvinted-lgtm/Vinted-manager)**, identifiant stable `1459243181`, branche `main`.
- Application : **https://alisurvinted-lgtm.github.io/Vinted-manager/**. Conservez la majuscule `V` dans le chemin ; un chemin écrit autrement peut renvoyer 404.
- Le dépôt a déjà été renommé et Pages est déjà configuré avec la source **GitHub Actions**. Aucun second dépôt, changement de visibilité, abonnement ou serveur n’est nécessaire.

L’état réellement vérifié de chaque livraison figure dans [VALIDATION.md](./VALIDATION.md).

## Déploiement automatique

Chaque push sur `main` déclenche [Déployer sur GitHub Pages](https://github.com/alisurvinted-lgtm/Vinted-manager/actions/workflows/deploy-pages.yml) :

1. `configure` vérifie l’identifiant du dépôt, sa visibilité publique, son nom et le chemin réel retourné par Pages.
2. `build` installe les dépendances verrouillées, vérifie la sélection de sources, exécute l’audit, les tests unitaires, TypeScript, le build, le contrôle de l’artefact et les tests Chromium/WebKit.
3. `deploy` publie uniquement les fichiers statiques autorisés de `.pages-build/` (application et lecteur Gmail contrôlé) avec les actions officielles épinglées à des commits.

Le chemin Vite est fourni automatiquement par Pages via `PAGES_BASE_PATH` ; le manifeste, les icônes, le scope du service worker et son cache suivent ce chemin. Un lancement manuel est possible dans **Actions → Déployer sur GitHub Pages → Run workflow → main**.

### Correction de l’ancien blocage configure

`actions/configure-pages` utilise **`enablement: false`** pour consulter le site existant, avec `pages: read`. Le job ne tente plus de créer ou réactiver le site, opération qui exige une permission d’administration supplémentaire et avait renvoyé `Resource not accessible by integration`. Seul `deploy` possède `pages: write` et `id-token: write`. Les permissions générales d’écriture des workflows ne remplacent pas cette permission d’administration.

Les réglages **Pages → Source : GitHub Actions**, **Enforce HTTPS** et les autorisations Actions déjà réalisés n’ont pas besoin d’être refaits.

## Vérification locale pour un développeur

```bash
npm ci
npx playwright install --with-deps chromium webkit
PAGES_BASE_PATH=/Vinted-manager/ npm run check
```

Le workflow utilise les runners Linux standards et GitHub Pages gratuit pour ce dépôt public. Il refuse un dépôt privé pour ne pas dépendre d’un forfait payant.

## Installer sur iPhone

1. Ouvrez **https://alisurvinted-lgtm.github.io/Vinted-manager/** dans Safari, en navigation normale, puis attendez le chargement complet avec Internet.
2. **Partager → Sur l’écran d’accueil → Ajouter** (ou « Ajouter à l’écran d’accueil », selon iOS). Activez **Ouvrir en tant qu’app** si proposé.
3. Ouvrez l’icône et créez votre phrase secrète (ou déverrouillez). Après le premier chargement complet, les articles et formulaires restent accessibles hors ligne après déverrouillage.

Pour une installation existante, exportez d’abord une sauvegarde chiffrée si possible, fermez les autres fenêtres de l’application, conservez la même adresse et touchez **Actualiser** quand la bannière de mise à jour apparaît, après avoir enregistré tout formulaire ouvert. N’effacez pas les données Safari et ne désinstallez pas l’application pour obtenir la mise à jour. Le cache des ressources et IndexedDB sont distincts : la mise à jour n’efface pas la base. Un coffre v4 existant se déverrouille avec sa phrase habituelle, sans migration supplémentaire. Pour les anciennes bases encore en clair, l’écran de protection propose la sauvegarde préalable puis vérifie la migration vers v4. Les anciennes sauvegardes restent compatibles.

Les tests WebKit reproduisent le format iPhone ; le geste d’installation sur votre appareil physique ne peut pas être vérifié à distance.

## Confidentialité de la publication

Seuls les fichiers choisis par `scripts/source-files.mjs` sont envoyés au dépôt. Aucune donnée comptable, sauvegarde `.vmbackup`, JSON personnel, CSV, archive, capture, trace ou profil de navigateur ne doit être publié. Le build possède aussi une liste fermée de fichiers statiques autorisés.

Les données restent dans IndexedDB sur l’appareil. Après migration vérifiée, la base active est chiffrée ; la sécurité de l’iPhone/Safari et du code chargé pendant une session ouverte reste nécessaire. Les sauvegardes `.vmbackup` sont chiffrées localement avec une phrase jamais conservée ni transmise. Dans Fichiers, choisissez **Sur mon iPhone** si vous ne voulez pas synchroniser l’export avec un fournisseur cloud.

Pour transférer des données, utilisez uniquement les sauvegardes dans l’application ; ne les envoyez jamais au dépôt. Voir [SECURITE.md](./SECURITE.md) pour les limites et [VINTED_IMPORT.md](./VINTED_IMPORT.md) pour la préparation de l’import officiel.
