# P0 — Explicit First Platform Operator Bootstrap

## Objective

Provide a deliberate, local-first mechanism for creating the first active Platform Operator without weakening tenant RBAC, creating a second authentication system, or fabricating a session.

## Implemented mechanism

Run the local administrative command:

`npm run bootstrap:platform-operator`

The command is disabled unless `BOOTSTRAP_PLATFORM_OPERATOR=true`. It provisions the reserved internal organization **OmniKès technique** (`omnikes-platform-technical`) idempotently, ensures the platform role and its permissions exist, then creates the first operator through `PlatformOperatorBootstrapService.bootstrap()`.

The internal organization uses Haiti defaults (HT / HTG / fr-HT / America/Port-au-Prince), with cloud and online-store features disabled. It does not create a store or demo data.

Required environment variables:

- `BOOTSTRAP_PLATFORM_OPERATOR=true`
- `BOOTSTRAP_PLATFORM_OPERATOR_EMAIL`
- `BOOTSTRAP_PLATFORM_OPERATOR_NAME`
- `BOOTSTRAP_PLATFORM_OPERATOR_PASSWORD`

The organization ID is resolved by the command; it is no longer supplied manually. The password is never written to the audit log or command output.

## Security invariants

1. The bootstrap is not exposed as a public HTTP endpoint.
2. The explicit switch is required for every invocation.
3. An active user assigned to the active `OMNIKES_PLATFORM_OPERATOR` role permanently closes first-operator bootstrap.
4. The operator creation uses a PostgreSQL transaction-scoped advisory lock and SERIALIZABLE isolation to prevent concurrent first-operator creation.
5. The internal organization uses a reserved slug and an idempotent upsert. An existing organization with that slug but a different name causes a hard failure; it is never repurposed.
6. An existing email is rejected; bootstrap never silently modifies an existing account.
7. The password is hashed through the existing `authService.hashPassword()` bcrypt implementation.
8. The created user receives exactly one platform role assignment and no tenant `UserRole`.
9. The normal login/session mechanism remains unchanged.
10. A `PLATFORM_OPERATOR_BOOTSTRAPPED` audit event is written with `authorizationScope: PLATFORM`.
11. The platform role, platform permission catalogue, and role-permission links are provisioned idempotently both by the Windows RBAC initializer and by the explicit bootstrap command.
12. No test seed, Redis, Docker, cloud service, or remote authentication service is required.

## Usage

PowerShell example:

```powershell
$env:BOOTSTRAP_PLATFORM_OPERATOR = "true"
$env:BOOTSTRAP_PLATFORM_OPERATOR_EMAIL = "platform.admin@example.com"
$env:BOOTSTRAP_PLATFORM_OPERATOR_NAME = "Administrateur OmniKès"
$env:BOOTSTRAP_PLATFORM_OPERATOR_PASSWORD = "<strong-local-password>"

npm run bootstrap:platform-operator

Remove-Item Env:BOOTSTRAP_PLATFORM_OPERATOR
Remove-Item Env:BOOTSTRAP_PLATFORM_OPERATOR_EMAIL
Remove-Item Env:BOOTSTRAP_PLATFORM_OPERATOR_NAME
Remove-Item Env:BOOTSTRAP_PLATFORM_OPERATOR_PASSWORD
```

The command prints the created user ID, email, organization ID, and platform role. It does not print the password. Supply the password locally through the environment; never send it in chat, commit it, or put it in a log.

After a successful bootstrap, do not run the command again unless the active Platform Operator has been deliberately removed and the instance is intentionally being re-bootstrapped.

## Validation

The PostgreSQL integration test proves:

- platform role assignment;
- absence of tenant role elevation;
- normal bcrypt password authentication;
- normal session creation/revocation;
- second-bootstrap rejection;
- platform permission resolution;
- PLATFORM-scoped audit logging.

The Windows RBAC build test additionally verifies that the installer initializer provisions the platform role and permissions, and that the explicit bootstrap command uses the dedicated technical organization rather than requiring an organization ID or invoking test seed data.

## Scope decision

`User.organizationId` remains mandatory. A Platform Operator is still a normal authenticated user attached to the dedicated internal organization, while `PlatformUserRole` supplies the separate platform authorization boundary.

No schema migration is required for this bootstrap mechanism.
