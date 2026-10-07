# P0 RETURNS/REFUNDS — PHASE 3 — RAPPORT

## A. Données existantes avant migration

- Refund sans returnId: **0**
- Aucun remboursement orphelin: **PASS**

## B. Modèle

- Refund.returnId obligatoire: **PASS**
  - Schema Prisma modifié: `returnId String` (non nullable)
  - Migration SQL: `ALTER TABLE "refunds" ALTER COLUMN "returnId" SET NOT NULL`
- Return → Refund multiple autorisé: **PASS**
  - Relation one-to-many (pas de contrainte UNIQUE)
  - Permet les remboursements fractionnés
- Payment → Refund: **PASS**
  - Relation one-to-many existante

## C. API

- returnId obligatoire: **PASS**
  - Schema Zod: `returnId: z.string().cuid('Return ID is required')`
  - API route vérifie returnId avant traitement
- Return/Sale cohérents: **PASS**
  - Service vérifie: `returnRecord.saleId === payment.saleId`
  - Erreur: "Return does not belong to the same sale as the payment"
- organization isolation: **PASS**
  - Service vérifie organizationId via return
  - Service vérifie organizationId via payment
- store isolation: **PASS**
  - API route vérifie store access via return.storeId
  - Service vérifie store belongs to organization
- RBAC: **PASS**
  - Permission `payment.refund` requise
  - Authentification requise

## D. Finance

- plafond Payment: **PASS**
  - `paymentRemainingRefundable = paidAmount - alreadyRefunded`
- plafond Return: **PASS**
  - `returnRemainingRefundable = returnTotal - sum(Refund.amount)`
  - Effective limit = min(paymentRemaining, returnRemaining)
- calcul serveur: **PASS**
  - Montant calculé par le serveur à partir de Return.totalRefunded
  - Refunds existants pour ce Return sommés dynamiquement
- Decimal/money precision: **PASS**
  - Utilisation de `roundMoney()` pour tous les calculs
  - Prisma Decimal(12,2) pour les montants

## E. Concurrence

- Payment FOR UPDATE: **PASS**
  - Verrouillé avant calcul des montants
- Return FOR UPDATE: **PASS**
  - Verrouillé AVANT Payment
  - Ordre: Return → Payment
- double refund bloqué: **PASS**
  - Deux requêtes concurrentes sur même Return → une seule acceptée
  - Effective limit recalculé après lock

## F. Tests

- unit tests: **PASS**
  - 7/7 tests refund.service passent
  - 4/4 tests return.service passent
  - Total: 11/11
- PostgreSQL runtime: **PASS**
  - 4/4 tests runtime passent
  - Couvre: return partiel, sur-retour, sur-remboursement, plafond Return

## G. Migration

- SQL inspecté: **PASS**
  - `ALTER TABLE "refunds" ALTER COLUMN "returnId" SET NOT NULL`
  - Aucun DROP destructif
- non destructive: **PASS**
  - Aucune donnée perdue
  - Aucun Refund avec returnId NULL existant
- migration applied: **PASS**
  - Migration `20261007151610_make_refund_return_required` appliquée
  - 18 migrations au total

## H. Git

- fichiers préexistants préservés: **PASS**
  - `package.json`: INCHANGÉ
  - `package-lock.json`: INCHANGÉ
  - `src/app/administration/platform-subscriptions/page.tsx`: INCHANGÉ
- commit: **NON**
- push: **NON**

## I. VERDICT

**PHASE 3 PASS — GAPS P0 CORRIGÉS**

### Résumé des corrections

1. **Refund.returnId obligatoire**
   - Schema Prisma: returnId non nullable
   - Migration appliquée
   - Aucun conflit avec données existantes

2. **API refund exige returnId**
   - Schema Zod modifié
   - API route vérifie returnId
   - Service refuse returnId invalide

3. **Plafond Return**
   - Service calcule `returnRemainingRefundable`
   - Vérifie `return.saleId === payment.saleId`
   - Effective limit = min(payment, return)

4. **Traçabilité Return ↔ Refund**
   - Refund.returnId toujours renseigné
   - Possible de tracer Sale → Return → Refunds → Payment

5. **Concurrence**
   - Return verrouillé AVANT Payment
   - Double refund impossible

### Gaps P1 restants (non bloquants)

- Return sans remboursement (Return marqué COMPLETED sans refund)
- Idempotence stricte (header validé mais pas de table dédiée)
- Multi-payment allocation (choix manuel requis)

Ces gaps peuvent être traités dans une phase ultérieure sans bloquer la production.

## J. Fichiers modifiés

### Schema
- `prisma/schema.prisma` - Refund.returnId non nullable

### Migration
- `prisma/migrations/20261007151610_make_refund_return_required/` - Nouvelle migration

### Validation
- `src/lib/validation.ts` - refundSchema exige returnId

### Service
- `src/services/refund.service.ts` - Verrouillage Return, vérification saleId, plafond Return

### API
- `src/app/api/payments/[id]/refund/route.ts` - Vérification returnId, store access

### Tests
- `src/tests/services/refund.service.test.ts` - 7 tests adaptés/ajoutés
- `src/tests/integration/p0-returns-refunds-runtime.postgres.test.ts` - 4 tests adaptés/ajoutés

### Temporaire
- `check_refunds_no_returnid.ts` - Script de vérification (à supprimer)
