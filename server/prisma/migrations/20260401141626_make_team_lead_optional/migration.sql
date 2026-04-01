-- DropForeignKey
ALTER TABLE "Team" DROP CONSTRAINT "Team_leadUserId_fkey";

-- AlterTable
ALTER TABLE "Team" ALTER COLUMN "leadUserId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_leadUserId_fkey" FOREIGN KEY ("leadUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
