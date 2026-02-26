import { Link } from 'react-router-dom';
import '../styles/LandingPage.css';

const LandingPage = () => {
    return (
        <div className="landing-page" id="home">
            <header className="landing-header">
                <div className="landing-brand">
                    <span className="dot dot-light" aria-hidden="true"></span>
                    <span className="dot dot-dark" aria-hidden="true"></span>
                    <span className="brand-text">Apraizal</span>
                </div>

                <nav className="landing-nav" aria-label="Main">
                    <a href="#home">Home</a>
                    <a href="#about">About Us</a>
                </nav>
            </header>

            <main>
                <section className="hero" aria-labelledby="landing-title">
                    <h1 id="landing-title">All Your Work Appraisal, All In One Place</h1>
                    <p className="hero-features">Organize <span aria-hidden="true">•</span> Track <span aria-hidden="true">•</span> Appraise</p>

                    <div className="hero-actions">
                        <Link to="/login?mode=admin_signup" className="cta cta-primary">Get started</Link>
                        <Link to="/login" className="cta cta-secondary">Sign In</Link>
                    </div>

                    <div className="hero-art" aria-hidden="true">
                        <span className="orb orb-1"></span>
                        <span className="orb orb-2"></span>
                        <span className="orb orb-3"></span>
                        <span className="orb orb-4"></span>
                        <img src="/images/landing-hero.png" alt="" />
                    </div>
                </section>

                <section id="about" className="about">
                    <h2>About Apraizal</h2>
                    <p>
                        Apraizal helps teams manage objectives, track task ownership, and keep appraisals organized in one workflow.
                        Admins, team leads, and members each get focused views so execution stays clear and measurable.
                    </p>
                </section>
            </main>
        </div>
    );
};

export default LandingPage;
