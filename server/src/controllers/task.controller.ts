import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { sendTaskAssignmentEmail, sendTaskAlertEmail } from '../services/email.service';
import { normalizeOrgName } from '../utils/org.utils';

const prisma = new PrismaClient();

type TaskView = 'active' | 'deleted';

const resolveTaskView = (view: unknown): TaskView => {
    return view === 'deleted' ? 'deleted' : 'active';
};

const notifyTaskAssignment = async (params: {
    assigneeId: string;
    assignerId: string;
    taskTitle: string;
    organizationId: string;
    organizationName: string;
    dueDate?: Date | null;
    priority?: string | null;
}) => {
    const { assigneeId, assignerId, taskTitle, organizationId, organizationName, dueDate, priority } = params;

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

        // Create in-app notification
        if (assignee) {
            await prisma.notification.create({
                data: {
                    organizationId,
                    senderId: assignerId,
                    targetType: 'INDIVIDUAL',
                    targetId: assigneeId,
                    type: 'PRIORITY_ALERT',
                    message: `New task assigned to you: ${taskTitle}`
                }
            });
        }

        // Send email notification
        if (assignee?.email) {
            await sendTaskAssignmentEmail({
                to: assignee.email,
                assigneeName: assignee.name,
                taskTitle,
                organizationName,
                assignerName: assigner?.name || assigner?.email,
                dueDate,
                priority
            });
        }
    } catch (error) {
        console.error('Task assignment notification failed:', error);
    }
};

const notifyTaskPendingApproval = async (params: {
    taskId: string;
    taskTitle: string;
    organizationId: string;
    actorUserId: string;
}) => {
    const { taskTitle, organizationId, actorUserId } = params;

    try {
        const actorMembership = await prisma.organizationMember.findUnique({
            where: {
                userId_organizationId: {
                    userId: actorUserId,
                    organizationId
                }
            },
            select: { teamId: true }
        });

        const reviewers = await prisma.organizationMember.findMany({
            where: {
                organizationId,
                OR: [
                    { role: 'ADMIN' },
                    ...(actorMembership?.teamId
                        ? [{ role: 'TEAM_LEAD', teamId: actorMembership.teamId }]
                        : [{ role: 'TEAM_LEAD' }])
                ]
            },
            select: { userId: true }
        });

        const targetIds = Array.from(new Set(reviewers.map((reviewer) => reviewer.userId)))
            .filter((targetId) => targetId !== actorUserId);

        if (targetIds.length === 0) {
            return;
        }

        await prisma.notification.createMany({
            data: targetIds.map((targetId) => ({
                organizationId,
                senderId: actorUserId,
                targetType: 'INDIVIDUAL',
                targetId,
                type: 'PRIORITY_ALERT',
                message: `Task pending approval: ${taskTitle}`
            }))
        });
    } catch (error) {
        console.error('Task approval notification failed:', error);
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

    const teamIds: string[] = [];
    if (assigneeMembership.teamId) {
        teamIds.push(assigneeMembership.teamId);
    }
    if (supporterMembership?.teamId) {
        teamIds.push(supporterMembership.teamId);
    }

    return {
        assigneeMembership,
        supporterMembership,
        teamIds: Array.from(new Set(teamIds))
    };
};

const ensureMembershipOrAssignment = async (userId: string, organizationId: string, task?: { assigneeId?: string | null; supporterId?: string | null }) => {
    const membership = await prisma.organizationMember.findUnique({
        where: {
            userId_organizationId: {
                userId,
                organizationId
            }
        }
    });

    if (!membership) {
        // Allow access if the user is explicitly the assignee or supporter on the task
        if (task && (userId === task.assigneeId || userId === task.supporterId)) {
            return { role: 'MEMBER', teamId: null } as any;
        }
        return null;
    }

    return membership;
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
        const { organizationId, status, assigneeId, view, clientId } = req.query;
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
        if (clientId) {
            where.project = {
                clientId: clientId as string
            };
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
                attachments: true,
                krImpacts: {
                    include: {
                        okrKeyResult: {
                            select: {
                                id: true,
                                title: true,
                                metricName: true,
                                metricUnit: true,
                                targetValue: true,
                                weight: true,
                                okr: {
                                    select: {
                                        id: true,
                                        title: true
                                    }
                                }
                            }
                        }
                    }
                },
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
        const { title, description, organizationId, assigneeId, supporterId, dueDate, priority, alertTeamLead, keyResultId } = req.body;
        const normalizedAssigneeId = assigneeId === '' ? null : assigneeId;
        const normalizedSupporterId = supporterId === '' ? null : supporterId;

        if (!title || !organizationId || !normalizedAssigneeId) {
            return res.status(400).json({ error: 'Title, organization and assignee are required' });
        }

        const membership = await prisma.organizationMember.findUnique({
            where: {
                userId_organizationId: {
                    userId,
                    organizationId
                }
            },
            include: {
                user: { select: { name: true } }
            }
        });

        if (!membership) {
            return res.status(403).json({ error: 'Access denied' });
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
                    createdByUserId: userId,
                    assigneeId: normalizedAssigneeId,
                    supporterId: normalizedSupporterId,
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

            if (keyResultId) {
                const keyResult = await tx.okrKeyResult.findUnique({
                    where: { id: keyResultId }
                });
                if (keyResult && keyResult.okrId) {
                    await tx.taskKrImpact.create({
                        data: {
                            taskId: created.id,
                            okrKeyResultId: keyResultId,
                            actualValue: 0
                        }
                    });
                }
            }

            return tx.task.findUnique({
                where: { id: created.id },
                include: {
                    assignee: { select: { id: true, email: true, name: true } },
                    supporter: { select: { id: true, email: true, name: true } },
                    organization: { select: { id: true, name: true } },
                    krImpacts: {
                        include: {
                            okrKeyResult: {
                                select: {
                                    id: true,
                                    title: true,
                                    metricName: true,
                                    metricUnit: true,
                                    targetValue: true,
                                    weight: true,
                                    okr: { select: { id: true, title: true } }
                                }
                            }
                        }
                    },
                    taskTeams: { include: { team: { select: { id: true, name: true } } } }
                }
            });
        });

        await notifyTaskAssignment({
            assigneeId: task?.assignee?.id || '',
            assignerId: userId,
            taskTitle: task?.title || title,
            organizationId: organizationId,
            organizationName: task?.organization?.name || '',
            dueDate: task?.dueDate,
            priority: task?.priority
        });

        // emit socket event for real-time updates
        try {
            const io = (global as any).io;
            if (io && organizationId) {
                io.to(`org:${organizationId}`).emit('task:created', task);
            }
        } catch (e) {
            console.error('Emit task created failed', e);
        }

        // Send alert to team leads if requested
        if (alertTeamLead && membership.role !== 'TEAM_LEAD' && membership.role !== 'ADMIN') {
            const teamLeads = await prisma.organizationMember.findMany({
                where: { organizationId, role: 'TEAM_LEAD' },
                include: { user: { select: { email: true, name: true } } }
            });

            for (const lead of teamLeads) {
                try {
                    await sendTaskAlertEmail({
                        to: lead.user.email,
                        taskTitle: title,
                        taskDescription: description,
                        creatorName: membership.user?.name || 'A team member',
                        organizationName: task?.organization?.name || ''
                    });
                } catch (alertErr) {
                    console.error('Failed to send task alert:', alertErr);
                }
            }
        }

        res.status(201).json(task);
    } catch (error: any) {
        console.error('Create task error:', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        res.status(message === 'Internal server error' ? 500 : 400).json({ error: message });
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
                krImpacts: {
                    include: {
                        okrKeyResult: {
                            select: {
                                id: true,
                                title: true,
                                metricName: true,
                                metricUnit: true,
                                targetValue: true,
                                weight: true,
                                okr: {
                                    select: {
                                        id: true,
                                        title: true
                                    }
                                }
                            }
                        }
                    }
                },
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

        let membership = await ensureMembershipOrAssignment(userId, task.organizationId, task as any);
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
        const { title, description, status, assigneeId, supporterId, dueDate, priority, approvalAction, approvalNotes } = req.body;
        const hasAssigneeUpdate = assigneeId !== undefined;
        const normalizedAssigneeId = assigneeId === '' ? null : assigneeId;
        const hasSupporterUpdate = supporterId !== undefined;
        const normalizedSupporterId = supporterId === '' ? null : supporterId;

        const task = await prisma.task.findUnique({
            where: { id: id }
        });

        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        if (!ensureTaskIsActive(task)) {
            return res.status(400).json({ error: 'Task is in Recently Deleted' });
        }

        let membership = await ensureMembershipOrAssignment(userId, task.organizationId, task as any);
        if (!membership) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const isReviewer = ['ADMIN', 'TEAM_LEAD'].includes(membership.role);
        const nextApprovalPatch: any = {};
        if (approvalAction) {
            if (!isReviewer) {
                return res.status(403).json({ error: 'Only admins or team leads can review completed tasks' });
            }
            if (!['APPROVE', 'REJECT'].includes(approvalAction)) {
                return res.status(400).json({ error: 'Invalid approval action' });
            }
            if (task.status !== 'COMPLETED' || task.approvalStatus !== 'PENDING') {
                return res.status(400).json({ error: 'Only completed tasks pending approval can be reviewed' });
            }
        }

        if (status) {
            if (status === 'COMPLETED') {
                nextApprovalPatch.approvalStatus = isReviewer ? 'APPROVED' : 'PENDING';
                nextApprovalPatch.approvedById = isReviewer ? userId : null;
                nextApprovalPatch.approvedAt = isReviewer ? new Date() : null;
                nextApprovalPatch.approvalNotes = null;
            } else {
                nextApprovalPatch.approvalStatus = 'NOT_SUBMITTED';
                nextApprovalPatch.approvedById = null;
                nextApprovalPatch.approvedAt = null;
                nextApprovalPatch.approvalNotes = null;
            }
        }

        if (approvalAction === 'APPROVE') {
            nextApprovalPatch.approvalStatus = 'APPROVED';
            nextApprovalPatch.approvedById = userId;
            nextApprovalPatch.approvedAt = new Date();
            nextApprovalPatch.approvalNotes = approvalNotes || null;
        } else if (approvalAction === 'REJECT') {
            nextApprovalPatch.approvalStatus = 'REJECTED';
            nextApprovalPatch.approvedById = userId;
            nextApprovalPatch.approvedAt = new Date();
            nextApprovalPatch.approvalNotes = approvalNotes || null;
        }


        const nextAssigneeId = hasAssigneeUpdate ? normalizedAssigneeId : task.assigneeId;
        const nextSupporterId = hasSupporterUpdate ? normalizedSupporterId : task.supporterId;
        const shouldRecalculateTeams = hasAssigneeUpdate || hasSupporterUpdate;
        let teamIds: string[] | null = null;

        if (shouldRecalculateTeams) {
            if (!nextAssigneeId) {
                return res.status(400).json({ error: 'Primary assignee is required' });
            }

            const resolved = await resolveTaskTeamContext({
                organizationId: task.organizationId,
                assigneeId: nextAssigneeId,
                supporterId: nextSupporterId
            });
            teamIds = resolved.teamIds;
        }

        const updatedTask = await prisma.$transaction(async (tx) => {
            const updated = await tx.task.update({
                where: { id: id },
                data: {
                    ...(title && { title }),
                    ...(description !== undefined && { description }),
                    ...(status && { status }),
                    ...((status || approvalAction) && nextApprovalPatch),
                    ...(hasAssigneeUpdate && { assigneeId: normalizedAssigneeId }),
                    ...(hasSupporterUpdate && { supporterId: normalizedSupporterId }),
                    ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
                    ...(priority && { priority })
                }
            });

            // Log activity for changes
            const activityEntries: Array<{ action: string; description: string; metadata?: any }> = [];

            if (status && status !== task.status) {
                activityEntries.push({
                    action: 'STATUS_CHANGED',
                    description: `Status changed from ${task.status} to ${status}`,
                    metadata: { oldStatus: task.status, newStatus: status }
                });
            }

            if (approvalAction) {
                activityEntries.push({
                    action: 'TASK_UPDATED',
                    description: `Completion ${approvalAction === 'APPROVE' ? 'approved' : 'rejected'}`,
                    metadata: {
                        field: 'approvalStatus',
                        oldApprovalStatus: task.approvalStatus,
                        newApprovalStatus: nextApprovalPatch.approvalStatus,
                        approvalNotes: approvalNotes || null
                    }
                });
            }

            if (hasAssigneeUpdate && normalizedAssigneeId !== task.assigneeId) {
                activityEntries.push({
                    action: 'ASSIGNEE_CHANGED',
                    description: `Assignee changed`,
                    metadata: { oldAssigneeId: task.assigneeId, newAssigneeId: normalizedAssigneeId }
                });
            }

            if (hasSupporterUpdate && normalizedSupporterId !== task.supporterId) {
                activityEntries.push({
                    action: 'SUPPORTER_CHANGED',
                    description: `Supporter changed`,
                    metadata: { oldSupporterId: task.supporterId, newSupporterId: normalizedSupporterId }
                });
            }

            if (priority && priority !== task.priority) {
                activityEntries.push({
                    action: 'TASK_UPDATED',
                    description: `Priority changed from ${task.priority} to ${priority}`,
                    metadata: { oldPriority: task.priority, newPriority: priority }
                });
            }

            if (dueDate !== undefined) {
                const oldDue = task.dueDate ? new Date(task.dueDate).toISOString() : null;
                const newDue = dueDate ? new Date(dueDate).toISOString() : null;
                if (oldDue !== newDue) {
                    activityEntries.push({
                        action: 'TASK_UPDATED',
                        description: `Due date changed`,
                        metadata: { oldDueDate: oldDue, newDueDate: newDue }
                    });
                }
            }

            if (description !== undefined && description !== task.description) {
                activityEntries.push({
                    action: 'TASK_UPDATED',
                    description: 'Description updated',
                    metadata: { field: 'description' }
                });
            }

            if (title && title !== task.title) {
                activityEntries.push({
                    action: 'TASK_UPDATED',
                    description: 'Title updated',
                    metadata: { field: 'title' }
                });
            }

            // Create activity logs
            for (const entry of activityEntries) {
                await tx.activityLog.create({
                    data: {
                        taskId: id,
                        userId,
                        action: entry.action,
                        description: entry.description,
                        metadata: entry.metadata
                    }
                });
            }

            if (shouldRecalculateTeams) {
                await tx.taskTeam.deleteMany({ where: { taskId: updated.id } });
                if (teamIds && teamIds.length > 0) {
                    await tx.taskTeam.createMany({
                        data: teamIds.map((teamId) => ({ taskId: updated.id, teamId }))
                    });
                }
            }

            return tx.task.findUnique({
                where: { id: updated.id },
                include: {
                    assignee: { select: { id: true, email: true, name: true } },
                    supporter: { select: { id: true, email: true, name: true } },
                    organization: { select: { id: true, name: true } },
                    krImpacts: {
                        include: {
                            okrKeyResult: {
                                select: {
                                    id: true,
                                    title: true,
                                    metricName: true,
                                    metricUnit: true,
                                    targetValue: true,
                                    weight: true,
                                    okr: { select: { id: true, title: true } }
                                }
                            }
                        }
                    },
                    taskTeams: { include: { team: { select: { id: true, name: true } } } }
                }
            });
        });

        if (hasAssigneeUpdate && normalizedAssigneeId && normalizedAssigneeId !== task.assigneeId) {
            await notifyTaskAssignment({
                assigneeId: normalizedAssigneeId,
                assignerId: userId,
                taskTitle: updatedTask?.title || task.title,
                organizationId: task.organizationId,
                organizationName: updatedTask?.organization?.name || '',
                dueDate: updatedTask?.dueDate,
                priority: updatedTask?.priority
            });
        }

        if (
            status === 'COMPLETED' &&
            !isReviewer &&
            updatedTask?.approvalStatus === 'PENDING'
        ) {
            void notifyTaskPendingApproval({
                taskId: updatedTask.id,
                taskTitle: updatedTask.title,
                organizationId: task.organizationId,
                actorUserId: userId
            });
        }

        // emit socket event for real-time updates
        try {
            const io = (global as any).io;
            if (io && task.organizationId) {
                io.to(`org:${task.organizationId}`).emit('task:updated', updatedTask);
            }
        } catch (e) {
            console.error('Emit task updated failed', e);
        }

        res.json(updatedTask);
    } catch (error: any) {
        console.error('Update task error:', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        res.status(message === 'Internal server error' ? 500 : 400).json({ error: message });
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

        if (!membership) {
            return res.status(403).json({ error: 'Access denied' });
        }

        if (membership.role !== 'ADMIN' && task.createdByUserId !== userId) {
            return res.status(403).json({ error: 'Only admins or the task creator can delete this task' });
        }

        if (task.deletedAt) {
            return res.status(400).json({ error: 'Task already deleted' });
        }

        const updated = await prisma.task.update({
            where: { id: id },
            data: {
                deletedAt: new Date(),
                deletedById: userId
            }
        });
        // emit socket event for deletion
        try {
            const io = (global as any).io;
            if (io && updated.organizationId) {
                io.to(`org:${updated.organizationId}`).emit('task:deleted', { id: updated.id });
            }
        } catch (e) {
            console.error('Emit task deleted failed', e);
        }

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
                attachments: true,
                krImpacts: {
                    include: {
                        okrKeyResult: {
                            select: {
                                id: true,
                                title: true,
                                metricName: true,
                                metricUnit: true,
                                targetValue: true,
                                weight: true,
                                okr: { select: { id: true, title: true } }
                            }
                        }
                    }
                },
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
            where: { id: id },
            include: { organization: true }
        });

        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        if (!ensureTaskIsActive(task)) {
            return res.status(400).json({ error: 'Task is in Recently Deleted' });
        }

        let membership = await ensureMembershipOrAssignment(userId, task.organizationId, task as any);
        if (!membership) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Extract @mentions from content
        const mentionRegex = /@\[([^\]]+)\]\(user:([a-f0-9-]+)\)/g;
        const mentionedUserIds = new Set<string>();
        let match;
        while ((match = mentionRegex.exec(content)) !== null) {
            mentionedUserIds.add(match[2]);
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

        // Log activity
        await prisma.activityLog.create({
            data: {
                taskId: id,
                userId,
                action: 'COMMENT_ADDED',
                description: 'Added a comment',
                metadata: { commentId: comment.id }
            }
        });

        // Send notifications to mentioned users
        if (mentionedUserIds.size > 0) {
            const mentionedUsers = await prisma.user.findMany({
                where: { id: { in: Array.from(mentionedUserIds) } },
                select: { email: true, name: true }
            });

            const currentUser = await prisma.user.findUnique({
                where: { id: userId },
                select: { name: true }
            });

            for (const mentionedUser of mentionedUsers) {
                if (mentionedUser.email) {
                    await sendTaskAssignmentEmail({
                        to: mentionedUser.email,
                        assigneeName: mentionedUser.name,
                        taskTitle: task.title,
                        organizationName: task.organization.name,
                        assignerName: currentUser?.name || 'Someone',
                        dueDate: task.dueDate,
                        priority: task.priority
                    }).catch(() => { }); // Silent fail for notifications
                }
            }
        }

        res.status(201).json(comment);
    } catch (error) {
        console.error('Add comment error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getStats = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { organizationId, clientId } = req.query;

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

        if (clientId) {
            where.project = {
                clientId: clientId as string
            };
        }

        const now = new Date();
        const [pending, ongoing, completed, overdue, myTasks] = await Promise.all([
            prisma.task.count({ where: { ...where, status: 'CREATED' } }),
            prisma.task.count({ where: { ...where, status: 'IN_PROGRESS' } }),
            prisma.task.count({ where: { ...where, status: 'COMPLETED' } }),
            prisma.task.count({
                where: {
                    ...where,
                    status: { not: 'COMPLETED' },
                    dueDate: { lt: now }
                }
            }),
            prisma.task.count({ where: { ...where, assigneeId: userId } })
        ]);

        res.json({
            pending,
            ongoing,
            completed,
            overdue,
            myTasks,
            total: pending + ongoing + completed
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
            where: { id: id },
            include: { organization: true }
        });

        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        if (!ensureTaskIsActive(task)) {
            return res.status(400).json({ error: 'Task is in Recently Deleted' });
        }

        let membership = await ensureMembershipOrAssignment(userId, task.organizationId, task as any);
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

        // Log activity
        await prisma.activityLog.create({
            data: {
                taskId: id,
                userId,
                action: 'ATTACHMENT_ADDED',
                description: `Added attachment: ${req.file.originalname}`,
                metadata: { attachmentId: attachment.id, fileName: req.file.originalname }
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
            where: { id },
            include: { organization: true }
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

        // Log activity
        await prisma.activityLog.create({
            data: {
                taskId: id,
                userId,
                action: 'ATTACHMENT_ADDED',
                description: `Added link: ${fileName || url}`,
                metadata: { attachmentId: attachment.id, url }
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
            const now = new Date();
            const [pending, ongoing, completed, overdue, okrLinkedTasks] = await Promise.all([
                prisma.task.count({ where: { organizationId: organizationId as string, assigneeId: m.userId, status: 'CREATED', deletedAt: null } }),
                prisma.task.count({ where: { organizationId: organizationId as string, assigneeId: m.userId, status: 'IN_PROGRESS', deletedAt: null } }),
                prisma.task.count({ where: { organizationId: organizationId as string, assigneeId: m.userId, status: 'COMPLETED', deletedAt: null } }),
                prisma.task.count({
                    where: {
                        organizationId: organizationId as string,
                        assigneeId: m.userId,
                        deletedAt: null,
                        status: { not: 'COMPLETED' },
                        dueDate: { lt: now }
                    }
                }),
                prisma.taskKrImpact.count({
                    where: {
                        task: {
                            organizationId: organizationId as string,
                            assigneeId: m.userId,
                            deletedAt: null
                        }
                    }
                })
            ]);

            const total = pending + ongoing + completed;
            let performanceScore = 0;
            let temperature = '🔴 Low Activity';

            if (total > 0) {
                const completionRate = (completed / total) * 50; // 50 points max
                const deadlineRate = ((total - overdue) / total) * 30; // 30 points max
                const okrContribution = (okrLinkedTasks / total) * 20; // 20 points max
                performanceScore = Math.round(completionRate + deadlineRate + okrContribution);

                if (performanceScore > 75) temperature = '🔥 High Performance';
                else if (performanceScore > 35) temperature = '🟡 Moderate Performance';
            }

            return {
                userId: m.userId,
                name: m.user.name || m.user.email,
                stats: {
                    pending,
                    ongoing,
                    completed,
                    overdue,
                    total,
                    performanceScore,
                    temperature
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

        let membership = await ensureMembershipOrAssignment(userId, comment.task.organizationId, comment.task as any);

        if (!membership) {
            return res.status(403).json({ error: 'Access denied' });
        }

        if (comment.userId !== userId && membership.role !== 'ADMIN') {
            return res.status(403).json({ error: 'You can only delete your own comments' });
        }

        await prisma.comment.delete({
            where: { id: commentId }
        });

        // Log activity
        await prisma.activityLog.create({
            data: {
                taskId: comment.taskId,
                userId,
                action: 'COMMENT_DELETED',
                description: 'Deleted a comment',
                metadata: { commentId }
            }
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

        let membership = await ensureMembershipOrAssignment(userId, attachment.task.organizationId, attachment.task as any);

        if (!membership || membership.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Only admins can delete attachments' });
        }

        await prisma.attachment.delete({
            where: { id: attachmentId }
        });

        // Log activity
        await prisma.activityLog.create({
            data: {
                taskId: attachment.taskId,
                userId,
                action: 'ATTACHMENT_DELETED',
                description: `Deleted attachment: ${attachment.fileName || 'file'}`,
                metadata: { attachmentId }
            }
        });

        res.json({ message: 'Attachment deleted successfully' });
    } catch (error) {
        console.error('Delete attachment error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const submitWork = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const taskId = req.params.id as string;
        const { description } = req.body;

        const task = await prisma.task.findUnique({
            where: { id: taskId },
            include: { organization: true }
        });

        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        if (!ensureTaskIsActive(task)) {
            return res.status(400).json({ error: 'Task is in Recently Deleted' });
        }

        // Only assignee or supporter can submit work
        if (task.assigneeId !== userId && task.supporterId !== userId) {
            return res.status(403).json({ error: 'Only assignee or supporter can submit work' });
        }

        const now = new Date();
        const submission = await prisma.$transaction(async (tx) => {
            const created = await tx.workSubmission.create({
                data: {
                    taskId,
                    userId,
                    description: description || null
                }
            });

            await tx.task.update({
                where: { id: taskId },
                data: {
                    status: 'COMPLETED',
                    approvalStatus: 'PENDING',
                    approvedById: null,
                    approvedAt: null,
                    approvalNotes: null
                }
            });

            await tx.activityLog.create({
                data: {
                    taskId,
                    userId,
                    action: 'SUBMISSION_CREATED',
                    description: `${task.assigneeId === userId ? 'Assignee' : 'Supporter'} submitted work`,
                    metadata: { submissionId: created.id }
                }
            });

            return created;
        });

        res.json({ message: 'Work submitted successfully', submission });
    } catch (error) {
        console.error('Submit work error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getSubmissions = async (req: Request, res: Response) => {
    try {
        const taskId = req.params.id as string;
        const userId = (req as any).user.userId;

        const task = await prisma.task.findUnique({
            where: { id: taskId },
            include: { organization: true }
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

        const submissions = await prisma.workSubmission.findMany({
            where: { taskId },
            include: {
                user: {
                    select: { id: true, name: true, email: true }
                }
            },
            orderBy: { submittedAt: 'desc' }
        });

        res.json(submissions);
    } catch (error) {
        console.error('Get submissions error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const reviewSubmission = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const taskId = req.params.id as string;
        const submissionId = req.params.submissionId as string;
        const { status, reviewNotes } = req.body;

        const task = await prisma.task.findUnique({
            where: { id: taskId },
            include: { organization: true }
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

        if (!membership || !['ADMIN', 'TEAM_LEAD'].includes(membership.role)) {
            return res.status(403).json({ error: 'Only reviewers can review submissions' });
        }

        if (!['PENDING', 'REVIEWED', 'APPROVED', 'REJECTED'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const reviewedAt = new Date();
        const submission = await prisma.$transaction(async (tx) => {
            const updated = await tx.workSubmission.update({
                where: { id: submissionId },
                data: {
                    status,
                    reviewNotes: reviewNotes || null,
                    reviewedAt,
                    reviewedBy: userId
                },
                include: {
                    user: {
                        select: { id: true, name: true, email: true }
                    }
                }
            });

            if (status === 'APPROVED') {
                await tx.task.update({
                    where: { id: taskId },
                    data: {
                        status: 'COMPLETED',
                        approvalStatus: 'APPROVED',
                        approvedById: userId,
                        approvedAt: reviewedAt,
                        approvalNotes: reviewNotes || null
                    }
                });
            } else if (status === 'REJECTED') {
                await tx.task.update({
                    where: { id: taskId },
                    data: {
                        status: 'IN_PROGRESS',
                        approvalStatus: 'REJECTED',
                        approvedById: userId,
                        approvedAt: reviewedAt,
                        approvalNotes: reviewNotes || null
                    }
                });
            } else if (status === 'PENDING') {
                await tx.task.update({
                    where: { id: taskId },
                    data: {
                        status: 'COMPLETED',
                        approvalStatus: 'PENDING',
                        approvedById: null,
                        approvedAt: null,
                        approvalNotes: null
                    }
                });
            }

            await tx.activityLog.create({
                data: {
                    taskId,
                    userId,
                    action: 'SUBMISSION_REVIEWED',
                    description: `Submission ${status.toLowerCase()}`,
                    metadata: { submissionId, status }
                }
            });

            return updated;
        });

        res.json({ message: 'Submission reviewed successfully', submission });
    } catch (error) {
        console.error('Review submission error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getTaskKrImpacts = async (req: Request, res: Response) => {
    try {
        const taskId = req.params.id as string;
        const userId = (req as any).user.userId as string;

        const task = await prisma.task.findUnique({
            where: { id: taskId }
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

        const impacts = await prisma.taskKrImpact.findMany({
            where: { taskId },
            include: {
                okrKeyResult: {
                    select: {
                        id: true,
                        title: true,
                        metricName: true,
                        metricUnit: true,
                        targetValue: true,
                        weight: true,
                        okr: {
                            select: {
                                id: true,
                                title: true
                            }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        return res.json(impacts);
    } catch (error) {
        console.error('Get task KR impacts error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const upsertTaskKrImpacts = async (req: Request, res: Response) => {
    try {
        const taskId = req.params.id as string;
        const userId = (req as any).user.userId as string;
        const { impacts } = req.body as {
            impacts?: Array<{
                okrKeyResultId?: string;
                plannedValue?: number | string | null;
                actualValue?: number | string;
                notes?: string | null;
            }>;
        };

        if (!Array.isArray(impacts)) {
            return res.status(400).json({ error: 'impacts array is required' });
        }

        const task = await prisma.task.findUnique({
            where: { id: taskId }
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

        const canEdit =
            membership.role === 'ADMIN' ||
            membership.role === 'TEAM_LEAD' ||
            task.createdByUserId === userId ||
            task.assigneeId === userId ||
            task.supporterId === userId;
        if (!canEdit) {
            return res.status(403).json({ error: 'Only admins, team leads, the task creator, assignee, or supporter can edit KR impacts' });
        }

        const sanitized = impacts
            .map((impact) => {
                const actualValue = typeof impact.actualValue === 'number'
                    ? impact.actualValue
                    : typeof impact.actualValue === 'string' && impact.actualValue.trim() !== ''
                        ? Number(impact.actualValue)
                        : null;
                const plannedValue = typeof impact.plannedValue === 'number'
                    ? impact.plannedValue
                    : typeof impact.plannedValue === 'string' && impact.plannedValue.trim() !== ''
                        ? Number(impact.plannedValue)
                        : null;
                return {
                    okrKeyResultId: impact.okrKeyResultId || '',
                    actualValue,
                    plannedValue,
                    notes: impact.notes?.trim() || null
                };
            })
            .filter((impact) => impact.okrKeyResultId);

        const invalidImpact = sanitized.find((impact) => impact.actualValue === null || Number.isNaN(impact.actualValue));
        if (invalidImpact) {
            return res.status(400).json({ error: 'Each impact entry must have a valid actualValue' });
        }

        const krIds = Array.from(new Set(sanitized.map((impact) => impact.okrKeyResultId)));
        const keyResults = krIds.length > 0
            ? await prisma.okrKeyResult.findMany({
                where: { id: { in: krIds } },
                include: { okr: { select: { organizationId: true } } }
            })
            : [];
        if (keyResults.length !== krIds.length || keyResults.some((kr) => kr.okr.organizationId !== task.organizationId)) {
            return res.status(400).json({ error: 'One or more key results are invalid for this task organization' });
        }

        const result = await prisma.$transaction(async (tx) => {
            await tx.taskKrImpact.deleteMany({ where: { taskId } });

            if (sanitized.length > 0) {
                for (const impact of sanitized) {
                    await tx.taskKrImpact.create({
                        data: {
                            taskId,
                            okrKeyResultId: impact.okrKeyResultId,
                            plannedValue: impact.plannedValue,
                            actualValue: impact.actualValue as number,
                            notes: impact.notes
                        }
                    });
                }
            }

            return tx.taskKrImpact.findMany({
                where: { taskId },
                include: {
                    okrKeyResult: {
                        select: {
                            id: true,
                            title: true,
                            metricName: true,
                            metricUnit: true,
                            targetValue: true,
                            weight: true,
                            okr: {
                                select: {
                                    id: true,
                                    title: true
                                }
                            }
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            });
        });

        // Notify members if any KR impact's metricName references a member (match by normalized name or email)
        try {
            const taskWithOrg = await prisma.task.findUnique({ where: { id: taskId }, include: { organization: true, assignee: { select: { id: true, email: true, name: true } } } });
            if (taskWithOrg) {
                const members = await prisma.organizationMember.findMany({ where: { organizationId: taskWithOrg.organizationId }, include: { user: { select: { id: true, name: true, email: true } } } });
                const memberNameMap = new Map<string, any>();
                members.forEach((m) => {
                    const nameKey = normalizeOrgName(m.user.name || '');
                    const emailKey = normalizeOrgName(m.user.email || '');
                    if (nameKey) memberNameMap.set(nameKey, m);
                    if (emailKey) memberNameMap.set(emailKey, m);
                });

                for (const impact of result) {
                    const metric = impact.okrKeyResult?.metricName || impact.okrKeyResult?.title || '';
                    if (!metric) continue;
                    const normalizedMetric = normalizeOrgName(metric);
                    const matched = memberNameMap.get(normalizedMetric);
                    if (matched) {
                        try {
                            // create in-app notification
                            await prisma.notification.create({
                                data: {
                                    organizationId: taskWithOrg.organizationId,
                                    senderId: userId,
                                    targetType: 'INDIVIDUAL',
                                    targetId: matched.user.id,
                                    type: 'PRIORITY_ALERT',
                                    message: `You've been mentioned in task "${taskWithOrg.title}" via metric: ${metric}`
                                }
                            });

                            // send email (silent fail)
                            if (matched.user.email) {
                                const assigner = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
                                await sendTaskAssignmentEmail({
                                    to: matched.user.email,
                                    assigneeName: matched.user.name,
                                    taskTitle: taskWithOrg.title,
                                    organizationName: taskWithOrg.organization?.name || '',
                                    assignerName: assigner?.name || assigner?.email || 'Someone',
                                    dueDate: taskWithOrg.dueDate || undefined,
                                    priority: taskWithOrg.priority || undefined
                                }).catch(() => { });
                            }
                        } catch (notifyErr) {
                            console.error('Failed to notify member for KR impact metric match:', notifyErr);
                        }
                    }
                }
            }
        } catch (err) {
            console.error('KR impact notify pass failed:', err);
        }

        return res.json(result);
    } catch (error) {
        console.error('Upsert task KR impacts error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const getActivityTimeline = async (req: Request, res: Response) => {
    try {
        const taskId = req.params.id as string;
        const userId = (req as any).user.userId;

        const task = await prisma.task.findUnique({
            where: { id: taskId },
            include: { organization: true }
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

        const activities = await prisma.activityLog.findMany({
            where: { taskId },
            include: {
                user: {
                    select: { id: true, name: true, email: true }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: 50
        });

        res.json(activities);
    } catch (error) {
        console.error('Get activity timeline error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
