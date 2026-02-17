import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getOrgs = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;

        // Get all organizations where user is a member
        const memberships = await prisma.organizationMember.findMany({
            where: { userId },
            include: {
                organization: true
            }
        });

        const organizations = memberships.map(m => ({
            ...m.organization,
            userRole: m.role
        }));

        res.json(organizations);
    } catch (error) {
        console.error('Get orgs error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const createOrg = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Organization name is required' });
        }

        // Create organization and add creator as admin
        const organization = await prisma.organization.create({
            data: {
                name,
                members: {
                    create: {
                        userId,
                        role: 'ADMIN'
                    }
                }
            }
        });

        res.status(201).json(organization);
    } catch (error) {
        console.error('Create org error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getOrgById = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const id = req.params.id as string;

        // Check if user is a member
        const membership = await prisma.organizationMember.findUnique({
            where: {
                userId_organizationId: {
                    userId,
                    organizationId: id
                }
            }
        });

        if (!membership) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const organization = await prisma.organization.findUnique({
            where: { id: id },
            include: {
                members: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                email: true,
                                name: true
                            }
                        }
                    }
                }
            }
        });

        if (!organization) {
            return res.status(404).json({ error: 'Organization not found' });
        }

        res.json({
            ...organization,
            userRole: membership.role
        });
    } catch (error) {
        console.error('Get org by ID error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const addMember = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const id = req.params.id as string;
        const { email, role = 'MEMBER' } = req.body;

        // Check if requester is admin
        const requesterMembership = await prisma.organizationMember.findUnique({
            where: {
                userId_organizationId: {
                    userId,
                    organizationId: id
                }
            }
        });

        if (!requesterMembership || requesterMembership.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Only admins can add members' });
        }

        // Find user by email
        const newUser = await prisma.user.findUnique({ where: { email } });
        if (!newUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Add member
        const member = await prisma.organizationMember.create({
            data: {
                userId: newUser.id,
                organizationId: id,
                role
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

        res.status(201).json(member);
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'User is already a member' });
        }
        console.error('Add member error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
