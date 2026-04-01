-- AlterTable
ALTER TABLE "Invite" ADD COLUMN     "category" TEXT,
ADD COLUMN     "teamId" TEXT;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
