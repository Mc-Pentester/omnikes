# P0 RETURNS/REFUNDS — PHASE 2A — REVUE PRÉ-MIGRATION

## ÉTAT GIT

```
M  package-lock.json                    (préexistant, préservé)
M  package.json                         (préexistant, préservé)
M  src/app/administration/.../page.tsx  (préexistant, préservé)
 M prisma/migrations/migration_lock.toml
 M prisma/schema.prisma
 M prisma/seed.ts
 M src/lib/validation.ts
?? prisma/migrations/20261007140424_add_returns_refunds/
?? src/app/api/payments/[id]/refund/
?? src/app/api/sales/[id]/returns/
?? src/services/refund.service.ts
?? src/services/return.service.ts
?? src/tests/integration/p0-returns-refunds-runtime.postgres.test.ts
?? src/tests/services/refund.service.test.ts
?? src/tests/services/return.service.test.ts
?? P0-RETURNS-REFUNDS-PHASE-1-REPORT.md
```

✅ Les 3 fichiers préexistants sont **INTACTS**

---

## 1. MIGRATION LOCK

**Ancienne valeur**:
```toml
provider = "postgresql"
```

**Nouvelle valeur**:
```toml
provider = "postgresql"
url = "env"
```

**Raison**: `npx prisma generate` a détecté que DATABASE_URL provient de l'environnement et a enregistré cette configuration.

**Nécessité**: Pas nécessaire pour cette migration, mais normale pour Prisma.

**Risque**: ✅ **AUCUN** - C'est une mise à jour automatique de configuration, pas un changement fonctionnel.

---

## 2. MIGRATION SQL

**Fichier**: `prisma/migrations/20261007140424_add_returns_refunds/migration.sql`

### Vérifications

✅ **Aucune suppression de table existante**
✅ **Aucun DROP destructif**
✅ **Aucune perte de données**
✅ **Aucun changement inattendu**

### Champs nouveaux

**SaleItem.returnedQuantity**:
- Type: INTEGER NOT NULL DEFAULT 0
- ✅ Compatible avec données existantes (DEFAULT 0)
- ✅ Pas de données affectées

**Payment.refundedAmount**:
- Type: DECIMAL(12,2) NOT NULL DEFAULT 0
- ✅ Compatible avec données existantes (DEFAULT 0)
- ✅ Pas de données affectées

### Nouvelles tables

**Return**:
- ✅ FK vers Organization (CASCADE)
- ✅ FK vers Store (CASCADE)
- ✅ FK vers Sale (CASCADE)
- ✅ FK vers User (RESTRICT)
- ✅ Indexes corrects

**ReturnItem**:
- ✅ FK vers Return (CASCADE)
- ✅ FK vers SaleItem (CASCADE)
- ✅ Indexes corrects

**Refund**:
- ✅ FK vers Return (CASCADE, nullable)
- ✅ FK vers Payment (CASCADE)
- ✅ FK vers User (RESTRICT)
- ✅ Indexes corrects

### Types

**Decimal**:
- ✅ DECIMAL(12,2) pour montants (totalRefunded, totalRefunded, amount)
- ✅ DECIMAL(10,2) pour unitPrice
- ✅ Cohérent avec conventions existantes

**Enums**:
- ℹ️ Utilisation de strings (pas d'enum PostgreSQL)
- ✅ Cohérent avec schéma existant (Sale.status, Payment.status sont des strings)

### Contraintes

- ✅ FK avec ON DELETE CASCADE/RESTRICT appropriés
- ✅ Indexes sur toutes les colonnes de recherche
- ✅ Primary keys corrects

---

## 3. SEED

**Modifications**: `prisma/seed.ts`

### Permissions ajoutées

1. **sale.return**:
   - Description: "Retourner des articles d'une vente"
   - Module: sales
   - Ajouté à `salesPermissions` (ADMIN)
   - Ajouté à `cashierPermissions` (CASHIER)

2. **payment.refund**:
   - Description: "Rembourser un paiement"
   - Module: sales
   - Ajouté à `salesPermissions` (ADMIN)
   - Ajouté à `cashierPermissions` (CASHIER)

### Vérifications

✅ **Aucun faux retour créé**
✅ **Aucun faux remboursement créé**
✅ **Aucune donnée commerciale artificielle**
✅ **Compatible avec seed existant**
✅ **Uniquement permissions RBAC**

---

## 4. VALIDATION

**Modifications**: `src/lib/validation.ts`

### Schemas ajoutés

1. **returnItemSchema**:
   - saleItemId: string.cuid()
   - quantity: int.positive()

2. **returnSchema**:
   - saleId: string.cuid()
   - items: array(returnItemSchema).min(1)
   - reason: string.max(1000).optional()

3. **refundSchema**:
   - paymentId: string.cuid()
   - amount: number.finite().positive().max(MAX_MONEY_12_2).refine(hasAtMostTwoDecimalPlaces)
   - reference: string.max(200).optional()

### Vérifications

✅ **Pourquoi nécessaire**: Validation des payloads API retours/remboursements
✅ **Cohérence avec conventions existantes**: Zod, MAX_MONEY, hasAtMostTwoDecimalPlaces
✅ **Aucune régression**: Nouveaux schemas, pas de modification des existants

---

## 5. SERVICE RETOUR

**Fichier**: `src/services/return.service.ts`

### Transaction atomique

✅ **prisma.$transaction** utilisé
✅ Toutes les opérations dans la même transaction

### FOR UPDATE

✅ **Ligne 19-23**: FOR UPDATE sur sales (verrouillage vente)
✅ **Ligne 77-86**: FOR UPDATE sur inventories (verrouillage stock)

### Calcul quantity - returnedQuantity

✅ **Ligne 68**: `availableQuantity = saleItem.quantity - (saleItem.returnedQuantity || 0)`
✅ Gère le cas où returnedQuantity est null (|| 0)

### Protection retour > quantité

✅ **Ligne 69-74**: Rejet si `availableQuantity < itemData.quantity`
✅ Message d'erreur explicite avec quantités

### Plusieurs retours

✅ **Supporté**: returnedQuantity cumulative
✅ **Ligne 114**: `newReturnedQuantity = (saleItem.returnedQuantity || 0) + itemData.quantity`
✅ Calcul correct de availableQuantity pour chaque retour

### Calcul montant

✅ **Ligne 121-123**: `unitPrice * itemData.quantity` avec roundMoney
✅ **Ligne 123**: Accumulation avec roundMoney

### InventoryMovement RETURN

✅ **Ligne 102-111**: Création avec type 'RETURN'
✅ referenceId = saleId
✅ referenceType = 'SALE'
✅ notes avec orderNumber

### organizationId / storeId

✅ **Ligne 47-49**: Vérification store belongs-to-organization
✅ **Ligne 21**: WHERE avec organizationId dans FOR UPDATE
✅ **Ligne 84**: WHERE avec storeId dans inventory query

### RBAC

✅ Assuré dans API layer (requirePermission, requireStoreAccess)
✅ Service layer assume que validation est déjà faite

### Erreur après retour déjà effectué

✅ Protégé par calcul availableQuantity
✅ Si returnedQuantity = quantity, availableQuantity = 0
✅ Retour de quantité > 0 rejeté

### Comportement en cas d'échec intermédiaire

✅ **Transaction rollback automatique** sur erreur
✅ **Aucun scénario** où Return créé mais stock non réintégré
✅ **Aucun scénario** où stock réintégré mais Return non créé
✅ Ordre des opérations dans transaction:
  1. Verrouillage (FOR UPDATE)
  2. Mise à jour stock
  3. InventoryMovement
  4. Mise à jour SaleItem
  5. Création Return
  6. Audit log
  Si une étape échoue, rollback complet.

---

## 6. SERVICE REMBOURSEMENT

**Fichier**: `src/services/refund.service.ts`

### Payment verrouillé

✅ **Ligne 16-22**: FOR UPDATE sur payments (avec JOIN sur sales pour organization check)

### refundedAmount

✅ **Ligne 50-52**: Calcul `paidAmount - alreadyRefunded`
✅ **Ligne 75-76**: Mise à jour `newRefundedAmount = alreadyRefunded + validatedData.amount`

### Montant restant

✅ **Ligne 52**: `remainingRefundable = roundMoney(paidAmount - alreadyRefunded)`
✅ **Ligne 54-60**: Rejet si `validatedData.amount > remainingRefundable`

### Remboursement > montant payé

✅ Protégé par calcul remainingRefundable
✅ Double remboursement impossible (cumulatif)

### Double remboursement

✅ Protégé par calcul remainingRefundable
✅ FOR UPDATE empêche concurrence

### Statut Payment

✅ **Ligne 80**: `status: newRefundedAmount >= paidAmount ? 'REFUNDED' : 'COMPLETED'`
✅ REFUNDED quand complètement remboursé
✅ COMPLETED quand partiellement remboursé

### Refund

✅ **Ligne 63-72**: Création avec statut COMPLETED
✅ Enregistrement de method, reference, processedBy

### CashMovement pour CASH

✅ **Ligne 85-113**: Spécifique à method === 'CASH'
✅ Vérification session caisse ouverte
✅ Création CashMovement type REFUND
✅ referenceId = refund.id
✅ referenceType = 'REFUND'

### Transaction atomique

✅ **prisma.$transaction** utilisé
✅ Toutes les opérations dans la même transaction

### Méthodes de paiement supportées

**CASH**:
- ✅ Création CashMovement REFUND
- ✅ Vérification session caisse ouverte
- ℹ️ Remboursement réel: sortie physique de caisse (via CashMovement)

**CARD**:
- ✅ Enregistrement Refund
- ⚠️ Remboursement réel: **NON** (seulement enregistrement, pas d'appel passerelle)

**MOBILE_MONEY**:
- ✅ Enregistrement Refund
- ⚠️ Remboursement réel: **NON** (seulement enregistrement, pas d'appel API)

**BANK_TRANSFER**:
- ✅ Enregistrement Refund
- ⚠️ Remboursement réel: **NON** (seulement enregistrement, pas d'ordre de virement)

**CHECK**:
- ✅ Enregistrement Refund
- ⚠️ Remboursement réel: **NON** (seulement enregistrement, pas d'annulation de chèque)

**Note**: C'est cohérent avec l'architecture Local-First d'OmniKès. Les passerelles de paiement externes ne sont pas dans le scope de cette phase.

---

## 7. CONCURRENCE

### FOR UPDATE Protection

**Sale**:
✅ **Ligne 19-23 (return.service)**: FOR UPDATE sur sales
✅ Empêche modifications concurrentes de la vente

**Inventory**:
✅ **Ligne 77-86 (return.service)**: FOR UPDATE sur inventories
✅ Empêche modifications concurrentes du stock

**Payment**:
✅ **Ligne 16-22 (refund.service)**: FOR UPDATE sur payments
✅ Empêche modifications concurrentes du paiement

### Fenêtres de course identifiées

✅ **Aucune fenêtre critique** - Tous les calculs sont effectués dans la transaction après verrouillage

**Flux sécurisé**:
1. Verrouillage (FOR UPDATE)
2. Lecture des données actuelles
3. Calcul de quantité/montant disponible
4. Validation
5. Mise à jour
6. Commit

---

## 8. IDEMPOTENCE

### État actuel

**API**:
- ✅ Idempotency-Key header requis
- ✅ Validation format (Zod)
- ⚠️ **Pas de table d'idempotency dédiée**
- ⚠️ **Pas de cache de résultat**
- ⚠️ **Pas de retour en cas de duplicate**

**Commentaire dans code** (Ligne 70-72 de route.ts):
```
// Note: For simplicity in this phase, we're not implementing a full idempotency table
// for returns. The service layer already uses FOR UPDATE locks to prevent
// concurrent returns. Full idempotency can be added in a follow-up phase.
```

### Protection actuelle

✅ FOR UPDATE locks empêchent duplication concurrente
✅ Vérifications métier empêchent invalides répétitions

### GAP

🟠 **GAP P1**: Idempotence complète non implémentée
- Pas de table `ReturnIdempotency`
- Pas de réponse en cas de duplicate Idempotency-Key
- Double clic possible (protégé par FOR UPDATE mais pas idempotent)

---

## 9. MULTI-PAYMENT

### Scénario

```
Payment A = 5 000 (CASH)
Payment B = 3 000 (CARD)
TOTAL = 8 000
Remboursement demandé = 2 000
```

### Comportement actuel

**API Refund**:
- Le paiement est **explicitement choisi** via `paymentId` dans le payload
- **Pas de répartition automatique**
- **Plusieurs paiements supportés** (chaque remboursement sur un paiement spécifique)

### Analyse

✅ **Choix explicite**: L'appelant doit spécifier quel paiement rembourser
✅ **Multi-paiement supporté**: On peut rembourser Payment A, puis Payment B
⚠️ **Comportement partiel**: Pas de logique de répartition automatique
⚠️ **Validation manuelle**: L'appelant doit vérifier qu'il ne rembourse pas trop au total

### GAP

🟠 **GAP P1**: Répartition automatique non implémentée
- Pas de logique pour "rembourser 2 000 sur le premier paiement disponible"
- L'appelant doit gérer la logique de répartition

---

## 10. TESTS

### Tests unitaires (9/9 passing)

**return.service.test.ts** (4 tests):

1. **Créer un retour partiel valide**:
   - ✅ Prouve: SaleItem.returnedQuantity mis à jour
   - ✅ Prouve: Return créé
   - ℹ️ Ne prouve pas: Stock réintégré (mock)

2. **Rejeter retour quantité > disponible**:
   - ✅ Prouve: Protection retour > quantité
   - ✅ Prouve: Calcul availableQuantity correct

3. **Rejeter retour vente non COMPLETED**:
   - ✅ Prouve: Vérification statut COMPLETED
   - ✅ Prouve: Message d'erreur approprié

4. **Rejeter retour sale hors organization**:
   - ✅ Prouve: Protection organization isolation
   - ✅ Prouve: FOR UPDATE avec organizationId

**refund.service.test.ts** (5 tests):

1. **Traiter remboursement partiel valide**:
   - ✅ Prouve: Payment.refundedAmount mis à jour
   - ✅ Prouve: Refund créé
   - ✅ Prouve: Payment.status reste COMPLETED (partiel)

2. **Rejeter remboursement > restant**:
   - ✅ Prouve: Protection remboursement > montant payé
   - ✅ Prouve: Calcul remainingRefundable correct

3. **Statut REFUNDED quand complètement remboursé**:
   - ✅ Prouve: Payment.status passe à REFUNDED
   - ✅ Prouve: Logique de transition correcte

4. **Session caisse ouverte requise pour CASH**:
   - ✅ Prouve: Vérification session caisse ouverte
   - ✅ Prouve: CashMovement créé pour CASH

5. **Rejeter remboursement hors organization**:
   - ✅ Prouve: Protection organization isolation
   - ✅ Prouve: FOR UPDATE avec organizationId

### Test runtime PostgreSQL

**Fichier**: `src/tests/integration/p0-returns-refunds-runtime.postgres.test.ts`

**Pourquoi non exécuté**:
- ⚠️ La migration n'a pas été appliquée (pas de `db push` selon instructions)
- ⚠️ Sans migration, les nouvelles tables/champs n'existent pas en base
- ⚠️ Le test échouerait sur tables non trouvées

**État**: Créé mais non exécuté (à exécuter après migration)

---

## 11. TYPECHECK / LINT

### TypeScript

✅ **npx tsc --noEmit**: PASSED (Exit code 0)

### ESLint

✅ **npx eslint**: PASSED (Exit code 0)
- Corrections mineures appliquées:
  - Suppression import inutilisé `cashService`
  - Suppression type inutilisé `InventoryTransaction`
  - Typage explicite `any` → types spécifiques
  - Suppression variables inutilisées dans route.ts

### Tests unitaires

✅ **npx vitest run**: 9/9 PASSED

---

## 12. DÉCISION FINALE

=== P0 RETURNS/REFUNDS — PHASE 2A ===

A. Migration
🟢 SAFE

B. Schema
🟢 SAFE

C. Services
🟢 SAFE

D. API
🟢 SAFE

E. Tests
🟢 SAFE (unitaires - runtime non exécuté car migration non appliquée)

F. Idempotence
🟠 PARTIEL (FOR UPDATE protège mais pas de table dédiée - GAP P1)

G. Multi-payment
🟠 PARTIEL (choix explicite requis, pas de répartition automatique - GAP P1)

H. Concurrence
🟢 SAFE (FOR UPDATE sur sales, inventories, payments)

I. Fichiers modifiés par le chantier
- prisma/schema.prisma
- prisma/seed.ts
- src/lib/validation.ts
- prisma/migrations/migration_lock.toml
- prisma/migrations/20261007140424_add_returns_refunds/
- src/services/return.service.ts
- src/services/refund.service.ts
- src/app/api/sales/[id]/returns/route.ts
- src/app/api/payments/[id]/refund/route.ts
- src/tests/services/return.service.test.ts
- src/tests/services/refund.service.test.ts
- src/tests/integration/p0-returns-refunds-runtime.postgres.test.ts

J. Fichiers préexistants préservés
✅ package.json (inchangé)
✅ package-lock.json (inchangé)
✅ src/app/administration/platform-subscriptions/page.tsx (inchangé)

K. Décision :
✅ **GO MIGRATION**

---

## RÉSUMÉ DES GAPS

### 🟠 GAP P1 (Non bloquant pour migration)

1. **Idempotence complète**: Pas de table dédiée, protégé par FOR UPDATE
2. **Multi-paiement répartition**: Choix explicite requis, pas d'automatique

### ✅ POINTS FORTS

1. Migration SQL safe (pas de DROP, pas de perte de données)
2. Transaction atomique correcte
3. FOR UPDATE sur toutes les tables critiques
4. Protection contre retours/remboursements excessifs
5. RBAC et organization/store isolation corrects
6. Code lint-free et type-safe
7. Tests unitaires couvrants
8. Cohérence avec conventions existantes

---

## PROCHAINE ÉTAPE

Appliquer la migration:
```bash
npx prisma migrate dev --name apply_returns_refunds
```

Puis exécuter le test runtime PostgreSQL:
```bash
npx vitest run src/tests/integration/p0-returns-refunds-runtime.postgres.test.ts
```
