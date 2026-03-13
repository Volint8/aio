import React from 'react';
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
    const currentUserStats = memberStats.find(m => m.userId === (window as any).currentUserId) 
        || memberStats[0] 
        || { userId: '', name: 'User', stats: { pending: 0, ongoing: 0, completed: 0, overdue: 0, total: 0 } };

    const canViewTeam = userRole === 'ADMIN' || userRole === 'TEAM_LEAD';

    return (
        <div className="board-view">
            {/* Team Panel - Visible to Admins and Team Leads */}
            {canViewTeam && (
                <div className="board-panel team-panel">
                    <h2 className="panel-title">Team</h2>
                    <div className="stats-row">
                        <div className="stat-circle">
                            <span className="stat-number">{teamTotals.members}</span>
                            <span className="stat-label">Team Members</span>
                        </div>
                        <div className="stat-circle ongoing">
                            <span className="stat-number">{teamTotals.ongoing}</span>
                            <span className="stat-label">Ongoing</span>
                        </div>
                        <div className="stat-circle pending">
                            <span className="stat-number">{teamTotals.pending}</span>
                            <span className="stat-label">Pending</span>
                        </div>
                        <div className="stat-circle overdue">
                            <span className="stat-number">{teamTotals.overdue}</span>
                            <span className="stat-label">Overdue</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Individual Panel - Visible to all roles */}
            <div className="board-panel individual-panel">
                <h2 className="panel-title">{currentUserStats.name}</h2>
                <div className="stats-row">
                    {canViewTeam && (
                        <button className="create-task-btn" onClick={onCreateTask}>
                            Create Task +
                        </button>
                    )}
                    {!canViewTeam && (
                        <button className="create-task-btn" onClick={onCreateTask}>
                            Create Task +
                        </button>
                    )}
                    <div className="stat-circle ongoing">
                        <span className="stat-number">{currentUserStats.stats.ongoing}</span>
                        <span className="stat-label">Ongoing</span>
                    </div>
                    <div className="stat-circle pending">
                        <span className="stat-number">{currentUserStats.stats.pending}</span>
                        <span className="stat-label">Pending</span>
                    </div>
                    <div className="stat-circle overdue">
                        <span className="stat-number">{currentUserStats.stats.overdue}</span>
                        <span className="stat-label">Overdue</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BoardView;
