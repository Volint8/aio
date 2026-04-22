-- Add batch-level appraisal generation and structured report storage.

CREATE TABLE "AppraisalBatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "outputFormat" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "purposes" JSONB NOT NULL,
    "customFocus" TEXT,
    "selectedSubjects" JSONB NOT NULL,
    "selectedOkrIds" JSONB NOT NULL,
    "setupSummary" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'GENERATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppraisalBatch_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Appraisal" ADD COLUMN "batchId" TEXT;
ALTER TABLE "Appraisal" ADD COLUMN "subjectType" TEXT NOT NULL DEFAULT 'INDIVIDUAL';
ALTER TABLE "Appraisal" ADD COLUMN "subjectTeamId" TEXT;
ALTER TABLE "Appraisal" ADD COLUMN "subjectName" TEXT;
ALTER TABLE "Appraisal" ADD COLUMN "periodStart" TIMESTAMP(3);
ALTER TABLE "Appraisal" ADD COLUMN "periodEnd" TIMESTAMP(3);
ALTER TABLE "Appraisal" ADD COLUMN "purposes" JSONB;
ALTER TABLE "Appraisal" ADD COLUMN "customFocus" TEXT;
ALTER TABLE "Appraisal" ADD COLUMN "reportSections" JSONB;
ALTER TABLE "Appraisal" ADD COLUMN "selectedOkrSnapshot" JSONB;
ALTER TABLE "Appraisal" ADD COLUMN "aiMetadata" JSONB;
ALTER TABLE "Appraisal" ADD COLUMN "fallbackReason" TEXT;

ALTER TABLE "Appraisal" ALTER COLUMN "subjectUserId" DROP NOT NULL;

CREATE INDEX "AppraisalBatch_organizationId_createdAt_idx" ON "AppraisalBatch"("organizationId", "createdAt");
CREATE INDEX "Appraisal_batchId_idx" ON "Appraisal"("batchId");
CREATE INDEX "Appraisal_organizationId_createdAt_idx" ON "Appraisal"("organizationId", "createdAt");
CREATE INDEX "Appraisal_subjectType_subjectUserId_subjectTeamId_idx" ON "Appraisal"("subjectType", "subjectUserId", "subjectTeamId");

ALTER TABLE "AppraisalBatch" ADD CONSTRAINT "AppraisalBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AppraisalBatch" ADD CONSTRAINT "AppraisalBatch_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Appraisal" ADD CONSTRAINT "Appraisal_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "AppraisalBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
