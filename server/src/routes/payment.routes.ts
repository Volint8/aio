import { Router } from 'express';
import {
  initializePayment,
  verifyPayment,
  verifyPaymentPublic,
  handleWebhook,
} from '../controllers/payment.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// Public routes
router.post('/webhook', handleWebhook);
router.get('/verify/public/:reference', verifyPaymentPublic);

// Protected routes
router.post('/initialize', authenticateToken, initializePayment);
router.get('/verify/:reference', authenticateToken, verifyPayment);

export default router;
