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
    resendInviteById,
    deleteInvite,
    removeMember,
    createTeam,
    getTeams,
    updateTeam,
    deleteTeam,
    listClients,
    createClient,
    updateClient,
    deleteClient,
    createTag,
    listTags,
    updateTag,
    deleteTag,
    createOkr,
    listOkrs,
    updateOkr,
    deleteOkr,
    generateAppraisal,
    listAppraisals,
    getAudit,
    bulkInviteMembers,
    listQuotes,
    createQuote,
    deleteQuote
} from '../controllers/org.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import multer from 'multer';

const router = Router();

// Configure multer for file uploads (in-memory storage)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
            'application/vnd.ms-excel', // .xls
            'text/csv' // .csv
        ];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only Excel and CSV files are allowed.'));
        }
    }
});

router.get('/name-suggestions', getOrgNameSuggestions);
router.get('/', authenticateToken, getOrgs);
router.post('/', authenticateToken, createOrg);
router.get('/:id', authenticateToken, getOrgById);
router.post('/:id/members', authenticateToken, addMember);
router.patch('/:id/members/:memberId/role', authenticateToken, updateMemberRole);
router.post('/:id/invites', authenticateToken, createInvite);
router.post('/:id/invites/bulk', authenticateToken, upload.single('file'), bulkInviteMembers);
router.get('/:id/invites', authenticateToken, listInvites);
router.post('/invites/:token/resend', authenticateToken, resendInvite);
router.post('/:id/invites/:inviteId/resend', authenticateToken, resendInviteById);
router.delete('/:id/invites/:inviteId', authenticateToken, deleteInvite);
router.delete('/:id/members/:memberId', authenticateToken, removeMember);
router.post('/:id/teams', authenticateToken, createTeam);
router.get('/:id/teams', authenticateToken, getTeams);
router.patch('/:id/teams/:teamId', authenticateToken, updateTeam);
router.delete('/:id/teams/:teamId', authenticateToken, deleteTeam);

router.get('/:id/clients', authenticateToken, listClients);
router.post('/:id/clients', authenticateToken, createClient);
router.patch('/:id/clients/:clientId', authenticateToken, updateClient);
router.delete('/:id/clients/:clientId', authenticateToken, deleteClient);

router.post('/:id/tags', authenticateToken, createTag);
router.get('/:id/tags', authenticateToken, listTags);
router.patch('/:id/tags/:tagId', authenticateToken, updateTag);
router.delete('/:id/tags/:tagId', authenticateToken, deleteTag);

router.post('/:id/okrs', authenticateToken, createOkr);
router.get('/:id/okrs', authenticateToken, listOkrs);
router.patch('/:id/okrs/:okrId', authenticateToken, updateOkr);
router.delete('/:id/okrs/:okrId', authenticateToken, deleteOkr);

router.post('/:id/appraisals/generate', authenticateToken, generateAppraisal);
router.get('/:id/appraisals', authenticateToken, listAppraisals);
router.get('/:id/audit', authenticateToken, getAudit);

// Quotes
router.get('/:id/quotes', authenticateToken, listQuotes);
router.post('/:id/quotes', authenticateToken, createQuote);
router.delete('/:id/quotes/:quoteId', authenticateToken, deleteQuote);

export default router;
