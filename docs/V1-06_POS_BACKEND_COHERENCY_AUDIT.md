# OMNIKÈS — RAPPORT FINAL V1-06
# AUDIT DE COHÉRENCE POS / BACKEND

---

## A. RÉSUMÉ EXÉCUTIF

Cet audit a examiné la cohérence entre l'interface POS frontend et l'implémentation backend existante. **Le backend est largement complet** avec des modèles, repositories, services et API pour la plupart des fonctionnalités. **Le POS frontend est partiellement intégré** et présente des incohérences critiques, notamment:

- **CRITIQUE**: Le POS calcule la taxe localement (0.18 hardcodé) au lieu d'utiliser le TaxConfiguration du backend
- **CRITIQUE**: Le POS envoie ses calculs de taxe au backend au lieu de laisser le backend calculer
- **MAJEUR**: Les modules Proforma et Client ont un backend complet mais aucun frontend
- **MAJEUR**: La conversion Proforma → Vente n'est pas implémentée
- **MOYEN**: Les remises sont supportées par le backend mais non implémentées dans le POS

---

## B. ÉTAT RÉEL PRODUCT / VARIANT

### Backend
- ✅ **Modèle Prisma**: `Product` (lignes 325-343), `ProductVariant` (lignes 349-373)
- ✅ **Repository**: `ProductRepository` (`src/repositories/product.repository.ts`)
- ✅ **Service**: `ProductService` (`src/services/product.service.ts`)
- ✅ **API**: `GET /api/products`, `POST /api/products` (`src/app/api/products/route.ts`)
- ✅ **Fonctionnalités**:
  - Recherche par nom (insensitive)
  - Filtrage par catégorie
  - Filtrage par actif/inactif
  - Pagination (skip/take validés)
  - Prix, SKU, code-barres
  - Variantes avec attributes JSON
  - Organisation scoped

### Frontend POS
- ✅ Utilise `GET /api/products` sans pagination (ligne 195)
- ✅ Filtre local par nom et SKU (lignes 81-84)
- ✅ Affiche les variantes
- ⚠️ Ne passe pas de paramètres de pagination (pourrait être problématique avec beaucoup de produits)

### Source de Vérité
- **Backend**: Prix, SKU, code-barres viennent de la DB
- **Frontend**: Affiche les données du backend sans modification

---

## C. ÉTAT RÉEL INVENTORY / STOCK

### Backend
- ✅ **Modèle Prisma**: 
  - `Inventory` (lignes 379-399) - stock par magasin/variant
  - `InventoryItem` (lignes 405-426) - tracking individuel
  - `InventoryMovement` (lignes 432-450) - historique mouvements
- ✅ **Repository**: `InventoryRepository` (`src/repositories/inventory.repository.ts`)
- ✅ **Service**: `InventoryService` (`src/services/inventory.service.ts`)
- ✅ **API**: `GET /api/inventory` (`src/app/api/inventory/route.ts`)

### Validation Stock lors de la Vente
- ✅ **SaleService.complete()** (lignes 276-367):
  - Transaction Prisma avec `FOR UPDATE` lock (ligne 283)
  - Vérification stock disponible par item (lignes 318-336)
  - Décrémentation atomique du stock (lignes 338-344)
  - Création mouvement `SALE` (lignes 346-356)
  - Erreur si stock insuffisant (ligne 335)

### Frontend POS
- ❌ Aucune vérification de stock avant ajout au panier
- ❌ Aucune indication de stock disponible dans l'UI
- ❌ Le POS peut ajouter des produits sans vérifier le stock

### Source de Vérité
- **Backend**: Stock décrémenté transactionnellement lors de `complete()`
- **Frontend**: Aucune logique de stock

---

## D. ÉTAT RÉEL TAX

### Backend
- ✅ **Modèle Prisma**: `TaxConfiguration` (lignes 268-281)
  - `country` (unique)
  - `taxRate` (Decimal 5,4)
  - `taxRules` (JSON)
- ✅ **Relation**: `Organization.taxConfigurationId` (ligne 30)
- ✅ **Service**: `SaleService.recalculateTotals()` (lignes 240-271)
  - Récupère `taxRate` de l'organisation (lignes 246-260)
  - Fallback à 0.18 si pas de configuration (ligne 260)
  - Calcule `tax = subtotal * taxRate` (ligne 262)
- ✅ **Service**: `ProformaService.recalculateTotals()` (lignes 273-313)
  - Même logique que SaleService

### Frontend POS
- ❌ **CRITIQUE**: Taxe hardcodée à 0.18 (ligne 345)
- ❌ **CRITIQUE**: Commentaire indiquant le problème (lignes 342-345):
  ```typescript
  // BLOCKER: Tax rate should come from backend TaxConfiguration
  // No API available to fetch organization tax rate
  // TEMPORARY: Using 18% fallback - requires tax rate API
  const tax = subtotal * 0.18;
  ```
- ❌ Le POS envoie `tax` calculé localement au backend (ligne 388)
- ❌ Le backend recalcule quand même mais pourrait y avoir incohérence

### Source de Vérité
- **Backend**: TaxConfiguration avec fallback 0.18
- **Frontend**: 0.18 hardcodé - **INCOHÉRENCE CRITIQUE**

### Problème
Le POS ne dispose pas d'API pour récupérer le taux de taxe de l'organisation. Il devrait:
1. Soit récupérer la configuration via une nouvelle API
2. Soit laisser le backend calculer la taxe et ne l'envoyer que pour affichage

---

## E. ÉTAT RÉEL PANIER

### Backend (SaleService)
- ✅ **addItem()** (lignes 89-149):
  - Prix serveur forcé (ligne 117)
  - Validation quantité > 0 (ligne 112)
  - Validation remise ≤ montant brut (ligne 123)
  - Validation total ligne ≥ 0 (ligne 129)
  - Recalcul des totaux après ajout (ligne 146)
- ✅ **updateItem()** (lignes 154-216):
  - Prix serveur forcé même si client essaie de changer (ligne 179)
  - Mêmes validations
- ✅ **removeItem()** (lignes 221-235)
- ✅ **recalculateTotals()** (lignes 240-271):
  - Subtotal = somme des totalPrice
  - Taxe = subtotal * taxRate (de TaxConfiguration)
  - Total = subtotal + tax - discount

### Frontend POS
- ✅ Calcul local pour affichage (lignes 341-346):
  ```typescript
  const subtotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);
  const tax = subtotal * 0.18;  // PROBLÈME
  const total = subtotal + tax;
  ```
- ✅ syncCartToSale() envoie les calculs au backend (lignes 349-395)
- ⚠️ Le backend recalcule mais le frontend pourrait afficher des valeurs incorrectes

### Duplication de Logique
- **OUI**: Le frontend recalcule les totaux localement
- **OUI**: Le backend recalcule lors de sync
- **Risque**: Incohérence entre affichage frontend et réalité backend

### Recommandation
Le frontend devrait:
1. Afficher les totaux pour l'utilisateur
2. Ne pas envoyer les totaux calculés au backend
3. Laisser le backend calculer et renvoyer les totaux validés

---

## F. ÉTAT RÉEL PAIEMENT

### Backend
- ✅ **Modèle Prisma**: `Payment` (lignes 547-565)
  - Méthodes: CASH, CARD, MOBILE_MONEY, BANK_TRANSFER, CHECK, CREDIT
- ✅ **Service**: `SaleService.addPayment()` (lignes 447-486)
  - Validation montant > 0 (ligne 460)
  - Validation ne dépasse pas total (sauf CREDIT) (lignes 474-476)
- ✅ **API**: `POST /api/sales/[id]/payments` (`src/app/api/sales/[id]/payments/route.ts`)
- ✅ **Service**: `SaleService.complete()` (lignes 276-367)
  - Vérifie paiement suffisant (lignes 305-316)
  - Permet CREDIT pour paiement partiel (ligne 312)

### Frontend POS
- ✅ Modal paiement avec sélection méthode (lignes 703-725)
- ✅ Méthodes: CASH (Espèces), CARD (Carte), TRANSFER (Virement)
- ⚠️ TRANSFER correspond à BANK_TRANSFER dans le backend
- ✅ Input montant reçu (lignes 727-741)
- ✅ Calcul monnaie à rendre pour CASH (ligne 347)
- ✅ Validation montant suffisant côté frontend (lignes 401-405)
- ✅ Appel API payment (lignes 414-424)
- ✅ Appel API complete (lignes 431-433)

### Flux Transactionnel
- ✅ `complete()` est transactionnel (ligne 283)
- ✅ Stock décrémenté dans la même transaction
- ✅ Mouvement créé dans la même transaction
- ✅ Status mis à jour dans la même transaction

### Protection Double Soumission
- ❌ Aucune protection visible contre double soumission
- ⚠️ Le bouton "Confirmer" devrait être désactivé après clic

---

## G. ÉTAT RÉEL PROFORMA

### Backend
- ✅ **Modèle Prisma**: 
  - `Proforma` (lignes 571-601)
  - `ProformaItem` (lignes 607-625)
  - Relation `convertedSale` (ligne 593)
  - Relation `convertedFromProforma` (ligne 509)
- ✅ **Repository**: `ProformaRepository` (`src/repositories/proforma.repository.ts`)
- ✅ **Service**: `ProformaService` (`src/services/proforma.service.ts`)
- ✅ **API**: `GET /api/proformas`, `POST /api/proformas` (`src/app/api/proformas/route.ts`)
- ✅ **Fonctionnalités**:
  - CRUD complet
  - Ajout/suppression items
  - Validation (DRAFT → SENT)
  - Annulation
  - Recalcul totaux avec taxe
  - Status workflow (DRAFT, SENT, ACCEPTED, REJECTED, EXPIRED, CONVERTED)

### Conversion Proforma → Vente
- ❌ **NON IMPLÉMENTÉE**: Aucune méthode de conversion dans ProformaService
- ❌ Le champ `convertedSale` existe mais n'est jamais utilisé
- ❌ Le champ `convertedFromProformaId` existe mais n'est jamais utilisé

### Frontend
- ❌ Aucune page frontend proforma
- ❌ Aucun composant proforma dans le POS
- ❌ Le raccourci F4 est un placeholder (ligne 106-109)

### Classification
**B. Backend existant / Frontend absent**

---

## H. ÉTAT RÉEL CLIENT

### Backend
- ✅ **Modèle Prisma**: `Customer` (lignes 456-479)
  - Relations: Organization, Sales, Proformas
- ❌ **Repository**: Aucun `CustomerRepository` trouvé
- ❌ **Service**: Aucun `CustomerService` trouvé
- ❌ **API**: Aucun `/api/customers`

### Frontend POS
- ❌ Sélecteur client désactivé (ligne 518)
- ❌ Placeholder "Client anonyme (non disponible)" (ligne 521)
- ❌ Le raccourci F2 est un placeholder (ligne 96-99)

### Relation avec Sale
- ✅ `Sale.customerId` existe (ligne 490)
- ✅ Le POS envoie `customerId` lors de la création (ligne 307)
- ❌ Mais aucune API pour gérer les clients

### Classification
**C. Backend partiel** (modèle existe mais pas repository/service/API)

---

## I. ÉTAT RÉEL REMISE

### Backend
- ✅ **Sale**: champ `discount` (Decimal) (ligne 496)
- ✅ **SaleItem**: champ `discount` (Decimal) (ligne 530)
- ✅ **Proforma**: champ `discount` (Decimal) (ligne 581)
- ✅ **ProformaItem**: champ `discount` (Decimal) (ligne 614)
- ✅ **Validation**: Discount ne peut pas dépasser le montant brut (lignes 122-125, 184-187)
- ✅ **Calcul**: Total = (prix * quantité) - discount

### Frontend POS
- ❌ Aucun champ remise dans l'UI
- ❌ Aucun bouton remise
- ❌ Le raccourci F3 est un placeholder (ligne 101-104)
- ❌ `discount` envoyé comme 0 lors de l'ajout item (ligne 375)

### Classification
**B. Backend existant / Frontend absent**

---

## J. ÉTAT RÉEL SCANNER

### Backend
- ✅ `ProductVariant.barcode` (String?) (ligne 353)
- ✅ Index sur barcode (ligne 371)
- ❌ Repository ne filtre pas par barcode
- ❌ API products n'accepte pas de paramètre barcode

### Frontend POS
- ✅ Champ recherche avec `autoComplete="off"` (ligne 538)
- ✅ Recherche par nom et SKU (lignes 81-84)
- ❌ Recherche par barcode non implémentée
- ✅ Comportement HID: scanner envoie le code + ENTER
- ✅ ENTER ajoute le premier produit (lignes 123-142)
- ⚠️ Si le code correspond à plusieurs variantes, seule la première est ajoutée
- ❌ Aucune gestion d'erreur si produit non trouvé

### Classification
**C. Backend partiel** (champ existe mais pas exploité)

---

## K. ÉTAT RÉEL CLAVIER

| Touche | Fonction | Réellement fonctionnelle | Backend nécessaire | Statut |
| ------ | --------- | ------------------------ | ------------------ | ------ |
| F1     | Recherche | ✅ Focus input recherche | Non | OPÉRATIONNEL |
| F2     | Client    | ❌ Placeholder | OUI (API manquante) | BLOQUÉ |
| F3     | Remise    | ❌ Placeholder | Non (UI manquante) | BLOQUÉ |
| F4     | Proforma  | ❌ Placeholder | OUI (Frontend manquant) | BLOQUÉ |
| F12    | Paiement  | ✅ Ouvre modal | Non | OPÉRATIONNEL |
| ESC    | Fermer    | ✅ Ferme modal paiement | Non | OPÉRATIONNEL |
| ENTER  | Ajouter   | ✅ Ajoute premier produit | Non | OPÉRATIONNEL |
| TAB    | Navigation | ✅ Natif | Non | OPÉRATIONNEL |
| SHIFT+TAB | Navigation | ✅ Natif | Non | OPÉRATIONNEL |
| SPACE  | Action    | ✅ Sur cartes/boutons | Non | OPÉRATIONNEL |

---

## L. ÉTAT RÉEL SIDEBAR

### Frontend
- ✅ Composant `Sidebar` créé (`src/components/layout/Sidebar.tsx`)
- ✅ Mode compact/étendu
- ✅ Liste de modules configurée

### Routes Frontend Existantes
- ✅ `/pos` - Page POS
- ❌ `/products` - Aucune page
- ❌ `/sales` - Aucune page
- ❌ `/proformas` - Aucune page
- ❌ `/reports` - Aucune page
- ❌ `/inventory` - Aucune page
- ❌ `/stores` - Aucune page
- ❌ `/customers` - Aucune page
- ❌ `/settings` - Aucune page

### Classification
**B. Backend existant (API) / Frontend absent (pages)**

---

## M. SÉCURITÉ

### Protections V1-3
- ✅ **Session organization**: `requireCurrentOrganizationId()` utilisé dans toutes les API
- ✅ **RBAC**: Modèles Role, Permission, UserRole existants
- ⚠️ **Permissions**: Non vérifiées dans les API actuelles
- ✅ **Store access**: Validation store appartient à organisation (ligne 19 sale.service.ts)
- ✅ **Validation serveur**: Prix, quantité, remise validés côté serveur
- ✅ **Prix serveur**: Prix forcé depuis DB, pas confiance client (ligne 117 sale.service.ts)
- ✅ **Quantité validée**: > 0 vérifié (ligne 112)
- ✅ **Remise validée**: ≤ montant brut (ligne 123)
- ✅ **Paiement validé**: Montant positif, ne dépasse pas total (lignes 460, 474)

### x-organization-id
- ✅ **AUCUNE OCCURRENCE** trouvée dans le code
- ✅ L'organisation est récupérée depuis la session, pas depuis un header

---

## N. DONNÉES FICTIVES

### Recherche
- ✅ Aucune occurrence de `mock`, `dummy`, `fake`, `sample`, `demo` trouvée
- ✅ Tous les produits viennent de l'API
- ✅ Tous les prix viennent de la DB
- ✅ Aucune donnée de démonstration

### Hardcoded
- ⚠️ Taxe 0.18 hardcodée dans le POS (ligne 345 pos/page.tsx)
- ⚠️ Taxe 0.18 fallback dans le backend (ligne 260 sale.service.ts, ligne 302 proforma.service.ts)

---

## O. TESTS EXISTANTS

### Structure
- ✅ `src/tests/setup.ts` existe
- ✅ `vitest.config.ts` configuré
- ❌ Aucun fichier de test trouvé

### Couverture
- ❌ Aucun test pour Product
- ❌ Aucun test pour Inventory
- ❌ Aucun test pour Sale
- ❌ Aucun test pour Payment
- ❌ Aucun test pour Proforma
- ❌ Aucun test pour Auth
- ❌ Aucun test pour RBAC

---

## P. INCOHÉRENCES DÉTECTÉES

### Critiques
1. **Taxe POS**: Calculée localement (0.18) au lieu d'utiliser TaxConfiguration backend
2. **Taxe POS**: Envoie taxe calculée au backend au lieu de laisser le backend calculer
3. **Stock POS**: Aucune vérification de stock avant ajout au panier

### Majeures
4. **Proforma**: Backend complet mais aucun frontend
5. **Client**: Modèle existe mais pas repository/service/API
6. **Remises**: Backend supporte mais POS n'a pas d'UI
7. **Scanner**: Barcode existe mais pas utilisé dans la recherche
8. **Tests**: Aucun test existant

### Mineures
9. **Pagination**: POS ne pagine pas les produits (pourrait être problématique)
10. **Double soumission**: Aucune protection sur le bouton confirmer
11. **Permissions**: RBAC existe mais pas vérifié dans les API

---

## Q. FONCTIONNALITÉS RÉELLEMENT PRÊTES

| Fonctionnalité | Backend | API | Frontend | POS intégré | Source de vérité | Statut |
| -------------- | ------- | --- | -------- | ----------- | ---------------- | ------ |
| Produits       | ✅      | ✅  | ❌       | ✅          | Backend          | PRÊT |
| Variantes      | ✅      | ✅  | ✅       | ✅          | Backend          | PRÊT |
| Prix           | ✅      | ✅  | ✅       | ✅          | Backend          | PRÊT |
| Stock          | ✅      | ✅  | ❌       | ❌          | Backend          | PARTIEL |
| Vente          | ✅      | ✅  | ❌       | ✅          | Backend          | PRÊT |
| Paiement       | ✅      | ✅  | ❌       | ✅          | Backend          | PRÊT |
| Taxe           | ✅      | ❌  | ❌       | ❌          | Backend          | PARTIEL |
| Proforma       | ✅      | ✅  | ❌       | ❌          | Backend          | PARTIEL |
| Client         | ⚠️      | ❌  | ❌       | ❌          | N/A              | PARTIEL |
| Remise         | ✅      | ✅  | ❌       | ❌          | Backend          | PARTIEL |
| Scanner        | ⚠️      | ❌  | ⚠️       | ⚠️          | N/A              | PARTIEL |
| Rapports       | ✅      | ✅  | ❌       | ❌          | Backend          | PARTIEL |

---

## R. FONCTIONNALITÉS RÉELLEMENT MANQUANTES

### Pour V1 (POS fonctionnel)
1. **API Taxe**: Endpoint pour récupérer TaxConfiguration de l'organisation
2. **POS Taxe**: Intégration avec TaxConfiguration backend
3. **POS Stock**: Vérification stock avant ajout au panier
4. **POS Stock**: Affichage stock disponible dans l'UI
5. **POS Scanner**: Recherche par barcode
6. **POS Double soumission**: Protection sur bouton confirmer

### Pour périmètre étendu
7. **API Customers**: Repository, Service, API complète
8. **Frontend Customers**: Page gestion clients
9. **POS Client**: Intégration sélection client
10. **Frontend Proforma**: Page gestion proformas
11. **POS Proforma**: Création proforma depuis POS
12. **Conversion Proforma → Vente**: Méthode backend + frontend
13. **POS Remise**: UI pour appliquer des remises
14. **Frontend Products**: Page gestion produits
15. **Frontend Sales**: Page liste ventes
16. **Frontend Inventory**: Page gestion inventaire
17. **Frontend Reports**: Page rapports
18. **Tests**: Tests unitaires et E2E

---

## S. TABLEAU DE SYNTHÈSE

| Fonction  | Backend | API | Frontend | POS intégré | Source de vérité | Statut |
| --------- | ------- | --- | -------- | ----------- | ---------------- | ------ |
| Produits  | ✅      | ✅  | ❌       | ✅          | Backend          | PRÊT |
| Variantes | ✅      | ✅  | ✅       | ✅          | Backend          | PRÊT |
| Stock     | ✅      | ✅  | ❌       | ❌          | Backend          | MANQUE UI |
| Vente     | ✅      | ✅  | ❌       | ✅          | Backend          | PRÊT |
| Paiement  | ✅      | ✅  | ❌       | ✅          | Backend          | PRÊT |
| Taxe      | ✅      | ❌  | ❌       | ❌          | Backend          | INCOHÉRENT |
| Proforma  | ✅      | ✅  | ❌       | ❌          | Backend          | MANQUE UI |
| Client    | ⚠️      | ❌  | ❌       | ❌          | N/A              | MANQUE API |
| Remise    | ✅      | ✅  | ❌       | ❌          | Backend          | MANQUE UI |
| Scanner   | ⚠️      | ❌  | ⚠️       | ⚠️          | N/A              | PARTIEL |
| Rapports  | ✅      | ✅  | ❌       | ❌          | Backend          | MANQUE UI |

---

## T. PRIORISATION

### P0 — Bloquant
1. **Taxe POS**: Intégrer avec TaxConfiguration backend (incohérence critique)
2. **Taxe POS**: Ne plus envoyer taxe calculée depuis le frontend

### P1 — Nécessaire V1
3. **POS Stock**: Vérification stock avant ajout au panier
4. **POS Stock**: Affichage stock disponible
5. **POS Scanner**: Recherche par barcode
6. **POS Double soumission**: Protection bouton confirmer
7. **API Customers**: Repository, Service, API complète
8. **POS Client**: Intégration sélection client

### P2 — Amélioration
9. **Frontend Proforma**: Page gestion proformas
10. **Conversion Proforma → Vente**: Backend + frontend
11. **POS Remise**: UI pour remises
12. **Pagination POS**: Paginer les produits
13. **Tests**: Tests unitaires et E2E
14. **Frontend Products/Sales/Inventory/Reports**: Pages de gestion

---

## U. CONCLUSION

Le backend OmniKès est **solide et largement complet** avec des modèles, repositories, services et API pour la plupart des fonctionnalités POS. Les protections de sécurité (Vagues 1-3) sont correctement implémentées.

Le POS frontend est **fonctionnel mais incomplet** et présente des incohérences critiques avec le backend, notamment autour du calcul de la taxe.

**Les corrections P0 doivent être effectuées avant toute mise en production**, car elles affectent l'intégrité des données commerciales.

---

**AUDIT V1-06 TERMINÉ**

**FICHIERS MODIFIÉS : 0**
**MIGRATIONS : 0**
**DONNÉES CRÉÉES : 0**

**ÉTAT : FIXES REQUIRED BEFORE IMPLEMENTATION**

**PROCHAINE ACTION :**
1. Corriger l'incohérence taxe POS (P0)
2. Implémenter la vérification stock dans le POS (P1)
3. Créer l'API Customers (P1)
4. Implémenter la recherche par barcode (P1)
