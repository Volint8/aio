import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { sendAlert, getNotifications, markAsRead } from '../controllers/notification.controller';

const router = Router();

router.post('/send-alert', authenticateToken, sendAlert);
router.get('/', authenticateToken, getNotifications);
router.patch('/:notificationId/read', authenticateToken, markAsRead);

export default router;
