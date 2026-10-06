# P0 — Explicit First Platform Operator Bootstrap

## Objective

Provide a deliberate, local-first mechanism for creating the **first active Platform Operator** without weakening tenant RBAC, creating a second authentication system, or fabricating a session.

## Implemented mechanism

The bootstrap is implemented as a local administrative command:

`npm run bootstrap:platform-operator`

It calls `PlatformOperatorBootstrapService.bootstrap()`.

The operation is disabled unless:

`BOOTSTRAP_PLATFORM_OPERATOR=true`

The following environment variables are then required:

- `BOOTSTRAP_PLATFORM_OPERATOR_ORGANIZATION_ID`
- `BOOTSTRAP_PLATFORM_OPERATOR_EMAIL`
- `BOOTSTRAP_PLATFORM_OPERATOR_NAME`
- `BOOTSTRAP_PLATFORM_OPERATOR_PASSWORD`

The password is never written to the audit log or command output.

## Security invariants

1. The bootstrap is not exposed as a public HTTP endpoint.
2. The explicit switch is required for every invocation.
3. An active user assigned to the active `OMNIKES_PLATFORM_OPERATOR` role permanently closes bootstrap.
4. The operation uses a PostgreSQL transaction-scoped advisory lock and SERIALIZABLE isolation to prevent concurrent first-operator creation.
5. The organization must already exist.
6. An existing email is rejected; bootstrap never silently modifies an existing account.
7. The password is hashed through the existing `authService.hashPassword()` bcrypt implementation.
8. The created user receives exactly one platform role assignment and no tenant `UserRole`.
9. The normal login/session mechanism remains unchanged.
10. A `PLATFORM_OPERATOR_BOOTSTRAPPED` audit event is written with `authorizationScope: PLATFORM`.
11. No Redis, Docker, cloud service, or remote authentication service is required.

## Usage

PowerShell example:

```powershell
$env:BOOTSTRAP_PLATFORM_OPERATOR = "true"
$env:BOOTSTRAP_PLATFORM_OPERATOR_ORGANIZATION_ID = "<existing-organization-id>"
$env:BOOTSTRAP_PLATFORM_OPERATOR_EMAIL = "platform.admin@example.com"
$env:BOOTSTRAP_PLATFORM_OPERATOR_NAME = "OmniKès Platform Administrator"
$env:BOOTSTRAP_PLATFORM_OPERATOR_PASSWORD = "<strong-local-password>"

npm run bootstrap:platform-operator

Remove-Item Env:BOOTSTRAP_PLATFORM_OPERATOR
Remove-Item Env:BOOTSTRAP_PLATFORM_OPERATOR_ORGANIZATION_ID
Remove-Item Env:BOOTSTRAP_PLATFORM_OPERATOR_EMAIL
Remove-Item Env:BOOTSTRAP_PLATFORM_OPERATOR_NAME
Remove-Item Env:BOOTSTRAP_PLATFORM_OPERATOR_PASSWORD
```

The command prints the created user ID, email, organization ID and platform role. It does not print the password.

After a successful bootstrap, do not run the command again unless the active Platform Operator has been deliberately removed and the instance is intentionally being re-bootstrapped.

## E2E authentication

After the operator has been deliberately created, the authenticated P1 runtime can use:

```text
E2E_EMAIL=<bootstrap operator email>
E2E_PASSWORD=<bootstrap operator password>
```

These variables remain test/runtime inputs. The bootstrap mechanism does not populate them automatically and never stores the plaintext password in the repository.

## Validation

The PostgreSQL integration test proves:

- platform role assignment;
- absence of tenant role elevation;
- normal bcrypt password authentication;
- normal session creation/revocation;
- second-bootstrap rejection;
- platform permission resolution;
- PLATFORM-scoped audit logging.

## Scope decision

`User.organizationId` remains mandatory. A Platform Operator is still a normal authenticated user attached to an existing organization, while `PlatformUserRole` supplies the cross-tenant platform authorization boundary.

No schema migration is required for this bootstrap mechanism.
