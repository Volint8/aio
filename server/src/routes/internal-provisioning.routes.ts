import { Router } from 'express';
import {
    createProvisioningUser,
    deleteProvisioningUser,
    disableProvisioningUser,
    lookupProvisioningUser,
    syncProvisioningUser,
} from '../controllers/internal-provisioning.controller';
import { requireInternalProvisioningKey } from '../middleware/internal-provisioning-auth.middleware';

const router = Router();

router.use(requireInternalProvisioningKey);

router.get('/users/lookup', lookupProvisioningUser);
router.post('/users', createProvisioningUser);
router.patch('/users/:userId', syncProvisioningUser);
router.delete('/users/:userId', deleteProvisioningUser);
router.post('/users/:userId/disable', disableProvisioningUser);

export default router;
