# OmniKès

**OmniKès** est un logiciel de point de vente (POS) conçu selon une architecture **Local-First**. Les opérations essentielles d'un établissement sont hébergées et exécutées sur son réseau local. Les services cloud et la boutique en ligne sont des extensions facultatives, et non des prérequis au fonctionnement du POS.

## Principes

- **Local-First** : les fonctions essentielles du POS restent disponibles sur le réseau local.
- **Cloud-Optional** : aucun compte cloud ni synchronisation distante obligatoire pour le fonctionnement local.
- **Online Store-Optional** : la boutique en ligne est un module facultatif.
- **Multi-organisation et multi-magasin** : séparation des organisations, établissements, utilisateurs et autorisations.
- **PostgreSQL** : base de données relationnelle utilisée par l'application.
- **Matériel** : intégration via une couche dédiée pour les périphériques pris en charge.

## Technologies

- Next.js 16, React 19 et TypeScript
- Prisma ORM
- PostgreSQL
- Tailwind CSS 4
- Zod
- Vitest pour les tests unitaires et d'intégration
- Playwright pour les tests end-to-end

Les versions exactes sont définies dans `package.json` et `package-lock.json`.

## Installation Windows

Pour les utilisateurs finaux, utiliser le programme d'installation Windows fourni dans les **GitHub Releases** du dépôt. Le package Windows embarque les runtimes nécessaires, notamment Node.js et PostgreSQL, afin d'éviter de demander à l'utilisateur d'installer Docker Desktop ou un environnement de développement.

Les mises à jour doivent être effectuées avec le processus d'installation prévu par OmniKès. Ne pas supprimer le répertoire de données PostgreSQL ni les données applicatives lors d'une mise à jour.

## Développement

### Prérequis

- Node.js compatible avec la version utilisée par le projet (voir le runtime défini dans le workflow Windows)
- npm
- Une instance PostgreSQL accessible depuis l'environnement de développement

Docker Compose peut être utilisé comme option de développement/test pour fournir PostgreSQL. Docker Desktop n'est pas un prérequis pour l'installation Windows destinée aux utilisateurs.

### Démarrage

1. Cloner le dépôt et installer les dépendances :

   ```bash
   npm ci
   ```

2. Créer le fichier local d'environnement à partir du modèle :

   ```bash
   cp .env.example .env
   ```

3. Configurer `DATABASE_URL` dans `.env` pour pointer vers l'instance PostgreSQL de développement. Ne jamais committer un fichier `.env` contenant des identifiants ou secrets.

4. Générer le client Prisma et appliquer les migrations sur la base de développement :

   ```bash
   npx prisma generate
   npx prisma migrate dev
   ```

5. Lancer l'application :

   ```bash
   npm run dev
   ```

L'application de développement est accessible à l'adresse http://localhost:3000.

## Commandes utiles

| Commande | Description |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production (nécessite `DATABASE_URL`) |
| `npm start` | Serveur Next.js |
| `npm run lint` | Analyse ESLint |
| `npm run typecheck` | Vérification TypeScript |
| `npm test` | Tests Vitest |
| `npx playwright test` | Tests Playwright configurés dans le dépôt |
| `npx prisma validate` | Validation du schéma Prisma |
| `npx prisma generate` | Génération du client Prisma |

## Structure du projet

- `prisma/` : schéma et migrations de base de données
- `src/app/` : pages et routes API Next.js
- `src/components/` : composants d'interface
- `src/services/` et `src/repositories/` : logique métier et accès aux données
- `src/tests/` et `e2e/` : tests automatisés
- `scripts/` : scripts d'administration, de validation et de packaging
- `installer/` : ressources de l'installateur Windows
- `.github/workflows/` : workflows CI et packaging/publication

## Sécurité et données

- Ne jamais committer de secrets, mots de passe, jetons ou fichiers d'environnement réels.
- Ne pas exécuter de migration destructive sur une base contenant des données réelles.
- Utiliser une base dédiée aux tests et au développement.
- Préserver les données locales et le répertoire PostgreSQL pendant les mises à jour.
- Les opérations sensibles doivent respecter les contrôles d'autorisation (RBAC) de l'application.

## Licence

Logiciel propriétaire — tous droits réservés. Voir [docs/legal/OMNIKES-LICENSE.txt](docs/legal/OMNIKES-LICENSE.txt).
