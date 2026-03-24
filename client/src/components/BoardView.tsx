import React from 'react';
import { useAuth } from '../context/AuthContext';
import '../styles/BoardView.css';

interface BoardViewProps {
    memberStats: Array<{
        userId: string;
        name: string;
        stats: {
            pending: number;
            ongoing: number;
            completed: number;
            overdue: number;
            total: number;
        };
    }>;
    teamDistribution: Array<{
        teamId: string;
        teamName: string;
        stats: {
            pending: number;
            ongoing: number;
            completed: number;
            overdue: number;
            total: number;
        };
        people: Array<{
            userId: string;
            name: string;
            stats: {
                pending: number;
                ongoing: number;
                completed: number;
                overdue: number;
                total: number;
            };
        }>;
    }>;
    userRole: 'ADMIN' | 'TEAM_LEAD' | 'MEMBER';
    onCreateTask: () => void;
}

const BoardView: React.FC<BoardViewProps> = ({
    memberStats,
    userRole,
    onCreateTask
}) => {
    const { user } = useAuth();
    
    // Calculate team totals (for Team Lead/Admin)
    const teamTotals = memberStats.reduce(
        (acc, member) => ({
            members: acc.members + 1,
            pending: acc.pending + member.stats.pending,
            ongoing: acc.ongoing + member.stats.ongoing,
            completed: acc.completed + member.stats.completed,
            overdue: acc.overdue + member.stats.overdue,
            total: acc.total + member.stats.total
        }),
        { members: 0, pending: 0, ongoing: 0, completed: 0, overdue: 0, total: 0 }
    );

    // Calculate individual stats (current user)
    const currentUserStats = memberStats.find(m => m.userId === user?.id) 
        || memberStats[0] 
        || { userId: '', name: 'User', stats: { pending: 0, ongoing: 0, completed: 0, overdue: 0, total: 0 } };

    const canViewTeam = userRole === 'ADMIN' || userRole === 'TEAM_LEAD';

    return (
        <div className="board-view">
            {/* Welcome Banner */}
            <div className="welcome-banner">
                <h1>Welcome back, {user?.name || 'User'}!</h1>
                <p>Track your team's progress and stay on top of your tasks.</p>
            </div>

            {/* Team Stats Section */}
            {canViewTeam && (
                <>
                    <div className="board-panel-header">
                        <h2>Team Overview</h2>
                    </div>
                    <div className="board-stats-grid">
                        <div className="board-stat-card">
                            <span className="board-stat-label">Team Members</span>
                            <span className="board-stat-value">{teamTotals.members.toString().padStart(2, '0')}</span>
                        </div>
                        <div className="board-stat-card">
                            <span className="board-stat-label">Ongoing Tasks</span>
                            <span className="board-stat-value">{teamTotals.ongoing.toString().padStart(2, '0')}</span>
                        </div>
                        <div className="board-stat-card">
                            <span className="board-stat-label">Pending</span>
                            <span className="board-stat-value">{teamTotals.pending.toString().padStart(2, '0')}</span>
                        </div>
                        <div className="board-stat-card">
                            <span className="board-stat-label" style={{ color: '#EF4444' }}>Overdue</span>
                            <span className="board-stat-value" style={{ color: '#EF4444' }}>{teamTotals.overdue.toString().padStart(2, '0')}</span>
                        </div>
                    </div>
                </>
            )}

            {/* My Stats Section - Only for Team Lead and Member */}
            {userRole !== 'ADMIN' && (
                <>
                    <div className="board-panel-header">
                        <h2>My Focus</h2>
                        <button className="board-create-btn" onClick={onCreateTask}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                            New Task
                        </button>
                    </div>
                    <div className="board-stats-grid">
                        <div className="board-stat-card">
                            <span className="board-stat-label">Ongoing</span>
                            <span className="board-stat-value">{currentUserStats.stats.ongoing.toString().padStart(2, '0')}</span>
                        </div>
                        <div className="board-stat-card">
                            <span className="board-stat-label">Pending</span>
                            <span className="board-stat-value">{currentUserStats.stats.pending.toString().padStart(2, '0')}</span>
                        </div>
                        <div className="board-stat-card">
                            <span className="board-stat-label">Completed</span>
                            <span className="board-stat-value">{currentUserStats.stats.completed.toString().padStart(2, '0')}</span>
                        </div>
                        <div className="board-stat-card">
                            <span className="board-stat-label" style={{ color: '#EF4444' }}>Overdue</span>
                            <span className="board-stat-value" style={{ color: '#EF4444' }}>{currentUserStats.stats.overdue.toString().padStart(2, '0')}</span>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default BoardView;
