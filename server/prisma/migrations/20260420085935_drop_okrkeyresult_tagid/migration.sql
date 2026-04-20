/*
  Warnings:

  - You are about to drop the column `tagId` on the `OkrKeyResult` table. All the data in the column will be lost.
  - You are about to drop the column `tagId` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the `Tag` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "OkrKeyResult" DROP CONSTRAINT "OkrKeyResult_tagId_fkey";

-- DropForeignKey
ALTER TABLE "Tag" DROP CONSTRAINT "Tag_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_tagId_fkey";

-- DropIndex
DROP INDEX "OkrKeyResult_tagId_idx";

-- AlterTable
ALTER TABLE "OkrKeyResult" DROP COLUMN "tagId";

-- AlterTable
ALTER TABLE "Task" DROP COLUMN "tagId";

-- DropTable
DROP TABLE "Tag";
