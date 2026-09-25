# OMNIKÈS — FORENSIC STORE DELETE

## 1. Git

Path: C:\Projects\omnikes
Branch: main
HEAD: b8ffc8f Fix: Add missing store.delete permission to seed
Working tree: Clean (modifications poussées)

## 2. Symptôme

Lorsque l'utilisateur clique sur le bouton "Supprimer" pour un magasin, le magasin devient `isActive = false` mais reste présent dans la base de données au lieu d'être supprimé physiquement.

## 3. Bouton frontend

**Fichier:** src/app/stores/page.tsx
**Fonction:** handleDelete() (lignes 164-185)
**Méthode HTTP:** DELETE
**Endpoint:** /api/stores/${storeId}

**Confirmation affichée:** "Voulez-vous vraiment SUPPRIMER définitivement ce magasin ? Cette action est irréversible et supprimera toutes les données associées."

**Comportement réel:** Le magasin est désactivé (`isActive = false`), pas supprimé.

## 4. Route API

**Fichier:** src/app/api/stores/[id]/route.ts
**Handler:** DELETE (lignes 123-165)
**Protection:**
- requireCurrentOrganizationId()
- requirePermission('store.delete')

**Commentaire ligne 121:** "Deactivate a store (soft delete)"
**Appel ligne 132:** `storeService.deactivate(storeId, organizationId)`

## 5. Service

**Fichier:** src/services/store.service.ts
**Méthode:** deactivate() (lignes 89-99)
**Commentaire ligne 87:** "Deactivate a store (soft delete)"
**Appel ligne 96:** `storeRepository.deactivate(storeId, organizationId)`

## 6. Repository

**Fichier:** src/repositories/store.repository.ts
**Méthode:** deactivate() (lignes 107-117)
**Commentaire ligne 105:** "Deactivate a store (soft delete)"
**Instruction Prisma exacte (lignes 108-116):**
```typescript
prisma.store.updateMany({
  where: {
    id,
    organizationId,
  },
  data: {
    isActive: false,
  },
})
```

## 7. Comportement réel

**DELETE physique:** NON
**Désactivation logique:** OUI

**Instruction Prisma exacte:** `prisma.store.updateMany({ data: { isActive: false } })`

Le code effectue explicitement une mise à jour pour passer `isActive` à `false`, pas une suppression physique.

## 8. isActive

**Origine du `isActive = false`:**
- Modèle Store: `isActive Boolean @default(true)` (prisma/schema.prisma ligne 63)
- Repository: `data: { isActive: false }` (store.repository.ts ligne 114)
- Service: appelle repository.deactivate() (store.service.ts ligne 96)
- Route: appelle service.deactivate() (route.ts ligne 132)

## 9. Relations Store

**Relations importantes:**
- Organization (onDelete: Cascade)
- Inventory[] (onDelete: Cascade)
- Sales[] (onDelete: Cascade)
- Proformas[] (onDelete: Cascade)

**Contraintes:**
Toutes les relations Store ont `onDelete: Cascade`.

**Impact d'une suppression physique:**
- Supprimer un Store supprimerait en cascade:
  - Tous les inventaires (Inventory)
  - Tous les mouvements d'inventaire (InventoryMovement)
  - Toutes les ventes (Sale)
  - Tous les paiements (Payment)
  - Toutes les proformas (Proforma)
  - Tous les items de proforma (ProformaItem)

**Conclusion:** Une suppression physique est techniquement possible mais détruirait tout l'historique des ventes, inventaires et proformas associés au magasin.

## 10. Historique Git

**Git log des routes stores:**
```
b8ffc8f Fix: Add missing store.delete permission to seed
3339715 V1-07A.4-V1-07A.5.1: Store creation API with RBAC and seed audit
006c91a feat: implement Store Context V1
```

**Commit ayant introduit le comportement:**
Le comportement soft delete semble avoir été introduit dès la création initiale du modèle Store (lignes 52-77 dans schema.prisma). Le modèle possède `isActive` depuis le début, ce qui suggère que la désactivation logique était prévue comme mécanisme principal.

Les commentaires "soft delete" dans le service et le repository confirment que ce comportement est volontaire.

## 11. Sémantique métier

**Suppression physique:** Possible mais DANGEREUSE
- Techniquement possible avec `prisma.store.delete()`
- Détruirait tout l'historique (ventes, inventaires, proformas)
- Non recommandé pour la préservation des données comptables et d'audit

**Désactivation logique:** VOLONTAIRE
- Le modèle Store a `isActive` depuis sa création
- Les commentaires "soft delete" dans service/repository confirment l'intention
- Permet de conserver l'historique des ventes/inventaires
- Compatible avec les exigences d'audit et de comptabilité

**Conclusion:** OmniKès considère un magasin comme une entité désactivable uniquement, pour préserver l'historique métier.

## 12. Conclusion

Le magasin devient inactif au lieu d'être supprimé car:

1. **Architecture volontaire:** Le modèle Store possède `isActive` depuis sa création, indiquant une intention de soft delete préservant l'historique.

2. **Implémentation explicite:** La route DELETE appelle `deactivate()`, qui fait un `update({ isActive: false })`, pas un `delete()`.

3. **Relations cascade:** Une suppression physique détruirait en cascade tous les inventaires, ventes et proformas associés, ce qui est incompatible avec la préservation des données métier.

4. **Bouton trompeur:** Le bouton frontend affiche "Supprimer" avec une confirmation mentionnant une "suppression définitive", mais l'implémentation réalise une désactivation. C'est un UX trompeur.

**Le comportement soft delete est VOLONTAIRE et CORRECT métier, mais le bouton frontend est MAL ÉTIQUETTÉ.**

## 13. Correction proposée

**Option 1 (recommandée):** Corriger l'étiquette du bouton frontend
- Changer le texte du bouton de "Supprimer" à "Archiver" ou "Désactiver"
- Changer la confirmation de "SUPPRIMER définitivement" à "Désactiver le magasin (les données seront conservées)"
- Ajouter une note explicite que l'historique sera préservé

**Option 2:** Ajouter une vraie suppression physique avec avertissements
- Créer une route DELETE séparée pour suppression physique
- Ajouter des avertissements multiples
- Vérifier qu'aucune vente/inventaire/proforma n'existe
- Cette option est déconseillée car elle va à l'encontre de la préservation des données métier

**Option 3:** Garde de sécurité
- Ajouter une vérification que le magasin n'a aucune vente/inventaire/proforma avant de permettre la désactivation
- Empêcher la désactivation si des données existent
- Forcer l'utilisateur à résoudre les données dépendantes d'abord

## 14. Modifications

**Code modifié:** NON
**DB modifiée:** NON
**Migration:** NON
**Commit:** AUCUN
**Push:** AUCUN
