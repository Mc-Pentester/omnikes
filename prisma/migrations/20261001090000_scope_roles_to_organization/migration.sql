-- P0-25-B: scope RBAC roles to an organization without deleting existing data.

ALTER TABLE "roles"
  ADD COLUMN "organizationId" TEXT;

-- Backfill existing roles from the organizations of their assigned users.
UPDATE "roles" AS r
SET "organizationId" = source."organizationId"
FROM (
  SELECT ur."roleId", MIN(u."organizationId") AS "organizationId"
  FROM "user_roles" AS ur
  INNER JOIN "users" AS u ON u."id" = ur."userId"
  GROUP BY ur."roleId"
) AS source
WHERE r."id" = source."roleId";

-- Refuse ambiguous legacy roles rather than assigning them to the wrong tenant.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "user_roles" AS ur
    INNER JOIN "users" AS u ON u."id" = ur."userId"
    GROUP BY ur."roleId"
    HAVING COUNT(DISTINCT u."organizationId") > 1
  ) THEN
    RAISE EXCEPTION 'P0-25-B migration aborted: a role is assigned across multiple organizations';
  END IF;
END $$;

CREATE INDEX "roles_organizationId_idx" ON "roles"("organizationId");

ALTER TABLE "roles"
  ADD CONSTRAINT "roles_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
