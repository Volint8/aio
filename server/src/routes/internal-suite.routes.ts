import { Router } from 'express';
import { getSuiteSummary } from '../controllers/internal-suite.controller';
import { requireInternalProvisioningKey } from '../middleware/internal-provisioning-auth.middleware';

const router = Router();

router.use(requireInternalProvisioningKey);
router.get('/summary', getSuiteSummary);

export default router;
