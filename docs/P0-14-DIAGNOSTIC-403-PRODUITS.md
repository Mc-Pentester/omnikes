# OMNIKÈS — P0-14 — DIAGNOSTIC 403 PRODUITS

## 1. Git

Path: C:\Projects\omnikes
Branch: main
HEAD: 056f5b4 P0-14-A.2: Apply RBAC permissions and store isolation to historical domains
Working tree:
- M src/repositories/role.repository.ts (P0-14-A.4)
- ?? rapports et diagnostics (non committés)

## 2. Symptôme

GET /api/products?isActive=true → HTTP 403
Error fetching products: Error: Failed to fetch products
src/app/products/page.tsx:70

## 3. Route

Fichier: src/app/api/products/route.ts

Chaîne d'appel:
```
GET /api/products?isActive=true
  ↓
src/app/api/products/route.ts (GET handler)
  ↓
requireCurrentOrganizationId(request)
  ↓
requirePermission(request, 'product.read')
  ↓
roleRepository.hasPermission(user.id, 'product.read')
  ↓
roleRepository.getUserRoles(userId)
  ↓
prisma.userRole.findMany({ where: { userId }, include: { role: { include: { rolePermissions: { include: { permission: true } } } } } })
  ↓
Vérifie si 'product.read' est dans role.permissions
  ↓
Si non → throw new Error('Permission required: product.read') → 403
```

## 4. Cause exacte du 403

**Condition exacte qui retourne 403:**
```typescript
// Ligne 109-110 dans src/lib/auth.ts
if (!hasPermission) {
  throw new Error(`Permission required: ${permissionCode}`);
}
```

**Dans src/repositories/role.repository.ts (lignes 45-55):**
```typescript
async hasPermission(userId: string, permissionCode: string): Promise<boolean> {
  const userRoles = await this.getUserRoles(userId);
  
  for (const role of userRoles) {
    if (role.permissions.includes(permissionCode)) {
      return true;
    }
  }
  
  return false; // ← Retourne false si aucun rôle ne contient 'product.read'
}
```

**Résultat:** L'utilisateur courant ne possède PAS de rôle avec la permission `product.read`.

## 5. Permission

**Utilisateur:** Utilisateur courant authentifié via session
**Rôle:** Aucun rôle avec product.read
**Permission recherchée:** product.read
**Permission trouvée:** NON
**Résultat:** 403 (Permission required: product.read)

**Analyse du seed (prisma/seed.ts):**
- product.read est définie (lignes 405-413)
- product.read est assignée à:
  - ADMIN roles (lignes 599-607)
  - CASHIER roles (lignes 670, 675-682)
- CASHIER reçoit product.read (ligne 670)

**Problème:** L'utilisateur courant n'a probablement pas de rôle ADMIN ou CASHIER assigné, ou son rôle n'a pas la permission product.read.

## 6. Comparaison Inventaire

**Pourquoi Produits et Inventaire sont-ils tous les deux concernés:**

**GET /api/inventory exige:**
- requirePermission(request, 'inventory.read')

**Dans le seed (prisma/seed.ts):**
- inventory.read est définie (lignes 376-382)
- inventory.read est assignée à CASHIER (ligne 669)
- inventory.read est assignée à ADMIN (via productPermissions)

**Conclusion:** Les deux problèmes sont liés: CASHIER a product.read et inventory.read, mais l'utilisateur courant n'a probablement pas le rôle CASHIER assigné.

## 7. Git Forensic

**Last Known Good:**
- **Commit:** 7148232 feat: add authentication, multi-tenant isolation, and test data seed
- **Comportement:** Utilisait `requireCurrentOrganizationId` (authentification session-based) mais PAS `requirePermission('product.read')`. Les routes Produits étaient accessibles si authentifié.

**First Known Bad:**
- **Commit:** 056f5b4 P0-14-A.2: Apply RBAC permissions and store isolation to historical domains
- **Changement:** Ajout de `requirePermission(request, 'product.read')` dans src/app/api/products/route.ts (ligne 14)
- **Raison technique du 403:** La route exige maintenant la permission product.read, mais l'utilisateur courant ne possède pas de rôle avec cette permission.

**Analyse intermédiaire:**
- Le commit fe932be (simplify inventory movements) a créé src/repositories/role.repository.ts avec les méthodes RBAC
- Le commit 7148232 a introduit l'authentification session-based avec requireCurrentOrganizationId
- Le commit P0-14-A.2 a activé les vérifications de permission sur les routes historiques

## 8. Cause racine

**UNE SEULE CAUSE RACINE DÉMONTRÉE:**

Le commit P0-14-A.2 (056f5b4) a ajouté `requirePermission(request, 'product.read')` et `requirePermission(request, 'inventory.read')` aux routes Produits et Inventaire, mais l'utilisateur courant n'a pas de rôle (ADMIN ou CASHIER) avec ces permissions.

**Causalité:**
1. Avant P0-14-A.2: Routes accessibles si authentifié
2. Après P0-14-A.2: Routes exigent product.read/inventory.read
3. L'utilisateur courant n'a pas de rôle avec ces permissions
4. Résultat: 403 sur GET /api/products et GET /api/inventory

**Root cause:** Gap entre les permissions assignées dans le seed (ADMIN/CASHIER ont product.read et inventory.read) et les rôles effectivement assignés à l'utilisateur courant.

## 9. Hypothèses non démontrées

- L'utilisateur courant a un rôle mais ce rôle n'a pas product.read/inventory.read
- L'utilisateur courant n'a aucun rôle assigné (UserRole manquant)
- Le seed n'a pas été exécuté correctement pour l'utilisateur courant
- Les permissions product.read/inventory.read n'existent pas dans la base de données
- Le roleRepository.getUserRoles() retourne un tableau vide pour l'utilisateur courant

## 10. Recommandation de correction

**Option 1 (recommandée):** Assigner le rôle CASHIER ou ADMIN à l'utilisateur courant via la base de données
- Insérer un UserRole liant l'utilisateur courant au rôle CASHIER ou ADMIN
- CASHIER a product.read et inventory.read
- Cela résoudrait le 403 sans modifier le code

**Option 2:** Créer un nouveau rôle avec product.read et inventory.read et l'assigner à l'utilisateur courant
- Plus flexible mais plus complexe

**Option 3:** Ajouter un rôle par défaut avec permissions de lecture pour tous les utilisateurs lors de l'inscription
- Modification du code nécessaire (inscription, seed)

**IMPORTANT:**
NE PAS appliquer cette correction maintenant (P0-14-FORENSIC-REGRESSION est READ-ONLY).

## 11. Validation

**Aucune modification effectuée:** OUI
**Aucune écriture DB:** OUI
**Commit:** AUCUN
**Push:** AUCUN
