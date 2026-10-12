# Rate limiting partagé — OmniKès

## Comportement

Le limiteur utilise la table PostgreSQL `rate_limit_buckets` comme stockage partagé. Les compteurs sont mis à jour par un `INSERT ... ON CONFLICT` atomique : plusieurs processus qui utilisent la même base appliquent donc le même quota. Redis et un service cloud ne sont pas requis.

- Quota par identifiant email/IP : 10 tentatives sur 15 minutes.
- Quota IP pour la connexion : 50 tentatives sur 15 minutes afin de ne pas bloquer trop vite les postes de caisse partageant une adresse réseau.
- Inscription et réinitialisation : quota IP et quota lié à l’identifiant lorsque l’adresse IP est connue.
- Les identifiants persistés sont hachés en SHA-256 ; les adresses email et IP en clair ne sont pas stockées dans cette table.
- Nettoyage périodique des entrées expirées et plafond de 10 000 entrées.
- Les compteurs sont partagés entre les processus qui utilisent la même base PostgreSQL. Des installations OmniKès indépendantes, chacune avec sa propre base locale, gardent naturellement des compteurs indépendants.

## Adresse IP et proxy

Par défaut, `TRUSTED_PROXY=false` : les en-têtes de transfert ne sont pas considérés comme une source fiable. Activer `TRUSTED_PROXY=true` uniquement si le reverse proxy est maîtrisé et remplace lui-même `X-Forwarded-For` / `X-Real-IP`. Les valeurs IP invalides sont rejetées.

Sans proxy fiable, l’application continue de limiter par email/identifiant ; elle ne prétend pas disposer d’une IP client qu’elle ne peut pas vérifier.

## Déploiement

La migration `20261012150000_add_shared_rate_limit_buckets` crée la table additive. Elle ne réinitialise ni ne remplace aucune table métier. Appliquer les migrations avant de lancer la version qui utilise ce limiteur.
