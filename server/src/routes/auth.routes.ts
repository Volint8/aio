import { Router } from 'express';
import { login, signup, getMe, verifyOtp } from '../controllers/auth.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

router.post('/login', login);
router.post('/signup', signup);
router.post('/verify-otp', verifyOtp);
router.get('/me', authenticateToken, getMe);

export default router;
