import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import '../styles/LoginPage.css';

type Step = 'email' | 'otp';

const ForgotPasswordPage = () => {
    const [step, setStep] = useState<Step>('email');
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);

    const { forgotPasswordInit, forgotPasswordComplete } = useAuth();
    const navigate = useNavigate();

    const handleSendResetCode = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await forgotPasswordInit(email);
            setSuccess('Password reset code sent to your email');
            setStep('otp');
        } catch (err: any) {
            const errorData = err.response?.data?.error;
            const message = typeof errorData === 'object' ? errorData.message : errorData;
            setError(message || err.message || 'Failed to send reset code');
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await forgotPasswordComplete(email, otp, newPassword);
            setSuccess('Password reset successful! Redirecting to dashboard...');
            setTimeout(() => {
                navigate('/dashboard');
            }, 1500);
        } catch (err: any) {
            const errorData = err.response?.data?.error;
            const message = typeof errorData === 'object' ? errorData.message : errorData;
            setError(message || err.message || 'Failed to reset password');
        } finally {
            setLoading(false);
        }
    };

    const handleResendCode = async () => {
        setError('');
        setSuccess('');
        setLoading(true);

        try {
            await forgotPasswordInit(email);
            setSuccess('New reset code sent to your email');
        } catch (err: any) {
            const errorData = err.response?.data?.error;
            const message = typeof errorData === 'object' ? errorData.message : errorData;
            setError(message || err.message || 'Failed to resend code');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-header">
                    <div className="brand-row">
                        <img src="/images/image.png" alt="Apraizal Logo" style={{ height: '48px', marginBottom: '8px' }} />
                    </div>
                    <p className="tagline">Organize <span aria-hidden="true">•</span> Track <span aria-hidden="true">•</span> Appraise</p>
                </div>

                <h2>Reset Your Password</h2>

                {step === 'email' ? (
                    <>
                        <p className="otp-helper-text">
                            Enter your email address and we'll send you a code to reset your password.
                        </p>

                        <form onSubmit={handleSendResetCode}>
                            <div className="form-group">
                                <label>Email</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@company.com"
                                    required
                                />
                            </div>

                            {error && <p className="error-message">{error}</p>}
                            {success && <p className="success-message">{success}</p>}

                            <button type="submit" disabled={loading} className="btn-primary">
                                {loading ? 'Sending...' : 'Send Reset Code'}
                            </button>

                            <button
                                type="button"
                                onClick={() => navigate('/login')}
                                className="btn-secondary"
                                style={{ width: '100%', marginTop: '12px' }}
                            >
                                Back to Sign In
                            </button>
                        </form>
                    </>
                ) : (
                    <>
                        <p className="otp-helper-text">
                            We've sent a 6-digit code to <strong>{email}</strong>.
                            <br />It expires in 15 minutes.
                        </p>

                        <form onSubmit={handleResetPassword}>
                            <div className="form-group">
                                <label>Reset Code</label>
                                <input
                                    type="text"
                                    value={otp}
                                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="123456"
                                    required
                                    maxLength={6}
                                    className="otp-input"
                                    autoFocus
                                />
                            </div>

                            <div className="form-group">
                                <label>New Password</label>
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                    minLength={6}
                                />
                            </div>

                            {error && <p className="error-message">{error}</p>}
                            {success && <p className="success-message">{success}</p>}

                            <button type="submit" disabled={loading} className="btn-primary">
                                {loading ? 'Resetting...' : 'Reset Password'}
                            </button>

                            <button
                                type="button"
                                onClick={handleResendCode}
                                className="btn-secondary"
                                style={{ width: '100%', marginTop: '12px' }}
                                disabled={loading}
                            >
                                Resend Code
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setStep('email');
                                    setEmail('');
                                    setOtp('');
                                    setNewPassword('');
                                    setError('');
                                    setSuccess('');
                                }}
                                className="btn-secondary"
                                style={{ width: '100%', marginTop: '8px' }}
                                disabled={loading}
                            >
                                Use Different Email
                            </button>
                        </form>
                    </>
                )}

                <div className="auth-divider"></div>
                <div className="auth-footer">
                    <p>
                        Remember your password?{' '}
                        <button type="button" className="link-button" onClick={() => navigate('/login')}>
                            Back to Sign In
                        </button>
                    </p>
                    <p style={{ marginTop: '12px', fontSize: '0.9em' }}>
                        Need help? <a href="mailto:Hello@apraizal.com" className="link-button">Contact Support</a>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default ForgotPasswordPage;
