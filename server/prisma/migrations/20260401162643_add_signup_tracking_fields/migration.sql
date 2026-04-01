-- AlterTable
ALTER TABLE "OrganizationMember" ADD COLUMN     "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "initialRole" TEXT,
ADD COLUMN     "signupSource" TEXT;
