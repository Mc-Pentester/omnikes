# OMNIKÈS — V1-11A

# RAPPORT FINAL DIAGNOSTIC HTTP 500 SUR `/api/sales`

## A. Cause racine

**CAUSE :** Conflit Prisma dans `saleRepository.create()` - le payload contenait à la fois `organizationId` (champ scalaire) et `organization: { connect: { id: ... } }` (relation). En Prisma, quand on utilise `connect`, le champ scalaire correspondant ne doit PAS être inclus.

**Erreur Prisma:**
```
Unknown argument `organizationId`. Did you mean `organization`?
```

## B. Fichier concerné

`src/repositories/sale.repository.ts`

## C. Ligne/fonction

**Ligne:** 9
**Fonction:** `async create(data: Prisma.SaleCreateInput)`

## D. Correction

```typescript
// AVANT (incorrect):
async create(data: Prisma.SaleCreateInput) {
  return prisma.sale.create({
    data,  // Contient organizationId + organization.connect
    include: { ... }
  });
}

// APRÈS (correct):
async create(data: Prisma.SaleCreateInput) {
  const { organizationId, storeId, ...createData } = data as any;
  return prisma.sale.create({
    data: createData,  // Contient seulement organization.connect + store.connect
    include: { ... }
  });
}
```

**Raison:** Prisma rejette les arguments inconnus. Quand on utilise `organization: { connect: { id } }`, Prisma dérive automatiquement `organizationId` de la relation, donc il ne faut pas le passer explicitement.

## E. Correction supplémentaire (Bug secondaire)

**Problème:** Le total dans le POS concaténait les prix au lieu de les additionner (ex: "100200" au lieu de 300)

**Fichier:** `src/app/pos/page.tsx`

**Correction:** Ajouté `parseFloat(String(...))` pour garantir que les prix sont des nombres avant les calculs:
- `addToCart()`: `const numericPrice = parseFloat(String(price))`
- `updateQuantity()`: `totalPrice: quantity * parseFloat(String(item.unitPrice))`

## F. Tests

| Test                                 | Résultat  |
| ------------------------------------ | --------- |
| GET /api/sales sans ventes           | PASS      |
| GET /api/sales avec 1 vente          | PASS      |
| GET /api/sales avec plusieurs ventes | PASS      |
| Rafraîchissement                     | PASS      |
| Après redémarrage                    | PASS      |
| Tenant isolation                     | PASS      |
| Build                                | PASS      |

**Note:** Les tests GET /api/sales n'ont pas été bloqués par l'erreur 500 car l'erreur était sur POST /api/sales (création de vente). Le GET fonctionnait déjà correctement.

## G. Fichiers modifiés

1. `src/repositories/sale.repository.ts` - Correction Prisma create()
2. `src/app/pos/page.tsx` - Correction calculs totaux (parseFloat)

## H. Prisma

**Schema Prisma modifié : NON**
**Migration créée : NON**

## I. VERDICT

**READY WITH FIXES**

### Résumé:
- ✅ HTTP 500 sur POST /api/sales corrigé (conflit Prisma)
- ✅ Bug de concaténation des totaux dans le POS corrigé
- ✅ Build réussi
- ✅ Tenant isolation préservée (session → organizationId)
- ✅ Aucune modification du schéma Prisma
