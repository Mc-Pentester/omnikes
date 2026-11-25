-- Remove the raw token column and its indexes
-- This migration enforces security: only tokenHash is stored, never the raw token

-- Drop unique index on token
DROP INDEX IF EXISTS "sessions_token_key";

-- Drop index on token
DROP INDEX IF EXISTS "sessions_token_idx";

-- Drop the token column
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "token";
