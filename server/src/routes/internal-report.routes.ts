import { Router } from 'express';
import {
    downloadInternalReport,
    generateInternalReport,
    getInternalReportStatus,
    getInternalReportView,
    listInternalReportSubjects,
} from '../controllers/internal-report.controller';
import { requireInternalProvisioningKey } from '../middleware/internal-provisioning-auth.middleware';

const router = Router();

router.use(requireInternalProvisioningKey);
router.post('/generate', generateInternalReport);
router.get('/status', getInternalReportStatus);
router.get('/subjects', listInternalReportSubjects);
router.get('/view', getInternalReportView);
router.get('/download', downloadInternalReport);

export default router;
