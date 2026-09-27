import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

/**
 * Read-only figures for the Volint Suite portal (docs/TOOL_SUMMARY_CONTRACT.md in volint-suite-api).
 * Limits set by the contract: at most 6 cards and 20 rows, exactly 3 columns, strings up to 120 characters.
 */
const prisma: PrismaClient = (global as any).prisma || new PrismaClient();

const clip = (value: unknown, max = 120): string => String(value ?? '').slice(0, max);
const day = (date: Date) => date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const DONE = ['COMPLETED', 'DONE'];
const CLOSED = [...DONE, 'CANCELLED'];
const percent = (part: number, whole: number) => (whole === 0 ? '—' : `${Math.round((100 * part) / whole)}%`);

export const getSuiteSummary = async (req: Request, res: Response) => {
    const toolUserId = typeof req.query.toolUserId === 'string' ? req.query.toolUserId : '';
    const toolOrganizationId = typeof req.query.toolOrganizationId === 'string' ? req.query.toolOrganizationId : '';
    const audience = req.query.audience === 'staff' ? 'staff' : 'admin';
    if (!toolUserId) return res.status(400).json({ error: 'toolUserId is required' });

    // The person has to belong to the organisation they are asking about, and only ever sees that organisation.
    const membership = await prisma.organizationMember.findFirst({
        where: { userId: toolUserId, ...(toolOrganizationId ? { organizationId: toolOrganizationId } : {}) },
    });
    if (!membership) return res.status(404).json({ error: 'Member not found in this organisation' });

    const data = audience === 'admin'
        ? await adminSummary(membership.organizationId)
        : await staffSummary(membership.organizationId, toolUserId);
    return res.json({ success: true, data });
};

async function adminSummary(organizationId: string) {
    const now = new Date();
    const live = { organizationId, deletedAt: null };
    const [members, openOkrs, tasks, done, overdue, appraisals, published, okrs] = await Promise.all([
        prisma.organizationMember.count({ where: { organizationId } }),
        prisma.okr.count({ where: { organizationId, status: 'OPEN' } }),
        prisma.task.count({ where: { ...live, status: { not: 'CANCELLED' } } }),
        prisma.task.count({ where: { ...live, status: { in: DONE } } }),
        prisma.task.count({ where: { ...live, status: { notIn: CLOSED }, dueDate: { lt: now } } }),
        prisma.appraisal.count({ where: { organizationId } }),
        prisma.appraisal.count({ where: { organizationId, status: 'PUBLISHED' } }),
        prisma.okr.findMany({ where: { organizationId, status: 'OPEN' }, include: { _count: { select: { keyResults: true } } }, orderBy: { periodEnd: 'asc' }, take: 20 }),
    ]);

    return {
        cards: [
            { label: 'Active objectives', value: String(openOkrs), note: `${members} people in the organisation` },
            { label: 'Tasks completed', value: percent(done, tasks), note: `${done} of ${tasks} tasks` },
            { label: 'Overdue tasks', value: String(overdue), note: overdue ? 'Past their due date' : 'Nothing overdue' },
            { label: 'Appraisals', value: String(appraisals), note: `${published} published` },
        ],
        table: {
            title: 'Objectives in progress',
            columns: ['Objective', 'Ends', 'Key results'],
            rows: okrs.map((okr) => ({
                cells: [clip(okr.title), day(okr.periodEnd), `${okr._count.keyResults} key result${okr._count.keyResults === 1 ? '' : 's'}`],
                ok: okr.periodEnd >= now,
            })),
        },
    };
}

async function staffSummary(organizationId: string, userId: string) {
    const now = new Date();
    const mine = { organizationId, deletedAt: null, assigneeId: userId };
    const [open, done, overdue, latest, keyResults] = await Promise.all([
        prisma.task.count({ where: { ...mine, status: { notIn: CLOSED } } }),
        prisma.task.count({ where: { ...mine, status: { in: DONE } } }),
        prisma.task.count({ where: { ...mine, status: { notIn: CLOSED }, dueDate: { lt: now } } }),
        prisma.appraisal.findFirst({ where: { organizationId, subjectUserId: userId, status: 'PUBLISHED' }, orderBy: { createdAt: 'desc' } }),
        prisma.okrKeyResult.findMany({ where: { assignedUserId: userId, okr: { organizationId } }, orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);

    const cards = [
        { label: 'Open tasks', value: String(open), note: overdue ? `${overdue} overdue` : 'None overdue' },
        { label: 'Completed', value: String(done), note: 'Tasks you have finished' },
    ];
    if (latest?.overallRating) cards.push({ label: 'Latest appraisal', value: clip(latest.overallRating.charAt(0) + latest.overallRating.slice(1).toLowerCase(), 40), note: clip(latest.cycle) });

    return {
        cards,
        table: {
            title: 'My key results',
            columns: ['Key result', 'Target', 'Approval'],
            rows: keyResults.map((kr) => ({
                cells: [clip(kr.title), kr.targetValue != null ? clip(`${kr.targetValue}${kr.metricUnit ? ` ${kr.metricUnit}` : ''}`) : '—', clip(kr.approvalStatus.charAt(0) + kr.approvalStatus.slice(1).toLowerCase())],
                ok: kr.approvalStatus !== 'REJECTED',
            })),
        },
    };
}
