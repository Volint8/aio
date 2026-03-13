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
    const [notifications, setNotifications] = useState<any[]>([]);
    const [showNotifications, setShowNotifications] = useState(false);

    const fetchNotifications = () => {
        const orgId = localStorage.getItem('selectedOrgId');
        if (!orgId) return;

        api.get('/notifications', { params: { organizationId: orgId } })
            .then(res => setNotifications(res.data))
            .catch(() => { });
    };

    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 60000);
        return () => clearInterval(interval);
    }, [location.pathname]);

    const unreadCount = notifications.filter(n => !n.isRead).length;

    const handleMarkAsRead = async (id: string) => {
        try {
            await api.patch(`/notifications/${id}/read`);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
        } catch (error) {
            console.error('Failed to mark as read:', error);
        }
    };

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


    const isAdminInCurrentOrg = currentOrgRole === 'ADMIN';
    const isTeamLeadInCurrentOrg = currentOrgRole === 'TEAM_LEAD';
    const isMemberInCurrentOrg = currentOrgRole === 'MEMBER';
    const params = new URLSearchParams(location.search);
    const dashboardSection = params.get('section') || 'board';

    const adminDashboardItems = useMemo(() => ([
        { label: 'Board', section: 'board' },
        { label: 'Task Tracker', section: 'task-tracker' },
        { label: 'Team Tracker', section: 'team-tracker' },
        { label: 'OKR', section: 'okr' }
    ]), []);
    const teamLeadDashboardItems = useMemo(() => ([
        { label: 'Board', section: 'board' },
        { label: 'Task Tracker', section: 'task-tracker' },
        { label: 'Team Tracker', section: 'team-tracker' },
        { label: 'OKR', section: 'okr' }
    ]), []);
    const memberDashboardItems = useMemo(() => ([
        { label: 'Board', section: 'board' },
        { label: 'Task Tracker', section: 'task-tracker' },
        { label: 'OKR', section: 'okr' }
    ]), []);

    const selectedOrgId = localStorage.getItem('selectedOrgId');
    const selectedOrganization = organizations.find((org) => org.id === selectedOrgId);

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
            case 'Board':
                return (
                    <svg {...common}>
                        <rect x="3" y="3" width="7" height="7"></rect>
                        <rect x="14" y="3" width="7" height="7"></rect>
                        <rect x="3" y="14" width="7" height="7"></rect>
                        <rect x="14" y="14" width="7" height="7"></rect>
                    </svg>
                );
            case 'Task Tracker':
                return (
                    <svg {...common}>
                        <rect x="3" y="5" width="18" height="14" rx="2"></rect>
                        <path d="M3 9h18"></path>
                        <path d="M8 5V3h8v2"></path>
                    </svg>
                );
            case 'Team Tracker':
                return (
                    <svg {...common}>
                        <circle cx="9" cy="8" r="3"></circle>
                        <circle cx="17" cy="10" r="2"></circle>
                        <path d="M4 19c0-3 3-5 5-5s5 2 5 5"></path>
                        <path d="M15 19c0-2 1.5-3.5 3.5-4"></path>
                    </svg>
                );
            case 'OKR':
                return (
                    <svg {...common}>
                        <path d="M8 7h8"></path>
                        <path d="M8 12h8"></path>
                        <path d="M8 17h5"></path>
                        <rect x="4" y="4" width="16" height="16" rx="2"></rect>
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
                    <div className="sidebar-logo">
                        <img src="/images/image.png" alt="Apraizal Logo" style={{ height: '32px' }} />
                    </div>
                </div>

                <nav className="sidebar-nav">
                    <ul>
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
                                            <span className="sidebar-icon">{getSidebarIcon(item.label)}</span>
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
                                            <span className="sidebar-icon">{getSidebarIcon(item.label)}</span>
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
                                            <span className="sidebar-icon">{getSidebarIcon(item.label)}</span>
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
                    <div className="top-bar-left">
                        <button
                            className="btn-back"
                            onClick={() => navigate('/dashboard')}
                            title="Back to Board"
                        >
                            ←
                        </button>
                        <h2>
                            {dashboardSection === 'board' ? 'Board' :
                             dashboardSection === 'task-tracker' ? 'Task Tracker' :
                             dashboardSection === 'team-tracker' ? 'Team Tracker' :
                             dashboardSection === 'okr' ? 'OKR' : 'Dashboard'}
                        </h2>
                    </div>
                    <div className="top-bar-actions">
                        {dashboardSection !== 'board' && (
                            <button className="btn-send-alert" onClick={() => {}}>
                                Send Alert
                            </button>
                        )}
                        <div className="notification-bell-container">
                            <button
                                className={`notification-bell ${unreadCount > 0 ? 'has-unread' : ''}`}
                                onClick={() => setShowNotifications(!showNotifications)}
                            >
                                🔔
                                {unreadCount > 0 && <span className="unread-badge">{unreadCount}</span>}
                            </button>

                            {showNotifications && (
                                <div className="notifications-menu">
                                    <div className="notifications-header">Notifications</div>
                                    <div className="notifications-list">
                                        {notifications.length === 0 ? (
                                            <div className="notification-empty">No notifications</div>
                                        ) : (
                                            notifications.map(n => (
                                                <div
                                                    key={n.id}
                                                    className={`notification-item ${n.isRead ? 'read' : 'unread'}`}
                                                    onClick={() => !n.isRead && handleMarkAsRead(n.id)}
                                                >
                                                    <div className="notification-sender">From: {n.sender.name || n.sender.email}</div>
                                                    <div className="notification-type">{n.type.replace('_', ' ')}</div>
                                                    <div className="notification-message">{n.message}</div>
                                                    <div className="notification-time">{new Date(n.createdAt).toLocaleString()}</div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="org-display">
                            <span className="org-label">{selectedOrganization?.name || 'Workspace'}</span>
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
