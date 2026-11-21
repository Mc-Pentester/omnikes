# Mise en conformité des offres commerciales OmniKès

État établi après la fusion de la PR #162 et l'audit du dépôt `main`.

## Règles commerciales à conserver

- Essai gratuit : formule Professionnel pendant 7 jours, sans carte.
- Après expiration : consultation des données historiques et export uniquement; aucune nouvelle écriture.
- Activation d'un abonnement : manuelle par un opérateur plateforme.
- Les prix restent inchangés : 149/249/299 USD par an; équivalents mensuels 14,99/24,99/29,99 USD.
- Les droits commerciaux (entitlements) et les permissions RBAC sont cumulatifs : les deux contrôles doivent réussir.
- Les données existantes doivent être conservées. Aucun reset ou migration destructive.

## Écarts constatés et critères de sortie

| Domaine | État observé | Critère avant commercialisation |
|---|---|---|
| Caisse, ventes, produits, variantes, SKU, codes-barres | Parcours et contrôles de base présents | Tests API/E2E sur création, vente, retour et accès direct aux routes |
| Stock et ajustements | Une route de mouvements POST ne contrôlait pas le plan; corrigée dans PR #164 | CI verte; tests API HTTP 402 à expiration et succès sur Essentiel actif |
| Multi-établissements et transferts | Création du deuxième établissement et transferts liés aux capacités Professionnel | Tests API négatifs Essentiel et positifs Professionnel, y compris appels directs |
| Achats/fournisseurs et crédit client | Contrôles d'entitlement présents sur les routes examinées | Tests de création, réception, crédit et refus par plan |
| Rapports standards/par magasin | Résumé standard présent; rapport par magasin lié à reports.advanced | Tests de lecture par plan et après expiration |
| Promotions et tarifs différenciés | Aucun parcours/API dédié confirmé par l'audit | Ne pas annoncer avant implémentation, RBAC, entitlements et tests |
| Exports | Le moteur définit data.export, mais aucun parcours d'export général complet n'a été confirmé | Inventorier les exports réellement disponibles; ajouter export tenant-scoped et test après expiration |
| Sauvegardes automatisées | Sauvegarde/restauration manuelles présentes; aucun ordonnanceur confirmé | Implémenter planification locale configurable, rétention, journal, restauration vérifiée et tests; ne pas annoncer avant cela |
| Consolidation ventes/stocks Entreprise | Capacité déclarée, mais aucun endpoint/tableau de bord consolidé confirmé | API consolidée, filtrage par organisation et magasins, tests de cloisonnement et E2E |
| Catalogue centralisé Entreprise | Capacité déclarée, mais aucun flux centralisé inter-magasins confirmé | Définir source de vérité, synchronisation locale/LAN, conflits et tests multi-magasins |
| Comparaison des performances Entreprise | Non confirmée | Tableau de bord comparatif, calculs vérifiés et tests multi-magasins |

## Correctif de sécurité livré dans PR #164

- `POST /api/inventory/[id]/movements` vérifie maintenant `inventory.core / WRITE` après RBAC.
- Le refus d'entitlement est renvoyé avec HTTP 402.
- Le test PostgreSQL d'abonnement expiré vérifie également le refus de `inventory.core / WRITE`.

## Règle de publication

Une capacité n'est considérée comme disponible que si les quatre éléments existent :
1. parcours utilisateur réellement fonctionnel;
2. contrôle d'entitlement côté serveur sur chaque route d'écriture/lecture protégée;
3. contrôle RBAC et cloisonnement tenant/store;
4. tests unitaires ou intégration + E2E sur les plans autorisés et refusés.

Ne jamais considérer un simple code de capacité dans le catalogue comme une fonctionnalité livrée.
