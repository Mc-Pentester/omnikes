-- Platform RBAC is deliberately separate from tenant RBAC.
-- Platform roles never participate in tenant store authorization.

CREATE TABLE "platform_roles" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_roles_name_key" ON "platform_roles"("name");

CREATE TABLE "platform_permissions" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT,
  "module" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_permissions_code_key" ON "platform_permissions"("code");
CREATE INDEX "platform_permissions_module_idx" ON "platform_permissions"("module");

CREATE TABLE "platform_user_roles" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "platformRoleId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
,
  CONSTRAINT "platform_user_roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_user_roles_userId_platformRoleId_key"
  ON "platform_user_roles"("userId", "platformRoleId");
CREATE INDEX "platform_user_roles_userId_idx" ON "platform_user_roles"("userId");
CREATE INDEX "platform_user_roles_platformRoleId_idx" ON "platform_user_roles"("platformRoleId");

CREATE TABLE "platform_role_permissions" (
  "id" TEXT NOT NULL,
  "platformRoleId" TEXT NOT NULL,
  "platformPermissionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_role_permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_role_permissions_platformRoleId_platformPermissionId_key"
  ON "platform_role_permissions"("platformRoleId", "platformPermissionId");
CREATE INDEX "platform_role_permissions_platformRoleId_idx"
  ON "platform_role_permissions"("platformRoleId");
CREATE INDEX "platform_role_permissions_platformPermissionId_idx"
  ON "platform_role_permissions"("platformPermissionId");

ALTER TABLE "platform_user_roles"
  ADD CONSTRAINT "platform_user_roles_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "platform_user_roles"
  ADD CONSTRAINT "platform_user_roles_platformRoleId_fkey"
  FOREIGN KEY ("platformRoleId") REFERENCES "platform_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "platform_role_permissions"
  ADD CONSTRAINT "platform_role_permissions_platformRoleId_fkey"
  FOREIGN KEY ("platformRoleId") REFERENCES "platform_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "platform_role_permissions"
  ADD CONSTRAINT "platform_role_permissions_platformPermissionId_fkey"
  FOREIGN KEY ("platformPermissionId") REFERENCES "platform_permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
