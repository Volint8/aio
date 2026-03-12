-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordResetOtp" TEXT,
ADD COLUMN     "passwordResetOtpExpiresAt" TIMESTAMP(3);
