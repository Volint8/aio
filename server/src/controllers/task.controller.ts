import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { sendTaskAssignmentEmail } from '../services/email.service';

const prisma = new PrismaClient();

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

export const getTasks = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { organizationId, status, assigneeId } = req.query;

        const where: any = {};

        if (organizationId) {
            // Verify user is member of organization
            const membership = await prisma.organizationMember.findUnique({
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
        } else {
            // Get all tasks from user's organizations
            const memberships = await prisma.organizationMember.findMany({
                where: { userId }
            });
            where.organizationId = {
                in: memberships.map(m => m.organizationId)
            };
        }

        if (status) {
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
            },
            orderBy: {
                createdAt: 'desc'
            }
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
        const { title, description, organizationId, assigneeId, dueDate, priority } = req.body;
        const normalizedAssigneeId = assigneeId === '' ? null : assigneeId;

        if (!title || !organizationId) {
            return res.status(400).json({ error: 'Title and organization are required' });
        }

        // Verify user is member of organization
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

        // If assigneeId is provided, verify they're a member
        if (normalizedAssigneeId) {
            const assigneeMembership = await prisma.organizationMember.findUnique({
                where: {
                    userId_organizationId: {
                        userId: normalizedAssigneeId,
                        organizationId
                    }
                }
            });

            if (!assigneeMembership) {
                return res.status(400).json({ error: 'Assignee is not a member of this organization' });
            }
        }

        const task = await prisma.task.create({
            data: {
                title,
                description,
                organizationId,
                assigneeId: normalizedAssigneeId,
                dueDate: dueDate ? new Date(dueDate) : null,
                priority: priority || 'LOW',
                status: 'CREATED'
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
                }
            }
        });

        await notifyTaskAssignment({
            assigneeId: task.assignee?.id || '',
            assignerId: userId,
            taskTitle: task.title,
            organizationName: task.organization.name,
            dueDate: task.dueDate,
            priority: task.priority
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
            }
        });

        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        // Verify user is member of organization
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
        const { title, description, status, assigneeId, dueDate, priority } = req.body;
        const hasAssigneeUpdate = assigneeId !== undefined;
        const normalizedAssigneeId = assigneeId === '' ? null : assigneeId;

        const task = await prisma.task.findUnique({
            where: { id: id }
        });

        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        // Verify user is member of organization
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

        if (hasAssigneeUpdate && normalizedAssigneeId) {
            const assigneeMembership = await prisma.organizationMember.findUnique({
                where: {
                    userId_organizationId: {
                        userId: normalizedAssigneeId,
                        organizationId: task.organizationId
                    }
                }
            });

            if (!assigneeMembership) {
                return res.status(400).json({ error: 'Assignee is not a member of this organization' });
            }
        }

        const updatedTask = await prisma.task.update({
            where: { id: id },
            data: {
                ...(title && { title }),
                ...(description !== undefined && { description }),
                ...(status && { status }),
                ...(hasAssigneeUpdate && { assigneeId: normalizedAssigneeId }),
                ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
                ...(priority && { priority })
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
                }
            }
        });

        if (hasAssigneeUpdate && normalizedAssigneeId && normalizedAssigneeId !== task.assigneeId) {
            await notifyTaskAssignment({
                assigneeId: normalizedAssigneeId,
                assignerId: userId,
                taskTitle: updatedTask.title,
                organizationName: updatedTask.organization.name,
                dueDate: updatedTask.dueDate,
                priority: updatedTask.priority
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

        // Verify user is admin of organization
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

        await prisma.task.delete({
            where: { id: id }
        });

        res.json({ message: 'Task deleted successfully' });
    } catch (error) {
        console.error('Delete task error:', error);
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

        // Verify user is member of organization
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

        let where: any = {};

        if (organizationId) {
            // Verify user is member of organization
            const membership = await prisma.organizationMember.findUnique({
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
        } else {
            // Get all tasks from user's organizations
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

        // Verify user is member of organization
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

export const getMemberStats = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { organizationId } = req.query;

        if (!organizationId) {
            return res.status(400).json({ error: 'Organization ID is required' });
        }

        // Verify requester is admin
        const membership = await prisma.organizationMember.findUnique({
            where: {
                userId_organizationId: {
                    userId,
                    organizationId: organizationId as string
                }
            }
        });

        if (!membership || membership.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Only admins can access team statistics' });
        }

        const members = await prisma.organizationMember.findMany({
            where: { organizationId: organizationId as string },
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
                prisma.task.count({ where: { organizationId: organizationId as string, assigneeId: m.userId, status: 'CREATED' } }),
                prisma.task.count({ where: { organizationId: organizationId as string, assigneeId: m.userId, status: 'IN_PROGRESS' } }),
                prisma.task.count({ where: { organizationId: organizationId as string, assigneeId: m.userId, status: 'COMPLETED' } })
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

        // Check if user is the author OR an admin of the organization
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

        // Check if user is admin of the organization
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
