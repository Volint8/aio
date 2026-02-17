import { Router } from 'express';
import { getTasks, createTask, getTaskById, updateTask, deleteTask, addComment, getStats, uploadAttachment, getMemberStats, deleteComment, deleteAttachment } from '../controllers/task.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { upload } from '../middleware/upload.middleware';

const router = Router();

router.get('/', authenticateToken, getTasks);
router.post('/', authenticateToken, createTask);
router.get('/stats', authenticateToken, getStats);
router.get('/team-stats', authenticateToken, getMemberStats);
router.get('/:id', authenticateToken, getTaskById);
router.put('/:id', authenticateToken, updateTask);
router.delete('/:id', authenticateToken, deleteTask);
router.post('/:id/comments', authenticateToken, addComment);
router.delete('/comments/:commentId', authenticateToken, deleteComment);
router.post('/:id/attachments', authenticateToken, upload.single('file'), uploadAttachment);
router.delete('/attachments/:attachmentId', authenticateToken, deleteAttachment);

export default router;
