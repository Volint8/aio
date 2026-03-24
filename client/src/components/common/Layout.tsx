import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../../services/api';

interface LayoutProps {
    children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [currentOrgRole, setCurrentOrgRole] = useState(localStorage.getItem('selectedOrgRole') || '');
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [selectedOrgName, setSelectedOrgName] = useState(localStorage.getItem('selectedOrgName') || '');

    useEffect(() => {
        const orgId = localStorage.getItem('selectedOrgId');
        if (location.pathname !== '/dashboard' || !orgId) {
            return;
        }

        api.get(`/orgs/${orgId}`)
            .then((res) => {
                const role = res.data?.userRole || '';
                const orgName = res.data?.name || '';
                setCurrentOrgRole(role);
                setSelectedOrgName(orgName);
                localStorage.setItem('selectedOrgName', orgName);
            })
            .catch(() => {
                setCurrentOrgRole(localStorage.getItem('selectedOrgRole') || '');
                setSelectedOrgName(localStorage.getItem('selectedOrgName') || '');
            });
    }, [location.pathname]);


    const isAdminInCurrentOrg = currentOrgRole === 'ADMIN';
    const isTeamLeadInCurrentOrg = currentOrgRole === 'TEAM_LEAD';
    const params = new URLSearchParams(location.search);
    const dashboardSection = params.get('section') || 'board';

    const adminNavItems = useMemo(() => ([
        { label: 'Dashboard', section: 'board', icon: 'dashboard' },
        { label: 'OKRs', section: 'okr', icon: 'okr' },
        { label: 'Trackers', section: 'task-tracker', icon: 'trackers' },
        { label: 'Team', section: 'team', icon: 'team' },
        { label: 'Appraisals', section: 'appraisals', icon: 'appraisals' }
    ]), []);

    const teamLeadNavItems = useMemo(() => ([
        { label: 'Dashboard', section: 'board', icon: 'dashboard' },
        { label: 'OKRs', section: 'okr', icon: 'okr' },
        { label: 'Trackers', section: 'task-tracker', icon: 'trackers' },
        { label: 'Team', section: 'team-tracker', icon: 'team' }
    ]), []);

    const memberNavItems = useMemo(() => ([
        { label: 'Dashboard', section: 'board', icon: 'dashboard' },
        { label: 'OKRs', section: 'okr', icon: 'okr' },
        { label: 'Trackers', section: 'task-tracker', icon: 'trackers' }
    ]), []);

    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .substring(0, 2);
    };

    const getSidebarIcon = (iconName: string) => {
        const common = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
        switch (iconName) {
            case 'dashboard':
                return (
                    <svg {...common}>
                        <rect x="3" y="3" width="7" height="7"></rect>
                        <rect x="14" y="3" width="7" height="7"></rect>
                        <rect x="3" y="14" width="7" height="7"></rect>
                        <rect x="14" y="14" width="7" height="7"></rect>
                    </svg>
                );
            case 'okr':
                return (
                    <svg {...common}>
                        <path d="M12 2v20M2 12h20M7 7l10 10M7 17l10-10" />
                    </svg>
                );
            case 'trackers':
                return (
                    <svg {...common}>
                        <path d="M12 20h9M12 4h9M4 20h1M4 4h1M4 12h1M12 12h9" />
                        <circle cx="4" cy="4" r="1" />
                        <circle cx="4" cy="12" r="1" />
                        <circle cx="4" cy="20" r="1" />
                    </svg>
                );
            case 'team':
                return (
                    <svg {...common}>
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                );
            case 'appraisals':
                return (
                    <svg {...common}>
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                );
            case 'settings':
                return (
                    <svg {...common}>
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                    </svg>
                );
            default:
                return (
                    <svg {...common}>
                        <circle cx="12" cy="12" r="8"></circle>
                    </svg>
                );
        }
    };

    const navItems = isAdminInCurrentOrg ? adminNavItems : isTeamLeadInCurrentOrg ? teamLeadNavItems : memberNavItems;

    return (
        <div className="app-container">
            {/* Mobile sidebar overlay */}
            <div
                className={`sidebar-overlay ${sidebarOpen ? 'active' : ''}`}
                onClick={() => setSidebarOpen(false)}
            />

            <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
                <div className="sidebar-header" style={{ borderBottom: 'none', padding: '40px 24px 20px' }}>
                    <div className="sidebar-logo">
                        <img src="/images/image.png" alt="Apraizal Logo" style={{ height: '36px' }} />
                        <span style={{ fontSize: '1.2em', fontWeight: 700, marginLeft: '8px', color: '#0F172A' }}>Apraizal</span>
                    </div>
                </div>

                <nav className="sidebar-nav">
                    <ul>
                        {navItems.map((item) => (
                            <li key={item.section}>
                                <div
                                    className={`sidebar-link ${dashboardSection === item.section ? 'active' : ''}`}
                                    onClick={() => {
                                        navigate(`/dashboard?section=${item.section}`);
                                        setSidebarOpen(false);
                                    }}
                                    style={{
                                        padding: '12px 20px',
                                        margin: '4px 0',
                                        borderRadius: '8px',
                                        fontSize: '0.95em'
                                    }}
                                >
                                    <span className="sidebar-icon" style={{ color: dashboardSection === item.section ? 'var(--primary-blue)' : 'inherit' }}>
                                        {getSidebarIcon(item.icon)}
                                    </span>
                                    <span>{item.label}</span>
                                </div>
                            </li>
                        ))}
                    </ul>
                </nav>

                <div className="sidebar-footer" style={{ borderTop: 'none', padding: '24px' }}>
                    <button className="btn-logout" onClick={logout} style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                            <polyline points="16 17 21 12 16 7"></polyline>
                            <line x1="21" y1="12" x2="9" y2="12"></line>
                        </svg>
                        Sign Out
                    </button>
                </div>
            </aside>

            <main className="main-content">
                <header className="top-bar" style={{ padding: '0 24px', height: '80px', borderBottom: '1px solid #F1F5F9' }}>
                    <div className="top-bar-left">
                        <button
                            className={`hamburger-menu ${sidebarOpen ? 'active' : ''}`}
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            aria-label="Toggle menu"
                        >
                            <span></span>
                            <span></span>
                            <span></span>
                        </button>
                    </div>
                    <div className="top-bar-actions" style={{ gap: '20px', alignItems: 'center' }}>
                        <div className="org-display" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: '#F1F5F9', borderRadius: '10px', fontWeight: 600, color: '#0F172A' }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                                <polyline points="9 22 9 12 15 12 15 22"></polyline>
                            </svg>
                            {selectedOrgName || 'Organization'}
                        </div>

                        <div className="user-pill" style={{ background: 'none', padding: '0' }}>
                            <span style={{ color: '#0F172A', fontWeight: 500, marginRight: '10px' }}>{user?.name || user?.email}</span>
                            <div className="avatar" style={{ width: '36px', height: '36px', background: 'var(--primary-blue)', borderRadius: '50%', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
                                {getInitials(user?.name || user?.email || 'U')}
                            </div>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '4px' }}>
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </div>
                    </div>
                </header>
                <div className="content" style={{ width: '100%', maxWidth: 'none' }}>
                    {children}
                </div>
            </main>
        </div>
    );
};

export default Layout;
