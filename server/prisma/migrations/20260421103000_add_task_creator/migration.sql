ALTER TABLE "Task" ADD COLUMN "createdByUserId" TEXT;

CREATE INDEX "Task_createdByUserId_idx" ON "Task"("createdByUserId");

ALTER TABLE "Task"
ADD CONSTRAINT "Task_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
