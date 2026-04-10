-- Allow a tag to be reused by multiple key results
DROP INDEX IF EXISTS "OkrKeyResult_tagId_key";
CREATE INDEX IF NOT EXISTS "OkrKeyResult_tagId_idx" ON "OkrKeyResult"("tagId");
