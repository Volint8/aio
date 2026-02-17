import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import '../styles/Dashboard.css';

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
    organization: {
        id: string;
        name: string;
    };
    createdAt: string;
    comments?: any[];
    attachments?: {
        id: string;
        fileName: string;
        filePath: string;
        fileType: string;
    }[];
}

interface Stats {
    created: number;
    inProgress: number;
    completed: number;
    myTasks: number;
    total: number;
}

interface MemberStats {
    userId: string;
    name: string;
    stats: {
        created: number;
        inProgress: number;
        completed: number;
        total: number;
    };
}

interface Organization {
    id: string;
    name: string;
    userRole: string;
    members?: any[];
}

const DashboardPage = () => {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [memberStats, setMemberStats] = useState<MemberStats[]>([]);
    const [organization, setOrganization] = useState<Organization | null>(null);
    const [viewMode, setViewMode] = useState<'my' | 'team'>('my');
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'my' | 'created' | 'in_progress' | 'completed'>('all');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newTask, setNewTask] = useState({
        title: '',
        description: '',
        priority: 'LOW',
        dueDate: '',
        assigneeId: ''
    });
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const orgId = localStorage.getItem('selectedOrgId');

    useEffect(() => {
        if (!orgId) {
            navigate('/organizations');
            return;
        }
        fetchData();
    }, [orgId, filter]);

    const fetchData = async () => {
        try {
            const [tasksRes, statsRes, orgRes] = await Promise.all([
                api.get('/tasks', { params: { organizationId: orgId } }),
                api.get('/tasks/stats', { params: { organizationId: orgId } }),
                api.get(`/orgs/${orgId}`)
            ]);

            if (orgRes.data.userRole === 'ADMIN') {
                const memberStatsRes = await api.get('/tasks/team-stats', { params: { organizationId: orgId } });
                setMemberStats(memberStatsRes.data);
            }

            let filteredTasks = tasksRes.data;
            if (filter === 'my') {
                filteredTasks = filteredTasks.filter((t: Task) => t.assignee?.id === user?.id);
            } else if (filter !== 'all') {
                const statusMap: any = {
                    created: 'CREATED',
                    in_progress: 'IN_PROGRESS',
                    completed: 'COMPLETED'
                };
                filteredTasks = filteredTasks.filter((t: Task) => t.status === statusMap[filter]);
            }

            setTasks(filteredTasks);
            setStats(statsRes.data);
            setOrganization(orgRes.data);
        } catch (error) {
            console.error('Failed to fetch data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateTask = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/tasks', {
                ...newTask,
                organizationId: orgId,
                assigneeId: newTask.assigneeId || user?.id
            });
            setNewTask({ title: '', description: '', priority: 'LOW', dueDate: '', assigneeId: '' });
            setShowCreateModal(false);
            fetchData();
        } catch (error: any) {
            alert(error.response?.data?.error || 'Failed to create task');
        }
    };

    const handleUpdateTaskStatus = async (taskId: string, newStatus: string) => {
        try {
            await api.put(`/tasks/${taskId}`, { status: newStatus });
            fetchData();
        } catch (error: any) {
            alert(error.response?.data?.error || 'Failed to update task');
        }
    };

    if (loading) {
        return <div className="dashboard loading">Loading...</div>;
    }

    const isAdmin = organization?.userRole === 'ADMIN';

    return (
        <div className="dashboard">
            <div className="dashboard-container">
                <div className="dashboard-header">
                    <div>
                        <h1>{organization?.name || 'Workspace'}</h1>
                        <p className="org-subtitle">
                            {organization?.userRole} • {organization?.members?.length || 0} Team Members
                        </p>
                    </div>
                    <div className="header-actions">
                        <button onClick={() => setShowCreateModal(true)} className="btn-primary">
                            + New Task
                        </button>
                        <button onClick={logout} className="btn-logout">
                            Logout
                        </button>
                    </div>
                </div>

                {isAdmin && (
                    <div className="view-mode-toggle">
                        <button
                            className={viewMode === 'my' ? 'active' : ''}
                            onClick={() => setViewMode('my')}
                        >
                            Operations Board
                        </button>
                        <button
                            className={viewMode === 'team' ? 'active' : ''}
                            onClick={() => setViewMode('team')}
                        >
                            Work Distribution
                        </button>
                    </div>
                )}

                {viewMode === 'team' && isAdmin ? (
                    <div className="team-stats-view">
                        <div className="tasks-header">
                            <h2>Team Work Distribution</h2>
                        </div>
                        <div className="team-stats-grid">
                            {memberStats.map(member => (
                                <div key={member.userId} className="member-stat-row">
                                    <div className="member-info">
                                        <h4>{member.name}</h4>
                                        <span>{member.stats.total} assignments</span>
                                    </div>
                                    <div className="stat-bar-container">
                                        <div
                                            className="stat-bar created"
                                            style={{ width: `${(member.stats.created / (member.stats.total || 1)) * 100}%` }}
                                        ></div>
                                        <div
                                            className="stat-bar progress"
                                            style={{ width: `${(member.stats.inProgress / (member.stats.total || 1)) * 100}%` }}
                                        ></div>
                                        <div
                                            className="stat-bar completed"
                                            style={{ width: `${(member.stats.completed / (member.stats.total || 1)) * 100}%` }}
                                        ></div>
                                    </div>
                                    <div className="member-counts">
                                        <span className="count created">{member.stats.created}</span>
                                        <span className="count progress">{member.stats.inProgress}</span>
                                        <span className="count completed">{member.stats.completed}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <>
                        {stats && (
                            <div className="stats-grid">
                                <div className="stat-card" onClick={() => setFilter('all')}>
                                    <h3>Total Workload</h3>
                                    <p className="stat-value">{stats.total}</p>
                                </div>
                                <div className="stat-card" onClick={() => setFilter('in_progress')}>
                                    <h3>Active Sprints</h3>
                                    <p className="stat-value">{stats.inProgress}</p>
                                </div>
                                <div className="stat-card" onClick={() => setFilter('completed')}>
                                    <h3>Completed Work</h3>
                                    <p className="stat-value">{stats.completed}</p>
                                </div>
                                <div className="stat-card" onClick={() => setFilter('my')}>
                                    <h3>Your Focus</h3>
                                    <p className="stat-value">{stats.myTasks}</p>
                                </div>
                            </div>
                        )}

                        <div className="tasks-section">
                            <div className="tasks-header">
                                <h2>
                                    {filter === 'all' && 'Global Project Timeline'}
                                    {filter === 'my' && 'Active Personal Assignments'}
                                    {filter === 'created' && 'Pending Triage'}
                                    {filter === 'in_progress' && 'Operations in Growth'}
                                    {filter === 'completed' && 'Archive & History'}
                                </h2>
                            </div>

                            <div className="tasks-list">
                                {tasks.length === 0 ? (
                                    <div className="empty-state">
                                        <p>No tasks found</p>
                                        <button onClick={() => setShowCreateModal(true)} className="btn-primary">
                                            Create your first task
                                        </button>
                                    </div>
                                ) : (
                                    tasks.map((task) => (
                                        <div key={task.id} className="task-card">
                                            <div className="task-header">
                                                <h3>{task.title}</h3>
                                                <div className="task-badges">
                                                    <span className={`priority-badge ${task.priority.toLowerCase()}`}>
                                                        {task.priority}
                                                    </span>
                                                    <span className={`status-badge ${task.status.toLowerCase()}`}>
                                                        {task.status.replace('_', ' ')}
                                                    </span>
                                                </div>
                                            </div>

                                            {task.description && (
                                                <p className="task-description">{task.description}</p>
                                            )}

                                            <div className="task-meta">
                                                <div className="meta-item">
                                                    <strong>Owner:</strong> {task.assignee?.name || task.assignee?.email.split('@')[0] || 'Unassigned'}
                                                </div>
                                                {task.dueDate && (
                                                    <div className="meta-item">
                                                        <strong>Deadline:</strong> {new Date(task.dueDate).toLocaleDateString()}
                                                    </div>
                                                )}
                                            </div>

                                            {task.attachments && task.attachments.length > 0 && (
                                                <div className="task-attachments">
                                                    <h4>Documents</h4>
                                                    <ul>
                                                        {task.attachments.map((att: any) => (
                                                            <li key={att.id} className="attachment-item">
                                                                <a href={`http://localhost:3000/${att.filePath}`} target="_blank" rel="noreferrer">
                                                                    📄 {att.fileName}
                                                                </a>
                                                                {isAdmin && (
                                                                    <button
                                                                        className="btn-delete-small"
                                                                        onClick={async () => {
                                                                            if (window.confirm('Delete this attachment?')) {
                                                                                await api.delete(`/tasks/attachments/${att.id}`);
                                                                                fetchData();
                                                                            }
                                                                        }}
                                                                    >
                                                                        Remove
                                                                    </button>
                                                                )}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}

                                            <div className="task-actions">
                                                {task.status !== 'IN_PROGRESS' && task.status !== 'COMPLETED' && (
                                                    <button
                                                        onClick={() => handleUpdateTaskStatus(task.id, 'IN_PROGRESS')}
                                                        className="btn-action"
                                                    >
                                                        Start Work
                                                    </button>
                                                )}
                                                {task.status === 'IN_PROGRESS' && (
                                                    <button
                                                        onClick={() => handleUpdateTaskStatus(task.id, 'COMPLETED')}
                                                        className="btn-action success"
                                                    >
                                                        Complete
                                                    </button>
                                                )}
                                                {task.status === 'COMPLETED' && (
                                                    <button
                                                        onClick={() => handleUpdateTaskStatus(task.id, 'IN_PROGRESS')}
                                                        className="btn-action"
                                                    >
                                                        Re-open
                                                    </button>
                                                )}

                                                <label className="btn-action secondary upload-btn">
                                                    📎 Attach
                                                    <input
                                                        type="file"
                                                        style={{ display: 'none' }}
                                                        onChange={async (e) => {
                                                            if (e.target.files && e.target.files[0]) {
                                                                const formData = new FormData();
                                                                formData.append('file', e.target.files[0]);
                                                                try {
                                                                    await api.post(`/tasks/${task.id}/attachments`, formData, {
                                                                        headers: { 'Content-Type': 'multipart/form-data' }
                                                                    });
                                                                    fetchData();
                                                                } catch (err) {
                                                                    alert('Upload failed');
                                                                }
                                                            }
                                                        }}
                                                    />
                                                </label>
                                            </div>

                                            <div className="task-comments">
                                                <h4>Timeline & Comments</h4>
                                                <div className="comments-list">
                                                    {task.comments?.map((comment: any) => (
                                                        <div key={comment.id} className="comment-item">
                                                            <div className="comment-header">
                                                                <strong>{comment.user.name || comment.user.email}</strong>
                                                                <div className="comment-meta">
                                                                    <span>{new Date(comment.createdAt).toLocaleString()}</span>
                                                                    {(user?.id === comment.userId || organization?.userRole === 'ADMIN') && (
                                                                        <button
                                                                            className="btn-delete-small"
                                                                            onClick={async () => {
                                                                                if (window.confirm('Delete this comment?')) {
                                                                                    await api.delete(`/tasks/comments/${comment.id}`);
                                                                                    fetchData();
                                                                                }
                                                                            }}
                                                                        >
                                                                            Delete
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <p>{comment.content}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="add-comment">
                                                    <input
                                                        type="text"
                                                        placeholder="Write a comment..."
                                                        onKeyDown={async (e) => {
                                                            if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
                                                                const content = (e.target as HTMLInputElement).value;
                                                                try {
                                                                    await api.post(`/tasks/${task.id}/comments`, { content });
                                                                    (e.target as HTMLInputElement).value = '';
                                                                    fetchData();
                                                                } catch (err) {
                                                                    alert('Failed to add comment');
                                                                }
                                                            }
                                                        }}
                                                    />
                                                </div>
                                            </div>

                                            {task.attachments && task.attachments.length > 0 && (
                                                <div className="task-attachments">
                                                    <h4>Attachments</h4>
                                                    <ul>
                                                        {task.attachments.map((att) => (
                                                            <li key={att.id} className="attachment-item">
                                                                <a href={`http://localhost:3000/${att.filePath}`} target="_blank" rel="noopener noreferrer">
                                                                    📄 {att.fileName}
                                                                </a>
                                                                {organization?.userRole === 'ADMIN' && (
                                                                    <button
                                                                        className="btn-delete-small"
                                                                        onClick={async () => {
                                                                            if (window.confirm('Delete this attachment?')) {
                                                                                await api.delete(`/tasks/attachments/${att.id}`);
                                                                                fetchData();
                                                                            }
                                                                        }}
                                                                    >
                                                                        Remove
                                                                    </button>
                                                                )}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {showCreateModal && (
                            <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
                                <div className="modal large" onClick={(e) => e.stopPropagation()}>
                                    <h2>Create New Task</h2>
                                    <form onSubmit={handleCreateTask}>
                                        <div className="form-group">
                                            <label>Title *</label>
                                            <input
                                                type="text"
                                                value={newTask.title}
                                                onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                                                required
                                                autoFocus
                                            />
                                        </div>

                                        <div className="form-group">
                                            <label>Description</label>
                                            <textarea
                                                value={newTask.description}
                                                onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                                                rows={4}
                                            />
                                        </div>

                                        <div className="form-row">
                                            <div className="form-group">
                                                <label>Priority</label>
                                                <select
                                                    value={newTask.priority}
                                                    onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                                                >
                                                    <option value="LOW">Low</option>
                                                    <option value="MEDIUM">Medium</option>
                                                    <option value="HIGH">High</option>
                                                </select>
                                            </div>

                                            <div className="form-group">
                                                <label>Due Date</label>
                                                <input
                                                    type="date"
                                                    value={newTask.dueDate}
                                                    onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                                                />
                                            </div>
                                        </div>

                                        {isAdmin && organization?.members && (
                                            <div className="form-group">
                                                <label>Assign To</label>
                                                <select
                                                    value={newTask.assigneeId}
                                                    onChange={(e) => setNewTask({ ...newTask, assigneeId: e.target.value })}
                                                >
                                                    <option value="">Myself</option>
                                                    {organization.members.map((member: any) => (
                                                        <option key={member.user.id} value={member.user.id}>
                                                            {member.user.name || member.user.email}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        <div className="modal-actions">
                                            <button
                                                type="button"
                                                onClick={() => setShowCreateModal(false)}
                                                className="btn-secondary"
                                            >
                                                Cancel
                                            </button>
                                            <button type="submit" className="btn-primary">
                                                Create Task
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default DashboardPage;
