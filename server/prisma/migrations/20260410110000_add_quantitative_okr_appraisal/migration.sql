-- Add quantitative fields to key results
ALTER TABLE "OkrKeyResult"
ADD COLUMN "metricName" TEXT,
ADD COLUMN "metricUnit" TEXT,
ADD COLUMN "targetValue" DOUBLE PRECISION,
ADD COLUMN "weight" DOUBLE PRECISION NOT NULL DEFAULT 1;

-- Add structured OKR snapshot fields to appraisals
ALTER TABLE "Appraisal"
ADD COLUMN "okrImpactScore" DOUBLE PRECISION,
ADD COLUMN "okrImpactSummary" JSONB,
ADD COLUMN "scoreBreakdown" JSONB;

-- Task-level impact attribution for KRs
CREATE TABLE "TaskKrImpact" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "okrKeyResultId" TEXT NOT NULL,
    "plannedValue" DOUBLE PRECISION,
    "actualValue" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskKrImpact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TaskKrImpact_taskId_okrKeyResultId_key" ON "TaskKrImpact"("taskId", "okrKeyResultId");
CREATE INDEX "TaskKrImpact_okrKeyResultId_idx" ON "TaskKrImpact"("okrKeyResultId");

ALTER TABLE "TaskKrImpact" ADD CONSTRAINT "TaskKrImpact_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskKrImpact" ADD CONSTRAINT "TaskKrImpact_okrKeyResultId_fkey" FOREIGN KEY ("okrKeyResultId") REFERENCES "OkrKeyResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;
