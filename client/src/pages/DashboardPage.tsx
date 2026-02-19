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
    deletedAt?: string | null;
    deletedById?: string | null;
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

const COMMENTS_PREVIEW_COUNT = 4;
const RETENTION_DAYS = 30;
type TaskFilter = 'all' | 'my' | 'created' | 'in_progress' | 'completed' | 'recently_deleted';

const DashboardPage = () => {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [memberStats, setMemberStats] = useState<MemberStats[]>([]);
    const [organization, setOrganization] = useState<Organization | null>(null);
    const [viewMode, setViewMode] = useState<'my' | 'team'>('my');
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<TaskFilter>('all');
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [expandedCommentThreads, setExpandedCommentThreads] = useState<Record<string, boolean>>({});
    const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
    const [submittingCommentTaskId, setSubmittingCommentTaskId] = useState<string | null>(null);
    const [newTask, setNewTask] = useState({
        title: '',
        description: '',
        priority: 'LOW',
        dueDate: '',
        assigneeId: ''
    });
    const { user } = useAuth();
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
            const isDeletedView = filter === 'recently_deleted';
            const [tasksRes, statsRes, orgRes] = await Promise.all([
                api.get('/tasks', {
                    params: {
                        organizationId: orgId,
                        view: isDeletedView ? 'deleted' : 'active'
                    }
                }),
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
            } else if (filter !== 'all' && filter !== 'recently_deleted') {
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
            const errorData = error.response?.data?.error;
            const message = typeof errorData === 'object' ? errorData.message : errorData;
            alert(message || 'Failed to create task');
        }
    };

    const handleUpdateTaskStatus = async (taskId: string, newStatus: string) => {
        try {
            await api.put(`/tasks/${taskId}`, { status: newStatus });
            fetchData();
        } catch (error: any) {
            const errorData = error.response?.data?.error;
            const message = typeof errorData === 'object' ? errorData.message : errorData;
            alert(message || 'Failed to update task');
        }
    };

    const handleDeleteTask = async (taskId: string) => {
        if (!window.confirm('Move this task to Recently Deleted?')) {
            return;
        }

        try {
            await api.delete(`/tasks/${taskId}`);
            setSelectedTaskId(null);
            await fetchData();
        } catch (error: any) {
            const errorData = error.response?.data?.error;
            const message = typeof errorData === 'object' ? errorData.message : errorData;
            alert(message || 'Failed to delete task');
        }
    };

    const handleRestoreTask = async (taskId: string) => {
        try {
            await api.post(`/tasks/${taskId}/restore`);
            setSelectedTaskId(null);
            await fetchData();
        } catch (error: any) {
            const errorData = error.response?.data?.error;
            const message = typeof errorData === 'object' ? errorData.message : errorData;
            alert(message || 'Failed to restore task');
        }
    };

    const getDaysUntilPurge = (deletedAt: string | null | undefined) => {
        if (!deletedAt) {
            return RETENTION_DAYS;
        }

        const deletedTime = new Date(deletedAt).getTime();
        const purgeTime = deletedTime + RETENTION_DAYS * 24 * 60 * 60 * 1000;
        const remainingMs = purgeTime - Date.now();
        return Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
    };

    const handleAddComment = async (taskId: string) => {
        const content = (commentDrafts[taskId] || '').trim();
        if (!content) {
            return;
        }

        try {
            setSubmittingCommentTaskId(taskId);
            await api.post(`/tasks/${taskId}/comments`, { content });
            setCommentDrafts((prev) => ({ ...prev, [taskId]: '' }));
            await fetchData();
        } catch (err) {
            alert('Failed to add comment');
        } finally {
            setSubmittingCommentTaskId(null);
        }
    };

    useEffect(() => {
        if (tasks.length === 0) {
            setSelectedTaskId(null);
            return;
        }

        const selectedStillVisible = selectedTaskId && tasks.some((task) => task.id === selectedTaskId);
        if (!selectedStillVisible) {
            setSelectedTaskId(null);
        }
    }, [tasks, selectedTaskId]);

    if (loading) {
        return <div className="dashboard loading">Loading...</div>;
    }

    const isAdmin = organization?.userRole === 'ADMIN';
    const isDeletedView = filter === 'recently_deleted';
    const selectedTask = tasks.find((task) => task.id === selectedTaskId) || null;

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
                                    {filter === 'recently_deleted' && 'Recently Deleted (auto purged after 30 days)'}
                                </h2>
                                <div className="filter-group">
                                    <button type="button" className={`btn-filter ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
                                        All
                                    </button>
                                    <button type="button" className={`btn-filter ${filter === 'my' ? 'active' : ''}`} onClick={() => setFilter('my')}>
                                        My Tasks
                                    </button>
                                    <button type="button" className={`btn-filter ${filter === 'created' ? 'active' : ''}`} onClick={() => setFilter('created')}>
                                        Created
                                    </button>
                                    <button type="button" className={`btn-filter ${filter === 'in_progress' ? 'active' : ''}`} onClick={() => setFilter('in_progress')}>
                                        In Progress
                                    </button>
                                    <button type="button" className={`btn-filter ${filter === 'completed' ? 'active' : ''}`} onClick={() => setFilter('completed')}>
                                        Completed
                                    </button>
                                    {isAdmin && (
                                        <button
                                            type="button"
                                            className={`btn-filter ${filter === 'recently_deleted' ? 'active' : ''}`}
                                            onClick={() => setFilter('recently_deleted')}
                                        >
                                            Recently Deleted
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="tasks-workspace">
                                <div className="tasks-list">
                                    {tasks.length === 0 ? (
                                        <div className="empty-state">
                                            <p>{isDeletedView ? 'No deleted tasks' : 'No tasks found'}</p>
                                            {!isDeletedView && (
                                                <button onClick={() => setShowCreateModal(true)} className="btn-primary">
                                                    Create your first task
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        tasks.map((task) => (
                                            <button
                                                key={task.id}
                                                type="button"
                                                className={`task-card task-card-compact ${selectedTaskId === task.id ? 'active' : ''}`}
                                                onClick={() => setSelectedTaskId(task.id)}
                                            >
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
                                                    <p className="task-description task-description-compact">{task.description}</p>
                                                )}

                                                <div className="task-meta">
                                                    {isDeletedView ? (
                                                        <>
                                                            <div className="meta-item">
                                                                <strong>Deleted:</strong> {task.deletedAt ? new Date(task.deletedAt).toLocaleDateString() : 'Unknown'}
                                                            </div>
                                                            <div className="meta-item">
                                                                <strong>Purge In:</strong> {getDaysUntilPurge(task.deletedAt)} day(s)
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <div className="meta-item">
                                                                <strong>Owner:</strong> {task.assignee?.name || task.assignee?.email.split('@')[0] || 'Unassigned'}
                                                            </div>
                                                            <div className="meta-item">
                                                                <strong>Comments:</strong> {task.comments?.length || 0}
                                                            </div>
                                                            <div className="meta-item">
                                                                <strong>Attachments:</strong> {task.attachments?.length || 0}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </button>
                                        ))
                                    )}
                                </div>

                                <aside className={`task-detail-panel ${selectedTask ? 'open' : ''}`}>
                                    {selectedTask ? (
                                        <div className="task-detail-content" key={selectedTask.id}>
                                            <div className="task-detail-header">
                                                <h3>{selectedTask.title}</h3>
                                                <div className="task-badges">
                                                    <span className={`priority-badge ${selectedTask.priority.toLowerCase()}`}>
                                                        {selectedTask.priority}
                                                    </span>
                                                    <span className={`status-badge ${selectedTask.status.toLowerCase()}`}>
                                                        {selectedTask.status.replace('_', ' ')}
                                                    </span>
                                                </div>
                                            </div>

                                            {selectedTask.description && (
                                                <p className="task-description">{selectedTask.description}</p>
                                            )}

                                            <div className="task-meta">
                                                {isDeletedView ? (
                                                    <>
                                                        <div className="meta-item">
                                                            <strong>Deleted:</strong> {selectedTask.deletedAt ? new Date(selectedTask.deletedAt).toLocaleDateString() : 'Unknown'}
                                                        </div>
                                                        <div className="meta-item">
                                                            <strong>Purge In:</strong> {getDaysUntilPurge(selectedTask.deletedAt)} day(s)
                                                        </div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className="meta-item">
                                                            <strong>Owner:</strong> {selectedTask.assignee?.name || selectedTask.assignee?.email.split('@')[0] || 'Unassigned'}
                                                        </div>
                                                        {selectedTask.dueDate && (
                                                            <div className="meta-item">
                                                                <strong>Deadline:</strong> {new Date(selectedTask.dueDate).toLocaleDateString()}
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>

                                            <div className="task-actions">
                                                {isDeletedView ? (
                                                    <button
                                                        onClick={() => handleRestoreTask(selectedTask.id)}
                                                        className="btn-action success"
                                                    >
                                                        Restore Task
                                                    </button>
                                                ) : (
                                                    <>
                                                        {selectedTask.status !== 'IN_PROGRESS' && selectedTask.status !== 'COMPLETED' && (
                                                            <button
                                                                onClick={() => handleUpdateTaskStatus(selectedTask.id, 'IN_PROGRESS')}
                                                                className="btn-action"
                                                            >
                                                                Start Work
                                                            </button>
                                                        )}
                                                        {selectedTask.status === 'IN_PROGRESS' && (
                                                            <button
                                                                onClick={() => handleUpdateTaskStatus(selectedTask.id, 'COMPLETED')}
                                                                className="btn-action success"
                                                            >
                                                                Complete
                                                            </button>
                                                        )}
                                                        {selectedTask.status === 'COMPLETED' && (
                                                            <button
                                                                onClick={() => handleUpdateTaskStatus(selectedTask.id, 'IN_PROGRESS')}
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
                                                                            await api.post(`/tasks/${selectedTask.id}/attachments`, formData, {
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

                                                        {isAdmin && (
                                                            <button
                                                                onClick={() => handleDeleteTask(selectedTask.id)}
                                                                className="btn-action danger"
                                                            >
                                                                Move to Recently Deleted
                                                            </button>
                                                        )}
                                                    </>
                                                )}
                                            </div>

                                            {selectedTask.attachments && selectedTask.attachments.length > 0 && (
                                                <div className="task-attachments">
                                                    <h4>Attachments</h4>
                                                    <ul>
                                                        {selectedTask.attachments.map((att) => (
                                                            <li key={att.id} className="attachment-item">
                                                                <a href={`${api.defaults.baseURL}/${att.filePath}`} target="_blank" rel="noopener noreferrer">
                                                                    📄 {att.fileName}
                                                                </a>
                                                                {organization?.userRole === 'ADMIN' && !isDeletedView && (
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

                                            <div className="task-comments">
                                                <div className="task-comments-header">
                                                    <h4>Timeline & Comments</h4>
                                                    <span className="comments-count">
                                                        {selectedTask.comments?.length || 0} {(selectedTask.comments?.length || 0) === 1 ? 'entry' : 'entries'}
                                                    </span>
                                                </div>
                                                <div className="comments-list">
                                                    {(expandedCommentThreads[selectedTask.id]
                                                        ? (selectedTask.comments || [])
                                                        : (selectedTask.comments || []).slice(0, COMMENTS_PREVIEW_COUNT)
                                                    ).map((comment: any) => (
                                                        <div key={comment.id} className="comment-item">
                                                            <div className="comment-header">
                                                                <strong>{comment.user.name || comment.user.email}</strong>
                                                                <div className="comment-meta">
                                                                    <span>{new Date(comment.createdAt).toLocaleString()}</span>
                                                                    {!isDeletedView && (user?.id === comment.userId || organization?.userRole === 'ADMIN') && (
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
                                                            <p className="comment-content">{comment.content}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                                {(selectedTask.comments?.length || 0) > COMMENTS_PREVIEW_COUNT && (
                                                    <button
                                                        type="button"
                                                        className="btn-thread-toggle"
                                                        onClick={() => setExpandedCommentThreads((prev) => ({
                                                            ...prev,
                                                            [selectedTask.id]: !prev[selectedTask.id]
                                                        }))}
                                                    >
                                                        {expandedCommentThreads[selectedTask.id]
                                                            ? `Show recent ${COMMENTS_PREVIEW_COUNT}`
                                                            : `Show all ${selectedTask.comments?.length} comments`}
                                                    </button>
                                                )}
                                                {!isDeletedView && (
                                                    <form
                                                        className="add-comment"
                                                        onSubmit={async (e) => {
                                                            e.preventDefault();
                                                            await handleAddComment(selectedTask.id);
                                                        }}
                                                    >
                                                        <textarea
                                                            value={commentDrafts[selectedTask.id] || ''}
                                                            placeholder="Write a comment..."
                                                            rows={2}
                                                            onChange={(e) =>
                                                                setCommentDrafts((prev) => ({
                                                                    ...prev,
                                                                    [selectedTask.id]: e.target.value
                                                                }))
                                                            }
                                                            onKeyDown={async (e) => {
                                                                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                                                                    e.preventDefault();
                                                                    await handleAddComment(selectedTask.id);
                                                                }
                                                            }}
                                                        />
                                                        <button
                                                            type="submit"
                                                            className="btn-action success"
                                                            disabled={submittingCommentTaskId === selectedTask.id || !(commentDrafts[selectedTask.id] || '').trim()}
                                                        >
                                                            {submittingCommentTaskId === selectedTask.id ? 'Posting...' : 'Post'}
                                                        </button>
                                                    </form>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="task-detail-empty">
                                            <p>Select a task to view full details</p>
                                        </div>
                                    )}
                                </aside>
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

                                        {organization?.members && (
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
