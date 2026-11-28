# Validation matérielle du scanner code-barres Windows

Cette vérification complète le test Playwright HID clavier. Elle doit être effectuée avec le véritable scanner USB ou Bluetooth utilisé au point de vente.

## Préparation

- Installer et lancer la version de test d'OmniKès sur Windows.
- Connecter le scanner et vérifier qu'il fonctionne en mode clavier (HID / keyboard wedge).
- Vérifier la disposition du clavier Windows et configurer le scanner pour envoyer **Entrée** après chaque lecture.
- Ouvrir une session avec un utilisateur autorisé à consulter et créer des produits.

## Scénarios à vérifier

1. **Code connu au POS** : placer le focus dans la recherche produit, scanner un code existant et vérifier que le bon produit/variante est ajouté une seule fois au panier.
2. **Code inconnu** : scanner un code absent du catalogue et vérifier que la confirmation de création apparaît.
3. **Création depuis le scan** : accepter la confirmation, vérifier que le formulaire produit s'ouvre avec le code-barres prérempli, puis compléter les champs obligatoires et enregistrer.
4. **Entrée dans le formulaire** : scanner dans le champ code-barres et vérifier que le suffixe Entrée ne soumet pas le formulaire prématurément.
5. **Retour au POS** : revenir au POS, scanner le nouveau code et vérifier que le produit créé est ajouté au panier.
6. **Annulation** : scanner un autre code inconnu, refuser la création et vérifier qu'aucun produit ni ligne de panier n'est ajouté.
7. **Scans rapprochés** : scanner rapidement deux codes connus et vérifier que les deux sont traités dans l'ordre, sans perte ni doublon.
8. **Reconnexion** : débrancher puis reconnecter le scanner et vérifier qu'une nouvelle lecture fonctionne après reconnexion.

## Résultat à consigner

Pour chaque essai, noter le modèle du scanner, USB ou Bluetooth, la version de Windows, la disposition clavier, le résultat (réussi/échoué) et, en cas d'échec, les étapes exactes pour le reproduire.

La validation Playwright simule les frappes clavier ; elle ne remplace pas cette vérification physique.
