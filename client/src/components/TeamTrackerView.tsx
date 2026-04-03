import React from 'react';
import { useAuth } from '../context/AuthContext';
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
    teamName?: string | null;
    tasks: Task[];
    members: TeamMember[];
    selectedMemberId: string | null;
    onMemberSelect: (memberId: string) => void;
    filter: 'all' | 'my' | 'supporting' | 'pending' | 'ongoing' | 'completed' | 'overdue' | 'created' | 'in_progress' | 'recently_deleted';
    onFilterChange: (filter: 'all' | 'my' | 'supporting' | 'pending' | 'ongoing' | 'completed' | 'overdue') => void;
    onTaskClick: (task: Task) => void;
    onCreateTask: () => void;
    onSendAlert: () => void;
    tags?: Array<{ id: string; name: string; color: string }>;
    userRole?: 'ADMIN' | 'TEAM_LEAD' | 'MEMBER';
}

const TeamTrackerView: React.FC<TeamTrackerViewProps> = ({
    teamName,
    tasks,
    members,
    selectedMemberId,
    onMemberSelect,
    filter,
    onFilterChange,
    onTaskClick,
    onCreateTask,
    onSendAlert,
    tags = [],
    userRole = 'MEMBER'
}) => {
    const { user } = useAuth();
    const userId = user?.id || '';
    const [priorityFilter, setPriorityFilter] = React.useState<string>('all');
    const [tagFilter, setTagFilter] = React.useState<string>('all');

    const filters: Array<{ key: 'all' | 'my' | 'supporting' | 'pending' | 'ongoing' | 'completed' | 'overdue'; label: string }> = userRole === 'ADMIN'
        ? [
            { key: 'all', label: 'All Tasks' },
            { key: 'my', label: 'My Tasks' },
            { key: 'pending', label: 'Pending' },
            { key: 'ongoing', label: 'In Progress' },
            { key: 'completed', label: 'Completed' },
            { key: 'overdue', label: 'Overdue' }
        ]
        : [
            { key: 'all', label: 'All Tasks' },
            { key: 'my', label: 'My Tasks' },
            { key: 'supporting', label: 'Supporting' },
            { key: 'pending', label: 'Pending' },
            { key: 'ongoing', label: 'In Progress' },
            { key: 'completed', label: 'Completed' },
            { key: 'overdue', label: 'Overdue' }
        ];

    const isFilterActive = (key: typeof filters[number]['key']) => {
        if (filter === 'created' && key === 'pending') return true;
        if (filter === 'in_progress' && key === 'ongoing') return true;
        return filter === key;
    };

    // Use useMemo to optimize filtering performance
    const filteredTasks = React.useMemo(() => {
        return tasks.filter(task => {
            // Member filter
            if (selectedMemberId && task.assignee?.id !== selectedMemberId) return false;

            // Status filter - handle both UI filter keys and backend status values
            if (filter === 'pending' || filter === 'created') {
                if (task.status !== 'CREATED') return false;
            } else if (filter === 'ongoing' || filter === 'in_progress') {
                if (task.status !== 'IN_PROGRESS') return false;
            } else if (filter === 'completed') {
                if (task.status !== 'COMPLETED') return false;
            } else if (filter === 'overdue') {
                if (task.status === 'COMPLETED' || !task.dueDate || new Date(task.dueDate) >= new Date()) {
                    return false;
                }
            } else if (filter === 'my') {
                if (task.assignee?.id !== userId) return false;
            } else if (filter === 'supporting') {
                if (task.supporter?.id !== userId) return false;
            }
            // 'all' filter shows everything

            // Priority filter
            if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;

            // Tag/OKR filter
            if (tagFilter !== 'all' && task.tag?.id !== tagFilter) return false;

            return true;
        });
    }, [tasks, selectedMemberId, filter, priorityFilter, tagFilter, userId]);

    const getInitials = (name: string) => {
        return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
    };

    const getStatusLabel = (status: string, dueDate: string | null) => {
        // Check if overdue first (automatic status)
        if (status !== 'COMPLETED' && dueDate && new Date(dueDate) < new Date()) {
            return 'Overdue';
        }
        // Map status to user-friendly labels
        if (status === 'CREATED') return 'Not Started';
        if (status === 'IN_PROGRESS') return 'In Progress';
        if (status === 'COMPLETED') return 'Completed';
        return status.replace('_', ' ').toLowerCase();
    };

    return (
        <div className="tracker-view">
            <div className="tracker-view-header">
                <h1>{teamName ? `${teamName} Team Tracker` : 'Team Tracker'}</h1>
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
                    Everyone
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
                        className={`tracker-tab ${isFilterActive(f.key) ? 'active' : ''}`}
                        onClick={() => onFilterChange(f.key)}
                        style={{ fontSize: '0.85em', padding: '8px 4px' }}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            <div className="tracker-filters" style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <select
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value)}
                    className="tracker-filter-select"
                    style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: '#fff', fontSize: '0.9em', minWidth: '140px' }}
                >
                    <option value="all">All Priorities</option>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                </select>

                <select
                    value={tagFilter}
                    onChange={(e) => setTagFilter(e.target.value)}
                    className="tracker-filter-select"
                    style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: '#fff', fontSize: '0.9em', minWidth: '160px' }}
                >
                    <option value="all">All OKRs</option>
                    {tags.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                </select>

                {(priorityFilter !== 'all' || tagFilter !== 'all') && (
                    <button
                        onClick={() => {
                            setPriorityFilter('all');
                            setTagFilter('all');
                        }}
                        className="btn-secondary"
                        style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', background: '#fff', fontSize: '0.9em', cursor: 'pointer' }}
                    >
                        Clear Filters
                    </button>
                )}
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
                                        <span className={`status-pill ${task.status === 'CREATED' ? 'not-started' : task.status === 'IN_PROGRESS' ? 'in_progress' : task.status === 'COMPLETED' ? 'completed' : task.status.toLowerCase()}`}>
                                            {getStatusLabel(task.status, task.dueDate)}
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
