# OMNIKÈS — RAPPORT D'AUDIT AVANT MODIFICATION V1-07

---

## 1.1 FICHIERS CONCERNÉS

| Fichier | Rôle | Pourquoi modifier |
| ------- | ---- | ----------------- |
| `prisma/schema.prisma` | Schéma DB | **NON** - TaxConfiguration existe déjà, pas de modification nécessaire |
| `src/services/sale.service.ts` | Calcul fiscal backend | **NON** - recalculateTotals() utilise déjà TaxConfiguration, fallback 0.18 documenté |
| `src/services/proforma.service.ts` | Calcul fiscal proforma | **NON** - recalculateTotals() utilise déjà TaxConfiguration, fallback 0.18 documenté |
| `src/app/pos/page.tsx` | Frontend POS | **OUI** - Ligne 345: `const tax = subtotal * 0.18;` hardcodé, ligne 666: affichage "Taxe (18%)" hardcodé, ligne 388: envoie tax calculée localement |
| `src/app/api/tax/route.ts` | **À CRÉER** | API pour récupérer TaxConfiguration de l'organisation |
| `src/lib/validation.ts` | Validation | **NON** - Validation tax field existe, pas de modification nécessaire |

---

## 1.2 ÉTAT ACTUEL DU CALCUL FISCAL

### Frontend
```typescript
// src/app/pos/page.tsx ligne 345
const tax = subtotal * 0.18;  // HARDCODÉ - PROBLÈME CRITIQUE
```
- Calcule la taxe localement avec 0.18 hardcodé
- Envoie la taxe calculée au backend via syncCartToSale()
- Affiche "Taxe (18%)" hardcodé (ligne 666)

### Backend
```typescript
// src/services/sale.service.ts lignes 258-260
const taxRate = sale?.organization?.taxConfiguration?.taxRate 
  ? Number(sale.organization.taxConfiguration.taxRate) 
  : 0.18; // Fallback to 18% if no configuration
```
- Récupère taxRate depuis TaxConfiguration de l'organisation
- Fallback 0.18 si pas de configuration
- Recalcule les totaux après chaque modification d'item

### Base de données
```prisma
model TaxConfiguration {
  id                String   @id @default(cuid())
  country           String   @unique
  taxRate           Decimal  @db.Decimal(5, 4) // e.g., 0.1800 for 18%
  taxRules          Json
  // Relation avec Organization
}
```
- TaxConfiguration existe avec taxRate Decimal(5,4)
- Organization.taxConfigurationId nullable
- Pas de modification nécessaire

### API
- **Aucune API** pour récupérer TaxConfiguration
- Le POS ne peut pas récupérer le taux fiscal du backend
- Nécessite création de `/api/tax` ou `/api/settings/tax`

### Source de vérité actuelle
**INCOHÉRENTE**: Frontend utilise 0.18 hardcodé, Backend utilise TaxConfiguration avec fallback 0.18

---

## 1.3 VÉRIFICATION DU SCHÉMA

### TaxConfiguration
- ✅ `id`: String @id @default(cuid())
- ✅ `country`: String @unique
- ✅ `taxRate`: Decimal @db.Decimal(5, 4) - précision suffisante
- ✅ `taxRules`: Json - règles fiscales pays
- ✅ Relation avec Organization: `taxConfigurationId String?` nullable
- ✅ Relation inverse: `organizations Organization[]`
- ✅ Contrainte unicité sur country
- ✅ Pas de modification nécessaire

### Organization
- ✅ `taxConfigurationId String?` - nullable (fallback possible)
- ✅ Relation avec TaxConfiguration
- ✅ Pas de modification nécessaire

**CONCLUSION**: Le schéma est complet et adéquat. Aucune migration Prisma nécessaire.

---

## 1.4 VÉRIFICATION DE SaleService

### recalculateTotals() (lignes 240-271)
```typescript
async recalculateTotals(saleId: string, organizationId: string) {
  const items = await saleRepository.listItems(saleId, organizationId);
  const subtotal = items.reduce((sum: number, item: SaleItem) => sum + Number(item.totalPrice), 0);
  const discount = items.reduce((sum: number, item: SaleItem) => sum + Number(item.discount), 0);
  
  // Get tax rate from organization's tax configuration
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: {
      organization: {
        include: {
          taxConfiguration: true,
        },
      },
    },
  });

  const taxRate = sale?.organization?.taxConfiguration?.taxRate 
    ? Number(sale.organization.taxConfiguration.taxRate) 
    : 0.18; // Fallback to 18% if no configuration
  
  const tax = subtotal * taxRate;
  const total = subtotal + tax - discount;

  await saleRepository.update(saleId, organizationId, {
    subtotal,
    discount,
    tax,
    total,
  });
}
```
- ✅ Récupère TaxConfiguration depuis l'organisation
- ✅ Fallback 0.18 documenté
- ✅ Calcule tax = subtotal * taxRate
- ✅ Calcule total = subtotal + tax - discount
- ✅ Met à jour la Sale avec les totaux recalculés
- **Autorité fiscale**: Backend (CORRECT)

### addItem() (lignes 89-149)
- ✅ Force le prix serveur (ligne 117)
- ✅ Valide quantité > 0 (ligne 112)
- ✅ Valide discount ≤ montant brut (ligne 123)
- ✅ Appelle recalculateTotals() après ajout (ligne 146)
- **Autorité fiscale**: Backend via recalculateTotals() (CORRECT)

### updateItem() (lignes 154-216)
- ✅ Force le prix serveur (ligne 179)
- ✅ Valide quantité > 0 (ligne 173)
- ✅ Valide discount ≤ montant brut (ligne 185)
- ✅ Appelle recalculateTotals() après mise à jour (ligne 201)
- **Autorité fiscale**: Backend via recalculateTotals() (CORRECT)

### removeItem() (lignes 221-235)
- ✅ Appelle recalculateTotals() après suppression (ligne 234)
- **Autorité fiscale**: Backend via recalculateTotals() (CORRECT)

### Création de Sale
- ✅ SaleService.create() ne calcule pas les totaux initiaux
- ✅ Les totaux sont calculés lors du premier addItem() ou recalculateTotals()
- **Autorité fiscale**: Backend (CORRECT)

### Mise à jour de Sale
- ✅ SaleService.update() ne modifie pas directement les totaux
- ✅ Les totaux sont recalculés via recalculateTotals()
- **Autorité fiscale**: Backend (CORRECT)

### Paiement
- ✅ addPayment() ne modifie pas les totaux
- ✅ Validation du montant de paiement
- **Autorité fiscale**: Backend (CORRECT)

### Completion
- ✅ complete() ne modifie pas les totaux
- ✅ Décrémente le stock transactionnellement
- **Autorité fiscale**: Backend (CORRECT)

**CONCLUSION**: SaleService est correctement implémenté. L'autorité fiscale est bien le backend.

---

## 1.5 VÉRIFICATION DU POS

### Calcul subtotal (ligne 341)
```typescript
const subtotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);
```
- ✅ Calcul local pour affichage
- ✅ Basé sur les prix du backend
- **Autorité**: Frontend pour affichage temporaire (ACCEPTABLE)

### Calcul discount
```typescript
// Pas de calcul discount dans le POS actuel
// discount envoyé comme 0 dans syncCartToSale()
```
- ⚠️ Discount non implémenté dans l'UI
- **Autorité**: Backend (CORRECT)

### Calcul tax (ligne 345)
```typescript
// BLOCKER: Tax rate should come from backend TaxConfiguration
// No API available to fetch organization tax rate
// TEMPORARY: Using 18% fallback - requires tax rate API
const tax = subtotal * 0.18;
```
- ❌ **CRITIQUE**: Taxe hardcodée à 0.18
- ❌ Commentaire indiquant le problème
- ❌ Pas d'API pour récupérer le taux fiscal
- **Autorité**: Frontend (INCORRECT - DOIT ÊTRE BACKEND)

### Calcul total (ligne 346)
```typescript
const total = subtotal + tax;
```
- ❌ Basé sur la taxe hardcodée
- **Autorité**: Frontend (INCORRECT - DOIT ÊTRE BACKEND)

### syncCartToSale() (lignes 349-395)
```typescript
// Update sale totals
await fetch(`/api/sales/${currentSaleId}`, {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    subtotal,
    tax,      // ← Taxe calculée localement
    total,    // ← Total calculé localement
  }),
});
```
- ❌ **CRITIQUE**: Envoie la taxe calculée localement
- ❌ **CRITIQUE**: Envoie le total calculé localement
- Le backend recalcule ensuite via recalculateTotals()
- **Risque**: Incohérence entre affichage frontend et réalité backend
- **Autorité**: Frontend (INCORRECT - DOIT ÊTRE BACKEND)

### Création de Sale (lignes 298-312)
```typescript
body: JSON.stringify({
  storeId: currentStoreId,
  orderNumber: generateOrderNumber(),
  channel: 'POS',
  customerId: selectedCustomer || undefined,
  subtotal: 0,
  tax: 0,      // ← 0 est acceptable pour création initiale
  total: 0,    // ← 0 est acceptable pour création initiale
}),
```
- ✅ tax: 0 acceptable pour création initiale
- ✅ total: 0 acceptable pour création initiale
- Les totaux seront recalculés par le backend
- **Autorité**: Backend (CORRECT)

### Ajout d'items
- ✅ Envoie variantId, quantity, unitPrice, discount
- ✅ Backend force le prix serveur
- ✅ Backend recalcule les totaux
- **Autorité**: Backend (CORRECT)

### Paiement (lignes 414-424)
```typescript
body: JSON.stringify({
  method: paymentMethod,
  amount: total,  // ← Basé sur total calculé localement
  reference: generatePaymentReference(),
}),
```
- ⚠️ Amount basé sur total calculé localement
- Le backend valide le montant
- **Autorité**: Frontend pour montant, Backend pour validation (PARTIELLEMENT CORRECT)

### Completion (lignes 431-433)
- ✅ Appelle backend complete()
- ✅ Backend décrémente le stock
- **Autorité**: Backend (CORRECT)

**CONCLUSION**: Le POS a une incohérence critique sur le calcul fiscal. Il utilise 0.18 hardcodé au lieu de récupérer le taux depuis le backend.

---

## 1.6 OCCURRENCES 0.18

| Fichier | Ligne | Contexte | Action |
| ------- | ----- | -------- | ------ |
| `src/services/sale.service.ts` | 260 | Fallback backend si pas de TaxConfiguration | **CONSERVER** - Fallback backend documenté |
| `src/services/proforma.service.ts` | 302 | Fallback backend si pas de TaxConfiguration | **CONSERVER** - Fallback backend documenté |
| `src/app/pos/page.tsx` | 345 | Calcul taxe frontend hardcodé | **SUPPRIMER** - Source de vérité incorrecte |
| `src/app/pos/page.tsx` | 666 | Affichage "Taxe (18%)" hardcodé | **MODIFIER** - Afficher taux depuis backend |

---

## 1.7 OCCURRENCES taxRate

| Fichier | Ligne | Contexte | Action |
| ------- | ----- | -------- | ------ |
| `src/services/sale.service.ts` | 258 | Récupération depuis TaxConfiguration | **CONSERVER** - Correct |
| `src/services/proforma.service.ts` | 300 | Récupération depuis TaxConfiguration | **CONSERVER** - Correct |

---

## 1.8 OCCURRENCES recalculateTotals

| Fichier | Ligne | Contexte | Action |
| ------- | ----- | -------- | ------ |
| `src/services/sale.service.ts` | 146 | Appel dans addItem() | **CONSERVER** - Correct |
| `src/services/sale.service.ts` | 201 | Appel dans updateItem() | **CONSERVER** - Correct |
| `src/services/sale.service.ts` | 234 | Appel dans removeItem() | **CONSERVER** - Correct |
| `src/services/proforma.service.ts` | 159 | Appel dans addItem() | **CONSERVER** - Correct |
| `src/services/proforma.service.ts` | 224 | Appel dans updateItem() | **CONSERVER** - Correct |
| `src/services/proforma.service.ts` | 267 | Appel dans removeItem() | **CONSERVER** - Correct |

---

## 1.9 API EXISTANTES

### Organization
- ❌ Aucune API `/api/organization`
- ❌ Aucune API `/api/organizations`

### Settings
- ❌ Aucune API `/api/settings`
- ❌ Aucune API `/api/settings/tax`

### Tax
- ❌ Aucune API `/api/tax`
- ❌ Aucune API `/api/tax-configuration`

**CONCLUSION**: Aucune API existante pour récupérer TaxConfiguration. Nécessite création de nouvelle API.

---

## 1.10 TESTS EXISTANTS

- ❌ Aucun test pour TaxConfiguration
- ❌ Aucun test pour SaleService.recalculateTotals()
- ❌ Aucun test pour calcul fiscal
- ❌ Aucun test pour POS syncCartToSale()

**CONCLUSION**: Tests à créer pour valider la correction.

---

## 1.11 PACKAGE.JSON

### Scripts disponibles
- ✅ `npm run build` - Build Next.js
- ✅ `npm run test` - Exécute Vitest
- ✅ `npm run typecheck` - Vérification TypeScript
- ✅ `npm run seed` - Seed Prisma (non utilisé)

---

## 1.12 RÉSUMÉ DE L'AUDIT

### État actuel
- ✅ TaxConfiguration existe dans le schéma
- ✅ SaleService utilise déjà TaxConfiguration
- ✅ Fallback backend 0.18 documenté
- ❌ POS calcule la taxe avec 0.18 hardcodé
- ❌ POS envoie la taxe calculée localement au backend
- ❌ Aucune API pour récupérer TaxConfiguration
- ❌ Aucun test pour la logique fiscale

### Modifications nécessaires
1. **Créer API** `/api/tax` pour récupérer TaxConfiguration
2. **Modifier POS** pour utiliser le taux fiscal depuis l'API
3. **Modifier POS** pour ne plus envoyer la taxe calculée localement
4. **Modifier POS** pour utiliser les totaux serveur après sync
5. **Créer tests** pour valider la logique fiscale

### Modifications NON nécessaires
- ❌ Pas de migration Prisma (schéma complet)
- ❌ Pas de modification SaleService (déjà correct)
- ❌ Pas de modification ProformaService (déjà correct)
- ❌ Pas de modification schema.prisma

---

**AUDIT AVANT MODIFICATION TERMINÉ**

**FICHIERS MODIFIÉS : 0**
**MIGRATIONS : 0**
**DONNÉES CRÉÉES : 0**

**PRÊT POUR MODIFICATION**
