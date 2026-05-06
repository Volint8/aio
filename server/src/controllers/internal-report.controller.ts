import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import {
    exportAppraisalBatchPdf,
    exportAppraisalBatchZip,
    generateAppraisalBatch,
    listAppraisalReports,
} from '../services/appraisal-generation.service';

const prisma: PrismaClient = (global as any).prisma || new PrismaClient();

const parseString = (value: unknown, fieldName: string): string => {
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`${fieldName} is required`);
    }

    return value.trim();
};

const parseOptionalStringArray = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value.map((item) => String(item).trim()).filter(Boolean);
};

const normalizeScope = (value: unknown): 'ORGANIZATION' | 'INDIVIDUALS' | 'TEAMS' => {
    const normalized = typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : 'ORGANIZATION';
    if (normalized === 'ORGANIZATION' || normalized === 'INDIVIDUALS' || normalized === 'TEAMS') {
        return normalized;
    }

    throw new Error('scope must be ORGANIZATION, INDIVIDUALS, or TEAMS');
};

export const generateInternalReport = async (req: Request, res: Response) => {
    try {
        const toolOrganizationId = parseString(req.body.toolOrganizationId, 'toolOrganizationId');
        const periodStart = parseString(req.body.periodStart, 'periodStart');
        const periodEnd = parseString(req.body.periodEnd, 'periodEnd');
        const scope = normalizeScope(req.body.scope);

        const adminMembership = await prisma.organizationMember.findFirst({
            where: {
                organizationId: toolOrganizationId,
                role: 'ADMIN',
            },
            orderBy: {
                joinedAt: 'asc',
            },
        });

        if (!adminMembership) {
            return res.status(422).json({ error: 'No admin user found for target organization' });
        }

        const batch = await generateAppraisalBatch({
            organizationId: toolOrganizationId,
            createdByUserId: adminMembership.userId,
            scope,
            subjectIds: parseOptionalStringArray(req.body.subjectIds),
            outputFormat: typeof req.body.outputFormat === 'string' ? req.body.outputFormat : undefined,
            periodStart,
            periodEnd,
            purposes: parseOptionalStringArray(req.body.purposes),
            customFocus: typeof req.body.customFocus === 'string' ? req.body.customFocus : undefined,
            selectedOkrIds: parseOptionalStringArray(req.body.selectedOkrIds),
        });

        return res.status(200).json({
            success: true,
            data: {
                id: batch?.id,
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        return res.status(400).json({ error: message });
    }
};

export const listInternalReportSubjects = async (req: Request, res: Response) => {
    try {
        const toolOrganizationId = parseString(req.query.toolOrganizationId, 'toolOrganizationId');
        const scope = normalizeScope(req.query.scope);

        if (scope === 'ORGANIZATION') {
            return res.status(200).json({
                success: true,
                data: [],
            });
        }

        if (scope === 'INDIVIDUALS') {
            const members = await prisma.organizationMember.findMany({
                where: {
                    organizationId: toolOrganizationId,
                    role: { not: 'ADMIN' },
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            jobTitle: true,
                        },
                    },
                    primaryTeam: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
                orderBy: {
                    joinedAt: 'asc',
                },
            });

            return res.status(200).json({
                success: true,
                data: members.map((member) => ({
                    id: member.userId,
                    label: member.user.name || member.user.email,
                    subtitle: [member.user.jobTitle || member.role, member.primaryTeam?.name || null].filter(Boolean).join(' - '),
                })),
            });
        }

        const teams = await prisma.team.findMany({
            where: {
                organizationId: toolOrganizationId,
            },
            include: {
                leadUser: {
                    select: {
                        name: true,
                        email: true,
                    },
                },
                members: {
                    include: {
                        organizationMember: {
                            select: {
                                userId: true,
                            },
                        },
                    },
                },
            },
            orderBy: {
                name: 'asc',
            },
        });

        return res.status(200).json({
            success: true,
            data: teams.map((team) => ({
                id: team.id,
                label: team.name,
                subtitle: `Lead: ${team.leadUser?.name || team.leadUser?.email || 'Unassigned'} | Members: ${team.members.length}`,
            })),
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        return res.status(400).json({ error: message });
    }
};

export const getInternalReportStatus = async (req: Request, res: Response) => {
    try {
        const toolOrganizationId = parseString(req.query.toolOrganizationId, 'toolOrganizationId');
        const externalReportId = parseString(req.query.externalReportId, 'externalReportId');
        const reports = await listAppraisalReports(toolOrganizationId);
        const ready = reports.some(
            (report: any) => report.id === externalReportId || report.batchId === externalReportId
        );

        return res.status(200).json({
            success: true,
            data: {
                status: ready ? 'ready' : 'processing',
                ready,
                externalReportId,
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        return res.status(400).json({ error: message });
    }
};

export const getInternalReportView = async (req: Request, res: Response) => {
    try {
        const toolOrganizationId = parseString(req.query.toolOrganizationId, 'toolOrganizationId');
        const externalReportId = parseString(req.query.externalReportId, 'externalReportId');
        const reports = await listAppraisalReports(toolOrganizationId);
        const matches = reports.filter(
            (report: any) => report.id === externalReportId || report.batchId === externalReportId
        );

        if (matches.length === 0) {
            return res.status(404).json({ error: 'Report not found' });
        }

        return res.status(200).json({
            success: true,
            data: {
                batchId: matches[0]?.batchId || externalReportId,
                reportCount: matches.length,
                reports: matches,
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        return res.status(400).json({ error: message });
    }
};

export const downloadInternalReport = async (req: Request, res: Response) => {
    try {
        const toolOrganizationId = parseString(req.query.toolOrganizationId, 'toolOrganizationId');
        const externalReportId = parseString(req.query.externalReportId, 'externalReportId');
        const format = typeof req.query.format === 'string' && req.query.format.trim()
            ? req.query.format.trim().toLowerCase()
            : 'zip';

        const file = format === 'pdf'
            ? await exportAppraisalBatchPdf(toolOrganizationId, externalReportId)
            : await exportAppraisalBatchZip(toolOrganizationId, externalReportId);

        res.setHeader('Content-Type', format === 'pdf' ? 'application/pdf' : 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename=${file.filename}`);
        return res.status(200).send(file.buffer);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        return res.status(400).json({ error: message });
    }
};
