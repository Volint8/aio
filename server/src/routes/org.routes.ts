import { Router } from 'express';
import { getOrgs, createOrg, getOrgById, addMember } from '../controllers/org.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authenticateToken, getOrgs);
router.post('/', authenticateToken, createOrg);
router.get('/:id', authenticateToken, getOrgById);
router.post('/:id/members', authenticateToken, addMember);

export default router;
