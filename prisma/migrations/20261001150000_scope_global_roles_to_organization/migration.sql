-- P0-25-B.2: align global RBAC roles with organization-scoped authorization.
--
-- Current authorization semantics:
--   isGlobal = true means global across stores WITHIN the role's organization.
--   It does NOT mean cross-organization / cross-tenant.
--
-- The P0-25-B migration added roles.organizationId. This follow-up
-- normalizes any remaining legacy global roles whose organization can
-- be determined safely from their user assignments.
--
-- Safety rule:
--   Never guess an organization when a role is assigned to users from
--   multiple organizations. Abort the migration instead.
--
-- Roles with no user assignments and organizationId IS NULL are left
-- untouched because there is no safe organization to infer.

DO $$
BEGIN
  -- A role cannot be shared by users from multiple organizations.
  IF EXISTS (
    SELECT 1
    FROM "user_roles" AS ur
    INNER JOIN "users" AS u
      ON u."id" = ur."userId"
    GROUP BY ur."roleId"
    HAVING COUNT(DISTINCT u."organizationId") > 1
  ) THEN
    RAISE EXCEPTION
      'P0-25-B.2 migration aborted: a role is assigned to users from multiple organizations';
  END IF;

  -- If a role already has an organizationId, every assigned user must
  -- belong to that same organization.
  IF EXISTS (
    SELECT 1
    FROM "user_roles" AS ur
    INNER JOIN "users" AS u
      ON u."id" = ur."userId"
    INNER JOIN "roles" AS r
      ON r."id" = ur."roleId"
    WHERE r."organizationId" IS NOT NULL
      AND u."organizationId" <> r."organizationId"
  ) THEN
    RAISE EXCEPTION
      'P0-25-B.2 migration aborted: a role organization does not match an assigned user organization';
  END IF;
END $$;

-- Recover the organization for legacy global roles that still have a
-- NULL organizationId but are assigned to users from exactly one org.
UPDATE "roles" AS r
SET "organizationId" = source."organizationId"
FROM (
  SELECT
    ur."roleId",
    MIN(u."organizationId") AS "organizationId"
  FROM "user_roles" AS ur
  INNER JOIN "users" AS u
    ON u."id" = ur."userId"
  GROUP BY ur."roleId"
) AS source
WHERE r."id" = source."roleId"
  AND r."isGlobal" = true
  AND r."organizationId" IS NULL;

-- Final invariant for assigned global roles:
-- every assigned global role must now be organization-scoped.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "user_roles" AS ur
    INNER JOIN "roles" AS r
      ON r."id" = ur."roleId"
    WHERE r."isGlobal" = true
      AND r."organizationId" IS NULL
  ) THEN
    RAISE EXCEPTION
      'P0-25-B.2 migration aborted: an assigned global role has no organization scope';
  END IF;
END $$;
