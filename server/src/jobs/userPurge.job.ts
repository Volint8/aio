import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const RETENTION_DAYS = 7;
const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 50;

const cutoffDate = () => new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

const purgeUserById = async (userId: string, expiresBefore: Date) => {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      deletedAt: { lte: expiresBefore },
      purgedAt: null
    },
    select: { id: true, deletedAt: true }
  });

  if (!user) {
    return false;
  }

  const memberships = await prisma.organizationMember.count({ where: { userId } });
  if (memberships > 0) {
    console.warn(`[UserPurge] Skipping user ${userId}: still has memberships.`);
    return false;
  }

  const replacementEmail = `deleted+${userId}@apraizal.invalid`;
  const replacementPassword = crypto.randomBytes(32).toString('hex');
  const passwordHash = await bcrypt.hash(replacementPassword, 10);

  await prisma.user.update({
    where: { id: userId },
    data: {
      email: replacementEmail,
      passwordHash,
      name: null,
      jobTitle: null,
      isVerified: false,
      otp: null,
      otpExpiresAt: null,
      passwordResetOtp: null,
      passwordResetOtpExpiresAt: null,
      pendingInviteId: null,
      signupSource: null,
      initialRole: null,
      purgedAt: new Date()
    }
  });

  return true;
};

export const purgeExpiredDeletedUsers = async () => {
  const expiresBefore = cutoffDate();
  let totalPurged = 0;

  console.log(`[UserPurge] Starting purge job (cutoff=${expiresBefore.toISOString()})`);

  while (true) {
    const users = await prisma.user.findMany({
      where: {
        deletedAt: { lte: expiresBefore },
        purgedAt: null
      },
      select: { id: true },
      orderBy: { deletedAt: 'asc' },
      take: BATCH_SIZE
    });

    if (users.length === 0) break;

    for (const row of users) {
      const wasPurged = await purgeUserById(row.id, expiresBefore);
      if (wasPurged) {
        totalPurged += 1;
      }
    }
  }

  console.log(`[UserPurge] Purge complete. Purged ${totalPurged} users.`);
};

import * as Sentry from '@sentry/node';

export const startUserPurgeJob = () => {
  purgeExpiredDeletedUsers().catch((error) => {
    console.error('[UserPurge] Initial purge run failed:', error);
    Sentry.captureException(error);
  });

  setInterval(() => {
    purgeExpiredDeletedUsers().catch((error) => {
      console.error('[UserPurge] Scheduled purge run failed:', error);
      Sentry.captureException(error);
    });
  }, PURGE_INTERVAL_MS);
};

