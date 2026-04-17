-- Add isGeneral column to OkrKeyResult
ALTER TABLE "OkrKeyResult" ADD COLUMN "isGeneral" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "OkrKeyResult_isGeneral_idx" ON "OkrKeyResult"("isGeneral");