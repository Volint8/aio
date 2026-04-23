import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { clearReadNotifications, getNotifications, markAllAsRead, markAsRead, sendAlert } from '../controllers/notification.controller';

const router = Router();

router.post('/send-alert', authenticateToken, sendAlert);
router.get('/', authenticateToken, getNotifications);
router.patch('/read-all', authenticateToken, markAllAsRead);
router.delete('/read', authenticateToken, clearReadNotifications);
router.patch('/:notificationId/read', authenticateToken, markAsRead);

export default router;
