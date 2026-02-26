import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../../services/api';

interface LayoutProps {
    children: React.ReactNode;
}

interface OrgSummary {
    id: string;
    name: string;
    userRole: string;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [currentOrgRole, setCurrentOrgRole] = useState(localStorage.getItem('selectedOrgRole') || '');
    const [organizations, setOrganizations] = useState<OrgSummary[]>([]);
    const [showOrgMenu, setShowOrgMenu] = useState(false);

    useEffect(() => {
        const orgId = localStorage.getItem('selectedOrgId');
        if (location.pathname !== '/dashboard' || !orgId) {
            return;
        }

        api.get(`/orgs/${orgId}`)
            .then((res) => {
                const role = res.data?.userRole || '';
                setCurrentOrgRole(role);
                localStorage.setItem('selectedOrgRole', role);
            })
            .catch(() => {
                setCurrentOrgRole(localStorage.getItem('selectedOrgRole') || '');
            });
    }, [location.pathname]);

    useEffect(() => {
        api.get('/orgs')
            .then((res) => {
                setOrganizations(Array.isArray(res.data) ? res.data : []);
            })
            .catch(() => {
                setOrganizations([]);
            });
    }, [location.pathname]);

    useEffect(() => {
        const onOutsideClick = () => setShowOrgMenu(false);
        if (!showOrgMenu) {
            return;
        }
        window.addEventListener('click', onOutsideClick);
        return () => {
            window.removeEventListener('click', onOutsideClick);
        };
    }, [showOrgMenu]);

    const isAdminInCurrentOrg = currentOrgRole === 'ADMIN';
    const isTeamLeadInCurrentOrg = currentOrgRole === 'TEAM_LEAD';
    const isMemberInCurrentOrg = currentOrgRole === 'MEMBER';
    const params = new URLSearchParams(location.search);
    const dashboardSection = params.get('section') || 'tracker';

    const adminDashboardItems = useMemo(() => ([
        { label: 'OKRs', section: 'okrs' },
        { label: 'Tracker', section: 'tracker' },
        { label: 'Tags', section: 'tags' },
        { label: 'Team', section: 'team' },
        { label: 'Appraisals', section: 'appraisals' }
    ]), []);
    const teamLeadDashboardItems = useMemo(() => ([
        { label: 'OKRs', section: 'okrs' },
        { label: 'Tracker', section: 'tracker' },
        { label: 'Team', section: 'team' }
    ]), []);
    const memberDashboardItems = useMemo(() => ([
        { label: 'OKRs', section: 'okrs' },
        { label: 'Tracker', section: 'tracker' }
    ]), []);

    const menuItems = [
        {
            label: 'Operations Board',
            path: '/dashboard'
        }
    ];

    const selectedOrgId = localStorage.getItem('selectedOrgId');
    const selectedOrganization = organizations.find((org) => org.id === selectedOrgId);
    const orgSwitcherLabel = selectedOrganization?.name || 'Organization';

    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .substring(0, 2);
    };

    const getSidebarIcon = (key: string) => {
        const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
        switch (key) {
            case 'Operations Board':
                return (
                    <svg {...common}>
                        <rect x="3" y="3" width="7" height="7"></rect>
                        <rect x="14" y="3" width="7" height="7"></rect>
                        <rect x="3" y="14" width="7" height="7"></rect>
                        <rect x="14" y="14" width="7" height="7"></rect>
                    </svg>
                );
            case 'okrs':
                return (
                    <svg {...common}>
                        <path d="M8 7h8"></path>
                        <path d="M8 12h8"></path>
                        <path d="M8 17h5"></path>
                        <rect x="4" y="4" width="16" height="16" rx="2"></rect>
                    </svg>
                );
            case 'tracker':
                return (
                    <svg {...common}>
                        <circle cx="12" cy="12" r="8"></circle>
                        <path d="M12 8v4l3 2"></path>
                    </svg>
                );
            case 'tags':
                return (
                    <svg {...common}>
                        <path d="M20 10l-8 8-8-8V4h6l10 6z"></path>
                        <circle cx="9" cy="9" r="1"></circle>
                    </svg>
                );
            case 'team':
                return (
                    <svg {...common}>
                        <circle cx="9" cy="8" r="3"></circle>
                        <circle cx="17" cy="10" r="2"></circle>
                        <path d="M4 19c0-3 3-5 5-5s5 2 5 5"></path>
                        <path d="M15 19c0-2 1.5-3.5 3.5-4"></path>
                    </svg>
                );
            case 'appraisals':
                return (
                    <svg {...common}>
                        <path d="M12 3l3.1 6.2L22 10l-5 4.8 1.2 6.9L12 18.8 5.8 21.7 7 14.8 2 10l6.9-.8L12 3z"></path>
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

    return (
        <div className="app-container">
            <aside className="sidebar">
                <div className="sidebar-header">
                    <div className="sidebar-logo">Apraizal</div>
                </div>

                <nav className="sidebar-nav">
                    <ul>
                        {menuItems.map((item) => (
                            <li key={item.path}>
                                <div
                                    className={`sidebar-link ${location.pathname === item.path && (item.path !== '/dashboard' || !location.search) ? 'active' : ''}`}
                                    onClick={() => navigate(item.path)}
                                >
                                    <span className="sidebar-icon">{getSidebarIcon(item.label)}</span>
                                    <span>{item.label}</span>
                                </div>
                            </li>
                        ))}

                        {isAdminInCurrentOrg && location.pathname === '/dashboard' && (
                            <>
                                <li style={{ marginTop: 12, marginBottom: 6, color: '#94A3B8', fontSize: '0.75em', textTransform: 'uppercase', padding: '0 16px' }}>
                                    Admin
                                </li>
                                {adminDashboardItems.map((item) => (
                                    <li key={item.section}>
                                        <div
                                            className={`sidebar-link ${dashboardSection === item.section ? 'active' : ''}`}
                                            onClick={() => navigate(`/dashboard?section=${item.section}`)}
                                        >
                                            <span className="sidebar-icon">{getSidebarIcon(item.section)}</span>
                                            <span>{item.label}</span>
                                        </div>
                                    </li>
                                ))}
                            </>
                        )}
                        {isTeamLeadInCurrentOrg && location.pathname === '/dashboard' && (
                            <>
                                <li style={{ marginTop: 12, marginBottom: 6, color: '#94A3B8', fontSize: '0.75em', textTransform: 'uppercase', padding: '0 16px' }}>
                                    Team Lead
                                </li>
                                {teamLeadDashboardItems.map((item) => (
                                    <li key={item.section}>
                                        <div
                                            className={`sidebar-link ${dashboardSection === item.section ? 'active' : ''}`}
                                            onClick={() => navigate(`/dashboard?section=${item.section}`)}
                                        >
                                            <span className="sidebar-icon">{getSidebarIcon(item.section)}</span>
                                            <span>{item.label}</span>
                                        </div>
                                    </li>
                                ))}
                            </>
                        )}
                        {isMemberInCurrentOrg && location.pathname === '/dashboard' && (
                            <>
                                <li style={{ marginTop: 12, marginBottom: 6, color: '#94A3B8', fontSize: '0.75em', textTransform: 'uppercase', padding: '0 16px' }}>
                                    Member
                                </li>
                                {memberDashboardItems.map((item) => (
                                    <li key={item.section}>
                                        <div
                                            className={`sidebar-link ${dashboardSection === item.section ? 'active' : ''}`}
                                            onClick={() => navigate(`/dashboard?section=${item.section}`)}
                                        >
                                            <span className="sidebar-icon">{getSidebarIcon(item.section)}</span>
                                            <span>{item.label}</span>
                                        </div>
                                    </li>
                                ))}
                            </>
                        )}
                    </ul>
                </nav>

                <div className="sidebar-footer">
                    <button className="btn-logout" onClick={logout}>
                        Sign Out
                    </button>
                </div>
            </aside>

            <main className="main-content">
                <header className="top-bar">
                    <h2>
                        {location.pathname === '/dashboard' ? 'Operations Board' : 'Select Organization'}
                    </h2>
                    <div className="top-bar-actions">
                        <div className="org-switcher">
                            <button
                                type="button"
                                className={`org-switcher-trigger ${showOrgMenu ? 'active' : ''}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowOrgMenu((prev) => !prev);
                                }}
                            >
                                <span className="org-switcher-label">{orgSwitcherLabel}</span>
                                <span className="org-switcher-caret">▾</span>
                            </button>

                            {showOrgMenu && (
                                <div className="org-switcher-menu" onClick={(e) => e.stopPropagation()}>
                                    <div className="org-switcher-menu-title">Switch Organization</div>
                                    {organizations.map((org) => (
                                        <button
                                            key={org.id}
                                            type="button"
                                            className={`org-switcher-item ${org.id === selectedOrgId ? 'active' : ''}`}
                                            onClick={() => {
                                                localStorage.setItem('selectedOrgId', org.id);
                                                localStorage.setItem('selectedOrgRole', org.userRole);
                                                setCurrentOrgRole(org.userRole);
                                                setShowOrgMenu(false);
                                                navigate('/dashboard');
                                            }}
                                        >
                                            <span>{org.name}</span>
                                            <small>{org.userRole}</small>
                                        </button>
                                    ))}
                                    <button
                                        type="button"
                                        className="org-switcher-manage"
                                        onClick={() => {
                                            setShowOrgMenu(false);
                                            navigate('/organizations');
                                        }}
                                    >
                                        Manage Organizations
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="user-pill">
                            <div className="avatar">
                                {getInitials(user?.name || user?.email || 'U')}
                            </div>
                            <span>{user?.name || user?.email}</span>
                        </div>
                    </div>
                </header>
                <div className="content">
                    {children}
                </div>
            </main>
        </div>
    );
};

export default Layout;
