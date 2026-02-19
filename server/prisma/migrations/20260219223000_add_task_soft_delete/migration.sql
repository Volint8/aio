-- AlterTable
ALTER TABLE "Task"
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deletedById" TEXT;

-- CreateIndex
CREATE INDEX "Task_organizationId_deletedAt_idx" ON "Task"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "Task_deletedAt_idx" ON "Task"("deletedAt");

-- AddForeignKey
ALTER TABLE "Task"
ADD CONSTRAINT "Task_deletedById_fkey"
FOREIGN KEY ("deletedById") REFERENCES "User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
