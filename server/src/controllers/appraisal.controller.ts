import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const exportAppraisalCsv = async (req: Request, res: Response) => {
  try {
    const appraisalId = req.params.appraisalId as string;
    const appraisal = await prisma.appraisal.findUnique({
      where: { id: appraisalId },
      include: {
        subjectUser: { select: { name: true, email: true } },
        organization: { select: { name: true } }
      }
    }) as any;

    if (!appraisal) {
      return res.status(404).json({ error: 'Appraisal not found' });
    }

    const header = 'Employee Name,Email,Organization,Cycle,Tasks Completed (%),Deadlines Met (%),OKR Impact Score (%),OKR Contribution,Overall Rating,Status,Created At,OKR Title,Objective Target,KR Title,Assigned User,Contribution Value,Contribution (%),Approval Status,Approved By,Metric Unit,Target,Actual,KR Achieved (%)\n';
    const baseRowPrefix = `"${appraisal.subjectUser.name || ''}","${appraisal.subjectUser.email}","${appraisal.organization.name}","${appraisal.cycle}",${appraisal.tasksCompleted || 0},${appraisal.deadlinesMet || 0},${appraisal.okrImpactScore || 0},"${appraisal.okrContribution || ''}","${appraisal.overallRating || ''}","${appraisal.status}","${appraisal.createdAt.toISOString()}"`;

    const okrImpactSummary = (appraisal.okrImpactSummary || null) as any;
    const rows: string[] = [];

    if (okrImpactSummary?.okrs?.length) {
      for (const okr of okrImpactSummary.okrs) {
        const keyResults = Array.isArray(okr.keyResults) ? okr.keyResults : [];
        if (keyResults.length === 0) {
          rows.push(`${baseRowPrefix},"${okr.okrTitle || ''}","","",,,`);
          continue;
        }

        for (const kr of keyResults) {
          rows.push(
            `${baseRowPrefix},"${okr.okrTitle || ''}",${okr.objectiveTargetValue ?? ''},"${kr.krTitle || ''}","${kr.assignedUserName || kr.assignedUserEmail || ''}",${kr.contributionValue ?? ''},${kr.contributionPct ?? ''},"${kr.approvalStatus || ''}","${kr.approvedByName || ''}","${kr.metricUnit || ''}",${kr.targetValue ?? ''},${kr.actualValue ?? 0},${kr.achievedPct ?? ''}`
          );
        }
      }
    } else {
      rows.push(`${baseRowPrefix},"","","","","","","","","",,,`);
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=appraisal_${appraisal.cycle}_${appraisalId}.csv`);
    return res.status(200).send(header + rows.join('\n') + '\n');
  } catch (error) {
    console.error('Export CSV error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
