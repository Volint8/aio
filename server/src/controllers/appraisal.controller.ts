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

    const csvHeader = 'Employee Name,Email,Organization,Cycle,Tasks Completed (%),Deadlines Met (%),OKR Contribution,Overall Rating,Status,Created At\n';
    const csvData = `"${appraisal.subjectUser.name || ''}","${appraisal.subjectUser.email}","${appraisal.organization.name}","${appraisal.cycle}",${appraisal.tasksCompleted || 0},${appraisal.deadlinesMet || 0},"${appraisal.okrContribution || ''}","${appraisal.overallRating || ''}","${appraisal.status}","${appraisal.createdAt.toISOString()}"\n`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=appraisal_${appraisal.cycle}_${appraisalId}.csv`);
    return res.status(200).send(csvHeader + csvData);
  } catch (error) {
    console.error('Export CSV error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
