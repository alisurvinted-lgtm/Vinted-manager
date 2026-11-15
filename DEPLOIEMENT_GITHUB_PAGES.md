# Déploiement du dépôt existant et installation iPhone

## Dépôt inspecté

Le dépôt existant est **[alisurvinted-lgtm/Vinted-manager-](https://github.com/alisurvinted-lgtm/Vinted-manager-)**, public, identifiant GitHub `1459243181`. Il était vide lors de l’inspection. **Aucun second dépôt n’est créé.**

Le nom comporte un tiret final et diffère du nom `vinted-manager` demandé. La connexion permet d’envoyer le code et les workflows, mais l’API de renommage a renvoyé **403 — Resource not accessible by integration**. Le rôle administrateur du propriétaire ne donne pas automatiquement cette permission à l’intégration.

## Action manuelle nécessaire : corriger le nom

1. Ouvrez les **Settings** du dépôt existant avec votre compte GitHub.
2. Dans **General → Repository name**, remplacez `Vinted-manager-` par **`vinted-manager`**, sans tiret final, puis cliquez **Rename**.
3. Ne créez pas un nouveau dépôt. Le renommage conserve son historique et son identifiant.
4. Ouvrez **Actions → Déployer sur GitHub Pages → Run workflow**, branche **main**.

Le workflow vérifie le dépôt cible avant d’activer Pages. Tant que le nom n’est pas corrigé, il s’arrête avec un message explicite et ne publie aucun site sous une autre adresse.

## Si GitHub demande l’activation de Pages

Dans le dépôt renommé :

1. **Settings → Pages → Build and deployment → Source → GitHub Actions**.
2. Si demandé, autorisez GitHub Actions dans **Actions** / **Settings → Actions → General**.
3. Relancez **Actions → Déployer sur GitHub Pages → Run workflow → main**.
4. Attendez que les jobs **configure**, **build** et **deploy** soient verts. L’URL confirmée apparaît dans `deploy` et dans **Settings → Pages**.

GitHub Pages est gratuit pour ce dépôt public et les runners Linux standards utilisés. Aucun abonnement, domaine personnalisé payant, serveur ou compte dans l’application n’est nécessaire. Le workflow refuse un dépôt privé pour ne pas dépendre d’un forfait payant.

## Si l’envoi du code est bloqué

Téléchargez l’archive source fournie avec cette livraison, puis placez son contenu à la racine de la branche `main` du **même dépôt existant**, dossier caché `.github` compris. N’envoyez pas le dossier de travail entier. L’archive source est construite à partir d’une liste fermée et ne contient ni sauvegarde comptable ni profil de navigateur.

Avec Git sur un ordinateur, clonez le dépôt existant, copiez uniquement les fichiers de l’archive source dans ce clone, puis :

```bash
git add .github .gitignore src public scripts tests e2e index.html package.json package-lock.json tsconfig.json vite.config.ts vitest.config.ts playwright.config.ts README.md VALIDATION.md DEPLOIEMENT_GITHUB_PAGES.md SECURITE.md
git commit -m "Protéger les sauvegardes et préparer GitHub Pages"
git push origin main
```

N’utilisez jamais `git add` sur des sauvegardes JSON/CSV, fichiers `.vmbackup`, données Safari, profils de navigateur ou archives personnelles. Ne partagez aucun mot de passe ou token dans une conversation ou dans le dépôt.

## Ce que construit et publie Actions

- Dépendances verrouillées par `npm ci`, audit, vérification du code, tests, build et tests Chromium/WebKit.
- Chemin de base obtenu depuis la configuration réelle de Pages ; manifeste, icônes, worker et cache adaptés au sous-dossier.
- Actions officielles épinglées à des commits ; permissions d’écriture limitées aux jobs qui en ont besoin.
- Seulement les fichiers statiques autorisés de `dist/`. Aucun rapport de test, trace, capture, base IndexedDB, export ou sauvegarde n’est publié.
- Déploiement automatique à chaque push sur `main` après correction du nom ; lancement manuel également possible.

## Installer sur iPhone après publication vérifiée

1. Ouvrez **l’URL confirmée par GitHub Pages** dans Safari, en navigation normale.
2. Attendez le chargement complet avec une connexion Internet.
3. **Partager → Sur l’écran d’accueil → Ajouter** (ou « Ajouter à l’écran d’accueil », selon iOS). Activez **Ouvrir en tant qu’app** si proposé.
4. Ouvrez l’icône, ajoutez un article, fermez puis rouvrez l’application pour vérifier sa présence.
5. Après le premier chargement complet, essayez le mode avion : les articles et formulaires restent accessibles.

Les tests passent dans WebKit avec un format iPhone, mais le geste d’installation sur votre appareil physique n’est pas vérifiable à distance depuis cet environnement.

## Confidentialité et sauvegardes

Les données restent dans IndexedDB sur l’iPhone. La base active n’est pas chiffrée par cette application et dépend de la sécurité de l’appareil/Safari. Les sauvegardes `.vmbackup` sont chiffrées localement ; la phrase n’est ni enregistrée ni transmise. Conservez-la séparément : aucune récupération de l’ancien fichier n’est possible si elle est oubliée.

Dans Fichiers, choisissez **Sur mon iPhone** pour éviter un fournisseur de fichiers synchronisé. Le projet ne contrôle pas les sauvegardes système iCloud ou celles de votre ordinateur. Les anciens JSON et CSV restent en clair, avec avertissements explicites.

Pour importer des données déjà présentes sur une autre origine, utilisez uniquement **Paramètres → Importer une sauvegarde** dans l’application. **Ne les envoyez jamais au dépôt GitHub.** Aucun import n’est lancé par le déploiement, et aucune donnée existante de votre iPhone n’est supprimée par cette mise à jour.

Voir [SECURITE.md](./SECURITE.md) pour les protections et risques résiduels, et [VALIDATION.md](./VALIDATION.md) pour l’état réel des tests et du déploiement.
