import { Link } from 'react-router-dom';
import '../styles/LandingPage.css';

const LandingPage = () => {
    return (
        <div className="landing-page" id="home">
            <header className="landing-header">
                <div className="landing-brand">
                    <img src="/images/image.png" alt="Apraizal Logo" style={{ height: '36px' }} />
                </div>
                <nav className="landing-nav">
                    <a href="#features">Features</a>
                    <Link to="/login" className="btn-secondary" style={{ padding: '8px 20px', fontSize: '0.9em' }}>Sign In</Link>
                </nav>
            </header>

            <main>
                <section className="landing-hero" aria-labelledby="landing-title">
                    <div className="hero-content-wrapper">
                        <h1 id="landing-title">Modern Performance Management for High-Growth Teams.</h1>
                        <p className="hero-features">
                            <span className="feature-word">Organize</span>
                            <span className="feature-dot" aria-hidden="true">•</span>
                            <span className="feature-word">Track</span>
                            <span className="feature-dot" aria-hidden="true">•</span>
                            <span className="feature-word">Appraise</span>
                        </p>

                        <div className="hero-actions">
                            <Link to="/login?mode=admin_signup" className="cta cta-primary">Get started for free</Link>
                        </div>
                    </div>
                </section>

                <section id="features" className="landing-features-grid">
                    <div className="landing-feature-card">
                        <div className="feature-icon">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="7" height="7"></rect>
                                <rect x="14" y="3" width="7" height="7"></rect>
                                <rect x="3" y="14" width="7" height="7"></rect>
                                <rect x="14" y="14" width="7" height="7"></rect>
                            </svg>
                        </div>
                        <h3>Unified Tracking</h3>
                        <p>Keep all your team's tasks and objectives in one centralized dashboard with real-time updates.</p>
                    </div>
                    <div className="landing-feature-card">
                        <div className="feature-icon">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 2v20M2 12h20M7 7l10 10M7 17l10-10" />
                            </svg>
                        </div>
                        <h3>Strategic OKRs</h3>
                        <p>Align individual goals with organizational objectives to ensure everyone is pulling in the same direction.</p>
                    </div>
                    <div className="landing-feature-card">
                        <div className="feature-icon">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                <polyline points="22 4 12 14.01 9 11.01"></polyline>
                            </svg>
                        </div>
                        <h3>Smart Appraisals</h3>
                        <p>Automate performance reviews with data-driven insights and one-click report generation.</p>
                    </div>
                </section>
            </main>

            <footer style={{ textAlign: 'center', padding: '40px', color: '#64748B', fontSize: '0.9em', borderTop: '1px solid #F1F5F9' }}>
                &copy; {new Date().getFullYear()} Apraizal Platforms. All rights reserved.
            </footer>
        </div>
    );
};

export default LandingPage;
