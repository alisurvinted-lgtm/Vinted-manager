# Lecteur Gmail personnel — version actuelle

Ce module réutilise Google Identity Services et le client public déjà validé par le propriétaire. Il fait partie du parcours **Synchroniser Gmail** du coffre déverrouillé. Il n’a aucun stockage ni accès comptable dans son code. La page autonome renvoie vers l’application ; elle ne propose plus une seconde interface d’import.

## Parcours et séparation

La page comptable ouvre la frame HTTPS exacte `https://alisurvinted-lgtm.github.io/Vinted-manager/gmail-prototype/`. Le protocole v2 exige origine, parent, nonce, schéma borné et coffre déverrouillé. Il transmet uniquement des propositions comptables normalisées ; ni jeton, corps, objet ou adresse d’e-mail. Le parent conserve la validation et les écritures chiffrées. Un postMessage seul ne déclenche jamais un enregistrement.

L’autorisation préalable prépare le SDK ; le geste **Synchroniser Gmail** ouvre ensuite Google. Le jeton reste dans la fermeture de `session.ts`. Le scope exact est `gmail.readonly`, sans scopes supplémentaires, mot de passe, secret client, refresh token ni cookies Gmail directs. La fermeture du parcours ou le verrouillage abandonne l’accès et les réponses tardives. Déconnexion, révocation confirmée et lien Google restent disponibles dans **Connexion et révocation**.

Le module a sa CSP précise, son manifeste historique distinct et quatre fichiers statiques. Le worker comptable l’exclut de son cache/repli. Sa frame de même origine **n’isole pas cryptographiquement le SDK tiers** d’une session comptable ouverte ; consulter [SECURITE.md](../../SECURITE.md).

## Recherche et extraction locale

- Mois de réception en Europe/Paris, borne Unix pour éviter l’interprétation PST de Gmail ; période choisie par l’utilisateur.
- Métadonnées minimales ; From exact `@vinted.fr`, authentification alignée rapportée par Google et objets ciblés avant lecture du corps. Messages personnels, bordereaux et promotions écartés.
- Trois catégories : reçu d’achat, article vendu/vente annoncée, transaction finalisée. Une preuve du contenu est nécessaire. Achat finalisé ≠ paiement vendeur. Annulations et remboursements : section dédiée et confirmation séparée.
- Total TTC libellé prioritaire, port/protection non ajoutés deux fois, crédit porte-monnaie contextualisé. Champs absents inconnus ; contradictions à vérifier. Date explicite sinon réception estimée. Pas de nom ou prix inventé.
- `messageText` transforme les chaînes MIME/HTML sans DOM. Aucun HTML exécuté, image chargée, lien suivi, pièce jointe téléchargée ou modèle externe d’IA.
- Les titres d’image produits et références de liens Vinted précis peuvent servir d’indices textuels ; les URL ne sont pas suivies. Toutes les entrées restent non fiables et bornées.

20 identifiants par page, dix pages et 200 au maximum par lancement. La pagination est automatique à l’intérieur de cette limite ; la fin réelle, le plafond et l’interruption sont distingués. Le parent fournit des empreintes connues pour éviter même la relecture des métadonnées ; un curseur opaque est chiffré uniquement à la validation du lot. « Historique » repart du début du mois choisi. Aucun polling ni synchronisation permanente.

Réponses bornées : liste/métadonnées 32 Kio, corps 512 Kio, texte 200 000 caractères, structure MIME bornée. Le texte brut ne quitte pas la frame et n’est visible que sur demande. Seules des informations normalisées confirmées, propositions en attente et empreintes nécessaires rejoignent le coffre chiffré. Le contenu complet ne fait pas partie d’une sauvegarde.

## Limites Google et validation

Le propriétaire a attesté le mode personnel, Gmail API activée et le scope ajouté. L’agent n’a pas accès à sa console Google et n’a jamais autorisé son compte ni consulté ses messages. Le scope donne techniquement lecture de toute la boîte. Google impose ses règles de mode personnel, scopes restreints, quotas et éventuelle vérification selon la diffusion ; cette livraison ne rend pas le service public multi-utilisateur. Aucun abonnement ou serveur supplémentaire.

Les tests utilisent un OAuth simulé et des e-mails exclusivement synthétiques ; un essai anonyme peut seulement vérifier l’ouverture du vrai écran Google, sans confirmer un retour OAuth complet. Les connexions/révocations antérieures sur Safari et PWA ont été rapportées par le propriétaire ; le nouveau verrouillage et parcours groupé restent à valider sur son iPhone physique.

Pour désactiver la connexion, `enabled: false` dans la configuration puis reconstruire les deux pages ; cela ne révoque pas l’autorisation Google. Aucun changement de schéma comptable n’est nécessaire à cette désactivation.

```bash
npm run gmail:verify
npm run gmail:build
npm run gmail:test
npm run gmail:test:browser
```

Les preuves courantes de tests et déploiement sont dans [VALIDATION.md](../../VALIDATION.md).

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
