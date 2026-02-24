-- Organization naming fields
ALTER TABLE "Organization" ADD COLUMN "normalizedName" TEXT;
ALTER TABLE "Organization" ADD COLUMN "slug" TEXT;

UPDATE "Organization"
SET "normalizedName" = lower(regexp_replace(trim("name"), '\\s+', ' ', 'g'))
WHERE "normalizedName" IS NULL;

UPDATE "Organization"
SET "slug" = regexp_replace(lower(trim("name")), '[^a-z0-9]+', '-', 'g') || '-' || substr("id", 1, 6)
WHERE "slug" IS NULL;

ALTER TABLE "Organization" ALTER COLUMN "normalizedName" SET NOT NULL;
ALTER TABLE "Organization" ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX "Organization_normalizedName_key" ON "Organization"("normalizedName");
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- User onboarding guardrail
ALTER TABLE "User" ADD COLUMN "pendingInviteId" TEXT;

-- Extend attachment support with link outputs
ALTER TABLE "Attachment" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'FILE';
ALTER TABLE "Attachment" ADD COLUMN "url" TEXT;
ALTER TABLE "Attachment" ALTER COLUMN "filePath" DROP NOT NULL;
ALTER TABLE "Attachment" ALTER COLUMN "fileName" DROP NOT NULL;
ALTER TABLE "Attachment" ALTER COLUMN "fileType" DROP NOT NULL;

-- Invites
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "acceptedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Invite_organizationId_email_status_idx" ON "Invite"("organizationId", "email", "status");

ALTER TABLE "Invite" ADD CONSTRAINT "Invite_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Tags
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#2563eb',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Tag_organizationId_normalizedName_key" ON "Tag"("organizationId", "normalizedName");
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- OKRs
CREATE TABLE "Okr" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Okr_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Okr" ADD CONSTRAINT "Okr_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Okr" ADD CONSTRAINT "Okr_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "OkrAssignment" (
    "id" TEXT NOT NULL,
    "okrId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OkrAssignment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "OkrAssignment" ADD CONSTRAINT "OkrAssignment_okrId_fkey" FOREIGN KEY ("okrId") REFERENCES "Okr"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Appraisals
CREATE TABLE "Appraisal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "cycle" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'GENERATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Appraisal_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Appraisal" ADD CONSTRAINT "Appraisal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Appraisal" ADD CONSTRAINT "Appraisal_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Appraisal" ADD CONSTRAINT "Appraisal_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
