# Sécurité et confidentialité

Protections vérifiables de la version actuelle ; aucune sécurité absolue n’est promise. Aucun e-mail réel, mot de passe ou donnée comptable du propriétaire n’est utilisé dans les tests ou le dépôt.

## Coffre actif

Les écritures comptables passent par `ManagerDB` (`src/lib/secure-db.ts`). Les tables visibles par les fonctions métier travaillent **en mémoire**, dans une session déverrouillée. La transaction valide un instantané, le chiffre puis écrit exclusivement le texte chiffré dans IndexedDB. Aucun IndexedDB de travail en clair, index financier, localStorage, sessionStorage, cache de données ou journal applicatif. La lecture/modification verrouillée est refusée.

| Paramètre               | Coffre actif, format v1                                                                                                           |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Chiffrement             | AES-256-GCM, tag de 128 bits                                                                                                      |
| Clé des données         | 32 octets CSPRNG, importée non extractible en Web Crypto                                                                          |
| Protection de cette clé | AES-256-GCM avec une clé dérivée de la phrase                                                                                     |
| Dérivation              | PBKDF2-HMAC-SHA-256, exactement 600 000 itérations                                                                                |
| Sel de dérivation       | 16 octets aléatoires par coffre                                                                                                   |
| IV                      | 12 octets aléatoires par chiffrement ; nouveau à chaque écriture                                                                  |
| Authentification        | AAD distincts pour clé et contenu, liant version, identifiant, IV, révision et statut de migration pertinents                     |
| Format                  | Validation stricte des clés, tailles, paramètres et Base64 canonique                                                              |
| Métadonnées en clair    | Version, paramètres crypto, clé enveloppée, IV, identifiant aléatoire, révision technique, état de migration et taille du chiffré |

Les IV sont tirés par `crypto.getRandomValues`. Les répétitions du dernier IV et de ceux déjà utilisés dans la session sont refusées ; les révisions sont plafonnées avant 2³². Après réouverture, l’unicité des IV plus anciens repose sur le tirage cryptographique de 96 bits, pas sur une garantie mathématique absolue. Le stockage hors ligne n’offre pas de mécanisme anti-rejeu fiable contre un attaquant capable de remplacer l’ensemble par une ancienne copie valide. Une altération non authentifiée est refusée.

La clé dérivée et la clé des données ne sont jamais persistées en clair. La phrase n’est ni normalisée ni tronquée, et n’est jamais enregistrée ou envoyée. Les buffers modifiables temporaires sont remis à zéro quand possible. Le verrouillage retire les références, démonte l’interface comptable et abandonne synchroniquement l’accès Gmail avant de supprimer sa frame. Les opérations tardives sont refusées par une génération de session. JavaScript ne permet pas de garantir l’effacement immédiat de toutes les chaînes, copies, buffers internes et clés encore référencées par une opération asynchrone.

Une écriture concurrente dans une autre fenêtre est détectée par identifiant/révision : elle n’est pas écrasée. Il faut reverrouiller et déverrouiller pour recharger. Gardez une seule fenêtre comptable active.

## Migration sans effacement préalable

Le schéma physique v4 ajoute `vault` ; v1/v2/v3 restent reconnus. Une base ancienne reste intacte tant que la copie chiffrée n’est pas vérifiée. Une phrase est créée localement et un export chiffré préalable est proposé.

1. Lire les données validées et, si demandé, exporter une sauvegarde chiffrée.
2. Écrire un candidat chiffré marqué « pending » avec sa clé enveloppée.
3. Déchiffrer et comparer le contenu canonique (articles, montants, dates, frais, historique, paramètres et suivi d’import).
4. Relire les données anciennes, contrôler leur version et leur contenu dans la transaction finale.
5. Écrire et vérifier le coffre complet, puis vider les quatre tables anciennes **dans la même transaction**.

Une interruption avant le candidat laisse le clair intact. Une interruption après son écriture se reprend avec la même phrase. Si un ancien onglet a modifié les données pendant cette interruption, la version courante est migrée et le premier candidat est gardé **chiffré** comme copie de sécurité exportable dans les paramètres. Aucune écriture concurrente n’est ignorée. Fermez les anciens onglets avant migration ; une ancienne version de l’app pourrait sinon réécrire du clair après la migration. La mise à niveau de schéma ferme les connexions Dexie antérieures.

Le code ne garantit pas la destruction physique des anciennes données sur la mémoire flash ni des sauvegardes système. Il n’efface aucun fichier personnel téléchargé. Le cache historique ne contenait que des ressources statiques ; Workbox nettoie les caches statiques obsolètes. Aucun cache financier n’est créé ou migré.

## Phrase, verrouillage et récupération

Minimum de 16 caractères pour la création ; préférez cinq ou six mots réellement aléatoires, uniques. Ce minimum ne garantit pas l’entropie. Pas de PIN comme protection cryptographique, clé codée en dur, phrase conservée, envoi par e-mail, récupération serveur ou porte dérobée.

Inactivité 5 minutes par défaut, choix 1/5/15 minutes enregistré chiffré. Arrière-plan 30 secondes, grâce OAuth plafonnée à cinq minutes et au délai d’inactivité ; contrôle des échéances absolues au retour. Fermeture/rechargement/pagehide et retour BFcache imposent le verrouillage. iOS peut suspendre ou tuer la PWA ; le déverrouillage devra alors être refait.

**Phrase oubliée + coffre verrouillé = aucune récupération garantie.** Une sauvegarde indépendante reste restaurable avec sa propre phrase, dans un espace accessible. Tant qu’une session reste déverrouillée, exporter une sauvegarde avec une nouvelle phrase reste possible ; cela ne change pas la phrase du coffre. Aucun mécanisme de réinitialisation destructrice n’a été ajouté.

### Mise à jour et récupération sans effacement

Les phases 2 à 5 conservent IndexedDB v4 et les formats de coffre v1/sauvegarde interne v3. Les tests de livraison chargent les fichiers statiques réellement publiés, créent un coffre synthétique avec article vendu/frais, exportent une sauvegarde chiffrée, puis activent le nouveau service worker sur la **même origine de test**. Ils vérifient la conservation exacte du coffre persistant, son ouverture, les résultats, la restauration de cette ancienne sauvegarde et le hors ligne. Ce contrôle n'accède jamais au stockage de l'iPhone du propriétaire.

1. Avant une mise à jour importante, exporter depuis **Paramètres → Exporter une sauvegarde chiffrée**, conserver le fichier et sa phrase séparément, puis fermer les autres onglets/PWA comptables. Ne pas désinstaller ou effacer Safari.
2. Actualiser depuis la bannière, puis déverrouiller avec la phrase habituelle si le coffre existe déjà. Si une ancienne base en clair est détectée, conserver l'export préalable proposé et laisser la migration se vérifier. Une interruption se reprend avec la même phrase, sans supprimer la base.
3. En cas de problème applicatif, conserver le stockage et les exports. Un retour du **code uniquement** à la version v4 publiée `4045eeb`, sur la même origine et le même chemin, permet une ouverture/export de secours ; ce scénario est testé avec la copie des fichiers publiés avant livraison. Ne pas y synchroniser Gmail : ses anciennes règles de rapprochement ne contiennent pas les correctifs des phases suivantes. Réinstaller ensuite la version corrigée en conservant la base. Le retour avant le coffre v4 n'est pas une procédure sûre : l'ancien logiciel pourrait montrer des tables vides ou réécrire du clair. Ne jamais abaisser manuellement la version IndexedDB.
4. Avec une sauvegarde et sa phrase, utiliser **Paramètres → Importer une sauvegarde → Déchiffrer et vérifier**, puis confirmer uniquement le fichier souhaité. Exporter d'abord l'état courant s'il est encore accessible. Une restauration revient à l'état du fichier ; elle ne recrée pas les opérations saisies après cet export.
5. Si le coffre local est illisible ou sa phrase oubliée mais qu'une sauvegarde indépendante reste déchiffrable, ouvrir la version courante sur un autre appareil/profil de navigateur, créer un espace vide et y restaurer le fichier. Cela permet de récupérer la copie sans détruire le coffre initial. Sans phrase utilisable ni sauvegarde déchiffrable, aucune récupération n'est promise.

Une mise à jour ne déclenche aucune restauration automatique. Les tests de migration interrompue v1/v2/v3, de copies de récupération chiffrées et de sauvegardes historiques complètent le contrôle d'évolution v4. Aucun effacement physique de la flash ou récupération après éviction Safari n'est garanti.

### Biométrie étudiée, non activée

WebAuthn avec l’extension PRF peut dériver un secret permettant de protéger une clé locale ; un simple succès Face ID sans secret cryptographique ne suffit pas. La compatibilité dépend de Safari/iOS, du fournisseur de passkeys et de l’authentificateur ; une passkey peut être synchronisée par son fournisseur. Aucun essai PRF sur l’iPhone du propriétaire n’est disponible, et la synchronisation d’une passkey doit être évaluée séparément. La phrase reste le mécanisme unique de cette livraison ; aucun bouton Face ID simulé et aucune clé en clair pour faciliter un accès biométrique.

Sources techniques : [WebAuthn PRF, W3C](https://www.w3.org/TR/webauthn-3/#prf-extension), [extensions WebAuthn, MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API/WebAuthn_extensions), [suivi WebKit](https://bugs.webkit.org/show_bug.cgi?id=259934). Ces sources n’attestent pas le fonctionnement sur un appareil non testé.

## Sauvegardes

L’enveloppe `.vmbackup` existante v1 conserve AES-256-GCM, tag 128 bits, PBKDF2-SHA-256 à 600 000 itérations, **sel 32 octets** et IV 12 octets neufs à chaque export. Elle chiffre un contenu interne v3 ; les contenus v1/v2 restent compatibles. Ni jeton OAuth, clé du coffre, phrase, corps de message, adresse ni objet d’e-mail n’en font partie. Les propositions normalisées en attente, empreintes et curseurs sont des données comptables chiffrées nécessaires au suivi.

Authentification avant toute restauration, puis contrôle strict des structures, versions, doublons d’identifiants, dates, montants, types, bornes et tailles. Limites 20 Mo clair / 30 Mo chiffré, 100 frais par article, 100 000 articles, 200 000 opérations et entrées de suivi. Les paramètres affaiblis ou excessifs sont refusés avant dérivation. La confirmation précède le remplacement atomique, lui-même chiffré avant écriture. Mauvaise phrase, fichier corrompu ou échec crypto ne modifient pas la base.

Anciens JSON et CSV : avertissement clair avant export/import, section distincte, fichiers **lisibles sans phrase**. Les fichiers déjà exportés restent sous la responsabilité de leur détenteur. Dans Fichiers, « Sur mon iPhone » évite un export volontaire vers iCloud Drive ; la PWA ne contrôle pas les sauvegardes iOS, les fournisseurs de fichiers ou les copies système.

## Gmail et réseau

L’intégration officielle existante est conservée, client OAuth public personnel attesté par le propriétaire, scope exact **gmail.readonly**, `include_granted_scopes: false`, refus de scopes supplémentaires, aucun secret client ni refresh token. Le scope couvre techniquement toute la boîte ; le code limite ses requêtes aux notifications Vinted françaises.

Le lecteur `prototypes/gmail-oauth` n’utilise aucun stockage. Jeton dans une fermeture JavaScript ; messages en mémoire uniquement ; destruction des références/annulation sur déconnexion, révocation, expiration, verrouillage, fermeture ou reprise BFcache. La révocation officielle transmet le jeton à Google en POST et n’affiche un succès qu’après confirmation. Déconnexion locale ≠ révocation Google ; [gestion de l’accès](https://myaccount.google.com/connections).

La page comptable garde **connect-src 'none'**, sans SDK Google dans son bundle. Sa frame précise reçoit seulement des empreintes et un contexte technique ; elle renvoie des propositions strictement validées. Origine, fenêtre source, version, nonce et format sont vérifiés. Aucun message reçu ne déclenche une écriture : une action de validation utilisateur dans la page comptable est requise.

CSP propre du lecteur : seul SDK GIS exact, endpoints GIS nécessaires, profil minimal Gmail, collection et chemins de messages, point précis de révocation. Aucun joker, script inline, eval, CDN, tracker ou analyseur distant. GET Gmail seulement, `credentials: omit`, `cache: no-store`, `redirect: error`, Bearer uniquement en en-tête. Les méthodes d’écriture et chemins de téléchargement de pièces jointes sont refusés. Aucune donnée comptable n’est incluse dans les URL, paramètres, corps ou journaux réseau applicatifs ; Google traite naturellement les requêtes Gmail et métadonnées OAuth.

Domaine From exact `@vinted.fr` + DKIM/DMARC aligné rapporté par `mx.google.com`, objets ciblés et période Paris vérifiés avant le corps. Cela ne constitue pas une vérification DKIM indépendante ni une garantie absolue d’authenticité. Les messages personnels hors filtre ne sont pas analysés ; leurs métadonnées minimales pourraient être reçues si Gmail les renvoie malgré la requête, puis sont rejetées. Pas de pièce jointe téléchargée, image distante, document HTML, script ou instruction d’e-mail exécuté. Parsing de chaînes bornées, rendu React échappé.

Les empreintes SHA-256 d’identifiants ne sont pas une anonymisation absolue ; elles restent dans le coffre. Un nom seul ne fusionne jamais deux transactions. Une contradiction reste à vérifier. Les corrections financières requièrent une confirmation dédiée et conservent un historique minimal.

## PWA, hébergement et risques résiduels

Workbox ne précache que les ressources statiques de l’application. Aucun cache runtime, réponse Gmail, jeton, sauvegarde ou comptabilité déchiffrée. Le lecteur Gmail est exclu du repli de navigation comptable et n’est pas mis en cache par ce worker. HTTPS, origine et `/Vinted-manager/` restent inchangés. Les données ne sont ni synchronisées ni sauvegardées automatiquement chez GitHub.

GitHub Pages peut journaliser IP, navigateur, date et chemin des fichiers statiques servis. Son hébergement ne permet pas de définir librement les en-têtes : la CSP est une meta, `_headers` n’y est pas appliqué, `frame-ancestors` n’est pas fourni par cette meta. Les styles React requièrent l’exception style inline existante ; les scripts inline restent bloqués. Aucune protection complète anti-iframe ni configuration HSTS personnalisée n’est revendiquée.

Les sites du même compte `*.github.io` partagent une origine ; les chemins et scopes SW ne constituent **pas une isolation d’IndexedDB ni de la mémoire**. Le SDK Google est du code tiers de confiance de même origine. Une extension autorisée, un appareil compromis, une mise à jour compromise ou un script malveillant exécuté pendant une session déverrouillée peut accéder aux données et aux clés en cours d’utilisation. Le chiffrement au repos ne résout pas ces attaques. La taille et les révisions du chiffré restent observables.

Protégez l’iPhone avec code robuste, Face ID/Touch ID système et iOS à jour. Safari peut évincer le stockage, un effacement du site ou changement de profil/origine peut rendre le coffre indisponible. Exportez régulièrement ; la demande de stockage persistant n’est pas une garantie de conservation.

## Chaîne de publication et tests

Dépendances verrouillées, audit npm, actions officielles épinglées par commit. Permissions par job : configure Pages en lecture sans création de site ; build contents:read sans identifiants Git persistés ; deploy pages:write/id-token:write. Liste fermée de sources et de fichiers statiques ; secrets connus, exports, archives, traces et marqueurs de test exclus des bundles. Aucun outil ne certifie l’absence de toute vulnérabilité inconnue ou de secret non reconnaissable.

Les suites testent chiffrement, altération, mauvaise phrase, IV, AAD, migration interrompue et reprise, concurrence, sauvegardes anciennes, absence de clair dans les stockages, verrouillage, CSP, HTML hostile, trafic synthétique, comptabilité, rapprochements, pagination, offline et WebKit iPhone. Résultats réellement exécutés dans [VALIDATION.md](./VALIDATION.md). Le retour OAuth réel, l’installation et les téléchargements iOS sur l’appareil du propriétaire restent une validation physique, distincte des tests simulés.
