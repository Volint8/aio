-- AlterTable
ALTER TABLE "Appraisal" ADD COLUMN     "deadlinesMet" DOUBLE PRECISION,
ADD COLUMN     "okrContribution" TEXT,
ADD COLUMN     "overallRating" TEXT,
ADD COLUMN     "tasksCompleted" DOUBLE PRECISION;
