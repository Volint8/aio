import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import '../styles/LoginPage.css';

type Mode = 'login' | 'admin_signup';

const LoginPage = () => {
    const [mode, setMode] = useState<Mode>('login');
    const [signupStep, setSignupStep] = useState<1 | 2>(1);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [orgName, setOrgName] = useState('');
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const {
        login,
        adminSignupInit,
        adminSignupComplete
    } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const modeParam = searchParams.get('mode');

    useEffect(() => {
        if (modeParam === 'admin_signup') {
            setMode('admin_signup');
            resetSignupFlow();
            return;
        }
        setMode('login');
    }, [modeParam]);

    const modeLabel = useMemo(() => mode === 'login' ? 'Welcome Back' : 'Admin Sign Up', [mode]);

    const handleLogin = async () => {
        await login(email, password);
        navigate('/');
    };

    const handleAdminSignupStepOne = async () => {
        const res = await adminSignupInit(email, password, name);
        setSuggestions(res.suggestions || []);
        setOrgName((res.suggestions && res.suggestions[0]) || '');
        setSignupStep(2);
    };

    const handleAdminSignupStepTwo = async () => {
        await adminSignupComplete(email, password, orgName, name);
        localStorage.setItem('pendingAuthEmail', email);
        navigate('/confirm-otp', { state: { email } });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (mode === 'login') {
                await handleLogin();
            } else if (signupStep === 1) {
                await handleAdminSignupStepOne();
            } else {
                await handleAdminSignupStepTwo();
            }
        } catch (err: any) {
            const errorData = err.response?.data?.error;
            const message = typeof errorData === 'object' ? errorData.message : errorData;
            setError(message || err.message || 'Authentication failed');
        } finally {
            setLoading(false);
        }
    };

    const resetSignupFlow = () => {
        setSignupStep(1);
        setSuggestions([]);
        setOrgName('');
        setError('');
    };

    const switchMode = (next: Mode) => {
        setMode(next);
        setError('');
        if (next === 'admin_signup') {
            resetSignupFlow();
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

                <h2>{modeLabel}</h2>

                <div className="auth-mode-switch">
                    <button
                        type="button"
                        className={mode === 'login' ? 'active' : ''}
                        onClick={() => switchMode('login')}
                    >
                        Sign In
                    </button>
                    <button
                        type="button"
                        className={mode === 'admin_signup' ? 'active' : ''}
                        onClick={() => switchMode('admin_signup')}
                    >
                        Admin Sign Up
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    {mode === 'admin_signup' && (
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
                            placeholder="you@company.com"
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

                    {mode === 'admin_signup' && signupStep === 2 && (
                        <div className="form-group">
                            <label>Organization Name</label>
                            <input
                                type="text"
                                value={orgName}
                                onChange={(e) => setOrgName(e.target.value)}
                                placeholder="Acme Operations"
                                required
                            />
                            {suggestions.length > 0 && (
                                <div className="suggestion-list">
                                    {suggestions.map((suggestion) => (
                                        <button
                                            type="button"
                                            className="suggestion-chip"
                                            key={suggestion}
                                            onClick={() => setOrgName(suggestion)}
                                        >
                                            {suggestion}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {error && <p className="error-message">{error}</p>}

                    <button type="submit" disabled={loading} className="btn-primary">
                        {loading
                            ? 'Please wait...'
                            : mode === 'login'
                                ? 'Log In'
                                : signupStep === 1
                                    ? 'Continue'
                                    : 'Create Organization & Send OTP'}
                    </button>

                    {mode === 'admin_signup' && signupStep === 2 && (
                        <button
                            type="button"
                            className="btn-secondary"
                            style={{ width: '100%', marginTop: '12px' }}
                            onClick={resetSignupFlow}
                        >
                            Back
                        </button>
                    )}
                </form>

                <div className="auth-divider"></div>
                <div className="auth-footer">
                    {mode === 'login' ? (
                        <p>
                            Don&apos;t have an account?{' '}
                            <button type="button" className="link-button" onClick={() => switchMode('admin_signup')}>
                                Sign Up
                            </button>
                        </p>
                    ) : (
                        <p>
                            Already have an account?{' '}
                            <button type="button" className="link-button" onClick={() => switchMode('login')}>
                                Sign In
                            </button>
                        </p>
                    )}
                </div>
                <div className="domain-notice">
                    <small>Use a work email address. Personal domains are blocked.</small>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
