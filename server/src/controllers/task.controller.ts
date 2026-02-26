import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { sendTaskAssignmentEmail } from '../services/email.service';

const prisma = new PrismaClient();

type TaskView = 'active' | 'deleted';

const resolveTaskView = (view: unknown): TaskView => {
    return view === 'deleted' ? 'deleted' : 'active';
};

const notifyTaskAssignment = async (params: {
    assigneeId: string;
    assignerId: string;
    taskTitle: string;
    organizationName: string;
    dueDate?: Date | null;
    priority?: string | null;
}) => {
    const { assigneeId, assignerId, taskTitle, organizationName, dueDate, priority } = params;

    if (!assigneeId || assigneeId === assignerId) {
        return;
    }

    try {
        const [assignee, assigner] = await Promise.all([
            prisma.user.findUnique({
                where: { id: assigneeId },
                select: { email: true, name: true }
            }),
            prisma.user.findUnique({
                where: { id: assignerId },
                select: { email: true, name: true }
            })
        ]);

        if (!assignee?.email) {
            return;
        }

        await sendTaskAssignmentEmail({
            to: assignee.email,
            assigneeName: assignee.name,
            taskTitle,
            organizationName,
            assignerName: assigner?.name || assigner?.email,
            dueDate,
            priority
        });
    } catch (error) {
        console.error('Task assignment email failed:', error);
    }
};

const ensureTaskIsActive = (task: { deletedAt: Date | null }) => {
    return !task.deletedAt;
};

const resolveTaskTeamContext = async (params: {
    organizationId: string;
    assigneeId: string;
    supporterId?: string | null;
}) => {
    const { organizationId, assigneeId, supporterId } = params;

    const assigneeMembership = await prisma.organizationMember.findUnique({
        where: {
            userId_organizationId: {
                userId: assigneeId,
                organizationId
            }
        }
    });

    if (!assigneeMembership) {
        throw new Error('Assignee is not a member of this organization');
    }
    if (assigneeMembership.role === 'ADMIN') {
        throw new Error('Admin users cannot be assigned as primary assignee');
    }
    if (!assigneeMembership.teamId) {
        throw new Error('Primary assignee must belong to a team');
    }

    let supporterMembership: any = null;
    if (supporterId) {
        if (supporterId === assigneeId) {
            throw new Error('Supporter cannot be the same as primary assignee');
        }

        supporterMembership = await prisma.organizationMember.findUnique({
            where: {
                userId_organizationId: {
                    userId: supporterId,
                    organizationId
                }
            }
        });

        if (!supporterMembership) {
            throw new Error('Supporter is not a member of this organization');
        }
        if (supporterMembership.role === 'ADMIN') {
            throw new Error('Admin users cannot be supporters');
        }
    }

    const teamIds = [assigneeMembership.teamId];
    if (supporterMembership?.teamId && supporterMembership.teamId !== assigneeMembership.teamId) {
        teamIds.push(supporterMembership.teamId);
    }

    return {
        assigneeMembership,
        supporterMembership,
        teamIds: Array.from(new Set(teamIds))
    };
};

const syncTaskTeams = async (taskId: string, teamIds: string[]) => {
    await prisma.taskTeam.deleteMany({ where: { taskId } });
    if (teamIds.length > 0) {
        await prisma.taskTeam.createMany({
            data: teamIds.map((teamId) => ({ taskId, teamId }))
        });
    }
};

export const getTasks = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { organizationId, status, assigneeId, view } = req.query;
        const taskView = resolveTaskView(view);

        const where: any = {};
        let membership: { role: string; teamId: string | null } | null = null;

        if (organizationId) {
            membership = await prisma.organizationMember.findUnique({
                where: {
                    userId_organizationId: {
                        userId,
                        organizationId: organizationId as string
                    }
                }
            });

            if (!membership) {
                return res.status(403).json({ error: 'Access denied' });
            }

            if (taskView === 'deleted' && membership.role !== 'ADMIN') {
                return res.status(403).json({ error: 'Only admins can view recently deleted tasks' });
            }

            where.organizationId = organizationId;

            if (taskView === 'active' && ['TEAM_LEAD', 'MEMBER'].includes(membership.role)) {
                where.OR = [
                    { assigneeId: userId },
                    { supporterId: userId },
                    ...(membership.teamId ? [{ taskTeams: { some: { teamId: membership.teamId } } }] : [])
                ];
            }
        } else {
            const memberships = await prisma.organizationMember.findMany({
                where: { userId }
            });

            if (taskView === 'deleted') {
                const adminOrgIds = memberships.filter((m) => m.role === 'ADMIN').map((m) => m.organizationId);
                where.organizationId = {
                    in: adminOrgIds
                };
            } else {
                where.organizationId = {
                    in: memberships.map((m) => m.organizationId)
                };
            }
        }

        if (taskView === 'deleted') {
            where.deletedAt = { not: null };
        } else {
            where.deletedAt = null;
        }

        if (status && taskView === 'active') {
            where.status = status;
        }

        if (assigneeId) {
            where.assigneeId = assigneeId;
        }

        const tasks = await prisma.task.findMany({
            where,
            include: {
                assignee: {
                    select: {
                        id: true,
                        email: true,
                        name: true
                    }
                },
                supporter: {
                    select: {
                        id: true,
                        email: true,
                        name: true
                    }
                },
                organization: {
                    select: {
                        id: true,
                        name: true
                    }
                },
                comments: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                email: true,
                                name: true
                            }
                        }
                    },
                    orderBy: {
                        createdAt: 'desc'
                    }
                },
                attachments: true
                ,
                tag: true,
                taskTeams: {
                    include: {
                        team: {
                            select: {
                                id: true,
                                name: true
                            }
                        }
                    }
                }
            },
            orderBy: taskView === 'deleted'
                ? { deletedAt: 'desc' }
                : { createdAt: 'desc' }
        });

        res.json(tasks);
    } catch (error) {
        console.error('Get tasks error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const createTask = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { title, description, organizationId, assigneeId, supporterId, dueDate, priority, tagId } = req.body;
        const normalizedAssigneeId = assigneeId === '' ? null : assigneeId;
        const normalizedSupporterId = supporterId === '' ? null : supporterId;

        if (!title || !organizationId || !tagId || !normalizedAssigneeId) {
            return res.status(400).json({ error: 'Title, organization, tag and assignee are required' });
        }

        const membership = await prisma.organizationMember.findUnique({
            where: {
                userId_organizationId: {
                    userId,
                    organizationId
                }
            }
        });

        if (!membership) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const tag = await prisma.tag.findUnique({ where: { id: tagId } });
        if (!tag || tag.organizationId !== organizationId) {
            return res.status(400).json({ error: 'Selected tag is invalid for this organization' });
        }

        const { teamIds } = await resolveTaskTeamContext({
            organizationId,
            assigneeId: normalizedAssigneeId,
            supporterId: normalizedSupporterId
        });

        const task = await prisma.$transaction(async (tx) => {
            const created = await tx.task.create({
                data: {
                    title,
                    description,
                    organizationId,
                    assigneeId: normalizedAssigneeId,
                    supporterId: normalizedSupporterId,
                    tagId,
                    dueDate: dueDate ? new Date(dueDate) : null,
                    priority: priority || 'LOW',
                    status: 'CREATED'
                }
            });

            if (teamIds.length > 0) {
                await tx.taskTeam.createMany({
                    data: teamIds.map((teamId) => ({ taskId: created.id, teamId }))
                });
            }

            return tx.task.findUnique({
                where: { id: created.id },
                include: {
                    assignee: { select: { id: true, email: true, name: true } },
                    supporter: { select: { id: true, email: true, name: true } },
                    organization: { select: { id: true, name: true } },
                    tag: true,
                    taskTeams: { include: { team: { select: { id: true, name: true } } } }
                }
            });
        });

        await notifyTaskAssignment({
            assigneeId: task?.assignee?.id || '',
            assignerId: userId,
            taskTitle: task?.title || title,
            organizationName: task?.organization?.name || '',
            dueDate: task?.dueDate,
            priority: task?.priority
        });

        res.status(201).json(task);
    } catch (error) {
        console.error('Create task error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getTaskById = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const id = req.params.id as string;

        const task = await prisma.task.findUnique({
            where: { id: id },
            include: {
                assignee: {
                    select: {
                        id: true,
                        email: true,
                        name: true
                    }
                },
                supporter: {
                    select: {
                        id: true,
                        email: true,
                        name: true
                    }
                },
                organization: {
                    select: {
                        id: true,
                        name: true
                    }
                },
                comments: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                email: true,
                                name: true
                            }
                        }
                    },
                    orderBy: {
                        createdAt: 'desc'
                    }
                },
                attachments: true,
                tag: true,
                taskTeams: {
                    include: {
                        team: {
                            select: {
                                id: true,
                                name: true
                            }
                        }
                    }
                }
            }
        });

        if (!task || task.deletedAt) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const membership = await prisma.organizationMember.findUnique({
            where: {
                userId_organizationId: {
                    userId,
                    organizationId: task.organizationId
                }
            }
        });

        if (!membership) {
            return res.status(403).json({ error: 'Access denied' });
        }

        res.json(task);
    } catch (error) {
        console.error('Get task by ID error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const updateTask = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const id = req.params.id as string;
        const { title, description, status, assigneeId, supporterId, dueDate, priority, tagId } = req.body;
        const hasAssigneeUpdate = assigneeId !== undefined;
        const normalizedAssigneeId = assigneeId === '' ? null : assigneeId;
        const hasSupporterUpdate = supporterId !== undefined;
        const normalizedSupporterId = supporterId === '' ? null : supporterId;
        const hasTagUpdate = tagId !== undefined;

        const task = await prisma.task.findUnique({
            where: { id: id }
        });

        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        if (!ensureTaskIsActive(task)) {
            return res.status(400).json({ error: 'Task is in Recently Deleted' });
        }

        const membership = await prisma.organizationMember.findUnique({
            where: {
                userId_organizationId: {
                    userId,
                    organizationId: task.organizationId
                }
            }
        });

        if (!membership) {
            return res.status(403).json({ error: 'Access denied' });
        }

        if (hasTagUpdate) {
            if (!tagId) {
                return res.status(400).json({ error: 'Task tag is required' });
            }
            const tag = await prisma.tag.findUnique({ where: { id: tagId } });
            if (!tag || tag.organizationId !== task.organizationId) {
                return res.status(400).json({ error: 'Selected tag is invalid for this organization' });
            }
        }

        const nextAssigneeId = hasAssigneeUpdate ? normalizedAssigneeId : task.assigneeId;
        const nextSupporterId = hasSupporterUpdate ? normalizedSupporterId : task.supporterId;

        if (!nextAssigneeId) {
            return res.status(400).json({ error: 'Primary assignee is required' });
        }

        const { teamIds } = await resolveTaskTeamContext({
            organizationId: task.organizationId,
            assigneeId: nextAssigneeId,
            supporterId: nextSupporterId
        });

        const updatedTask = await prisma.$transaction(async (tx) => {
            const updated = await tx.task.update({
                where: { id: id },
                data: {
                    ...(title && { title }),
                    ...(description !== undefined && { description }),
                    ...(status && { status }),
                    ...(hasAssigneeUpdate && { assigneeId: normalizedAssigneeId }),
                    ...(hasSupporterUpdate && { supporterId: normalizedSupporterId }),
                    ...(hasTagUpdate && { tagId }),
                    ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
                    ...(priority && { priority })
                }
            });

            await tx.taskTeam.deleteMany({ where: { taskId: updated.id } });
            if (teamIds.length > 0) {
                await tx.taskTeam.createMany({
                    data: teamIds.map((teamId) => ({ taskId: updated.id, teamId }))
                });
            }

            return tx.task.findUnique({
                where: { id: updated.id },
                include: {
                    assignee: { select: { id: true, email: true, name: true } },
                    supporter: { select: { id: true, email: true, name: true } },
                    organization: { select: { id: true, name: true } },
                    tag: true,
                    taskTeams: { include: { team: { select: { id: true, name: true } } } }
                }
            });
        });

        if (hasAssigneeUpdate && normalizedAssigneeId && normalizedAssigneeId !== task.assigneeId) {
            await notifyTaskAssignment({
                assigneeId: normalizedAssigneeId,
                assignerId: userId,
                taskTitle: updatedTask?.title || task.title,
                organizationName: updatedTask?.organization?.name || '',
                dueDate: updatedTask?.dueDate,
                priority: updatedTask?.priority
            });
        }

        res.json(updatedTask);
    } catch (error) {
        console.error('Update task error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const deleteTask = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const id = req.params.id as string;

        const task = await prisma.task.findUnique({
            where: { id: id }
        });

        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const membership = await prisma.organizationMember.findUnique({
            where: {
                userId_organizationId: {
                    userId,
                    organizationId: task.organizationId
                }
            }
        });

        if (!membership || membership.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Only admins can delete tasks' });
        }

        if (task.deletedAt) {
            return res.status(400).json({ error: 'Task already deleted' });
        }

        await prisma.task.update({
            where: { id: id },
            data: {
                deletedAt: new Date(),
                deletedById: userId
            }
        });

        res.json({ message: 'Task moved to Recently Deleted' });
    } catch (error) {
        console.error('Delete task error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const restoreTask = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const id = req.params.id as string;

        const task = await prisma.task.findUnique({
            where: { id }
        });

        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const membership = await prisma.organizationMember.findUnique({
            where: {
                userId_organizationId: {
                    userId,
                    organizationId: task.organizationId
                }
            }
        });

        if (!membership || membership.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Only admins can restore tasks' });
        }

        if (!task.deletedAt) {
            return res.status(400).json({ error: 'Task is not deleted' });
        }

        const restoredTask = await prisma.task.update({
            where: { id },
            data: {
                deletedAt: null,
                deletedById: null
            },
            include: {
                assignee: {
                    select: {
                        id: true,
                        email: true,
                        name: true
                    }
                },
                organization: {
                    select: {
                        id: true,
                        name: true
                    }
                },
                comments: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                email: true,
                                name: true
                            }
                        }
                    },
                    orderBy: {
                        createdAt: 'desc'
                    }
                },
                attachments: true
                ,
                tag: true,
                taskTeams: {
                    include: {
                        team: {
                            select: {
                                id: true,
                                name: true
                            }
                        }
                    }
                }
            }
        });

        res.json(restoredTask);
    } catch (error) {
        console.error('Restore task error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const addComment = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const id = req.params.id as string;
        const { content } = req.body;

        if (!content) {
            return res.status(400).json({ error: 'Comment content is required' });
        }

        const task = await prisma.task.findUnique({
            where: { id: id }
        });

        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        if (!ensureTaskIsActive(task)) {
            return res.status(400).json({ error: 'Task is in Recently Deleted' });
        }

        const membership = await prisma.organizationMember.findUnique({
            where: {
                userId_organizationId: {
                    userId,
                    organizationId: task.organizationId
                }
            }
        });

        if (!membership) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const comment = await prisma.comment.create({
            data: {
                content,
                taskId: id,
                userId
            },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        name: true
                    }
                }
            }
        });

        res.status(201).json(comment);
    } catch (error) {
        console.error('Add comment error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getStats = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { organizationId } = req.query;

        let where: any = { deletedAt: null };
        let membership: { role: string; teamId: string | null } | null = null;

        if (organizationId) {
            membership = await prisma.organizationMember.findUnique({
                where: {
                    userId_organizationId: {
                        userId,
                        organizationId: organizationId as string
                    }
                }
            });

            if (!membership) {
                return res.status(403).json({ error: 'Access denied' });
            }

            where.organizationId = organizationId;

            if (['TEAM_LEAD', 'MEMBER'].includes(membership.role)) {
                where.OR = [
                    { assigneeId: userId },
                    { supporterId: userId },
                    ...(membership.teamId ? [{ taskTeams: { some: { teamId: membership.teamId } } }] : [])
                ];
            }
        } else {
            const memberships = await prisma.organizationMember.findMany({
                where: { userId }
            });
            where.organizationId = {
                in: memberships.map(m => m.organizationId)
            };
        }

        const [created, inProgress, completed, myTasks] = await Promise.all([
            prisma.task.count({ where: { ...where, status: 'CREATED' } }),
            prisma.task.count({ where: { ...where, status: 'IN_PROGRESS' } }),
            prisma.task.count({ where: { ...where, status: 'COMPLETED' } }),
            prisma.task.count({ where: { ...where, assigneeId: userId } })
        ]);

        res.json({
            created,
            inProgress,
            completed,
            myTasks,
            total: created + inProgress + completed
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const uploadAttachment = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const id = req.params.id as string;

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const task = await prisma.task.findUnique({
            where: { id: id }
        });

        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        if (!ensureTaskIsActive(task)) {
            return res.status(400).json({ error: 'Task is in Recently Deleted' });
        }

        const membership = await prisma.organizationMember.findUnique({
            where: {
                userId_organizationId: {
                    userId,
                    organizationId: task.organizationId
                }
            }
        });

        if (!membership) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const attachment = await prisma.attachment.create({
            data: {
                type: 'FILE',
                fileName: req.file.originalname,
                filePath: req.file.path,
                fileType: req.file.mimetype,
                taskId: id
            }
        });

        res.status(201).json(attachment);
    } catch (error) {
        console.error('Upload attachment error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const addLinkAttachment = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const id = req.params.id as string;
        const { url, fileName } = req.body as { url?: string; fileName?: string };

        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        const task = await prisma.task.findUnique({
            where: { id }
        });

        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        if (!ensureTaskIsActive(task)) {
            return res.status(400).json({ error: 'Task is in Recently Deleted' });
        }

        const membership = await prisma.organizationMember.findUnique({
            where: {
                userId_organizationId: {
                    userId,
                    organizationId: task.organizationId
                }
            }
        });

        if (!membership) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const attachment = await prisma.attachment.create({
            data: {
                type: 'LINK',
                fileName: fileName || null,
                url,
                taskId: id
            }
        });

        return res.status(201).json(attachment);
    } catch (error) {
        console.error('Add link attachment error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const getMemberStats = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { organizationId } = req.query;

        if (!organizationId) {
            return res.status(400).json({ error: 'Organization ID is required' });
        }

        const membership = await prisma.organizationMember.findUnique({
            where: {
                userId_organizationId: {
                    userId,
                    organizationId: organizationId as string
                }
            }
        });

        if (!membership || (membership.role !== 'ADMIN' && membership.role !== 'TEAM_LEAD')) {
            return res.status(403).json({ error: 'Only admins and team leads can access team statistics' });
        }

        if (membership.role === 'TEAM_LEAD' && !membership.teamId) {
            return res.json([]);
        }

        const members = await prisma.organizationMember.findMany({
            where: {
                organizationId: organizationId as string,
                ...(membership.role === 'TEAM_LEAD' ? { teamId: membership.teamId as string } : {})
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                }
            }
        });

        const memberStats = await Promise.all(members.map(async (m) => {
            const [created, inProgress, completed] = await Promise.all([
                prisma.task.count({ where: { organizationId: organizationId as string, assigneeId: m.userId, status: 'CREATED', deletedAt: null } }),
                prisma.task.count({ where: { organizationId: organizationId as string, assigneeId: m.userId, status: 'IN_PROGRESS', deletedAt: null } }),
                prisma.task.count({ where: { organizationId: organizationId as string, assigneeId: m.userId, status: 'COMPLETED', deletedAt: null } })
            ]);

            return {
                userId: m.userId,
                name: m.user.name || m.user.email,
                stats: {
                    created,
                    inProgress,
                    completed,
                    total: created + inProgress + completed
                }
            };
        }));

        res.json(memberStats);
    } catch (error) {
        console.error('Get member stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getTeamDistribution = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { organizationId } = req.query;

        if (!organizationId) {
            return res.status(400).json({ error: 'Organization ID is required' });
        }

        const membership = await prisma.organizationMember.findUnique({
            where: {
                userId_organizationId: {
                    userId,
                    organizationId: organizationId as string
                }
            }
        });

        if (!membership || (membership.role !== 'ADMIN' && membership.role !== 'TEAM_LEAD')) {
            return res.status(403).json({ error: 'Only admins and team leads can access team distribution' });
        }

        if (membership.role === 'TEAM_LEAD' && !membership.teamId) {
            return res.json([]);
        }

        const teams = await prisma.team.findMany({
            where: {
                organizationId: organizationId as string,
                ...(membership.role === 'TEAM_LEAD' ? { id: membership.teamId as string } : {})
            },
            include: {
                leadUser: {
                    select: { id: true, name: true, email: true }
                },
                members: {
                    include: {
                        user: {
                            select: { id: true, name: true, email: true }
                        }
                    }
                }
            },
            orderBy: { name: 'asc' }
        });

        const data = await Promise.all(teams.map(async (team) => {
            const [created, inProgress, completed] = await Promise.all([
                prisma.task.count({ where: { organizationId: organizationId as string, deletedAt: null, status: 'CREATED', taskTeams: { some: { teamId: team.id } } } }),
                prisma.task.count({ where: { organizationId: organizationId as string, deletedAt: null, status: 'IN_PROGRESS', taskTeams: { some: { teamId: team.id } } } }),
                prisma.task.count({ where: { organizationId: organizationId as string, deletedAt: null, status: 'COMPLETED', taskTeams: { some: { teamId: team.id } } } })
            ]);

            const people = await Promise.all(team.members.map(async (member) => {
                const [mCreated, mInProgress, mCompleted] = await Promise.all([
                    prisma.task.count({ where: { organizationId: organizationId as string, deletedAt: null, assigneeId: member.userId, status: 'CREATED' } }),
                    prisma.task.count({ where: { organizationId: organizationId as string, deletedAt: null, assigneeId: member.userId, status: 'IN_PROGRESS' } }),
                    prisma.task.count({ where: { organizationId: organizationId as string, deletedAt: null, assigneeId: member.userId, status: 'COMPLETED' } })
                ]);

                return {
                    userId: member.user.id,
                    name: member.user.name || member.user.email,
                    role: member.role,
                    stats: {
                        created: mCreated,
                        inProgress: mInProgress,
                        completed: mCompleted,
                        total: mCreated + mInProgress + mCompleted
                    }
                };
            }));

            return {
                teamId: team.id,
                teamName: team.name,
                leadUser: team.leadUser,
                stats: {
                    created,
                    inProgress,
                    completed,
                    total: created + inProgress + completed
                },
                people
            };
        }));

        return res.json(data);
    } catch (error) {
        console.error('Get team distribution error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const deleteComment = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const commentId = req.params.commentId as string;

        const comment = await prisma.comment.findUnique({
            where: { id: commentId },
            include: { task: true }
        });

        if (!comment) {
            return res.status(404).json({ error: 'Comment not found' });
        }

        if (!ensureTaskIsActive(comment.task)) {
            return res.status(400).json({ error: 'Task is in Recently Deleted' });
        }

        const membership = await prisma.organizationMember.findUnique({
            where: {
                userId_organizationId: {
                    userId,
                    organizationId: comment.task.organizationId
                }
            }
        });

        if (!membership) {
            return res.status(403).json({ error: 'Access denied' });
        }

        if (comment.userId !== userId && membership.role !== 'ADMIN') {
            return res.status(403).json({ error: 'You can only delete your own comments' });
        }

        await prisma.comment.delete({
            where: { id: commentId }
        });

        res.json({ message: 'Comment deleted successfully' });
    } catch (error) {
        console.error('Delete comment error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const deleteAttachment = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const attachmentId = req.params.attachmentId as string;

        const attachment = await prisma.attachment.findUnique({
            where: { id: attachmentId },
            include: { task: true }
        });

        if (!attachment) {
            return res.status(404).json({ error: 'Attachment not found' });
        }

        if (!ensureTaskIsActive(attachment.task)) {
            return res.status(400).json({ error: 'Task is in Recently Deleted' });
        }

        const membership = await prisma.organizationMember.findUnique({
            where: {
                userId_organizationId: {
                    userId,
                    organizationId: attachment.task.organizationId
                }
            }
        });

        if (!membership || membership.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Only admins can delete attachments' });
        }

        await prisma.attachment.delete({
            where: { id: attachmentId }
        });

        res.json({ message: 'Attachment deleted successfully' });
    } catch (error) {
        console.error('Delete attachment error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
