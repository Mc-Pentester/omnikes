# Audit technique — Crédit client OmniKès

Date : 2026-11-24
Branche de base : `feat/organization-tax-webview-print`
Branche de travail dédiée : `feat/customer-credit-approval`
Issue de suivi : #171

## Résumé exécutif

Le dépôt contient déjà un premier mécanisme de crédit explicite au niveau d'une vente. Il ne s'agit donc pas d'un module à créer de zéro. En revanche, le mécanisme actuel ne satisfait pas les décisions métier validées : l'autorisation est attribuée à l'utilisateur de la session courante, sans ré-authentification sur place d'un autre gérant, sans PIN dédié, sans échéance, sans plafond client et sans véritable registre de remboursements de créances.

La finalisation de vente sait déjà tenir compte du paiement réel et du crédit explicitement autorisé pour vérifier la couverture financière. Cette logique doit être conservée et étendue sans créer de voie parallèle.

## Éléments confirmés dans le code

### Données Prisma

- `Organization` possède déjà la devise de référence et les relations `customers`, `sales` et `saleCredits`.
- `Customer` est isolé par `organizationId`, mais ne possède pas de plafond de crédit.
- `Sale` possède le client, le magasin, le total, la devise et les paiements.
- `SaleCredit` contient actuellement `organizationId`, `storeId`, `saleId`, `customerId`, `amount`, `status`, `authorizedBy`, `authorizedAt` et `note`. Une contrainte unique impose un seul crédit par vente.
- Il n'existe pas de date d'échéance ni de modèle de remboursement/affectation de remboursement associé à une créance.
- Les relations vers l'organisation, le magasin, le client et l'utilisateur approbateur existent déjà.

### Services et API

- `POST /api/sales/[id]/credit` existe.
- Cette route exige actuellement la permission historique `sale.credit`, puis transmet l'identifiant de l'utilisateur de la session comme `authorizedBy`.
- `saleService.authorizeCredit()` verrouille la ligne de vente avec `SELECT ... FOR UPDATE`, vérifie que la vente est en attente, qu'un client est lié, que le client appartient à l'organisation et que le montant de crédit ne dépasse pas le solde non couvert.
- `saleService.addPayment()` verrouille aussi la vente et déduit le crédit autorisé de la couverture restante.
- `saleService.complete()` vérifie la couverture financière avant de finaliser et de déduire le stock.
- La route de finalisation exige `sale.complete`; elle ne doit jamais être contournée par une approbation de crédit.

### Authentification et RBAC

- Les mots de passe utilisateurs sont stockés sous forme de hash et le projet utilise déjà `bcryptjs`.
- L'authentification et la validation des sessions sont centralisées dans `authService`.
- Les permissions sont vérifiées côté serveur via `roleRepository.hasPermission`.
- L'API actuelle n'effectue pas de vérification d'identité distincte pour l'approbateur. Le caissier qui possède la permission historique peut donc devenir l'approbateur déclaré.
- Aucun champ PIN dédié ni flux de configuration/réinitialisation de PIN n'a été identifié dans le schéma consulté.

### Tests existants

- `src/tests/integration/sale-credit.postgres.test.ts` couvre les ventes entièrement payées, entièrement à crédit, avec paiement partiel + crédit, la couverture insuffisante et plusieurs cas d'isolation.
- Les tests de service couvrent déjà des invariants de vente et de couverture financière.
- Ces tests constituent une base à étendre; ils ne couvrent pas l'authentification d'un autre approbateur par mot de passe/PIN, les échéances, les plafonds, les remboursements de créance, ni les tests E2E du parcours complet.

## Écarts bloquants par rapport aux décisions validées

1. Autorisation par autre utilisateur habilité, directement au POS, avec mot de passe ou PIN.
2. Permission granulaire `credit.approve` (avec compatibilité/migration contrôlée depuis `sale.credit`).
3. Hash et gestion sécurisée d'un PIN distinct, avec limitation des tentatives et réinitialisation.
4. Liaison de l'approbation à un instantané de vente (client, montant, devise, magasin) et expiration courte/usage unique.
5. Paramètre d'organisation pour le délai standard de remboursement, modifiable par le responsable sur une vente.
6. Plafond facultatif par client, calculé sur les créances ouvertes et protégé contre les approbations concurrentes.
7. Registre de créance et remboursements partiels/totaux traçables, avec affectation à une vente et reçu.
8. États de créance, échéances en retard, historique client et rapports séparant ventes, créances et encaissements.
9. Intégration POS et tests E2E, y compris les refus de sécurité.

## Invariants à préserver

- Aucun crédit sans client actif de la même organisation.
- Aucun crédit finalisé sans approbation valide.
- L'approbateur doit être différent du caissier demandeur et avoir `credit.approve` ainsi que l'accès au magasin.
- Une modification du client, du montant, de la devise ou du panier invalide l'approbation.
- L'approbation est courte, à usage unique et ne contient jamais le secret en clair dans la base ou les journaux.
- L'approbation et la création de la créance doivent être transactionnelles et idempotentes.
- La vente, les paiements, le crédit, le stock et la caisse doivent rester cohérents.
- Les migrations sont additives et non destructives; aucun reset ni écrasement de données.
- Devise prise depuis la vente et l'organisation; aucune devise HTG/USD codée en dur.
- Les permissions sont contrôlées côté serveur et les données restent isolées par organisation/magasin.
- Le fonctionnement reste local-first/LAN; aucun service cloud obligatoire.

## Plan de réalisation

### Phase A — Contrat de données et migrations
Ajouter les paramètres d'organisation, le plafond client, les métadonnées d'approbation et l'échéance. Définir les entités de créance et de remboursement/affectation en s'appuyant sur `SaleCredit` si possible, plutôt que dupliquer les dettes. Écrire une migration PostgreSQL additive avec valeurs de compatibilité pour les crédits historiques.

### Phase B — Autorisation sécurisée
Créer une validation distincte de l'approbateur : identifiant + mot de passe ou PIN hashé. Vérifier compte actif, même organisation, accès magasin, permission `credit.approve`, séparation demandeur/approbateur, limite de tentatives, expiration et instantané de vente. Ne jamais créer de session de connexion ni exposer le hash PIN à l'interface.

### Phase C — Flux POS et finalisation
Faire apparaître la demande au moment où le caissier choisit le crédit. Bloquer la finalisation tant que l'autorisation valide n'est pas obtenue. Invalider l'autorisation à chaque changement de données financières. Finaliser et créer/mettre à jour la créance dans la transaction existante de finalisation.

### Phase D — Encaissement et suivi client
Ajouter remboursements partiels/totaux, idempotence, reçus, échéances, solde, historique et rapports. Les remboursements doivent alimenter les journaux de caisse/banque existants sans être comptés comme ventes.

### Phase E — Validation
Tests unitaires, API, PostgreSQL réel et Playwright E2E : autorisation par mot de passe et PIN, mauvais secret, utilisateur sans permission, auto-approbation, compte inactif, mauvais magasin/organisation, changement de panier après approbation, expiration, plafond et concurrence, paiement partiel, double soumission, remboursement, annulation/retour et cohérence stock/caisse.

## Livraison et CI

- Développement exclusivement sur `feat/customer-credit-approval`, créée depuis `feat/organization-tax-webview-print`.
- Ne pas modifier ni fusionner `main`.
- Migrations non destructives uniquement.
- Tests E2E à intégrer au workflow CI.
- Workflow Windows Installer maintenu manuel; aucun déclenchement sur chaque push/PR.
- Ne pas déclarer l'implémentation terminée avant CI verte et revue finale.
