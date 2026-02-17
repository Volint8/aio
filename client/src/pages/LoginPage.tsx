import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import '../styles/LoginPage.css';

const LoginPage = () => {
    const [isSignup, setIsSignup] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login, signup } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (isSignup) {
                const success = await signup(email, password, name);
                if (success) {
                    localStorage.setItem('pendingAuthEmail', email);
                    navigate('/confirm-otp', { state: { email } });
                    return;
                }
            } else {
                await login(email, password);
                navigate('/');
            }
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Authentication failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-header">
                    <h1>AIO</h1>
                    <p className="tagline">Organize. Track. Deliver.</p>
                </div>

                <h2>{isSignup ? 'Create Account' : 'Welcome Back'}</h2>

                <form onSubmit={handleSubmit}>
                    {isSignup && (
                        <div className="form-group">
                            <label>Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Your name"
                            />
                        </div>
                    )}

                    <div className="form-group">
                        <label>Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="user@volint.com or user@formatio.com"
                            required
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
                        {loading ? 'Please wait...' : (isSignup ? 'Sign Up' : 'Log In')}
                    </button>
                </form>

                <div className="toggle-mode">
                    <p>
                        {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
                        <button
                            type="button"
                            onClick={() => {
                                setIsSignup(!isSignup);
                                setError('');
                            }}
                            className="link-button"
                        >
                            {isSignup ? 'Log In' : 'Sign Up'}
                        </button>
                    </p>
                </div>

                <div className="domain-notice">
                    <small>Only @volint.com and @formatio.com emails are allowed</small>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
