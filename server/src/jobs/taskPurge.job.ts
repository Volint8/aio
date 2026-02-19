import fs from 'fs/promises';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const RETENTION_DAYS = 30;
const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 50;

const serverRoot = path.resolve(__dirname, '../..');
const uploadsRoot = path.resolve(serverRoot, 'uploads');

const cutoffDate = () => new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

const safeDeleteFile = async (filePath: string) => {
    try {
        const absoluteTargetPath = path.resolve(filePath);
        const inUploadsDir = absoluteTargetPath === uploadsRoot || absoluteTargetPath.startsWith(`${uploadsRoot}${path.sep}`);

        if (!inUploadsDir) {
            console.warn(`[TaskPurge] Skipping file outside uploads directory: ${filePath}`);
            return;
        }

        await fs.unlink(absoluteTargetPath);
    } catch (error: any) {
        if (error?.code !== 'ENOENT') {
            console.error(`[TaskPurge] Failed to delete file ${filePath}:`, error);
        }
    }
};

const purgeTaskById = async (taskId: string, expiresBefore: Date) => {
    const task = await prisma.task.findFirst({
        where: {
            id: taskId,
            deletedAt: {
                lte: expiresBefore
            }
        },
        select: { id: true }
    });

    if (!task) {
        return false;
    }

    const attachments = await prisma.attachment.findMany({
        where: { taskId: task.id },
        select: { filePath: true }
    });

    await Promise.all(attachments.map((attachment) => safeDeleteFile(attachment.filePath)));

    await prisma.attachment.deleteMany({ where: { taskId: task.id } });
    await prisma.comment.deleteMany({ where: { taskId: task.id } });
    await prisma.task.delete({ where: { id: task.id } });

    return true;
};

export const purgeExpiredDeletedTasks = async () => {
    const expiresBefore = cutoffDate();
    let totalPurged = 0;

    console.log(`[TaskPurge] Starting purge job (cutoff=${expiresBefore.toISOString()})`);

    while (true) {
        const tasks = await prisma.task.findMany({
            where: {
                deletedAt: {
                    lte: expiresBefore
                }
            },
            select: { id: true },
            orderBy: {
                deletedAt: 'asc'
            },
            take: BATCH_SIZE
        });

        if (tasks.length === 0) {
            break;
        }

        for (const task of tasks) {
            const wasPurged = await purgeTaskById(task.id, expiresBefore);
            if (wasPurged) {
                totalPurged += 1;
            }
        }
    }

    console.log(`[TaskPurge] Purge complete. Removed ${totalPurged} tasks.`);
};

export const startTaskPurgeJob = () => {
    purgeExpiredDeletedTasks().catch((error) => {
        console.error('[TaskPurge] Initial purge run failed:', error);
    });

    setInterval(() => {
        purgeExpiredDeletedTasks().catch((error) => {
            console.error('[TaskPurge] Scheduled purge run failed:', error);
        });
    }, PURGE_INTERVAL_MS);
};
