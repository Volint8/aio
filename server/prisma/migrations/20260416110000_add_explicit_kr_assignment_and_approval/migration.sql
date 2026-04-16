-- Add objective-level quantitative baseline
ALTER TABLE "Okr"
ADD COLUMN "objectiveTargetValue" DOUBLE PRECISION,
ADD COLUMN "objectiveMetricUnit" TEXT;

-- Add first-class KR ownership, contribution, and approval fields
ALTER TABLE "OkrKeyResult"
ADD COLUMN "assignedUserId" TEXT,
ADD COLUMN "contributionValue" DOUBLE PRECISION,
ADD COLUMN "contributionPct" DOUBLE PRECISION,
ADD COLUMN "approvalStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN "approvedBy" TEXT,
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "approvalNotes" TEXT;

-- Backfill assignment where the tag name matched a member name/email in the same organization
UPDATE "OkrKeyResult" kr
SET "assignedUserId" = matched."userId"
FROM (
    SELECT DISTINCT ON (kr_inner.id)
        kr_inner.id AS "krId",
        om."userId"
    FROM "OkrKeyResult" kr_inner
    JOIN "Okr" o ON o.id = kr_inner."okrId"
    JOIN "Tag" t ON t.id = kr_inner."tagId"
    JOIN "OrganizationMember" om ON om."organizationId" = o."organizationId"
    JOIN "User" u ON u.id = om."userId"
    WHERE lower(regexp_replace(t."name", '[^a-zA-Z0-9]+', '', 'g')) IN (
        lower(regexp_replace(COALESCE(u."name", ''), '[^a-zA-Z0-9]+', '', 'g')),
        lower(regexp_replace(u."email", '[^a-zA-Z0-9]+', '', 'g'))
    )
    ORDER BY kr_inner.id, om."joinedAt" ASC
) matched
WHERE kr.id = matched."krId";

-- Fallback assignment to the OKR creator for legacy rows that could not be matched
UPDATE "OkrKeyResult" kr
SET "assignedUserId" = o."createdBy"
FROM "Okr" o
WHERE o.id = kr."okrId"
  AND kr."assignedUserId" IS NULL;

ALTER TABLE "OkrKeyResult"
ALTER COLUMN "assignedUserId" SET NOT NULL;

CREATE INDEX "OkrKeyResult_assignedUserId_idx" ON "OkrKeyResult"("assignedUserId");

ALTER TABLE "OkrKeyResult"
ADD CONSTRAINT "OkrKeyResult_assignedUserId_fkey"
FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OkrKeyResult"
ADD CONSTRAINT "OkrKeyResult_approvedBy_fkey"
FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
