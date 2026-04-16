-- Add soft-delete + purge tracking for users
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "purgedAt" TIMESTAMP(3);

