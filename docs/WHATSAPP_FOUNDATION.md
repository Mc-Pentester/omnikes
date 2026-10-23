# WhatsApp foundation — phase 1

## Scope

Prepare the first outbound WhatsApp flow without enabling provider delivery, changing the Prisma schema, or running a database migration.

## Tenant and RBAC rules

- Resolve the organization only from the authenticated session; never accept `organizationId` from request payloads.
- Require a dedicated tenant permission for reading/managing WhatsApp consent and queueing messages.
- Every consent, outbox row, log, and webhook event must be scoped to the authenticated organization.
- Never treat a platform-operator permission as a tenant permission.
- Do not send a message unless the recipient has an explicit, current opt-in for the relevant purpose.
- Do not log message bodies, access tokens, provider secrets, or full webhook payloads containing personal data.

## Data model planned (not applied)

- `whatsapp_consents`: organization, customer/contact, normalized phone, purpose, consent status, capture source/time, revocation time.
- `whatsapp_outbox`: organization, consent reference, normalized recipient, template/purpose, idempotency key, state, attempt count, next attempt, provider message ID.
- `whatsapp_message_events`: organization, outbox reference, event type, provider event ID, event time, minimal safe metadata.
- `whatsapp_message_logs`: organization, outbox reference, delivery state, timestamps, redacted error code; no secrets or unnecessary body data.
- `whatsapp_webhook_events`: provider event ID with uniqueness for replay protection, processing state, and minimal metadata.

Exact foreign keys and uniqueness constraints must be finalized against the existing Customer model before any Prisma change.

## First implementation slice

1. Add consent validation and phone normalization as provider-independent code.
2. Add tenant-scoped API routes for recording/revoking consent and enqueueing one approved template.
3. Enqueue only; no provider call until persistence, RBAC, idempotency, and tests are reviewed.
4. Add provider delivery, webhook verification, retries, and delivery-status updates in a later slice.

## Acceptance criteria

- Unauthenticated requests fail.
- Missing permission fails closed.
- A request cannot select another organization or customer across organizations.
- Missing/revoked consent prevents enqueueing.
- Repeated idempotency keys do not create duplicate outbound messages.
- No live WhatsApp message is sent by tests or CI.
- No Prisma migration is run as part of this phase.
