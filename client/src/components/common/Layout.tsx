import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';

interface LayoutProps {
    children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const menuItems = [
        {
            label: 'Operations Board',
            path: '/dashboard',
            icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                    <line x1="9" y1="21" x2="9" y2="9" />
                </svg>
            )
        },
        {
            label: 'Organization',
            path: '/organizations',
            icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 21h18" />
                    <path d="M9 8h1" />
                    <path d="M9 12h1" />
                    <path d="M9 16h1" />
                    <path d="M14 8h1" />
                    <path d="M14 12h1" />
                    <path d="M14 16h1" />
                    <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
                </svg>
            )
        },
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
                                    className={`sidebar-link ${location.pathname === item.path ? 'active' : ''}`}
                                    onClick={() => navigate(item.path)}
                                >
                                    <span className="sidebar-icon">{item.icon}</span>
                                    <span>{item.label}</span>
                                </div>
                            </li>
                        ))}
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
