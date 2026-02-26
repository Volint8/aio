import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import '../styles/LoginPage.css'; // Reusing login styles for consistency

const OTPPage = () => {
    const [otp, setOtp] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { verifyOtp } = useAuth();
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
        setLoading(true);

        try {
            await verifyOtp(email, otp);
            // Clear pending email
            localStorage.removeItem('pendingAuthEmail');
            navigate('/organizations');
        } catch (err: any) {
            const errorData = err.response?.data?.error;
            const message = typeof errorData === 'object' ? errorData.message : errorData;
            setError(message || err.message || 'Verification failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-header">
                    <div className="brand-row">
                        <span className="brand-dot brand-dot-light" aria-hidden="true"></span>
                        <span className="brand-dot brand-dot-dark" aria-hidden="true"></span>
                        <h1>Apraizal</h1>
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

                    <button type="submit" disabled={loading} className="btn-primary">
                        {loading ? 'Verifying...' : 'Verify & Join'}
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
                </div>
            </div>
        </div>
    );
};

export default OTPPage;
