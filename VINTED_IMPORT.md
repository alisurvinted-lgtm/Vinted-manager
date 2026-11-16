# Import Vinted : possibilités vérifiées et limites

Recherche sur les aides officielles effectuée le **16 novembre 2026** pour préparer l’import d’un compte Vinted classique. Aucune connexion au compte, API privée, extraction automatisée ou récupération d’identifiants n’est utilisée.

## Ce qui est confirmé

- [Aide officielle française : droits relatifs aux données](https://www.vinted.fr/help/1432) : possibilité de demander une copie des données du compte.
- [Aide officielle britannique : copie des données du compte](https://www.vinted.co.uk/help/1374?access_channel=hc_topics) : demande depuis les paramètres de confidentialité, préparation annoncée par email, puis téléchargement d’une archive ZIP contenant des documents HTML, des photos et des PDF.

La description britannique ne garantit pas un export français identique. Elle ne confirme ni les noms de fichiers/champs transactionnels, ni la présence de toutes les dates, coûts TTC, frais, annulations ou remboursements nécessaires aux calculs. Aucun schéma officiel CSV/Excel/JSON d’achats et de ventes, ni API publique pour ce compte, n’a été confirmé. Les exemples de services tiers ne sont pas traités comme une spécification officielle. La page française correspondante sur le détail de l’export n’était pas consultable publiquement durant la recherche ; aucune protection n’a été contournée.

## Ce que fournit cette version

**Mes articles → Importer depuis Vinted** ouvre un guide avec les liens ci-dessus et un statut explicite de préparation. Le registre des formats transactionnels pris en charge est **vide**. L’application n’invente aucun connecteur.

Le sélecteur vérifie uniquement une taille valide, non nulle, de **20 Mo maximum**, puis refuse le fichier comme non pris en charge. Il ne lit aucun contenu, n’extrait aucune archive, n’exécute aucun HTML et ne transmet rien. La taille limite un futur traitement ; elle n’est pas une validation de structure, de type réel ou de provenance. Les articles, ventes, frais, paramètres et opérations existants ne sont ni remplacés ni modifiés. Une sélection répétée reste sans effet.

L’ajout manuel demeure disponible. Les fichiers `.vmbackup` et les anciens JSON de Vinted Manager se restaurent dans **Paramètres**, avec leurs confirmations et contrôles existants : ce sont des sauvegardes de l’application, pas des exports Vinted.

## Condition pour activer un véritable analyseur

Il faut d’abord un **exemple minimal anonymisé issu d’un export officiel réel** : arborescence et noms de champs, quelques lignes synthétiques de même structure, sans nom/adresse/email/identifiant personnel, lien de téléchargement, message privé ou référence de compte. Ne partagez pas l’archive complète et ne la placez jamais dans GitHub. En attendant, aucun achat ni aucune vente ne peut être importé depuis un export Vinted dans cette application.

Le futur analyseur devra ensuite être développé et testé sur cette structure vérifiée :

1. Limiter taille, nombre d’entrées et, s’il s’agit d’une archive, décompression, chemins et types autorisés ; refuser les formats inconnus/corrompus et ne jamais exécuter le contenu.
2. Distinguer explicitement achat de stock, vente finalisée, remboursement et annulation à partir des champs effectivement présents. L’absence de statut fiable doit bloquer la conversion automatique.
3. Présenter un aperçu modifiable avant écriture, sans inventer prix, date, coût d’acquisition ou lien entre achat et vente. Demander les informations manquantes ; ne pas créer une marge sur un coût inconnu.
4. Identifier les doublons dans le fichier et la base, privilégier les identifiants officiels quand ils existent et soumettre les correspondances incertaines à l’utilisateur.
5. Demander une confirmation du lot, ajouter uniquement les lignes valides choisies dans une transaction locale, sans écraser les articles existants.
6. Prévoir une migration compatible si des champs de provenance deviennent nécessaires ; conserver les sauvegardes et données antérieures.

Ces points sont des exigences pour la prochaine étape, **pas des fonctionnalités d’import transactionnel revendiquées dans cette version**.
