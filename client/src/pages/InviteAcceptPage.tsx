import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/LoginPage.css';

const InviteAcceptPage = () => {
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const { inviteAcceptInit, inviteAcceptComplete } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const token = useMemo(() => new URLSearchParams(location.search).get('token') || '', [location.search]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (!token) {
                setError('Invite token is missing.');
                return;
            }

            const initRes = await inviteAcceptInit(token, password, name);

            if (initRes.mode === 'EXISTING_ACCOUNT_LOGIN_REQUIRED') {
                await inviteAcceptComplete(token, password);
                navigate('/organizations');
                return;
            }

            localStorage.setItem('pendingAuthEmail', initRes.email);
            navigate('/confirm-otp', { state: { email: initRes.email } });
        } catch (err: any) {
            const errorData = err.response?.data?.error;
            const message = typeof errorData === 'object' ? errorData.message : errorData;
            setError(message || err.message || 'Could not accept invite');
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

                <h2>Join Organization</h2>

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Name (for new accounts)</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Your name"
                        />
                    </div>

                    <div className="form-group">
                        <label>Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            minLength={6}
                        />
                    </div>

                    {error && <p className="error-message">{error}</p>}

                    <button type="submit" disabled={loading} className="btn-primary">
                        {loading ? 'Please wait...' : 'Continue'}
                    </button>
                </form>

                <div className="auth-divider"></div>
                <div className="auth-footer">
                    <p>Have a different account? <button type="button" className="link-button" onClick={() => navigate('/login')}>Sign In</button></p>
                </div>
            </div>
        </div>
    );
};

export default InviteAcceptPage;
