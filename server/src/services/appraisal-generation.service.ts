import OpenAI from 'openai';
import PDFDocument from 'pdfkit';
import archiver from 'archiver';
import { PrismaClient } from '@prisma/client';
import {
  appraisalReportSchema,
  getAppraisalSystemPrompt,
  buildAppraisalPromptPayload
} from './appraisal-prompt';
import { buildTeamsPayloadFromMembership } from '../utils/membership.utils';

const prisma = new PrismaClient();

export type AppraisalScope = 'INDIVIDUALS' | 'TEAMS' | 'ORGANIZATION';
export type AppraisalOutputFormat = 'SINGLE_PDF' | 'SEPARATE_PDFS';

type Subject = {
  type: 'INDIVIDUAL' | 'TEAM';
  id: string;
  name: string;
  role?: string | null;
  teamId?: string | null;
  teamName?: string | null;
  userIds: string[];
};

type OkrWithRelations = {
  id: string;
  title: string;
  description: string | null;
  periodStart: Date;
  periodEnd: Date;
  status: string;
  objectiveTargetValue: number | null;
  objectiveMetricUnit: string | null;
  assignments: Array<{ targetType: string; targetId: string }>;
  keyResults: Array<{
    id: string;
    title: string;
    assignedUserId: string | null;
    ownerIds: unknown;
    isGeneral: boolean;
    metricName: string | null;
    metricUnit: string | null;
    targetValue: number | null;
    weight: number;
    contributionValue: number | null;
    contributionPct: number | null;
    approvalStatus: string;
    approvedAt: Date | null;
    approvalNotes: string | null;
    assignedUser?: { id: string; name: string | null; email: string } | null;
    approver?: { id: string; name: string | null; email: string } | null;
  }>;
};

type ReportSections = {
  header: {
    name: string;
    role?: string | null;
    team?: string | null;
    appraisalPeriod: string;
    purpose: string;
  };
  overviewSummary: string;
  okrPerformanceBreakdown: Array<{
    objective: string;
    keyResults: string[];
    owner: string;
    timeline: string;
    status: string;
    performanceInsight: string;
  }>;
  strengths: string[];
  areasForImprovement: string[];
  skillsCapabilityInsights: string[];
  recommendations: string[];
  finalRating: string;
  nextSteps: string[];
};

const toDateOnly = (date: Date) => date.toISOString().slice(0, 10);

const startOfToday = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

const parseDateRange = (periodStart?: string, periodEnd?: string) => {
  if (!periodStart || !periodEnd) {
    throw new Error('periodStart and periodEnd are required');
  }
  const from = new Date(`${periodStart}T00:00:00.000Z`);
  const to = new Date(`${periodEnd}T23:59:59.999Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new Error('Invalid appraisal period');
  }
  if (from > to) {
    throw new Error('Start date must be before end date');
  }
  return { from, to };
};

const asOwnerIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === 'string' && id.trim() !== '');
};

const roundMetric = (value: number | null | undefined, precision = 2): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

const normalizeScope = (scope?: string): AppraisalScope => {
  const normalized = (scope || 'INDIVIDUALS').toUpperCase();
  if (normalized === 'INDIVIDUALS' || normalized === 'TEAMS' || normalized === 'ORGANIZATION') {
    return normalized;
  }
  throw new Error('scope must be INDIVIDUALS, TEAMS, or ORGANIZATION');
};

const normalizeOutputFormat = (outputFormat?: string): AppraisalOutputFormat => {
  const normalized = (outputFormat || 'SINGLE_PDF').toUpperCase();
  if (normalized === 'SINGLE_PDF' || normalized === 'SEPARATE_PDFS') {
    return normalized;
  }
  throw new Error('outputFormat must be SINGLE_PDF or SEPARATE_PDFS');
};

const normalizePurposes = (purposes?: unknown): string[] => {
  if (!Array.isArray(purposes)) return ['Performance Review'];
  const values = purposes
    .filter((purpose): purpose is string => typeof purpose === 'string')
    .map((purpose) => purpose.trim())
    .filter(Boolean);
  return values.length > 0 ? Array.from(new Set(values)) : ['Performance Review'];
};

const periodLabel = (from: Date, to: Date) => `${toDateOnly(from)} to ${toDateOnly(to)}`;

const buildCycle = (from: Date, to: Date) => {
  const sameMonth = from.getUTCFullYear() === to.getUTCFullYear() && from.getUTCMonth() === to.getUTCMonth();
  if (sameMonth) {
    return from.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }
  return periodLabel(from, to);
};

const resolveSubjects = async (organizationId: string, scope: AppraisalScope, subjectIds: string[]): Promise<Subject[]> => {
  const nonAdminMemberships = await prisma.organizationMember.findMany({
    where: { organizationId, role: { not: 'ADMIN' } },
    include: {
      user: { select: { id: true, name: true, email: true, jobTitle: true } },
      primaryTeam: { select: { id: true, name: true } },
      teamMemberships: {
        include: {
          team: { select: { id: true, name: true } }
        }
      }
    },
    orderBy: { joinedAt: 'asc' }
  });

  if (scope === 'ORGANIZATION') {
    return nonAdminMemberships.map((member) => ({
      ...(buildTeamsPayloadFromMembership(member)),
      type: 'INDIVIDUAL',
      id: member.userId,
      name: member.user.name || member.user.email,
      role: member.user.jobTitle || member.role,
      teamId: member.primaryTeamId,
      teamName: member.primaryTeam?.name || null,
      userIds: [member.userId]
    }));
  }

  if (subjectIds.length === 0) {
    throw new Error('At least one subject is required');
  }

  if (scope === 'INDIVIDUALS') {
    const byUserId = new Map(nonAdminMemberships.map((member) => [member.userId, member]));
    const subjects = Array.from(new Set(subjectIds)).map((id) => byUserId.get(id)).filter(Boolean);
    if (subjects.length !== Array.from(new Set(subjectIds)).length) {
      throw new Error('One or more selected members are invalid for this organization');
    }
    return subjects.map((member) => ({
      ...(buildTeamsPayloadFromMembership(member!)),
      type: 'INDIVIDUAL',
      id: member!.userId,
      name: member!.user.name || member!.user.email,
      role: member!.user.jobTitle || member!.role,
      teamId: member!.primaryTeamId,
      teamName: member!.primaryTeam?.name || null,
      userIds: [member!.userId]
    }));
  }

  const teams = await prisma.team.findMany({
    where: { organizationId, id: { in: Array.from(new Set(subjectIds)) } },
    include: {
      members: {
        where: { organizationMember: { role: { not: 'ADMIN' } } },
        include: {
          organizationMember: {
            include: {
              user: { select: { id: true, name: true, email: true } }
            }
          }
        }
      }
    },
    orderBy: { name: 'asc' }
  });

  if (teams.length !== Array.from(new Set(subjectIds)).length) {
    throw new Error('One or more selected teams are invalid for this organization');
  }

  return teams.map((team) => ({
    type: 'TEAM',
    id: team.id,
    name: team.name,
    teamId: team.id,
    teamName: team.name,
    userIds: team.members.map((member) => member.organizationMember.userId)
  }));
};

const fetchOverlappingOkrs = async (organizationId: string, from: Date, to: Date): Promise<OkrWithRelations[]> => {
  return prisma.okr.findMany({
    where: {
      organizationId,
      periodStart: { lte: to },
      periodEnd: { gte: from }
    },
    include: {
      assignments: { select: { targetType: true, targetId: true } },
      keyResults: {
        include: {
          assignedUser: { select: { id: true, name: true, email: true } },
          approver: { select: { id: true, name: true, email: true } }
        }
      }
    },
    orderBy: { periodStart: 'desc' }
  }) as any;
};

const okrMatchesSubject = (okr: OkrWithRelations, subject: Subject) => {
  const userIdSet = new Set(subject.userIds);
  const hasTeamAssignment = !!subject.teamId && okr.assignments.some((a) => a.targetType === 'TEAM' && a.targetId === subject.teamId);
  const hasMemberAssignment = okr.assignments.some((a) => a.targetType === 'MEMBER' && userIdSet.has(a.targetId));
  const hasKrOwner = okr.keyResults.some((kr) => {
    if (kr.assignedUserId && userIdSet.has(kr.assignedUserId)) return true;
    return asOwnerIds(kr.ownerIds).some((id) => userIdSet.has(id));
  });
  return hasTeamAssignment || hasMemberAssignment || hasKrOwner;
};

const filterSubjectKeyResults = (okr: OkrWithRelations, subject: Subject) => {
  const userIdSet = new Set(subject.userIds);
  return okr.keyResults.filter((kr) => {
    if (kr.isGeneral) return false;
    if (kr.assignedUserId && userIdSet.has(kr.assignedUserId)) return true;
    return asOwnerIds(kr.ownerIds).some((id) => userIdSet.has(id));
  });
};

const buildSetupSummary = (subjects: Subject[], from: Date, to: Date, okrs: OkrWithRelations[], purposes: string[], customFocus?: string | null) => {
  const subjectNames = subjects.map((subject) => subject.teamName && subject.type === 'INDIVIDUAL'
    ? `${subject.name} (${subject.role || 'Member'}, ${subject.teamName})`
    : `${subject.name}${subject.role ? ` (${subject.role})` : ''}`);
  const okrTitles = okrs.map((okr) => okr.title);
  return [
    `Subjects: ${subjectNames.length > 0 ? subjectNames.join('; ') : 'None selected'}.`,
    `Appraisal period: ${periodLabel(from, to)}.`,
    `Selected OKRs: ${okrTitles.length > 0 ? okrTitles.join('; ') : 'No matching OKRs selected'}.`,
    `Purpose: ${purposes.join(', ')}.`,
    customFocus?.trim() ? `Custom focus: ${customFocus.trim()}.` : null
  ].filter(Boolean).join('\n');
};

export const previewAppraisalSetup = async (params: {
  organizationId: string;
  scope?: string;
  subjectIds?: string[];
  periodStart?: string;
  periodEnd?: string;
  purposes?: unknown;
  customFocus?: string | null;
  selectedOkrIds?: string[];
}) => {
  const scope = normalizeScope(params.scope);
  const { from, to } = parseDateRange(params.periodStart, params.periodEnd);
  const purposes = normalizePurposes(params.purposes);
  const subjects = await resolveSubjects(params.organizationId, scope, params.subjectIds || []);
  const overlappingOkrs = await fetchOverlappingOkrs(params.organizationId, from, to);
  const eligibleOkrs = overlappingOkrs.filter((okr) => subjects.some((subject) => okrMatchesSubject(okr, subject)));

  const selectedOkrIds = (params.selectedOkrIds && params.selectedOkrIds.length > 0)
    ? params.selectedOkrIds.filter((id) => eligibleOkrs.some((okr) => okr.id === id))
    : eligibleOkrs.map((okr) => okr.id);

  const setupOkrs = eligibleOkrs.filter((okr) => selectedOkrIds.includes(okr.id));
  const setupSummary = buildSetupSummary(subjects, from, to, setupOkrs, purposes, params.customFocus);

  return {
    scope,
    periodStart: toDateOnly(from),
    periodEnd: toDateOnly(to),
    subjects: subjects.map((subject) => ({
      type: subject.type,
      id: subject.id,
      name: subject.name,
      role: subject.role || null,
      teamId: subject.teamId || null,
      teamName: subject.teamName || null
    })),
    okrs: eligibleOkrs.map((okr) => ({
      id: okr.id,
      title: okr.title,
      description: okr.description,
      periodStart: okr.periodStart,
      periodEnd: okr.periodEnd,
      status: okr.status,
      keyResultCount: okr.keyResults.length
    })),
    selectedOkrIds,
    setupSummary
  };
};

const buildOkrImpact = async (params: {
  organizationId: string;
  subject: Subject;
  from: Date;
  to: Date;
  selectedOkrIds: string[];
}) => {
  const { organizationId, subject, from, to, selectedOkrIds } = params;
  const selectedSet = new Set(selectedOkrIds);
  const overlappingOkrs = await fetchOverlappingOkrs(organizationId, from, to);
  const scopedOkrs = overlappingOkrs
    .filter((okr) => selectedSet.has(okr.id))
    .filter((okr) => okrMatchesSubject(okr, subject))
    .map((okr) => ({ ...okr, keyResults: filterSubjectKeyResults(okr, subject) }))
    .filter((okr) => okr.keyResults.length > 0 || okr.assignments.length > 0);

  const taskWhere: any = {
    organizationId,
    deletedAt: null,
    assigneeId: { in: subject.userIds },
    createdAt: { gte: from, lte: to }
  };

  const overdueCutoff = startOfToday();
  const [allTasks, completedTasks, overdueTasks, generalTaskCount, completedGeneralTaskCount, rawDeadlineShifts] = await Promise.all([
    prisma.task.count({ where: taskWhere }),
    prisma.task.count({ where: { ...taskWhere, status: 'COMPLETED' } }),
    prisma.task.count({ where: { ...taskWhere, status: { not: 'COMPLETED' }, dueDate: { lt: overdueCutoff } } }),
    prisma.task.count({ where: { ...taskWhere, krImpacts: { none: {} } } }),
    prisma.task.count({ where: { ...taskWhere, status: 'COMPLETED', krImpacts: { none: {} } } }),
    prisma.activityLog.findMany({
      where: {
        action: 'TASK_UPDATED',
        description: 'Due date changed',
        task: {
          organizationId,
          deletedAt: null,
          assigneeId: { in: subject.userIds }
        },
        createdAt: { gte: from, lte: to }
      },
      include: {
        task: {
          select: {
            title: true
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    })
  ]);

  const deadlineShifts = rawDeadlineShifts.map((log: any) => {
    const meta = (log.metadata && typeof log.metadata === 'object') ? log.metadata : {};
    return {
      taskTitle: log.task?.title || 'Untitled Task',
      oldDueDate: meta.oldDueDate || null,
      newDueDate: meta.newDueDate || null,
      changedAt: log.createdAt.toISOString()
    };
  });

  const krIds = scopedOkrs.flatMap((okr) => okr.keyResults.map((kr) => kr.id));
  const impactRows = krIds.length > 0
    ? await prisma.taskKrImpact.findMany({
      where: {
        okrKeyResultId: { in: krIds },
        task: {
          organizationId,
          deletedAt: null,
          assigneeId: { in: subject.userIds },
          createdAt: { gte: from, lte: to }
        }
      } as any,
      select: { okrKeyResultId: true, actualValue: true }
    })
    : [];

  const actualByKr = new Map<string, number>();
  for (const row of impactRows) {
    actualByKr.set(row.okrKeyResultId, (actualByKr.get(row.okrKeyResultId) || 0) + row.actualValue);
  }

  const okrSummaries = scopedOkrs.map((okr) => {
    const keyResults = okr.keyResults.map((kr) => {
      const actualValue = actualByKr.get(kr.id) || 0;
      const targetValue = kr.targetValue ?? null;
      const achievedPct = targetValue && targetValue > 0 ? Math.min((actualValue / targetValue) * 100, 100) : null;
      return {
        krId: kr.id,
        krTitle: kr.title,
        assignedUserId: kr.assignedUserId,
        assignedUserName: kr.assignedUser?.name || null,
        assignedUserEmail: kr.assignedUser?.email || null,
        metricName: kr.metricName,
        metricUnit: kr.metricUnit,
        targetValue,
        actualValue,
        weight: kr.weight || 1,
        contributionValue: kr.contributionValue ?? null,
        contributionPct: kr.contributionPct ?? null,
        achievedPct: roundMetric(achievedPct),
        approvalStatus: kr.approvalStatus,
        approvedByName: kr.approver?.name || kr.approver?.email || null,
        approvedAt: kr.approvedAt ? kr.approvedAt.toISOString() : null,
        approvalNotes: kr.approvalNotes
      };
    });

    const quantitativeKrs = keyResults.filter((kr) => kr.achievedPct !== null);
    const weightTotal = quantitativeKrs.reduce((acc, kr) => acc + ((kr.contributionPct && kr.contributionPct > 0) ? kr.contributionPct : kr.weight), 0);
    const achievedPct = weightTotal > 0
      ? quantitativeKrs.reduce((acc, kr) => {
        const effectiveWeight = (kr.contributionPct && kr.contributionPct > 0) ? kr.contributionPct : kr.weight;
        const approvalFactor = kr.approvalStatus === 'APPROVED' ? 1 : 0;
        return acc + ((kr.achievedPct || 0) * effectiveWeight * approvalFactor);
      }, 0) / weightTotal
      : null;

    return {
      okrId: okr.id,
      okrTitle: okr.title,
      periodStart: okr.periodStart.toISOString(),
      periodEnd: okr.periodEnd.toISOString(),
      status: okr.status,
      objectiveTargetValue: okr.objectiveTargetValue,
      objectiveMetricUnit: okr.objectiveMetricUnit,
      achievedPct: roundMetric(achievedPct),
      targetValueTotal: quantitativeKrs.length > 0 ? quantitativeKrs.reduce((acc, kr) => acc + (kr.targetValue || 0), 0) : null,
      actualValueTotal: keyResults.reduce((acc, kr) => acc + kr.actualValue, 0),
      keyResults,
      quantitativeKrCount: quantitativeKrs.length,
      excludedKrCount: keyResults.length - quantitativeKrs.length
    };
  });

  const assignedKeyResults = okrSummaries.flatMap((okr) => okr.keyResults);
  const contributionWeightTotal = assignedKeyResults.reduce((acc, kr) => acc + ((kr.contributionPct && kr.contributionPct > 0) ? kr.contributionPct : kr.weight), 0);
  const krScore = contributionWeightTotal > 0
    ? assignedKeyResults.reduce((acc, kr) => {
      const achievedPct = kr.achievedPct ?? 0;
      const effectiveWeight = (kr.contributionPct && kr.contributionPct > 0) ? kr.contributionPct : kr.weight;
      const approvalFactor = kr.approvalStatus === 'APPROVED' ? 1 : 0;
      return acc + (achievedPct * effectiveWeight * approvalFactor);
    }, 0) / contributionWeightTotal
    : 0;

  const generalTaskAchievedPct = generalTaskCount > 0 ? (completedGeneralTaskCount / generalTaskCount) * 100 : null;
  const weightedImpactDenominator = assignedKeyResults.length + generalTaskCount;
  const okrImpactScore = weightedImpactDenominator > 0
    ? ((krScore * assignedKeyResults.length) + ((generalTaskAchievedPct || 0) * generalTaskCount)) / weightedImpactDenominator
    : 0;

  const tasksCompleted = allTasks > 0 ? (completedTasks / allTasks) * 100 : 0;
  const deadlinesMet = allTasks > 0 ? ((allTasks - overdueTasks) / allTasks) * 100 : 0;
  const performanceScore = (tasksCompleted * 0.25) + (deadlinesMet * 0.2) + (okrImpactScore * 0.55);
  let overallRating = 'AVERAGE';
  if (performanceScore >= 85) overallRating = 'EXCELLENT';
  else if (performanceScore >= 70) overallRating = 'GOOD';
  else if (performanceScore < 40) overallRating = 'POOR';

  let okrContribution = 'LOW';
  if (okrImpactScore >= 70) okrContribution = 'HIGH';
  else if (okrImpactScore >= 30) okrContribution = 'MEDIUM';

  return {
    allTasks,
    completedTasks,
    overdueTasks,
    tasksCompleted: roundMetric(tasksCompleted) || 0,
    deadlinesMet: roundMetric(deadlinesMet) || 0,
    okrContribution,
    okrImpactScore: roundMetric(okrImpactScore) || 0,
    overallRating,
    deadlineShifts,
    okrImpactSummary: {
      okrs: okrSummaries,
      totals: {
        achievedPct: assignedKeyResults.length > 0 || generalTaskCount > 0 ? roundMetric(okrImpactScore) : null,
        quantitativeOkrCount: assignedKeyResults.length,
        excludedOkrCount: okrSummaries.reduce((acc, okr) => acc + okr.excludedKrCount, 0),
        generalTaskCount,
        generalTaskCompletedCount: completedGeneralTaskCount,
        generalTaskAchievedPct: roundMetric(generalTaskAchievedPct)
      }
    },
    scoreBreakdown: {
      tasksCompletedWeight: 0.25,
      deadlinesMetWeight: 0.2,
      okrImpactWeight: 0.55,
      tasksCompleted: roundMetric(tasksCompleted) || 0,
      deadlinesMet: roundMetric(deadlinesMet) || 0,
      okrImpactScore: roundMetric(okrImpactScore) || 0,
      performanceScore: roundMetric(performanceScore) || 0,
      approvedKeyResultCount: assignedKeyResults.filter((kr) => kr.approvalStatus === 'APPROVED').length,
      pendingKeyResultCount: assignedKeyResults.filter((kr) => kr.approvalStatus === 'PENDING').length,
      rejectedKeyResultCount: assignedKeyResults.filter((kr) => kr.approvalStatus === 'REJECTED').length,
      generalTaskCount,
      completedGeneralTaskCount,
      generalTaskAchievedPct: roundMetric(generalTaskAchievedPct)
    }
  };
};

const buildFallbackSections = (input: {
  subject: Subject;
  from: Date;
  to: Date;
  purposes: string[];
  customFocus?: string | null;
  metrics: Awaited<ReturnType<typeof buildOkrImpact>>;
}): ReportSections => {
  const { subject, from, to, purposes, customFocus, metrics } = input;
  const okrRows = metrics.okrImpactSummary.okrs.map((okr: any) => ({
    objective: okr.okrTitle,
    keyResults: okr.keyResults.map((kr: any) => `${kr.krTitle}: ${kr.actualValue}/${kr.targetValue || 'target not set'}${kr.achievedPct !== null ? ` (${Math.round(kr.achievedPct)}%)` : ''}`),
    owner: subject.name,
    timeline: `${toDateOnly(new Date(okr.periodStart))} to ${toDateOnly(new Date(okr.periodEnd))}`,
    status: okr.status || 'Tracked',
    performanceInsight: okr.achievedPct !== null
      ? `Weighted approved achievement was ${Math.round(okr.achievedPct)}%.`
      : 'Quantitative target data is incomplete, so this OKR should be reviewed qualitatively.'
  }));

  let overviewSummary = `${subject.name} completed ${metrics.completedTasks}/${metrics.allTasks} tasks, met ${Math.round(metrics.deadlinesMet)}% of tracked deadlines, and recorded an OKR impact score of ${Math.round(metrics.okrImpactScore)}%.${customFocus ? ` Focus area: ${customFocus}.` : ''}`;
  if (metrics.deadlineShifts && metrics.deadlineShifts.length > 0) {
    const shiftDetails = metrics.deadlineShifts.map((s: any) => {
      const oldStr = s.oldDueDate ? toDateOnly(new Date(s.oldDueDate)) : 'None';
      const newStr = s.newDueDate ? toDateOnly(new Date(s.newDueDate)) : 'None';
      return `"${s.taskTitle}" (${oldStr} -> ${newStr})`;
    }).join(', ');
    overviewSummary += ` Deadline shifts occurred for: ${shiftDetails}.`;
  }

  return {
    header: {
      name: subject.name,
      role: subject.role || (subject.type === 'TEAM' ? 'Team' : null),
      team: subject.teamName || null,
      appraisalPeriod: periodLabel(from, to),
      purpose: purposes.join(', ')
    },
    overviewSummary,
    okrPerformanceBreakdown: okrRows,
    strengths: [
      metrics.tasksCompleted >= 70 ? 'Consistent completion of assigned work.' : 'Maintained measurable work activity during the appraisal period.',
      metrics.okrImpactScore >= 70 ? 'Strong contribution to approved OKR outcomes.' : 'Has tracked OKR contribution data available for focused review.'
    ],
    areasForImprovement: [
      metrics.deadlinesMet < 70 ? 'Improve deadline reliability and escalation timing.' : 'Continue improving delivery predictability.',
      metrics.okrImpactScore < 70 ? 'Increase completion and approval rate for assigned key results.' : 'Sustain OKR execution quality across future periods.',
      ...(metrics.deadlineShifts && metrics.deadlineShifts.length > 0
        ? [`Minimize deadline shifts (recorded ${metrics.deadlineShifts.length} deadline shift(s) during this period).`]
        : [])
    ],
    skillsCapabilityInsights: [
      purposes.includes('Skills Gap Analysis')
        ? 'Review capability gaps against the OKRs with lower achievement or incomplete quantitative data.'
        : 'Capability signal is strongest where approved key results have clear targets and actual values.'
    ],
    recommendations: [
      purposes.includes('Promotion')
        ? `Promotion readiness should be reviewed against the ${metrics.overallRating} verdict and evidence from approved key results.`
        : `Use the ${metrics.overallRating} verdict as decision support alongside manager review.`,
      purposes.includes('Salary Review')
        ? 'Consider salary decisions alongside role expectations, market bands, and sustained performance beyond this period.'
        : 'Confirm qualitative context with the manager before final decisions.'
    ],
    finalRating: metrics.overallRating,
    nextSteps: [
      'Review the OKR breakdown with the manager and subject.',
      'Set measurable follow-up goals for the next appraisal period.',
      'Document any calibration decisions before communicating outcomes.'
    ]
  };
};

const parseOpenAIReport = (value: unknown): ReportSections | null => {
  if (!value || typeof value !== 'object') return null;
  const report = value as Partial<ReportSections>;
  if (!report.header || typeof report.overviewSummary !== 'string' || !Array.isArray(report.recommendations)) {
    return null;
  }
  return report as ReportSections;
};

const generateSectionsWithOpenAI = async (input: {
  subject: Subject;
  from: Date;
  to: Date;
  purposes: string[];
  customFocus?: string | null;
  metrics: Awaited<ReturnType<typeof buildOkrImpact>>;
}): Promise<{ sections: ReportSections; aiMetadata: Record<string, any>; fallbackReason: string | null }> => {
  const fallback = (reason: string) => ({
    sections: buildFallbackSections(input),
    aiMetadata: {
      provider: 'openai',
      model: process.env.OPENAI_MODEL || null,
      status: 'FALLBACK',
      reason
    },
    fallbackReason: reason
  });

  if (!process.env.OPENAI_API_KEY) {
    return fallback('OPENAI_API_KEY is not configured');
  }

  const model = process.env.OPENAI_MODEL;
  if (!model) {
    return fallback('OPENAI_MODEL is not configured');
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
    timeout: Number(process.env.OPENAI_TIMEOUT_MS || 30000)
  });
  const systemPrompt = getAppraisalSystemPrompt(input.subject.type);

  try {
    if ((process.env.OPENAI_BASE_URL || '').includes('deepseek')) {
      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: JSON.stringify({
              instruction: 'Return valid JSON matching the appraisal_report schema.',
              schema: appraisalReportSchema,
              payload: buildAppraisalPromptPayload({
                subjectType: input.subject.type,
                subject: input.subject,
                appraisalPeriod: periodLabel(input.from, input.to),
                purposes: input.purposes,
                customFocus: input.customFocus || null,
                deterministicMetrics: input.metrics
              })
            })
          }
        ],
        response_format: { type: 'json_object' }
      } as any);

      const content = completion.choices[0]?.message?.content;
      const parsed = content ? JSON.parse(content) : null;
      const sections = parseOpenAIReport(parsed);
      if (!sections) {
        return fallback('DeepSeek returned an invalid appraisal report structure');
      }

      return {
        sections,
        aiMetadata: {
          provider: 'deepseek',
          baseURL: process.env.OPENAI_BASE_URL,
          model,
          status: 'GENERATED',
          responseId: completion.id || null
        },
        fallbackReason: null
      };
    }

    const response = await client.responses.create({
      model,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: systemPrompt
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify(buildAppraisalPromptPayload({
                subjectType: input.subject.type,
                subject: input.subject,
                appraisalPeriod: periodLabel(input.from, input.to),
                purposes: input.purposes,
                customFocus: input.customFocus || null,
                deterministicMetrics: input.metrics
              }))
            }
          ]
        }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'appraisal_report',
          strict: true,
          schema: appraisalReportSchema
        }
      }
    } as any);

    const outputText = (response as any).output_text;
    const parsed = outputText ? JSON.parse(outputText) : null;
    const sections = parseOpenAIReport(parsed);
    if (!sections) {
      return fallback('OpenAI returned an invalid appraisal report structure');
    }

    return {
      sections,
      aiMetadata: {
        provider: 'openai',
        model,
        status: 'GENERATED',
        responseId: (response as any).id || null
      },
      fallbackReason: null
    };
  } catch (error: any) {
    return fallback(error?.message || 'OpenAI generation failed');
  }
};

const buildSummaryText = (sections: ReportSections) => [
  sections.overviewSummary,
  '',
  `Strengths: ${sections.strengths.join('; ')}`,
  `Areas for improvement: ${sections.areasForImprovement.join('; ')}`,
  `Recommendations: ${sections.recommendations.join('; ')}`,
  `Final Rating: ${sections.finalRating}`
].join('\n');

export const generateAppraisalBatch = async (params: {
  organizationId: string;
  createdByUserId: string;
  scope?: string;
  subjectIds?: string[];
  outputFormat?: string;
  periodStart?: string;
  periodEnd?: string;
  purposes?: unknown;
  customFocus?: string | null;
  selectedOkrIds?: string[];
}) => {
  const scope = normalizeScope(params.scope);
  const outputFormat = normalizeOutputFormat(params.outputFormat);
  const { from, to } = parseDateRange(params.periodStart, params.periodEnd);
  const purposes = normalizePurposes(params.purposes);
  const subjects = await resolveSubjects(params.organizationId, scope, params.subjectIds || []);
  const overlappingOkrs = await fetchOverlappingOkrs(params.organizationId, from, to);
  const eligibleOkrs = overlappingOkrs.filter((okr) => subjects.some((subject) => okrMatchesSubject(okr, subject)));
  const eligibleIds = new Set(eligibleOkrs.map((okr) => okr.id));
  const selectedOkrIds = (params.selectedOkrIds && params.selectedOkrIds.length > 0)
    ? Array.from(new Set(params.selectedOkrIds)).filter((id) => eligibleIds.has(id))
    : Array.from(eligibleIds);

  const selectedOkrs = eligibleOkrs.filter((okr) => selectedOkrIds.includes(okr.id));
  const setupSummary = buildSetupSummary(subjects, from, to, selectedOkrs, purposes, params.customFocus);
  const cycle = buildCycle(from, to);

  const batch = await prisma.appraisalBatch.create({
    data: {
      organizationId: params.organizationId,
      createdByUserId: params.createdByUserId,
      scope,
      outputFormat,
      periodStart: from,
      periodEnd: to,
      purposes,
      customFocus: params.customFocus?.trim() || null,
      selectedSubjects: subjects.map((subject) => ({
        type: subject.type,
        id: subject.id,
        name: subject.name,
        role: subject.role || null,
        teamId: subject.teamId || null,
        teamName: subject.teamName || null
      })),
      selectedOkrIds,
      setupSummary,
      status: 'GENERATED'
    } as any
  });

  const createdReports = [];
  for (const subject of subjects) {
    const metrics = await buildOkrImpact({
      organizationId: params.organizationId,
      subject,
      from,
      to,
      selectedOkrIds
    });
    const { sections, aiMetadata, fallbackReason } = await generateSectionsWithOpenAI({
      subject,
      from,
      to,
      purposes,
      customFocus: params.customFocus,
      metrics
    });

    const report = await prisma.appraisal.create({
      data: {
        organizationId: params.organizationId,
        batchId: batch.id,
        subjectType: subject.type,
        subjectUserId: subject.type === 'INDIVIDUAL' ? subject.id : null,
        subjectTeamId: subject.type === 'TEAM' ? subject.id : null,
        subjectName: subject.name,
        createdByUserId: params.createdByUserId,
        cycle,
        summary: buildSummaryText(sections),
        periodStart: from,
        periodEnd: to,
        purposes,
        customFocus: params.customFocus?.trim() || null,
        tasksCompleted: metrics.tasksCompleted,
        deadlinesMet: metrics.deadlinesMet,
        okrContribution: metrics.okrContribution,
        okrImpactScore: metrics.okrImpactScore,
        okrImpactSummary: metrics.okrImpactSummary as any,
        scoreBreakdown: metrics.scoreBreakdown as any,
        reportSections: sections as any,
        selectedOkrSnapshot: selectedOkrs.map((okr) => ({
          id: okr.id,
          title: okr.title,
          periodStart: okr.periodStart,
          periodEnd: okr.periodEnd,
          status: okr.status
        })) as any,
        aiMetadata: aiMetadata as any,
        fallbackReason,
        overallRating: sections.finalRating || metrics.overallRating,
        status: 'GENERATED'
      } as any
    });
    createdReports.push(report);
  }

  return prisma.appraisalBatch.findUnique({
    where: { id: batch.id },
    include: {
      appraisals: {
        include: {
          subjectUser: { select: { id: true, name: true, email: true } }
        },
        orderBy: { createdAt: 'asc' }
      }
    }
  });
};

export const listAppraisalReports = async (organizationId: string) => {
  const reports = await prisma.appraisal.findMany({
    where: { organizationId },
    include: {
      batch: true,
      subjectUser: { select: { id: true, name: true, email: true } },
      createdByUser: { select: { id: true, name: true, email: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  const userIds = reports.map((report) => report.subjectUserId).filter((id): id is string => Boolean(id));
  const memberships = userIds.length > 0
    ? await prisma.organizationMember.findMany({
      where: { organizationId, userId: { in: userIds } },
      include: { primaryTeam: { select: { id: true, name: true } } }
    })
    : [];
  const teamByUserId = new Map(memberships.map((membership) => [membership.userId, membership.primaryTeam]));

  return reports.map((report) => ({
    ...report,
    subjectUser: report.subjectUser ? {
      ...report.subjectUser,
      team: teamByUserId.get(report.subjectUserId || '') || null
    } : null
  }));
};

const writeLine = (doc: PDFKit.PDFDocument, text: string, options: PDFKit.Mixins.TextOptions = {}) => {
  doc.text(text || 'N/A', { ...options });
};

const writeList = (doc: PDFKit.PDFDocument, items: string[]) => {
  if (!items || items.length === 0) {
    doc.text('No items recorded.');
    return;
  }
  for (const item of items) {
    doc.text(`- ${item}`, { indent: 12 });
  }
};

const formatDisplayDate = (value?: string | Date | null) => {
  if (!value) return 'No data recorded';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'No data recorded';
  return date
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .replace(/ /g, ' ');
};

const formatMetricNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') return 'No data recorded';
  const numeric = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(numeric)) return String(value);
  return Number.isInteger(numeric) ? `${numeric}` : `${Math.round(numeric * 100) / 100}`;
};

const formatPercent = (value: unknown) => {
  if (value === null || value === undefined || value === '') return 'No data recorded';
  const numeric = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(numeric)) return String(value);
  return `${Math.round(numeric * 100) / 100}%`;
};

const drawTemplatePageFrame = (doc: PDFKit.PDFDocument, pageNumber: number, footerLabel: string) => {
  const width = doc.page.width;
  const height = doc.page.height;
  doc.save();
  doc.lineWidth(2).strokeColor('#2F73B5').moveTo(52, 30).lineTo(width - 52, 30).stroke();

  // Temporarily disable the bottom margin for writing the footer text to prevent triggering autoPageBreak.
  const oldBottomMargin = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;

  doc.font('Helvetica').fontSize(9).fillColor('#B2BCC8').text(footerLabel, 52, height - 36, { width: 240 });
  doc.text(`Page ${pageNumber}`, width - 100, height - 36, { width: 48, align: 'right' });

  // Restore the original bottom margin.
  doc.page.margins.bottom = oldBottomMargin;

  doc.restore();
};

const drawStaffPageFrame = (doc: PDFKit.PDFDocument, pageNumber: number) =>
  drawTemplatePageFrame(doc, pageNumber, 'Apraizal | Confidential');

const drawTeamPageFrame = (doc: PDFKit.PDFDocument, pageNumber: number) =>
  drawTemplatePageFrame(doc, pageNumber, 'Apraizal | Confidential | Team Appraisal');

const drawSectionBar = (doc: PDFKit.PDFDocument, y: number, title: string) => {
  doc.save();
  doc.rect(52, y, doc.page.width - 104, 28).fill('#2F73B5');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(11).text(title, 64, y + 8);
  doc.restore();
};

const drawStaffInfoField = (
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number
) => {
  doc.save();
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#1F6FB6').text(label, x, y, { width });
  doc.font('Helvetica').fontSize(9).fillColor('#9AA9BC').text(value || 'No data recorded', x + 130, y, {
    width: Math.max(0, width - 130)
  });
  doc.restore();
};

const drawStaffSummaryBox = (
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string
) => {
  doc.save();
  doc.rect(x, y, width, 34).fill('#CFE5F7');
  doc.rect(x, y + 34, width, 36).fillAndStroke('#F8FBFE', '#B9C5D2');
  doc.fillColor('#1F6FB6').font('Helvetica-Bold').fontSize(8).text(label, x + 12, y + 11, { width: width - 24, align: 'center' });
  doc.fillColor('#9AA9BC').font('Helvetica').fontSize(8).text(value || 'No data recorded', x + 10, y + 47, {
    width: width - 20,
    align: 'left'
  });
  doc.restore();
};

const drawStaffRecommendationsTable = (
  doc: PDFKit.PDFDocument,
  rows: Array<{ label: string; value: string }>
) => {
  const startX = 52;
  const labelWidth = 170;
  const valueWidth = doc.page.width - 104 - labelWidth;
  let y = 130;

  rows.forEach((row) => {
    const valueHeight = Math.max(34, doc.heightOfString(row.value, { width: valueWidth - 16, align: 'left' }) + 16);
    doc.save();
    doc.rect(startX, y, labelWidth, valueHeight).fillAndStroke('#FFFFFF', '#C4CDD7');
    doc.rect(startX + labelWidth, y, valueWidth, valueHeight).fillAndStroke('#FFFFFF', '#C4CDD7');
    doc.fillColor('#1F6FB6').font('Helvetica-Bold').fontSize(9).text(row.label, startX + 10, y + 12, { width: labelWidth - 20 });
    doc.fillColor('#7B8CA1').font('Helvetica').fontSize(9).text(row.value, startX + labelWidth + 10, y + 12, {
      width: valueWidth - 20
    });
    doc.restore();
    y += valueHeight;
  });
};

const buildStaffRecommendationRows = (report: any, sections: ReportSections) => {
  const recommendations = sections.recommendations || [];
  const nextSteps = sections.nextSteps || [];
  const skills = sections.skillsCapabilityInsights || [];
  const areas = sections.areasForImprovement || [];
  const purposes = Array.isArray(report.purposes) ? report.purposes.map(String) : [];
  const finalRating = sections.finalRating || report.overallRating || 'No data recorded';

  return [
    {
      label: '1. Manager Action',
      value: recommendations[0] || nextSteps[0] || 'No data recorded. Manager review required.'
    },
    {
      label: '2. OKR / Execution Focus',
      value: recommendations[1] || areas[0] || 'No data recorded. Review execution gaps and blockers.'
    },
    {
      label: '3. Development / Training',
      value: recommendations[2] || skills[0] || 'No data recorded. Identify development priorities with the manager.'
    },
    {
      label: '4. Milestone & Check-in Plan',
      value: nextSteps[0] || nextSteps[1] || recommendations[3] || 'No data recorded. Set follow-up milestones and check-in dates.'
    },
    {
      label: '5. Promotion / Salary Readiness',
      value:
        recommendations[4] ||
        (purposes.some((purpose: string) => ['Promotion', 'Salary Review'].includes(purpose))
          ? `Use ${finalRating} as decision support only and confirm with manager review.`
          : `No data recorded. Use ${finalRating} as manager decision support.`)
    }
  ];
};

const buildTeamRecommendationRows = (report: any, sections: ReportSections) => {
  const recommendations = sections.recommendations || [];
  const nextSteps = sections.nextSteps || [];
  const skills = sections.skillsCapabilityInsights || [];
  const areas = sections.areasForImprovement || [];
  const all = [...recommendations, ...nextSteps, ...skills, ...areas].filter(Boolean);

  const leadRows = [
    {
      label: '1. OKR & Execution Focus',
      value: all[0] || 'No data recorded. Team lead should review OKR execution priorities.'
    },
    {
      label: '2. Milestone & Check-in Plan',
      value: all[1] || 'No data recorded. Define a check-in cadence and milestone tracking plan.'
    },
    {
      label: '3. Team Development',
      value: all[2] || 'No data recorded. Review capability and process improvement opportunities.'
    }
  ];

  const leadershipRows = all.slice(3).map((value, index) => ({
    label: `${index + 1}. Leadership / HR Review`,
    value
  }));

  return { leadRows, leadershipRows };
};

const drawStaffReportToPdf = (doc: PDFKit.PDFDocument, report: any, isFirst: boolean) => {
  if (!isFirst) doc.addPage();
  const sections = (report.reportSections || {}) as ReportSections;
  const header = sections.header || {};
  const scoreBreakdown = (report.scoreBreakdown || {}) as Record<string, any>;
  const okrImpactSummary = (report.okrImpactSummary || {}) as Record<string, any>;
  const okrRows = Array.isArray(okrImpactSummary.okrs) ? okrImpactSummary.okrs : [];
  const pageWidth = doc.page.width;
  const contentWidth = pageWidth - 104;

  drawStaffPageFrame(doc, doc.bufferedPageRange().count);

  doc.save();
  doc.rect(52, 54, contentWidth, 86).fill('#132434');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(24).text('Staff Impact', 82, 92);
  doc.font('Helvetica').fontSize(24).text('Appraisal Report', 232, 92);
  doc.circle(pageWidth - 80, 100, 30).lineWidth(14).strokeColor('#2F7CC1').stroke();
  doc.fillColor('#2F73B5').font('Helvetica-Bold').fontSize(14).text('SCORE', pageWidth - 104, 86, { width: 48, align: 'center' });
  doc.font('Helvetica').fontSize(9).text(
    `${formatMetricNumber(scoreBreakdown.performanceScore || report.okrImpactScore || 'No data recorded')}`,
    pageWidth - 104,
    108,
    { width: 48, align: 'center' }
  );
  doc.rect(52, 140, contentWidth, 34).fill('#3A88C0');
  doc.fillColor('#E8F3FB').font('Helvetica').fontSize(9).text(
    `Purpose: ${header.purpose || 'Performance Review'}`,
    70,
    151,
    { width: 270 }
  );
  doc.text(`Generated: ${formatDisplayDate(report.createdAt)}`, pageWidth - 260, 151, {
    width: 180,
    align: 'right'
  });
  doc.restore();

  drawStaffInfoField(doc, 'EMPLOYEE / UNIT NAME', header.name || report.subjectName || report.subjectUser?.name || 'No data recorded', 54, 204, 250);
  drawStaffInfoField(doc, 'TEAM', header.team || report.subjectUser?.team?.name || 'No data recorded', 342, 204, 200);
  drawStaffInfoField(doc, 'TEAM LEAD / MANAGER', report.createdByUser?.name || report.createdByUser?.email || 'No data recorded', 54, 242, 250);
  drawStaffInfoField(doc, 'APPRAISAL PERIOD', header.appraisalPeriod || report.cycle || 'No data recorded', 342, 242, 200);

  const boxY = 286;
  const boxWidth = contentWidth / 4;
  drawStaffSummaryBox(doc, 52, boxY, boxWidth, 'OVERALL SCORE', `${formatMetricNumber(scoreBreakdown.performanceScore)} / 100`);
  drawStaffSummaryBox(doc, 52 + boxWidth, boxY, boxWidth, 'RATING / VERDICT', sections.finalRating || report.overallRating || 'No data recorded');
  const completedCount = scoreBreakdown.completedTaskCount ?? 'No data recorded';
  const allCount = scoreBreakdown.allTaskCount ?? 'No data recorded';
  const tasksCompletedPct = scoreBreakdown.tasksCompleted ?? report.tasksCompleted;
  drawStaffSummaryBox(
    doc,
    52 + boxWidth * 2,
    boxY,
    boxWidth,
    'TASKS COMPLETED',
    completedCount === 'No data recorded' || allCount === 'No data recorded'
      ? formatPercent(tasksCompletedPct)
      : `${completedCount} of ${allCount} (${formatPercent(tasksCompletedPct)})`
  );
  drawStaffSummaryBox(doc, 52 + boxWidth * 3, boxY, boxWidth, 'DEADLINES MET', formatPercent(scoreBreakdown.deadlinesMet ?? report.deadlinesMet));

  drawSectionBar(doc, 380, '01 | EXECUTIVE SUMMARY');
  doc.fillColor('#3D454F').font('Helvetica').fontSize(10).text(
    sections.overviewSummary || report.summary || 'No data recorded.',
    64,
    416,
    { width: contentWidth - 24, lineGap: 3 }
  );

  drawSectionBar(doc, 490, '02 | OKR vs ACHIEVEMENT');
  doc.fillColor('#3D454F').font('Helvetica').fontSize(9).text(
    'Each objective is listed below with its key results, assigned owners, target values, actual achievement, and status.',
    64,
    527,
    { width: contentWidth - 24, lineGap: 2 }
  );
  doc.text('The AI populates these rows from verified OKR data only.', 64, 546, { width: contentWidth - 24 });

  const startX = 52;
  const columns = [232, 84, 66, 66, 104];
  const columnLabels = ['OBJECTIVE / KEY RESULT', 'OWNER', 'TARGET', 'ACHIEVED', 'STATUS'];
  let y = 572;
  doc.save();
  let x = startX;
  columnLabels.forEach((label, index) => {
    doc.rect(x, y, columns[index], 30).fillAndStroke('#2F73B5', '#FFFFFF');
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8).text(label, x + 8, y + 10, {
      width: columns[index] - 16,
      align: 'center'
    });
    x += columns[index];
  });
  doc.restore();
  y += 30;

  const ensureSpaceForRow = (rowHeight: number) => {
    if (y + rowHeight <= doc.page.height - 64) return;
    doc.addPage();
    drawStaffPageFrame(doc, doc.bufferedPageRange().count);
    drawSectionBar(doc, 54, '02 | OKR vs ACHIEVEMENT');
    let headerX = startX;
    doc.save();
    columnLabels.forEach((label, index) => {
      doc.rect(headerX, 102, columns[index], 30).fillAndStroke('#2F73B5', '#FFFFFF');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8).text(label, headerX + 8, 112, {
        width: columns[index] - 16,
        align: 'center'
      });
      headerX += columns[index];
    });
    doc.restore();
    y = 132;
  };

  const writeTableRow = (values: string[], fill: string, bold = false) => {
    const rowHeight = Math.max(
      28,
      ...values.map((value, index) =>
        doc.heightOfString(value, { width: columns[index] - 16, align: 'left' }) + 12
      )
    );
    ensureSpaceForRow(rowHeight);
    let rowX = startX;
    doc.save();
    values.forEach((value, index) => {
      doc.rect(rowX, y, columns[index], rowHeight).fillAndStroke(fill, '#C4CDD7');
      doc.fillColor(fill === '#2F73B5' ? '#FFFFFF' : '#9AA9BC')
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(8)
        .text(value, rowX + 8, y + 8, { width: columns[index] - 16 });
      rowX += columns[index];
    });
    doc.restore();
    y += rowHeight;
  };

  if (okrRows.length === 0) {
    writeTableRow(
      ['No data recorded', 'No data recorded', 'No data recorded', 'No data recorded', 'Manager review required'],
      '#FFFFFF'
    );
  } else {
    okrRows.forEach((okr: any) => {
      writeTableRow(
        [
          `Objective: ${okr.okrTitle || 'No data recorded'}`,
          '-',
          formatMetricNumber(okr.targetValueTotal ?? okr.objectiveTargetValue),
          okr.achievedPct === null || okr.achievedPct === undefined ? 'No data recorded' : formatPercent(okr.achievedPct),
          okr.status || 'No data recorded'
        ],
        '#D9ECFA',
        true
      );

      const keyResults = Array.isArray(okr.keyResults) ? okr.keyResults : [];
      if (keyResults.length === 0) {
        writeTableRow(['No key results recorded', 'No data recorded', 'No data recorded', 'No data recorded', 'No data recorded'], '#FFFFFF');
      } else {
        keyResults.forEach((kr: any) => {
          writeTableRow(
            [
              `KR: ${kr.krTitle || 'No data recorded'}`,
              kr.assignedUserName || kr.assignedUserEmail || 'No data recorded',
              kr.targetValue === null || kr.targetValue === undefined
                ? 'No data recorded'
                : `${formatMetricNumber(kr.targetValue)}${kr.metricUnit ? ` ${kr.metricUnit}` : ''}`,
              kr.achievedPct === null || kr.achievedPct === undefined
                ? `${formatMetricNumber(kr.actualValue)}`
                : `${formatMetricNumber(kr.actualValue)} (${formatPercent(kr.achievedPct)})`,
              kr.approvalStatus || 'No data recorded'
            ],
            '#FFFFFF'
          );
        });
      }
    });
  }

  doc.addPage();
  drawStaffPageFrame(doc, doc.bufferedPageRange().count);
  drawSectionBar(doc, 54, '03 | RECOMMENDATIONS & NEXT STEPS');
  doc.fillColor('#3D454F').font('Helvetica').fontSize(10).text(
    'The AI will generate evidence-based recommendations calibrated to the appraisal purpose. These are decision-support inputs and require manager review.',
    64,
    88,
    { width: contentWidth - 24, lineGap: 3 }
  );
  drawStaffRecommendationsTable(doc, buildStaffRecommendationRows(report, sections));
};

const drawTeamInfoField = (
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number
) => {
  doc.save();
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#1F6FB6').text(label, x, y, { width });
  doc.font('Helvetica').fontSize(9).fillColor('#9AA9BC').text(value || 'No data recorded', x + 150, y, {
    width: Math.max(0, width - 150)
  });
  doc.restore();
};

const drawTeamRecommendationsTable = (
  doc: PDFKit.PDFDocument,
  y: number,
  title: string,
  rows: Array<{ label: string; value: string }>
) => {
  if (rows.length === 0) return y;

  doc.fillColor('#1F6FB6').font('Helvetica-Bold').fontSize(10).text(title, 64, y);
  y += 20;

  const startX = 52;
  const labelWidth = 170;
  const valueWidth = doc.page.width - 104 - labelWidth;

  rows.forEach((row) => {
    const valueHeight = Math.max(34, doc.heightOfString(row.value, { width: valueWidth - 16 }) + 16);
    doc.save();
    doc.rect(startX, y, labelWidth, valueHeight).fillAndStroke('#FFFFFF', '#C4CDD7');
    doc.rect(startX + labelWidth, y, valueWidth, valueHeight).fillAndStroke('#FFFFFF', '#C4CDD7');
    doc.fillColor('#1F6FB6').font('Helvetica-Bold').fontSize(9).text(row.label, startX + 10, y + 11, { width: labelWidth - 20 });
    doc.fillColor('#9AA9BC').font('Helvetica').fontSize(9).text(row.value, startX + labelWidth + 10, y + 11, {
      width: valueWidth - 20
    });
    doc.restore();
    y += valueHeight;
  });

  return y;
};

const drawTeamReportToPdf = (doc: PDFKit.PDFDocument, report: any, isFirst: boolean) => {
  if (!isFirst) doc.addPage();
  const sections = (report.reportSections || {}) as ReportSections;
  const header = sections.header || {};
  const scoreBreakdown = (report.scoreBreakdown || {}) as Record<string, any>;
  const okrImpactSummary = (report.okrImpactSummary || {}) as Record<string, any>;
  const okrRows = Array.isArray(okrImpactSummary.okrs) ? okrImpactSummary.okrs : [];
  const pageWidth = doc.page.width;
  const contentWidth = pageWidth - 104;

  drawTeamPageFrame(doc, doc.bufferedPageRange().count);

  doc.save();
  doc.rect(52, 54, contentWidth, 86).fill('#132434');
  doc.fillColor('#FFFFFF').font('Helvetica').fontSize(24).text('Team ', 82, 92);
  doc.font('Helvetica-Bold').text('Impact', 137, 92);
  doc.font('Helvetica').text(' Appraisal Report', 222, 92);
  doc.circle(pageWidth - 80, 100, 30).lineWidth(14).strokeColor('#2F7CC1').stroke();
  doc.fillColor('#2F73B5').font('Helvetica-Bold').fontSize(14).text('SCORE', pageWidth - 104, 86, { width: 48, align: 'center' });
  doc.font('Helvetica').fontSize(9).text(
    `${formatMetricNumber(scoreBreakdown.performanceScore || report.okrImpactScore || 'No data recorded')}`,
    pageWidth - 104,
    108,
    { width: 48, align: 'center' }
  );
  doc.rect(52, 140, contentWidth, 40).fill('#3A88C0');
  doc.fillColor('#E8F3FB').font('Helvetica').fontSize(9).text(
    `Purpose: ${header.purpose || 'Performance Review'}`,
    70,
    150,
    { width: 300 }
  );
  doc.text(`Generated: ${formatDisplayDate(report.createdAt)}`, pageWidth - 260, 156, {
    width: 180,
    align: 'right'
  });
  doc.restore();

  drawTeamInfoField(doc, 'TEAM / UNIT NAME', header.name || report.subjectName || 'No data recorded', 54, 214, 460);
  drawTeamInfoField(doc, 'TEAM LEAD / MANAGER', report.createdByUser?.name || report.createdByUser?.email || 'No data recorded', 54, 252, 290);
  drawTeamInfoField(doc, 'APPRAISAL PERIOD', header.appraisalPeriod || report.cycle || 'No data recorded', 314, 252, 230);

  const boxY = 292;
  const boxWidth = contentWidth / 4;
  drawStaffSummaryBox(doc, 52, boxY, boxWidth, 'OVERALL SCORE', `${formatMetricNumber(scoreBreakdown.performanceScore)} / 100`);
  drawStaffSummaryBox(doc, 52 + boxWidth, boxY, boxWidth, 'RATING / VERDICT', sections.finalRating || report.overallRating || 'No data recorded');
  const completedCount = scoreBreakdown.completedTaskCount ?? 'No data recorded';
  const allCount = scoreBreakdown.allTaskCount ?? 'No data recorded';
  const tasksCompletedPct = scoreBreakdown.tasksCompleted ?? report.tasksCompleted;
  drawStaffSummaryBox(
    doc,
    52 + boxWidth * 2,
    boxY,
    boxWidth,
    'TASKS COMPLETED',
    completedCount === 'No data recorded' || allCount === 'No data recorded'
      ? formatPercent(tasksCompletedPct)
      : `${completedCount} of ${allCount} (${formatPercent(tasksCompletedPct)})`
  );
  drawStaffSummaryBox(doc, 52 + boxWidth * 3, boxY, boxWidth, 'DEADLINES MET', formatPercent(scoreBreakdown.deadlinesMet ?? report.deadlinesMet));

  drawSectionBar(doc, 382, '01 | EXECUTIVE SUMMARY');
  doc.fillColor('#3D454F').font('Helvetica').fontSize(10).text(
    sections.overviewSummary || report.summary || 'No data recorded.',
    64,
    420,
    { width: contentWidth - 24, lineGap: 3 }
  );

  drawSectionBar(doc, 490, '02 | OKR vs ACHIEVEMENT');
  doc.fillColor('#3D454F').font('Helvetica').fontSize(9).text(
    "Each objective is listed with its key results, ownership (team-level by default; member or sub-team where data explicitly supports it), targets, achievement, and status. Fields with no data are marked 'No data recorded' and flagged for team lead attention.",
    64,
    527,
    { width: contentWidth - 24, lineGap: 2 }
  );

  const startX = 52;
  const columns = [148, 70, 58, 50, 58, 126];
  const labels = ['OBJECTIVE / KEY RESULT', 'OWNER\n(Team /\nMember)', 'TARGET', 'ACHIEVE\nD', 'STATUS', 'ASSESSMENT'];
  let y = 584;

  const drawHeaderRow = (headerY: number) => {
    let x = startX;
    doc.save();
    labels.forEach((label, index) => {
      doc.rect(x, headerY, columns[index], 44).fillAndStroke('#2F73B5', '#FFFFFF');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8).text(label, x + 6, headerY + 11, {
        width: columns[index] - 12,
        align: 'center'
      });
      x += columns[index];
    });
    doc.restore();
  };

  drawHeaderRow(y);
  y += 44;

  const ensureRowSpace = (rowHeight: number) => {
    if (y + rowHeight <= doc.page.height - 64) return;
    doc.addPage();
    drawTeamPageFrame(doc, doc.bufferedPageRange().count);
    drawHeaderRow(52);
    y = 96;
  };

  const writeTeamRow = (values: string[], fill: string, bold = false) => {
    const rowHeight = Math.max(
      32,
      ...values.map((value, index) =>
        doc.heightOfString(value, { width: columns[index] - 14 }) + 14
      )
    );
    ensureRowSpace(rowHeight);
    let x = startX;
    doc.save();
    values.forEach((value, index) => {
      doc.rect(x, y, columns[index], rowHeight).fillAndStroke(fill, '#C4CDD7');
      doc.fillColor(fill === '#2F73B5' ? '#FFFFFF' : '#9AA9BC')
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(8)
        .text(value, x + 6, y + 9, { width: columns[index] - 12 });
      x += columns[index];
    });
    doc.restore();
    y += rowHeight;
  };

  if (okrRows.length === 0) {
    writeTeamRow(
      ['No data recorded', 'No data recorded', 'No data recorded', 'No data recorded', 'No data recorded', 'Manager review required'],
      '#FFFFFF'
    );
  } else {
    okrRows.forEach((okr: any) => {
      writeTeamRow(
        [
          `Objective: ${okr.okrTitle || 'No data recorded'}`,
          '-',
          formatMetricNumber(okr.targetValueTotal ?? okr.objectiveTargetValue),
          okr.achievedPct === null || okr.achievedPct === undefined ? 'No data recorded' : formatPercent(okr.achievedPct),
          okr.status || 'No data recorded',
          okr.achievedPct === null || okr.achievedPct === undefined
            ? 'No data recorded. Flag for team lead attention.'
            : `Achievement and delivery patterns indicate ${Math.round(okr.achievedPct)}% objective execution.`
        ],
        '#D9ECFA',
        true
      );

      const keyResults = Array.isArray(okr.keyResults) ? okr.keyResults : [];
      if (keyResults.length === 0) {
        writeTeamRow(['No key results recorded', 'No data recorded', 'No data recorded', 'No data recorded', 'No data recorded', ''], '#FFFFFF');
      } else {
        keyResults.forEach((kr: any) => {
          writeTeamRow(
            [
              `KR: ${kr.krTitle || 'No data recorded'}`,
              kr.assignedUserName || kr.assignedUserEmail || 'Team',
              kr.targetValue === null || kr.targetValue === undefined
                ? 'No data recorded'
                : `${formatMetricNumber(kr.targetValue)}${kr.metricUnit ? ` ${kr.metricUnit}` : ''}`,
              kr.achievedPct === null || kr.achievedPct === undefined
                ? `${formatMetricNumber(kr.actualValue)}`
                : `${formatMetricNumber(kr.actualValue)} (${formatPercent(kr.achievedPct)})`,
              kr.approvalStatus || 'No data recorded',
              ''
            ],
            '#FFFFFF'
          );
        });
      }
    });
  }

  doc.addPage();
  drawTeamPageFrame(doc, doc.bufferedPageRange().count);
  drawSectionBar(doc, 54, '03 | RECOMMENDATIONS & NEXT STEPS');
  doc.fillColor('#3D454F').font('Helvetica').fontSize(10).text(
    'Evidence-based recommendations calibrated to the stated appraisal purpose. Recommendations are decision-support inputs and require team lead or leadership review. Each item is tagged to indicate who should action it.',
    64,
    90,
    { width: contentWidth - 24, lineGap: 3 }
  );

  const { leadRows, leadershipRows } = buildTeamRecommendationRows(report, sections);
  let recommendationsY = drawTeamRecommendationsTable(doc, 148, 'TEAM LEAD ACTIONS', leadRows) + 24;
  if (leadershipRows.length > 0) {
    drawTeamRecommendationsTable(doc, recommendationsY, 'LEADERSHIP / HR ACTIONS', leadershipRows);
  }
};

const writeGenericReportToPdf = (doc: PDFKit.PDFDocument, report: any, isFirst: boolean) => {
  if (!isFirst) doc.addPage();
  const sections = (report.reportSections || {}) as ReportSections;
  const header = sections.header || {};

  doc.fontSize(18).font('Helvetica-Bold').text(header.name || report.subjectName || report.subjectUser?.name || 'Appraisal Report');
  doc.moveDown(0.2);
  doc.fontSize(10).font('Helvetica').fillColor('#475569');
  writeLine(doc, `Role: ${header.role || 'N/A'}`);
  writeLine(doc, `Team: ${header.team || report.subjectUser?.team?.name || 'N/A'}`);
  writeLine(doc, `Period: ${header.appraisalPeriod || report.cycle}`);
  writeLine(doc, `Purpose: ${header.purpose || 'Performance Review'}`);
  doc.fillColor('#111827').moveDown();

  const section = (title: string, body: () => void) => {
    doc.moveDown(0.6);
    doc.fontSize(13).font('Helvetica-Bold').text(title);
    doc.moveDown(0.25);
    doc.fontSize(10).font('Helvetica');
    body();
  };

  section('Overview Summary', () => writeLine(doc, sections.overviewSummary || report.summary));
  section('OKR Performance Breakdown', () => {
    const okrs = sections.okrPerformanceBreakdown || [];
    if (okrs.length === 0) {
      doc.text('No OKR performance details recorded.');
      return;
    }
    okrs.forEach((okr) => {
      doc.font('Helvetica-Bold').text(okr.objective);
      doc.font('Helvetica').text(`Owner: ${okr.owner} | Timeline: ${okr.timeline} | Status: ${okr.status}`);
      writeList(doc, okr.keyResults);
      doc.text(okr.performanceInsight);
      doc.moveDown(0.4);
    });
  });
  section('Strengths', () => writeList(doc, sections.strengths || []));
  section('Areas for Improvement', () => writeList(doc, sections.areasForImprovement || []));
  section('Skills / Capability Insights', () => writeList(doc, sections.skillsCapabilityInsights || []));
  section('Recommendations', () => writeList(doc, sections.recommendations || []));
  section('Final Rating / Verdict', () => writeLine(doc, sections.finalRating || report.overallRating || 'N/A'));
  section('Next Steps', () => writeList(doc, sections.nextSteps || []));

  doc.moveDown();
  doc.fontSize(8).fillColor('#64748b').text('Generated by Apraizal. AI-supported recommendations are decision support and require manager review.');
  doc.fillColor('#111827');
};

const renderReportsPdf = async (reports: any[]) => new Promise<Buffer>((resolve, reject) => {
  const doc = new PDFDocument({ margin: 48, size: 'A4', bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.on('error', reject);
  reports.forEach((report, index) => {
    if (report.subjectType === 'INDIVIDUAL') {
      drawStaffReportToPdf(doc, report, index === 0);
      return;
    }
    if (report.subjectType === 'TEAM') {
      drawTeamReportToPdf(doc, report, index === 0);
      return;
    }
    writeGenericReportToPdf(doc, report, index === 0);
  });
  doc.end();
});

export const exportAppraisalBatchPdf = async (organizationId: string, batchId: string) => {
  const batch = await prisma.appraisalBatch.findFirst({
    where: { id: batchId, organizationId },
    include: {
      appraisals: {
        include: {
          subjectUser: { select: { id: true, name: true, email: true } },
          createdByUser: { select: { id: true, name: true, email: true } }
        },
        orderBy: { createdAt: 'asc' }
      }
    }
  });
  if (!batch) {
    throw new Error('Appraisal batch not found');
  }
  return {
    filename: `appraisal_${batchId}.pdf`,
    buffer: await renderReportsPdf(batch.appraisals)
  };
};

export const exportAppraisalBatchZip = async (organizationId: string, batchId: string) => {
  const batch = await prisma.appraisalBatch.findFirst({
    where: { id: batchId, organizationId },
    include: {
      appraisals: {
        include: {
          subjectUser: { select: { id: true, name: true, email: true } },
          createdByUser: { select: { id: true, name: true, email: true } }
        },
        orderBy: { createdAt: 'asc' }
      }
    }
  });
  if (!batch) {
    throw new Error('Appraisal batch not found');
  }

  const archive = archiver('zip', { zlib: { level: 9 } });
  const chunks: Buffer[] = [];
  archive.on('data', (chunk) => chunks.push(Buffer.from(chunk)));

  const done = new Promise<Buffer>((resolve, reject) => {
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);
  });

  for (const report of batch.appraisals) {
    const pdf = await renderReportsPdf([report]);
    const name = (report.subjectName || report.subjectUser?.name || report.subjectUser?.email || report.id)
      .replace(/[^a-z0-9_-]+/gi, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
    archive.append(pdf, { name: `${name || 'appraisal'}_${report.cycle.replace(/[^a-z0-9_-]+/gi, '_')}.pdf` });
  }
  await archive.finalize();

  return {
    filename: `appraisal_${batchId}.zip`,
    buffer: await done
  };
};
