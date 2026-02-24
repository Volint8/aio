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
        },
        {
            label: 'Organization',
            path: '/organizations'
        }
    ];

    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .substring(0, 2);
    };

    return (
        <div className="app-container">
            <aside className="sidebar">
                <div className="sidebar-header">
                    <div className="sidebar-logo">AIO</div>
                </div>

                <nav className="sidebar-nav">
                    <ul>
                        {menuItems.map((item) => (
                            <li key={item.path}>
                                <div
                                    className={`sidebar-link ${location.pathname === item.path && (item.path !== '/dashboard' || !location.search) ? 'active' : ''}`}
                                    onClick={() => navigate(item.path)}
                                >
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
                    <div className="user-pill">
                        <div className="avatar">
                            {getInitials(user?.name || user?.email || 'U')}
                        </div>
                        <span>{user?.name || user?.email}</span>
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
