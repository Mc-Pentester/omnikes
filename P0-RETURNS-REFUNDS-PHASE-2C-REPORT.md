# P0 RETURNS/REFUNDS — PHASE 2C — COHÉRENCE MÉTIER

## 1. Retour sans remboursement

**Comportement actuel**:
- Return.status: **COMPLETED** (automatiquement défini dans return.service.ts ligne 136)
- Stock: **réintégré immédiatement** (ligne 92-108)
- Return.totalRefunded: **calculé à partir des quantités retournées** (ligne 55, 120)
- Payment.refundedAmount: **NON modifié** par le return service
- Possibilité de rembourser plus tard: **OUI** - API refund peut être appelée indépendamment

**Analyse**:
- Le système considère le retour comme "COMPLETED" même sans remboursement financier
- Le stock est restauré mais l'argent n'est pas
- L'utilisateur peut oublier de rembourser → incohérence possible entre stock et argent

**Verdict**: **GAP P1** - Return ne devrait pas être COMPLETED sans remboursement

---

## 2. Remboursement sans retour

**Comportement actuel**:
- L'API refund **n'exige PAS de returnId** (Refund.returnId est nullable dans schema.prisma)
- Le service refund **ne vérifie PAS** si un retour existe (refund.service.ts ligne 10-135)
- Il vérifie seulement: paiement existe + montant restant suffisant

**Analyse**:
- On peut rembourser un paiement sans avoir physiquement reçu les produits
- Aucun lien obligatoire entre retour physique et remboursement financier
- Possibilité de fraude: rembourser sans récupérer le produit

**Verdict**: **GAP P0** - Refund devrait être lié à un Return obligatoirement

---

## 3. Correspondance Return ↔ Refund

**Analyse du schéma**:
- `Refund.returnId` existe mais est **nullable** (String?)
- Dans refund.service.ts ligne 62-71, **returnId n'est PAS passé** lors de la création
- Un Refund peut exister sans Return
- Un même Return peut recevoir plusieurs Refund (relation one-to-many)

**Traçabilité**:
- On peut connaître les refunds d'un payment via Payment.refunds[]
- On peut connaître les refunds d'un return via Return.refunds[]
- MAIS le lien n'est pas créé par le service actuel
- Impossible de savoir exactement combien une Return a déjà été remboursée

**Verdict**: **GAP P0** - Refund.returnId devrait être obligatoire et set par le service

---

## 4. Montant remboursable

**Niveau 1 - Contrôle actuel (Payment)**:
- Vérifié: `paidAmount - alreadyRefunded >= requestedAmount`
- Service refund.service.ts ligne 48-59
- **PASS** - On ne peut pas rembourser plus que le paiement

**Niveau 2 - Contrôle manquant (Return)**:
- PAS vérifié: `Return.totalRefunded - sum(Refund.amount for this Return) >= requestedAmount`
- On peut rembourser plus que ce qui a été retourné physiquement
- Exemple: retour de 250 HTG, remboursement de 500 HTG → accepté si le paiement est suffisant

**Verdict**: **GAP P0** - Devrait vérifier que le remboursement ne dépasse pas le retour

---

## 5. Retour multiple

**Scénario**:
- Vente: 10 unités
- Retour 1: 3 → OK (returnedQuantity = 3, disponible = 7)
- Retour 2: 2 → OK (returnedQuantity = 5, disponible = 5)
- Retour 3: 5 → OK (returnedQuantity = 10, disponible = 0)
- Retour 4: 1 → **REJETÉ** (availableQuantity = 0, requested = 1)

**Vérification**:
- return.service.ts ligne 65: `availableQuantity = saleItem.quantity - (saleItem.returnedQuantity || 0)`
- ligne 66-71: erreur si `availableQuantity < itemData.quantity`

**Verdict**: **PASS** - Le système gère correctement les retours multiples

---

## 6. Double remboursement

**Scénario 1 - Remboursement complet + sur-remboursement**:
- Paiement: 100
- Refund 1: 100 → refundedAmount = 100, status = REFUNDED
- Refund 2: 1 → **REJETÉ** (remainingRefundable = 0)

**Scénario 2 - Remboursement fractionné + sur-remboursement**:
- Paiement: 100
- Refund 1: 40 → refundedAmount = 40, remaining = 60
- Refund 2: 60 → refundedAmount = 100, remaining = 0
- Refund 3: 1 → **REJETÉ** (remainingRefundable = 0)

**Vérification**:
- refund.service.ts ligne 48-59: `remainingRefundable = paidAmount - alreadyRefunded`
- ligne 53-59: erreur si `validatedData.amount > remainingRefundable`

**Verdict**: **PASS** - Le système protège contre le double remboursement

---

## 7. CASH

**Comportement**:
- CASH payment → refund → CashMovement REFUND créé
- refund.service.ts ligne 84-112
- Vérifie qu'une cash session est ouverte
- CashMovement.referenceId = payment.saleId (pas refund.id)
- CashMovement.referenceType = 'SALE'

**Analyse**:
- Pas de mouvement en double (transaction atomique)
- Cash session correctement liée
- Type REFUND correct

**Verdict**: **PASS** - CASH refunds sont corrects

---

## 8. Non-CASH

**Comportement**:
- CARD/MOBILE_MONEY/BANK_TRANSFER/CHECK → refund
- Aucun CashMovement créé (ligne 84: if payment.method === 'CASH')
- Enregistrement seulement dans table Refund
- Pas de prétention de remboursement externe réel

**Verdict**: **PASS** - Non-CASH refunds sont corrects (enregistrement only)

---

## 9. Idempotence actuelle

**Header Idempotency-Key**:
- API return: exigé et validé (route.ts ligne 35-46)
- API refund: PAS exigé (route.ts ne le valide pas)

**Comportement si même requête envoyée deux fois**:
- **Sans FOR UPDATE**: double création possible
- **Avec FOR UPDATE**: une seule opération réussit, l'autre échoue avec erreur de verrou ou dépassement
- FOR UPDATE empêche la double opération CONCURRENTE mais PAS la duplication réelle

**Différence**:
- **Idempotence stricte**: même requête = même résultat, pas de duplication
- **FOR UPDATE**: protège contre la course, mais ne garantie pas l'absence de duplication en cas de retry

**Verdict**: **GAP P1** - Header validé mais pas de table d'idempotence pour garantir la déduplication

---

## 10. Multi-payment

**Scénario**:
- Vente = 100
- CASH = 60
- CARD = 40
- Remboursement de 80 demandé

**Comportement actuel**:
- API refund exige de choisir un paymentId explicite
- Si on choisit CASH (60) et demande 80 → **REJETÉ** (80 > 60)
- Si on choisit CARD (40) et demande 80 → **REJETÉ** (80 > 40)
- Aucune répartition automatique
- L'utilisateur doit manuellement:
  - Choisir CASH, rembourser 60
  - Choisir CARD, rembourser 20

**Verdict**: **GAP P1** - Pas de répartition automatique, choix manuel requis

---

## CLASSIFICATION DES GAPS

### P0 — Bloque la mise en production

1. **Refund sans Return** (Gap #2)
   - On peut rembourser sans retour physique
   - Risque de fraude
   - **Action requise**: Rendre Refund.returnId obligatoire et vérifier l'existence du Return

2. **Return ↔ Refund traçabilité** (Gap #3)
   - Refund.returnId nullable et non set par le service
   - Impossible de lier un remboursement à un retour
   - **Action requise**: Passer returnId en required, le set dans refund.service

3. **Montant remboursable vs Return** (Gap #4)
   - On peut rembourser plus que le montant du retour
   - Pas de vérification de cohérence entre retour physique et remboursement
   - **Action requise**: Ajouter vérification `sum(Refund.amount) <= Return.totalRefunded`

### P1 — Doit être traité avant V1 finale

4. **Return sans remboursement** (Gap #1)
   - Return marqué COMPLETED sans remboursement
   - Incohérence possible stock/argent
   - **Action recommandée**: Status COMPLETED seulement après remboursement complet

5. **Idempotence stricte** (Gap #9)
   - Header validé mais pas de table dédiée
   - FOR UPDATE protège contre la course mais pas la duplication
   - **Action recommandée**: Table ReturnIdempotency / RefundIdempotency

6. **Multi-payment allocation** (Gap #10)
   - Choix manuel du paiement requis
   - Pas de répartition automatique
   - **Action recommandée**: Algorithme de répartition proportionnelle

### P2 — Amélioration ultérieure

Aucun gap P2 identifié dans cette analyse.

---

## VERDICT FINAL

**PHASE 2C BLOCKED — GAP CRITIQUE**

### Raison

3 gaps P0 identifiés qui doivent être corrigés avant mise en production:

1. **Refund sans Return**: Possible de rembourser sans retour physique
2. **Traçabilité Return ↔ Refund**: returnId nullable et non utilisé
3. **Montant remboursable**: Pas de vérification contre Return.totalRefunded

Ces gaps créent des incohérences métier potentiellement dangereuses:
- Remboursement sans produit retourné
- Remboursement supérieur au retour
- Impossibilité de tracer quels remboursements correspondent à quels retours

### Actions requises

1. Rendre `Refund.returnId` required dans schema.prisma
2. Passer `returnId` dans l'API refund (payload)
3. Modifier refund.service pour:
   - Exiger returnId
   - Vérifier que le Return existe
   - Vérifier que `sum(Refund.amount for this Return) + requestedAmount <= Return.totalRefunded`
4. Modifier return.service pour:
   - Garder status PENDING jusqu'à remboursement complet
   - OU introduire status RETURNED (physique) vs REFUNDED (financier)
