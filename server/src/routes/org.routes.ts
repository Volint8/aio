import { Router } from 'express';
import {
    getOrgs,
    createOrg,
    getOrgById,
    addMember,
    updateMemberRole,
    getOrgNameSuggestions,
    createInvite,
    listInvites,
    resendInvite,
    createTeam,
    getTeams,
    updateTeam,
    deleteTeam,
    createTag,
    listTags,
    updateTag,
    createOkr,
    listOkrs,
    updateOkr,
    generateAppraisal,
    listAppraisals,
    getAudit
} from '../controllers/org.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

router.get('/name-suggestions', getOrgNameSuggestions);
router.get('/', authenticateToken, getOrgs);
router.post('/', authenticateToken, createOrg);
router.get('/:id', authenticateToken, getOrgById);
router.post('/:id/members', authenticateToken, addMember);
router.patch('/:id/members/:memberId/role', authenticateToken, updateMemberRole);
router.post('/:id/invites', authenticateToken, createInvite);
router.get('/:id/invites', authenticateToken, listInvites);
router.post('/invites/:token/resend', authenticateToken, resendInvite);
router.post('/:id/teams', authenticateToken, createTeam);
router.get('/:id/teams', authenticateToken, getTeams);
router.patch('/:id/teams/:teamId', authenticateToken, updateTeam);
router.delete('/:id/teams/:teamId', authenticateToken, deleteTeam);

router.post('/:id/tags', authenticateToken, createTag);
router.get('/:id/tags', authenticateToken, listTags);
router.patch('/:id/tags/:tagId', authenticateToken, updateTag);

router.post('/:id/okrs', authenticateToken, createOkr);
router.get('/:id/okrs', authenticateToken, listOkrs);
router.patch('/:id/okrs/:okrId', authenticateToken, updateOkr);

router.post('/:id/appraisals/generate', authenticateToken, generateAppraisal);
router.get('/:id/appraisals', authenticateToken, listAppraisals);
router.get('/:id/audit', authenticateToken, getAudit);

export default router;
