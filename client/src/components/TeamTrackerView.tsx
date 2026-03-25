import React from 'react';
import '../styles/TrackerView.css';

interface Task {
    id: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    dueDate: string | null;
    assignee: {
        id: string;
        name: string | null;
        email: string;
    } | null;
    supporter?: {
        id: string;
        name: string | null;
        email: string;
    } | null;
    tag?: {
        id: string;
        name: string;
        color: string;
    } | null;
    createdAt: string;
}

interface TeamMember {
    userId: string;
    name: string;
}

interface TeamTrackerViewProps {
    tasks: Task[];
    members: TeamMember[];
    selectedMemberId: string | null;
    onMemberSelect: (memberId: string) => void;
    filter: 'all' | 'pending' | 'ongoing' | 'completed' | 'overdue';
    onFilterChange: (filter: 'all' | 'pending' | 'ongoing' | 'completed' | 'overdue') => void;
    onTaskClick: (task: Task) => void;
    onCreateTask: () => void;
    onSendAlert: () => void;
}

const TeamTrackerView: React.FC<TeamTrackerViewProps> = ({
    tasks,
    members,
    selectedMemberId,
    onMemberSelect,
    filter,
    onFilterChange,
    onTaskClick,
    onCreateTask,
    onSendAlert
}) => {
    const filters: Array<{ key: 'all' | 'pending' | 'ongoing' | 'completed' | 'overdue'; label: string }> = [
        { key: 'all', label: 'All Tasks' },
        { key: 'pending', label: 'Pending' },
        { key: 'ongoing', label: 'In Progress' },
        { key: 'completed', label: 'Completed' },
        { key: 'overdue', label: 'Overdue' }
    ];

    const filteredTasks = tasks.filter(task => {
        if (selectedMemberId && task.assignee?.id !== selectedMemberId) return false;
        
        if (filter === 'all') return true;
        if (filter === 'pending') return task.status === 'CREATED';
        if (filter === 'ongoing') return task.status === 'IN_PROGRESS';
        if (filter === 'completed') return task.status === 'COMPLETED';
        if (filter === 'overdue') {
            return task.status !== 'COMPLETED' && task.dueDate && new Date(task.dueDate) < new Date();
        }
        return true;
    });

    const getInitials = (name: string) => {
        return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
    };

    const getStatusLabel = (status: string) => {
        return status.replace('_', ' ').toLowerCase();
    };

    return (
        <div className="tracker-view">
            <div className="tracker-view-header">
                <h1>Team Tracker</h1>
                <div className="tracker-view-actions">
                    <button className="btn-outline-blue" onClick={onSendAlert}>
                        Send Alert
                    </button>
                    <button className="btn-primary-green" onClick={onCreateTask}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        New Task
                    </button>
                </div>
            </div>

            <div className="tracker-tabs" style={{ gap: '12px' }}>
                <button
                    className={`tracker-tab ${!selectedMemberId ? 'active' : ''}`}
                    onClick={() => onMemberSelect('')}
                >
                    Everywhere
                </button>
                {members.map((member) => (
                    <button
                        key={member.userId}
                        className={`tracker-tab ${selectedMemberId === member.userId ? 'active' : ''}`}
                        onClick={() => onMemberSelect(member.userId)}
                    >
                        {member.name}
                    </button>
                ))}
            </div>

            <div className="tracker-tabs" style={{ marginBottom: '16px' }}>
                {filters.map(f => (
                    <button
                        key={f.key}
                        className={`tracker-tab ${filter === f.key ? 'active' : ''}`}
                        onClick={() => onFilterChange(f.key)}
                        style={{ fontSize: '0.85em', padding: '8px 4px' }}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            <div className="tracker-table-container">
                <table className="tracker-table">
                    <thead>
                        <tr>
                            <th>Task Name</th>
                            <th>OKR</th>
                            <th>Owner</th>
                            <th>Status</th>
                            <th>Priority</th>
                            <th>Timeline</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredTasks.length > 0 ? (
                            filteredTasks.map(task => (
                                <tr key={task.id} className="task-row" onClick={() => onTaskClick(task)}>
                                    <td className="task-title-cell">{task.title}</td>
                                    <td>
                                        {task.tag ? (
                                            <span 
                                                className="task-tag-pill" 
                                                style={{ backgroundColor: `${task.tag.color}15`, color: task.tag.color, borderColor: `${task.tag.color}30` }}
                                            >
                                                {task.tag.name}
                                            </span>
                                        ) : '-'}
                                    </td>
                                    <td>
                                        <div className="owner-cell">
                                            <div className="owner-avatar">
                                                {getInitials(task.assignee?.name || task.assignee?.email || 'U')}
                                            </div>
                                            <span>{task.assignee?.name || task.assignee?.email.split('@')[0]}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`status-pill ${task.status.toLowerCase()}`}>
                                            {getStatusLabel(task.status)}
                                        </span>
                                    </td>
                                    <td>
                                        <div className="priority-indicator">
                                            <span className={`priority-dot ${task.priority.toLowerCase()}`}></span>
                                            <span>{task.priority}</span>
                                        </div>
                                    </td>
                                    <td className="timeline-cell">
                                        {task.dueDate ? new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '-'}
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={6} className="tracker-empty">
                                    No tasks found for this member or filter.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default TeamTrackerView;
