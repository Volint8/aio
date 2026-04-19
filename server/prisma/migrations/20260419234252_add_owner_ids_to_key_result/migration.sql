-- DropForeignKey
ALTER TABLE "OkrKeyResult" DROP CONSTRAINT "OkrKeyResult_assignedUserId_fkey";

-- AlterTable
ALTER TABLE "OkrKeyResult" ADD COLUMN     "ownerIds" JSONB NOT NULL DEFAULT '[]',
ALTER COLUMN "assignedUserId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "OkrKeyResult" ADD CONSTRAINT "OkrKeyResult_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
