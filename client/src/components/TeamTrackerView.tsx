import React from 'react';
import '../styles/TrackerView.css';

interface Task {
    id: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    dueDate: string | null;
    assignee?: {
        id: string;
        name: string | null;
        email: string;
    } | null;
    supporter?: {
        id: string;
        name: string | null;
        email: string;
    } | null;
    project?: {
        id: string;
        name: string;
        client?: {
            id: string;
            name: string;
        } | null;
    } | null;
    tag?: {
        id: string;
        name: string;
        color: string;
    } | null;
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
        { key: 'all', label: 'All' },
        { key: 'pending', label: 'Pending' },
        { key: 'ongoing', label: 'Ongoing' },
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

    return (
        <div className="tracker-view">
            <div className="tracker-header">
                <h1 className="tracker-title">Team Tracker</h1>
                <div className="tracker-actions">
                    <button className="btn-create-task" onClick={onCreateTask}>
                        Create Task +
                    </button>
                    <button className="btn-send-alert" onClick={onSendAlert}>
                        Send Alert
                    </button>
                </div>
            </div>

            <div className="member-selector">
                {members.map((member, index) => (
                    <React.Fragment key={member.userId}>
                        <button
                            className={`member-btn ${selectedMemberId === member.userId ? 'active' : ''}`}
                            onClick={() => onMemberSelect(member.userId)}
                        >
                            {member.name}
                        </button>
                        {index < members.length - 1 && <span className="member-separator">|</span>}
                    </React.Fragment>
                ))}
            </div>

            <div className="filter-tabs">
                {filters.map(f => (
                    <button
                        key={f.key}
                        className={`filter-tab ${filter === f.key ? 'active' : ''}`}
                        onClick={() => onFilterChange(f.key)}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            <div className="task-grid">
                {filteredTasks.map(task => (
                    <div
                        key={task.id}
                        className="task-card"
                        onClick={() => onTaskClick(task)}
                    >
                        <div className="task-card-header">
                            <h3 className="task-card-title">{task.title}</h3>
                            <span className={`priority-badge ${task.priority.toLowerCase()}`}>
                                {task.priority}
                            </span>
                        </div>
                        {task.description && (
                            <p className="task-card-description">{task.description}</p>
                        )}
                        <div className="task-card-meta">
                            {task.assignee && (
                                <span className="meta-item">
                                    <strong>Assignee:</strong> {task.assignee.name || task.assignee.email}
                                </span>
                            )}
                            {task.project && (
                                <span className="meta-item">
                                    <strong>Project:</strong> {task.project.name}
                                </span>
                            )}
                            {task.dueDate && (
                                <span className="meta-item">
                                    <strong>Due:</strong> {new Date(task.dueDate).toLocaleDateString()}
                                </span>
                            )}
                        </div>
                        {task.tag && (
                            <span
                                className="task-tag"
                                style={{ borderColor: task.tag.color, color: task.tag.color }}
                            >
                                {task.tag.name}
                            </span>
                        )}
                    </div>
                ))}
            </div>

            {filteredTasks.length === 0 && (
                <div className="empty-state">
                    <p>No tasks found</p>
                </div>
            )}
        </div>
    );
};

export default TeamTrackerView;
