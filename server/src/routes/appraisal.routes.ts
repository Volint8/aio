import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { exportAppraisalCsv } from '../controllers/appraisal.controller';

const router = Router();

router.get('/:appraisalId/export', authenticateToken, exportAppraisalCsv);

export default router;
