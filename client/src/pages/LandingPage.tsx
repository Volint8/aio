import { Link } from 'react-router-dom';
import '../styles/LandingPage.css';

const LandingPage = () => {
    return (
        <div className="landing-page" id="home">
            <header className="landing-header">
                <div className="landing-brand">
                    <img src="/images/image.png" alt="Apraizal Logo" style={{ height: '40px' }} />
                </div>
            </header>

            <main>
                <section className="hero" aria-labelledby="landing-title">
                    <h1 id="landing-title">Turn a year's worth of messy HR paperwork into a finished report with just one click.</h1>
                    <p className="hero-features">
                        <span className="feature-word">Organize</span><span aria-hidden="true">•</span>
                        <span className="feature-word">Track</span><span aria-hidden="true">•</span>
                        <span className="feature-word">Appraise</span>
                    </p>

                    <div className="hero-actions">
                        <Link to="/login?mode=admin_signup" className="cta cta-primary">Get started</Link>
                        <Link to="/login" className="cta cta-secondary">Sign In</Link>
                    </div>
                </section>
            </main>
        </div>
    );
};

export default LandingPage;
