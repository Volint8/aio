import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import '../styles/LoginPage.css'; // Reusing login styles for consistency

const OTPPage = () => {
    const [otp, setOtp] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);
    const { verifyOtp, resendOtp } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    // Get email from router state or local storage
    const email = location.state?.email || localStorage.getItem('pendingAuthEmail');

    useEffect(() => {
        if (!email) {
            navigate('/login');
        }
    }, [email, navigate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setLoading(true);

        try {
            await verifyOtp(email, otp);
            // Clear pending email
            localStorage.removeItem('pendingAuthEmail');
            navigate('/dashboard');
        } catch (err: any) {
            const errorData = err.response?.data?.error;
            const message = typeof errorData === 'object' ? errorData.message : errorData;
            setError(message || err.message || 'Verification failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleResendOtp = async () => {
        setError('');
        setSuccess('');
        setResending(true);

        try {
            await resendOtp(email);
            setSuccess('A new code has been sent to your email!');
        } catch (err: any) {
            const errorData = err.response?.data?.error;
            const message = typeof errorData === 'object' ? errorData.message : errorData;
            setError(message || 'Failed to resend code. Please try again.');
        } finally {
            setResending(false);
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

                <h2>Verify Your Account</h2>
                <p className="otp-helper-text">
                    We've sent a 6-digit code to <strong>{email}</strong>.
                    <br />It expires in 15 minutes.
                </p>

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>One-Time Password</label>
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

                    {error && <p className="error-message">{error}</p>}
                    {success && <p className="success-message" style={{ color: '#16a34a', background: '#f0fdf4', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>{success}</p>}

                    <button type="submit" disabled={loading} className="btn-primary">
                        {loading ? 'Verifying...' : 'Verify & Join'}
                    </button>

                    <button
                        type="button"
                        onClick={handleResendOtp}
                        disabled={resending}
                        className="btn-secondary"
                        style={{ width: '100%', marginTop: '12px' }}
                    >
                        {resending ? 'Sending...' : 'Resend Code'}
                    </button>

                    <button
                        type="button"
                        onClick={() => navigate('/login')}
                        className="btn-secondary"
                        style={{ width: '100%', marginTop: '12px' }}
                    >
                        Cancel
                    </button>
                </form>

                <div className="auth-divider"></div>
                <div className="auth-footer">
                    <p>Need to change account? <button type="button" className="link-button" onClick={() => navigate('/login')}>Back to Sign In</button></p>
                    <p style={{ marginTop: '12px', fontSize: '0.9em' }}>
                        Need help? <a href="mailto:Hello@apraizal.com" className="link-button">Contact Support</a>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default OTPPage;
