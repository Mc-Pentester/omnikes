# Chantier — alignement des abonnements et des fonctionnalités commerciales

## Objectif

Faire correspondre les trois offres publiées d'OmniKès aux capacités réellement autorisées par l'application. Le plan sélectionné doit être une règle métier appliquée côté serveur, et non une simple étiquette stockée sur l'organisation ou un masquage visuel dans l'interface.

Ce chantier conserve les principes du produit : local-first, fonctionnement POS sans Internet permanent, cloud facultatif et boutique en ligne facultative.

## État initial vérifié sur `main`

Référence de départ : `d367db71c2d81c3a9981ea14622c190f5faf925e`.

- Le modèle `Organization` possède `subscriptionStatus`, `subscriptionPlan` et `subscriptionExpiresAt`.
- Les plans acceptés sont `OMNIKES_149`, `OMNIKES_249` et `OMNIKES_299`.
- `PlatformSubscriptionService` permet à un opérateur plateforme autorisé d'activer ou d'annuler un abonnement et écrit un journal d'audit.
- Le contrôle observé de l'abonnement concerne notamment l'affichage de l'identité du magasin sur les tickets et les proformas imprimés.
- Aucun registre central de fonctionnalités par plan ni garde d'accès métier par plan n'a été établi dans cet audit.
- Le site décrit des fonctionnalités par formule, mais leur disponibilité effective doit être prouvée dans le code et par des tests.

Conclusion : la gestion de l'état d'abonnement existe; l'application des droits fonctionnels correspondant aux trois offres reste à construire et à démontrer.

## Catalogue commercial de référence

Les montants sont en USD. Les prix annuels et mensuels sont deux choix de périodicité de facturation, pas une conversion indicative.

| Offre | Annuel | Mensuel |
|---|---:|---:|
| Essentiel | 149 USD/an | 14,99 USD/mois |
| Professionnel | 249 USD/an | 24,99 USD/mois |
| Entreprise | 299 USD/an | 29,99 USD/mois |

### Essentiel

- Caisse et ventes.
- Produits, variantes, SKU et codes-barres.
- Gestion des stocks et ajustements.
- Clients, remboursements et proformas.
- Rapports standards.
- Utilisateurs et rôles de base.
- Fonctionnement local et sauvegarde/restauration.

### Professionnel — inclut Essentiel

- Plusieurs établissements et caisses.
- Transferts de stock entre magasins.
- Achats et fournisseurs.
- Crédit client, promotions et tarifs différenciés.
- Rôles avancés, exports et journal d'activité.
- Rapports par magasin et sauvegardes automatisées.

### Entreprise — inclut Professionnel

- Gestion centralisée des établissements.
- Vue consolidée des ventes et des stocks.
- Comparaison des performances entre magasins.
- Catalogue produits centralisé.
- Responsables et paramètres par établissement.
- Contrôle avancé et tableaux de bord.

### Éléments communs et options

L'architecture local-first, la maîtrise des données et la sauvegarde/restauration locales restent communes aux offres. Le cloud et la boutique en ligne restent facultatifs et ne doivent pas devenir des prérequis au POS. Installation, configuration, formation, matériel, hébergement cloud, boutique en ligne et migration de données restent des services/options distincts, sauf décision commerciale ultérieure documentée.

## Architecture cible

### 1. Catalogue de capacités centralisé

Créer un catalogue typé et versionné des capacités commerciales (par exemple `pos.sales`, `inventory.core`, `inventory.transfers`, `purchases.manage`, `customers.credit`, `reports.advanced`, `organization.multi_store`, `analytics.consolidated`). Chaque capacité doit avoir une définition stable, un niveau de plan minimum et une description.

Les codes définitifs seront alignés sur les domaines et permissions existants après inventaire. Ne pas dupliquer le RBAC : les droits d'abonnement déterminent ce que l'organisation a acheté; les rôles déterminent ce qu'un utilisateur de cette organisation a le droit de faire. L'accès effectif exige les deux.

### 2. Service d'entitlements unique

Introduire un service côté serveur qui reçoit l'organisation, le plan, le statut, l'expiration et la capacité demandée. Il doit :

- résoudre le plan vers les capacités incluses;
- refuser par défaut les capacités inconnues ou non incluses;
- vérifier le statut et l'expiration selon une règle temporelle unique;
- retourner une décision explicable (autorisé, plan requis, abonnement inactif/expiré);
- être utilisé par les routes API/services métier, jamais uniquement par les composants React.

Les routes doivent dériver l'organisation depuis la session et le contexte tenant autorisé, pas depuis un identifiant libre fourni par le client. Les vérifications d'isolation entre organisations restent obligatoires.

### 3. Modèle d'abonnement et périodicité

Conserver les trois identifiants de plans existants pour compatibilité. Ajouter séparément la périodicité (`MONTHLY` ou `ANNUAL`) et les métadonnées nécessaires uniquement après avoir inspecté les migrations et les flux d'activation.

Ne pas confondre :
- le plan commercial (Essentiel/Professionnel/Entreprise);
- la périodicité choisie (mensuelle/annuelle);
- le statut de l'abonnement;
- la période de validité (dates);
- le moyen et l'état du paiement.

Ne pas inventer une intégration de paiement automatique. Dans cette première livraison, l'activation/renouvellement manuel par l'opérateur plateforme peut rester le mécanisme de provisionnement si c'est le flux déjà supporté. Les montants facturés doivent correspondre exactement à la périodicité sélectionnée.

### 4. Essai gratuit

Le site annonce un essai gratuit de 7 jours. Le traiter comme un état/période explicite et auditable, distinct d'un abonnement payant. Définir le comportement d'expiration et le plan accordé pendant l'essai avant d'activer le flux. Ne pas auto-créer ou convertir silencieusement des abonnements payants.

### 5. Local-first et disponibilité hors ligne

La vérification des capacités doit s'appuyer sur l'état d'abonnement disponible dans la base locale de l'installation. Le POS, la caisse et les opérations de base ne doivent pas appeler un serveur distant à chaque action. Une connexion Internet ne doit pas être nécessaire pour vérifier un droit déjà provisionné localement.

La synchronisation/validation distante éventuelle est hors de ce chantier initial, sauf si le code existant l'exige explicitement.

## Séquencement proposé

### Phase A — inventaire et matrice prouvée

- Cartographier les pages, composants, API et services pour chaque capacité annoncée.
- Distinguer « implémenté », « partiel », « absent » et « non vérifié ».
- Relier chaque capacité aux permissions RBAC existantes et aux points d'entrée serveur.
- Identifier les fonctions actuellement communes à tous les plans et les éventuelles limites de données (nombre de magasins/utilisateurs) qui ne sont pas spécifiées sur le site.
- Ne pas inventer de quotas : si aucun quota n'est annoncé, ne pas en ajouter.

### Phase B — moteur d'entitlements

- Ajouter les types, le catalogue de capacités et le service central.
- Ajouter les champs de périodicité/statut nécessaires avec migration additive, réversible si possible et sans suppression de données.
- Garder une compatibilité explicite pour les organisations existantes dont le plan est `null` ou le statut `NONE`; aucune activation implicite.
- Protéger les API métier côté serveur et conserver le contrôle RBAC.
- Fournir des erreurs stables et traduisibles pour les fonctions non incluses.

### Phase C — interface d'administration et expérience utilisateur

- Afficher le nom lisible du plan, la périodicité, le statut et l'expiration.
- Empêcher les erreurs de sélection/édition d'organisation et rendre les changements explicites.
- Présenter les fonctionnalités indisponibles avec une explication et le plan requis, sans masquer les données déjà enregistrées.
- Ne pas bloquer la consultation/export des données historiques d'un tenant lors d'un downgrade ou d'une expiration; définir des règles de lecture seule avant toute restriction destructive.

### Phase D — preuve automatisée

- Tests unitaires du catalogue et des règles temporelles.
- Tests PostgreSQL d'activation, renouvellement, expiration, annulation, changement de plan et compatibilité des organisations existantes.
- Tests API de chaque capacité protégée : utilisateur autorisé au niveau RBAC mais plan insuffisant, plan suffisant mais rôle insuffisant, tenant A tentant d'accéder aux données de B.
- Tests E2E Playwright des trois plans, des fonctions incluses/exclues, de la sélection d'organisation et de l'expiration.
- Vérifier explicitement le fonctionnement local sans accès Internet pour les capacités provisionnées.
- Les tests doivent utiliser des données/organisations isolées et ne jamais réinitialiser une base utilisateur.

## Critères d'acceptation obligatoires

1. Chaque ligne du catalogue commercial est reliée à une capacité technique existante et à au moins un test.
2. Une capacité non incluse est refusée côté serveur même si l'utilisateur appelle directement l'API.
3. Un plan supérieur hérite de toutes les capacités des plans inférieurs.
4. Un rôle utilisateur insuffisant reste refusé même si l'abonnement inclut la capacité.
5. Un abonnement expiré/inactif n'accorde pas les capacités payantes, selon la politique d'expiration validée.
6. Les données métier existantes ne sont ni supprimées ni rendues inaccessibles à l'export lors d'un changement de plan.
7. Les organisations existantes sans abonnement restent dans cet état; aucune migration ne les active par défaut.
8. Le POS et les fonctions locales incluses continuent de fonctionner sans Internet permanent.
9. Les tarifs affichés, la périodicité enregistrée et le calcul de validité sont cohérents.
10. CI exécute les tests unitaires, PostgreSQL et E2E pertinents. Le workflow de packaging/installation Windows ne doit pas être déclenché par chaque push ou PR.

## Décisions à confirmer avant le code qui modifie les règles commerciales

- Pendant l'essai de 7 jours, quel plan est accordé : Essentiel ou Professionnel?
- À l'expiration/annulation : blocage des nouvelles opérations payantes, ou période de grâce? Les données doivent rester consultables/exportables.
- L'annulation prend-elle effet immédiatement ou à la fin de la période déjà payée?
- Les changements de plan prennent-ils effet immédiatement ou au prochain renouvellement?
- Les limites de magasins/utilisateurs sont-elles réellement souhaitées? Aucune limite chiffrée n'est publiée; ne pas en créer sans validation.
- Comment le paiement mensuel/annuel est-il constaté au lancement (confirmation manuelle, preuve de paiement ou intégration future)?

## Hors périmètre explicite

- Intégration MonCash/NatCash ou passerelle de paiement automatique.
- Obligation d'hébergement cloud ou de synchronisation distante.
- Activation de la boutique en ligne par défaut.
- Suppression, migration destructive ou réinitialisation de bases clientes.
- Modification du workflow de packaging Windows ou exécution de l'installateur à chaque push.

## Livrables attendus dans cette PR

Cette PR établit le plan technique et les critères de preuve. Les phases d'implémentation doivent ensuite être livrées dans cette même branche/PR, avec migrations additives, tests et vérification CI avant fusion. Aucun changement de comportement commercial n'est activé par ce document seul.
