# Vague 3 - Audit Initial (Phase 0)

**Date:** 8 septembre 2026  
**Objectif:** Documenter l'état du système avant les modifications de durcissement opérationnel et sécurité avancée

---

## A. Git Status

État du dépôt:
- Branche: `main`
- Modifications non stagées: 30 fichiers (Vague 1 et Vague 2)
- Fichiers non trackés: 12 fichiers (rapports, nouveaux fichiers Vague 1/2)
- Aucun commit à faire (conformément aux règles)

---

## B. npm audit --omit=dev

**Résultat:** 9 vulnérabilités de haute sévérité

| Package | Vulnérabilité | Advisory | Impact |
|---------|---------------|----------|--------|
| deepmerge-ts <8.0.0 | Stack exhaustion recursive object graphs | GHSA-ggr8-5vv4-36mx | DoS |
| mysql2 <=3.23.0 | Auth plugin downgrade leaks credentials | GHSA-3f6p-5ww8-9rcr | Credential leak |
| mysql2 <=3.23.0 | Unbounded zlib inflate DoS | GHSA-rgwj-5xj2-c3m3 | DoS |
| serialize-javascript <=7.0.2 | RCE via RegExp.flags | GHSA-5c6j-r48x-rmvq | RCE |

**Chaînes de dépendances:**
- `deepmerge-ts` → `@prisma/config` → `prisma`
- `mysql2` → `prisma`
- `serialize-javascript` → `rollup-plugin-terser` → `workbox-build` → `workbox-webpack-plugin` → `next-pwa`

**Note:** `npm audit fix --force` proposerait de downgrader Prisma à 6.19.3 (breaking change) et next-pwa à 2.0.2 (breaking change).

---

## C. npm ls --depth=0

Packages principaux installés:
- next@16.3.3
- react@19.2.8
- @prisma/client@7.10.0
- prisma@7.10.0
- @prisma/adapter-pg@7.10.0
- pg@8.23.0
- bcryptjs@3.0.3
- next-pwa@5.6.0
- vitest@5.0.0
- @playwright/test@1.63.0

Packages extraneous (non listés dans package.json):
- @emnapi/core@1.10.0
- @emnapi/runtime@1.11.3
- @emnapi/wasi-threads@1.2.1
- @img/sharp-wasm32@0.35.4
- @napi-rs/wasm-runtime@1.2.3
- @tybys/wasm-util@0.10.3

---

## D. npm run typecheck

**Résultat:** ✅ Succès (0 erreurs)

---

## E. npm test

**Résultat:** ✅ Succès (6/6 tests passants)
- `src/tests/lib/validation.test.ts`: 6 tests
- Warning Vitest config: ESM syntax in CommonJS file

---

## F. npm run lint

**Résultat:** ✅ Succès (0 erreurs, 6 warnings)

Warnings:
- `confirmPassword` non utilisé (register route)
- `productSchema` non utilisé (products route)
- `id` non utilisé (proformas items route x2)
- `id` non utilisé (sales items route x2)

---

## G. npm run build

**Résultat:** ✅ Succès
- Compilation Next.js réussie
- TypeScript check réussi
- 22 routes générées

---

## H. Inspection Authentification

### src/services/auth.service.ts

**Mécanisme actuel:**
- Token généré avec `randomBytes(32).toString('hex')` (64 caractères hex)
- Token stocké **en clair** en base de données (Session.token)
- Expiration: 7 jours
- Validation: recherche par token brut en DB

**Problème identifié:** Token stocké en clair en base (violation du principe de non-persistence des secrets)

### src/repositories/session.repository.ts

**Méthodes:**
- `create()`: Crée session avec token brut
- `findByToken()`: Recherche par token brut
- `findValidByToken()`: Recherche par token brut + vérification expiration/révocation
- `updateLastAccessed()`: Met à jour lastAccessedAt
- `revoke()`: Révoque par token brut
- `revokeAllForUser()`: Révoque toutes sessions utilisateur
- `deleteExpired()`: Nettoyage sessions expirées
- `deleteOldRevoked()`: Nettoyage sessions révoquées anciennes

**Problème:** Toutes les recherches utilisent le token brut

### src/repositories/user.repository.ts

**Mécanisme anti-brute-force actuel:**
- `incrementFailedAttempts()`: 
  - SELECT pour lire current attempts
  - UPDATE pour incrémenter
  - **Non atomique** (race condition possible)
- Lock après 5 échecs: 15 minutes
- `isLocked()`: Vérifie lockedUntil
- `updateLastLogin()`: Reset failedLoginAttempts et lockedUntil

**Problèmes identifiés:**
- Incrément non atomique (SELECT + UPDATE)
- Pas de rate limiting IP
- Réponses d'erreur différentes permettent énumération

---

## I. Inspection Health Check

### src/app/api/health/route.ts

**Réponse actuelle:**
```json
{
  "status": "ok|degraded",
  "timestamp": "...",
  "version": "0.1.0",
  "environment": "...",
  "services": {
    "database": {
      "status": "connected|disconnected",
      "error": "error message or null"  // ⚠️ EXPOSE MESSAGE ERREUR
    }
  }
}
```

**Problème:** Expose `databaseError` avec message d'erreur Prisma brut (potentiellement des informations sensibles)

---

## J. Inspection Docker

### docker-compose.yml

**Configuration actuelle:**
```yaml
environment:
  POSTGRES_USER: omnikes
  POSTGRES_PASSWORD: omnikes_password  # ⚠️ CREDENTIAL STATIQUE
  POSTGRES_DB: omnikes
ports:
  - "5432:5432"  # ⚠️ EXPOSITION PUBLIQUE
```

**Problèmes identifiés:**
- Mot de passe PostgreSQL statique dans le fichier
- Port 5432 exposé publiquement (toutes les interfaces)
- Pas de variables d'environnement pour les secrets

---

## K. Inspection Configuration

### package.json

**Scripts:**
- dev, build, start, lint, typecheck, test, test:watch, seed

**Dépendances clés:**
- Prisma 7.10.0
- Next.js 16.3.3
- React 19.2.8
- bcryptjs 3.0.3
- next-pwa 5.6.0 (source de vulnérabilité serialize-javascript)

---

## L. Synthèse des Problèmes Identifiés

### Priorité Critique (P0)

1. **Token de session stocké en clair** - Phase 1
2. **Health check expose erreur DB** - Phase 5
3. **Docker credentials statiques** - Phase 8

### Priorité Haute (P1)

4. **Anti-brute-force non atomique** - Phase 3
5. **Rate limiting absent** - Phase 3
6. **Énumération par réponses différentes** - Phase 3
7. **Docker port exposé publiquement** - Phase 8

### Priorité Moyenne (P2)

8. **Pagination non validée** - Phase 6
9. **Validation des dates insuffisante** - Phase 7
10. **Dépendances vulnérables** - Phase 9

### Priorité Basse (P3)

11. **Logs de sécurité structurés** - Phase 4
12. **Variables d'environnement** - Phase 10

---

## M. État du Système Avant Vague 3

| Composant | État | Notes |
|-----------|------|-------|
| Authentification | ⚠️ Token en clair | Hash requis |
| Session | ⚠️ Révocation OK | Expiration OK |
| Anti-brute-force | ⚠️ Non atomique | Race condition |
| Rate limiting | ❌ Absent | À implémenter |
| Health check | ⚠️ Trop bavard | Error DB exposé |
| Pagination | ⚠️ Non validée | skip/take libres |
| Dates | ⚠️ Validation faible | À renforcer |
| Docker | ⚠️ Credentials exposés | Port public |
| Dépendances | ⚠️ 9 vulnérabilités high | À évaluer |
| TypeScript | ✅ OK | 0 erreurs |
| Tests | ✅ OK | 6/6 passent |
| Lint | ✅ OK | 0 erreurs |
| Build | ✅ OK | Succès |

---

## N. Points d'Attention pour les Phases Suivantes

### Phase 1 - Hash des Tokens
- Migration des sessions existantes nécessaire
- Secret HMAC requis (variable d'environnement)
- Mise à jour de tous les repositories session

### Phase 3 - Anti-brute-force
- Utiliser Prisma atomic operations (increment)
- Implémenter rate limiting in-memory (simple et suffisant pour mono-instance)
- Uniformiser les réponses d'erreur

### Phase 5 - Health Check
- Réduire réponse à `{ status: "ok" }` ou `{ status: "unhealthy" }`
- Logger les détails en interne

### Phase 8 - Docker
- Utiliser variables d'environnement
- Limiter binding à `127.0.0.1:5432`
- Documenter que c'est pour développement uniquement

### Phase 9 - Dépendances
- Évaluer exploitabilité réelle
- Ne pas downgrader Prisma arbitrairement
- next-pwa: vérifier si PWA est utilisé

---

## O. Conclusion

Le système est fonctionnel mais présente plusieurs vulnérabilités de sécurité:
- Token de session en clair (critique)
- Health check trop bavard (critique)
- Docker credentials exposés (critique)
- Anti-brute-force non atomique (haut)
- Rate limiting absent (haut)

Les tests, lint et build passent, ce qui fournit une base solide pour les modifications de sécurité.

**Prochaine étape:** Phase 1 - Hash des tokens de session
