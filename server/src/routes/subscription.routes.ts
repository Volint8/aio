import { Router } from 'express';
import {
  getCurrentSubscription,
  cancelSubscription,
  validateUserLimit,
  getPaymentHistory,
} from '../controllers/subscription.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// All routes are protected
router.use(authenticateToken);

router.get('/current', getCurrentSubscription);
router.post('/cancel', cancelSubscription);
router.get('/validate-limit', validateUserLimit);
router.get('/payments', getPaymentHistory);

export default router;
