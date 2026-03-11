-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "visibility" TEXT NOT NULL DEFAULT 'ORG_WIDE';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "visibility" TEXT NOT NULL DEFAULT 'ORG_WIDE';
