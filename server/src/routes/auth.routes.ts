import { Router } from 'express';
import {
    login,
    signup,
    getMe,
    verifyOtp,
    resendOtp,
    adminSignupInit,
    adminSignupComplete,
    inviteAcceptInit,
    inviteAcceptComplete,
    forgotPasswordInit,
    forgotPasswordComplete,
    changePassword
} from '../controllers/auth.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

router.post('/login', login);
router.post('/signup', signup);
router.post('/admin-signup/init', adminSignupInit);
router.post('/admin-signup/complete', adminSignupComplete);
router.post('/invites/accept/init', inviteAcceptInit);
router.post('/invites/accept/complete', inviteAcceptComplete);
router.post('/verify-otp', verifyOtp);
router.post('/resend-otp', resendOtp);
router.post('/forgot-password/init', forgotPasswordInit);
router.post('/forgot-password/complete', forgotPasswordComplete);
router.post('/change-password', authenticateToken, changePassword);
router.get('/me', authenticateToken, getMe);

export default router;
