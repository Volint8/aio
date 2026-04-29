import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { makeUniqueOrgName, makeUniqueSlug, normalizeOrgName } from '../utils/org.utils';
import { otpExpiryDate, randomOtp } from '../utils/auth.utils';
import { sendProvisioningOnboardingEmail } from '../services/email.service';

const prisma: PrismaClient = (global as any).prisma || new PrismaClient();

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const mapRoleToOrgRole = (role: string): 'ADMIN' | 'TEAM_LEAD' | 'MEMBER' => {
    const normalized = role.trim().toLowerCase();
    if (normalized === 'admin') return 'ADMIN';
    if (normalized === 'team_lead') return 'TEAM_LEAD';
    return 'MEMBER';
};

const parseOptionalString = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
};

const parseRequiredString = (value: unknown, fieldName: string): string => {
    const parsed = parseOptionalString(value);
    if (!parsed) {
        throw new Error(`${fieldName} is required`);
    }

    return parsed;
};

const parseEmail = (value: unknown): string => {
    const parsed = parseRequiredString(value, 'email');
    const basicEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!basicEmailRegex.test(parsed)) {
        throw new Error('Invalid email address');
    }

    return normalizeEmail(parsed);
};

const parseOptionalOrgId = (value: unknown): string | undefined => {
    const parsed = parseOptionalString(value);
    return parsed || undefined;
};

const parseRole = (value: unknown): string => {
    const parsed = parseRequiredString(value, 'role').toLowerCase();
    if (!['admin', 'member', 'team_lead'].includes(parsed)) {
        throw new Error('Invalid role');
    }

    return parsed;
};

const buildProvisioningSetupUrl = (email: string): string => {
    const clientBaseUrl = (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0];
    return `${clientBaseUrl.replace(/\/$/, '')}/forgot-password?email=${encodeURIComponent(email)}&source=volint-provisioning`;
};

export const lookupProvisioningUser = async (req: Request, res: Response) => {
    try {
        const email = parseEmail(req.query.email);
        const toolOrganizationId = parseOptionalOrgId(req.query.toolOrganizationId);

        const user = await prisma.user.findFirst({
            where: {
                email: {
                    equals: email,
                    mode: 'insensitive',
                },
            },
        });

        if (!user) {
            return res.status(200).json({ success: true, data: { exists: false } });
        }

        const memberships = await prisma.organizationMember.findMany({
            where: {
                userId: user.id,
            },
            orderBy: { joinedAt: 'asc' },
        });

        const scopedMembership = toolOrganizationId
            ? memberships.find((membership) => membership.organizationId === toolOrganizationId)
            : undefined;

        const membership = scopedMembership || memberships[0];

        return res.status(200).json({
            success: true,
            data: {
                exists: true,
                toolUserId: user.id,
                currentRole: (membership?.role || 'MEMBER').toLowerCase(),
                toolOrganizationId: membership?.organizationId,
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        return res.status(400).json({ success: false, message });
    }
};

export const deleteProvisioningUser = async (req: Request, res: Response) => {
    try {
        const toolUserId = parseRequiredString(req.params.userId, 'userId');
        const toolOrganizationId = parseOptionalOrgId(req.body.toolOrganizationId);

        const user = await prisma.user.findUnique({ where: { id: toolUserId } });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (toolOrganizationId) {
            await prisma.organizationMember.deleteMany({
                where: {
                    userId: toolUserId,
                    organizationId: toolOrganizationId,
                },
            });

            const remainingMemberships = await prisma.organizationMember.count({
                where: { userId: toolUserId },
            });

            if (remainingMemberships === 0) {
                await prisma.user.update({
                    where: { id: toolUserId },
                    data: {
                        deletedAt: new Date(),
                        purgedAt: null,
                        otp: null,
                        otpExpiresAt: null,
                        passwordResetOtp: null,
                        passwordResetOtpExpiresAt: null,
                        pendingInviteId: null,
                    },
                });
            }

            return res.status(200).json({ success: true, data: { deleted: true } });
        }

        await prisma.user.update({
            where: { id: toolUserId },
            data: {
                deletedAt: new Date(),
                purgedAt: null,
                otp: null,
                otpExpiresAt: null,
                passwordResetOtp: null,
                passwordResetOtpExpiresAt: null,
                pendingInviteId: null,
            },
        });

        return res.status(200).json({ success: true, data: { deleted: true } });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        return res.status(400).json({ success: false, message });
    }
};

export const createProvisioningUser = async (req: Request, res: Response) => {
    try {
        const email = parseEmail(req.body.email);
        const firstName = parseRequiredString(req.body.firstName, 'firstName');
        const lastName = parseRequiredString(req.body.lastName, 'lastName');
        const fullName = `${firstName} ${lastName}`.trim();
        const role = parseRole(req.body.role);
        const toolOrganizationId = parseOptionalOrgId(req.body.toolOrganizationId);
        const organizationName = parseRequiredString(req.body.organizationName, 'organizationName');
        const onboardingOtp = randomOtp();
        const onboardingOtpExpiresAt = otpExpiryDate();

        if (role !== 'admin' && !toolOrganizationId) {
            return res.status(422).json({ success: false, message: 'toolOrganizationId is required for non-admin users' });
        }

        const existingUser = await prisma.user.findFirst({
            where: {
                email: {
                    equals: email,
                    mode: 'insensitive',
                },
            },
        });

        if (existingUser) {
            return res.status(409).json({ success: false, message: 'User with this email already exists' });
        }

        const passwordHash = await bcrypt.hash(Math.random().toString(36) + Date.now().toString(36), 10);

        const result = await prisma.$transaction(async (tx) => {
            const createdUser = await tx.user.create({
                data: {
                    email,
                    passwordHash,
                    name: fullName,
                    role: 'USER',
                    isVerified: true,
                    signupSource: 'SYSTEM',
                    initialRole: role === 'admin' ? 'ADMIN' : 'MEMBER',
                    passwordResetOtp: onboardingOtp,
                    passwordResetOtpExpiresAt: onboardingOtpExpiresAt,
                },
            });

            if (role === 'admin') {
                const uniqueOrgName = await makeUniqueOrgName(organizationName);
                const normalizedName = normalizeOrgName(uniqueOrgName);
                const slug = await makeUniqueSlug(uniqueOrgName);

                const organization = await tx.organization.create({
                    data: {
                        name: uniqueOrgName,
                        normalizedName,
                        slug,
                    },
                });

                await tx.organizationMember.create({
                    data: {
                        userId: createdUser.id,
                        organizationId: organization.id,
                        role: 'ADMIN',
                    },
                });

                return {
                    toolUserId: createdUser.id,
                    toolOrganizationId: organization.id,
                };
            }

            const organization = await tx.organization.findUnique({ where: { id: String(toolOrganizationId) } });
            if (!organization) {
                throw new Error('Target organization not found for provisioning');
            }

            await tx.organizationMember.create({
                data: {
                    userId: createdUser.id,
                    organizationId: organization.id,
                    role: mapRoleToOrgRole(role),
                },
            });

            return {
                toolUserId: createdUser.id,
                toolOrganizationId: organization.id,
            };
        });

        try {
            await sendProvisioningOnboardingEmail({
                to: email,
                otp: onboardingOtp,
                organizationName,
                recipientName: fullName,
                setupUrl: buildProvisioningSetupUrl(email),
            });
        } catch (emailError) {
            console.error('Failed to send provisioning onboarding email:', emailError);
        }

        return res.status(201).json({ success: true, data: result });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        return res.status(400).json({ success: false, message });
    }
};

export const syncProvisioningUser = async (req: Request, res: Response) => {
    try {
        const toolUserId = parseRequiredString(req.params.userId, 'userId');
        const role = parseRole(req.body.role);
        const toolOrganizationId = parseOptionalOrgId(req.body.toolOrganizationId);
        const organizationName = parseRequiredString(req.body.organizationName, 'organizationName');

        const user = await prisma.user.findUnique({ where: { id: toolUserId } });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (role !== 'admin' && !toolOrganizationId) {
            return res.status(422).json({ success: false, message: 'toolOrganizationId is required for non-admin users' });
        }

        await prisma.$transaction(async (tx) => {
            await tx.user.update({
                where: { id: toolUserId },
                data: {
                    deletedAt: null,
                    isVerified: true,
                    initialRole: role === 'admin' ? 'ADMIN' : 'MEMBER',
                },
            });

            if (role === 'admin') {
                const existingAdminMembership = await tx.organizationMember.findFirst({
                    where: {
                        userId: toolUserId,
                        role: 'ADMIN',
                    },
                });

                // Prefer the existing membership org over whatever is passed, to guard
                // against callers that send the user ID instead of the org ID.
                const targetOrgId = existingAdminMembership?.organizationId || toolOrganizationId;

                if (targetOrgId) {
                    await tx.organizationMember.upsert({
                        where: {
                            userId_organizationId: {
                                userId: toolUserId,
                                organizationId: targetOrgId,
                            },
                        },
                        update: {
                            role: 'ADMIN',
                        },
                        create: {
                            userId: toolUserId,
                            organizationId: targetOrgId,
                            role: 'ADMIN',
                        },
                    });
                    return;
                }

                const uniqueOrgName = await makeUniqueOrgName(organizationName);
                const normalizedName = normalizeOrgName(uniqueOrgName);
                const slug = await makeUniqueSlug(uniqueOrgName);

                const organization = await tx.organization.create({
                    data: {
                        name: uniqueOrgName,
                        normalizedName,
                        slug,
                    },
                });

                await tx.organizationMember.create({
                    data: {
                        userId: toolUserId,
                        organizationId: organization.id,
                        role: 'ADMIN',
                    },
                });

                return;
            }

            const org = await tx.organization.findUnique({ where: { id: String(toolOrganizationId) } });
            if (!org) {
                throw new Error('Target organization not found for provisioning');
            }

            await tx.organizationMember.upsert({
                where: {
                    userId_organizationId: {
                        userId: toolUserId,
                        organizationId: org.id,
                    },
                },
                update: {
                    role: mapRoleToOrgRole(role),
                },
                create: {
                    userId: toolUserId,
                    organizationId: org.id,
                    role: mapRoleToOrgRole(role),
                },
            });
        });

        return res.status(200).json({ success: true, data: { synced: true } });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        return res.status(400).json({ success: false, message });
    }
};

export const disableProvisioningUser = async (req: Request, res: Response) => {
    try {
        const toolUserId = parseRequiredString(req.params.userId, 'userId');
        const toolOrganizationId = parseOptionalOrgId(req.body.toolOrganizationId);

        const user = await prisma.user.findUnique({ where: { id: toolUserId } });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (toolOrganizationId) {
            await prisma.organizationMember.deleteMany({
                where: {
                    userId: toolUserId,
                    organizationId: toolOrganizationId,
                },
            });

            return res.status(200).json({ success: true, data: { disabled: true } });
        }

        await prisma.user.update({
            where: { id: toolUserId },
            data: {
                deletedAt: new Date(),
            },
        });

        return res.status(200).json({ success: true, data: { disabled: true } });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        return res.status(400).json({ success: false, message });
    }
};
