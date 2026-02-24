import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import '../styles/Dashboard.css';

interface Tag {
    id: string;
    name: string;
    color: string;
}

interface Attachment {
    id: string;
    type?: string;
    fileName?: string | null;
    filePath?: string | null;
    fileType?: string | null;
    url?: string | null;
}

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
    taskTeams?: Array<{
        id: string;
        team: {
            id: string;
            name: string;
        };
    }>;
    tag?: Tag | null;
    createdAt: string;
    deletedAt?: string | null;
    comments?: any[];
    attachments?: Attachment[];
}

interface Stats {
    created: number;
    inProgress: number;
    completed: number;
    myTasks: number;
    total: number;
}

interface OrganizationMember {
    id: string;
    userId: string;
    role: string;
    teamId?: string | null;
    user: {
        id: string;
        email: string;
        name: string | null;
    };
}

interface Team {
    id: string;
    name: string;
    leadUser: { id: string; name: string | null; email: string };
    stats: { created: number; inProgress: number; completed: number; total: number };
    members: Array<{
        id?: string;
        userId?: string;
        name?: string | null;
        email?: string;
        role: string;
        stats?: { created: number; inProgress: number; completed: number; total: number };
    }>;
    people?: Array<{
        userId: string;
        name: string;
        role: string;
        stats: { created: number; inProgress: number; completed: number; total: number };
    }>;
}

interface Organization {
    id: string;
    name: string;
    userRole: string;
    members?: OrganizationMember[];
}

interface Okr {
    id: string;
    title: string;
    description?: string | null;
    periodStart: string;
    periodEnd: string;
    keyResults?: Array<{
        id: string;
        title: string;
        tag: Tag;
    }>;
}

interface Appraisal {
    id: string;
    cycle: string;
    summary: string;
    status: string;
    subjectUser?: { id: string; name?: string | null; email: string };
}

type DashboardSection = 'tracker' | 'team' | 'tags' | 'okrs' | 'appraisals';
type TaskFilter = 'all' | 'my' | 'created' | 'in_progress' | 'completed' | 'recently_deleted';

const COMMENTS_PREVIEW_COUNT = 4;
const RETENTION_DAYS = 30;

const DashboardPage = () => {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [organization, setOrganization] = useState<Organization | null>(null);
    const [tags, setTags] = useState<Tag[]>([]);
    const [okrs, setOkrs] = useState<Okr[]>([]);
    const [appraisals, setAppraisals] = useState<Appraisal[]>([]);
    const [teams, setTeams] = useState<Team[]>([]);

    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<TaskFilter>('all');
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [expandedCommentThreads, setExpandedCommentThreads] = useState<Record<string, boolean>>({});
    const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
    const [submittingCommentTaskId, setSubmittingCommentTaskId] = useState<string | null>(null);

    const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
    const [showCreateTagModal, setShowCreateTagModal] = useState(false);
    const [showCreateOkrModal, setShowCreateOkrModal] = useState(false);
    const [showCreateAppraisalModal, setShowCreateAppraisalModal] = useState(false);
    const [showAddLinkModal, setShowAddLinkModal] = useState(false);
    const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
    const [editingTeam, setEditingTeam] = useState<Team | null>(null);
    const [showEditTaskModal, setShowEditTaskModal] = useState(false);

    const [newTask, setNewTask] = useState({
        title: '',
        description: '',
        priority: 'LOW',
        dueDate: '',
        assigneeId: '',
        supporterId: '',
        tagId: ''
    });

    const [editTask, setEditTask] = useState({
        id: '',
        title: '',
        description: '',
        priority: 'LOW',
        dueDate: '',
        assigneeId: '',
        supporterId: '',
        tagId: ''
    });

    const [newTag, setNewTag] = useState({ name: '', color: '#2563eb' });
    const [newOkr, setNewOkr] = useState({
        title: '',
        description: '',
        periodStart: '',
        periodEnd: '',
        keyResults: [{ title: '', tagName: '', tagColor: '#2563eb' }]
    });
    const [newAppraisal, setNewAppraisal] = useState({ subjectUserId: '', cycle: '', summary: '' });
    const [newLink, setNewLink] = useState({ taskId: '', url: '', fileName: '' });
    const [teamForm, setTeamForm] = useState({
        name: '',
        leadUserId: '',
        memberUserIds: [] as string[]
    });

    const { user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const orgId = localStorage.getItem('selectedOrgId');

    const requestedSection = (new URLSearchParams(location.search).get('section') || 'tracker') as DashboardSection;
    const isAdmin = organization?.userRole === 'ADMIN';
    const isTeamLead = organization?.userRole === 'TEAM_LEAD';
    const isMember = organization?.userRole === 'MEMBER';
    const canTrackTeam = organization?.userRole === 'ADMIN' || organization?.userRole === 'TEAM_LEAD';

    const currentSection: DashboardSection = useMemo(() => {
        if (requestedSection === 'team' && canTrackTeam) return 'team';
        if (requestedSection === 'tags' && isAdmin) return 'tags';
        if (requestedSection === 'okrs' && (isAdmin || isTeamLead || isMember)) return 'okrs';
        if (requestedSection === 'appraisals' && isAdmin) return 'appraisals';
        return 'tracker';
    }, [requestedSection, canTrackTeam, isAdmin, isTeamLead, isMember]);

    const assignableUsers = (organization?.members || []).filter((member) => member.role !== 'ADMIN');
    const teamLeadUsers = (organization?.members || []).filter((member) => member.role === 'TEAM_LEAD');

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
            const [tasksRes, statsRes, orgRes, tagsRes, okrRes, appraisalRes] = await Promise.all([
                api.get('/tasks', {
                    params: {
                        organizationId: orgId,
                        view: isDeletedView ? 'deleted' : 'active'
                    }
                }),
                api.get('/tasks/stats', { params: { organizationId: orgId } }),
                api.get(`/orgs/${orgId}`),
                api.get(`/orgs/${orgId}/tags`),
                api.get(`/orgs/${orgId}/okrs`),
                api.get(`/orgs/${orgId}/appraisals`)
            ]);

            const role = orgRes.data.userRole;
            localStorage.setItem('selectedOrgRole', role);

            if (role === 'ADMIN') {
                const teamsRes = await api.get(`/orgs/${orgId}/teams`);
                setTeams(teamsRes.data || []);
            } else if (role === 'TEAM_LEAD') {
                const distRes = await api.get('/tasks/team-distribution', { params: { organizationId: orgId } });
                setTeams((distRes.data || []).map((item: any) => ({
                    id: item.teamId,
                    name: item.teamName,
                    leadUser: item.leadUser,
                    stats: item.stats,
                    members: [],
                    people: item.people || []
                })));
            } else {
                setTeams([]);
            }

            let filteredTasks = tasksRes.data as Task[];
            if (filter === 'my') {
                filteredTasks = filteredTasks.filter((t: Task) => t.assignee?.id === user?.id);
            } else if (filter !== 'all' && filter !== 'recently_deleted') {
                const statusMap: Record<string, string> = {
                    created: 'CREATED',
                    in_progress: 'IN_PROGRESS',
                    completed: 'COMPLETED'
                };
                filteredTasks = filteredTasks.filter((t: Task) => t.status === statusMap[filter]);
            }

            setTasks(filteredTasks);
            setStats(statsRes.data);
            setOrganization(orgRes.data);
            setTags(tagsRes.data || []);
            setOkrs(okrRes.data || []);
            setAppraisals(appraisalRes.data || []);

            if (tagsRes.data?.[0]?.id) {
                setNewTask((prev) => ({ ...prev, tagId: prev.tagId || tagsRes.data[0].id }));
                setEditTask((prev) => ({ ...prev, tagId: prev.tagId || tagsRes.data[0].id }));
            }
        } catch (error) {
            console.error('Failed to fetch data:', error);
        } finally {
            setLoading(false);
        }
    };

    const selectedTask = tasks.find((task) => task.id === selectedTaskId) || null;
    const isDeletedView = filter === 'recently_deleted';

    const getDaysUntilPurge = (deletedAt: string | null | undefined) => {
        if (!deletedAt) return RETENTION_DAYS;
        const deletedTime = new Date(deletedAt).getTime();
        const purgeTime = deletedTime + RETENTION_DAYS * 24 * 60 * 60 * 1000;
        const remainingMs = purgeTime - Date.now();
        return Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
    };

    const handleCreateTask = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (!newTask.assigneeId) {
                alert('Primary assignee is required');
                return;
            }
            if (newTask.supporterId && newTask.supporterId === newTask.assigneeId) {
                alert('Supporter cannot be the same as primary assignee');
                return;
            }
            await api.post('/tasks', {
                ...newTask,
                organizationId: orgId
            });
            setNewTask({ title: '', description: '', priority: 'LOW', dueDate: '', assigneeId: '', supporterId: '', tagId: tags[0]?.id || '' });
            setShowCreateTaskModal(false);
            await fetchData();
        } catch (error: any) {
            const errorData = error.response?.data?.error;
            alert((typeof errorData === 'object' ? errorData.message : errorData) || 'Failed to create task');
        }
    };

    const handleOpenEditTask = (task: Task) => {
        setEditTask({
            id: task.id,
            title: task.title,
            description: task.description || '',
            priority: task.priority,
            dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
            assigneeId: task.assignee?.id || '',
            supporterId: task.supporter?.id || '',
            tagId: task.tag?.id || tags[0]?.id || ''
        });
        setShowEditTaskModal(true);
    };

    const handleUpdateTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editTask.assigneeId) {
            alert('Primary assignee is required');
            return;
        }
        if (editTask.supporterId && editTask.supporterId === editTask.assigneeId) {
            alert('Supporter cannot be the same as primary assignee');
            return;
        }
        try {
            await api.put(`/tasks/${editTask.id}`, {
                title: editTask.title,
                description: editTask.description,
                priority: editTask.priority,
                dueDate: editTask.dueDate || null,
                assigneeId: editTask.assigneeId,
                supporterId: editTask.supporterId || null,
                tagId: editTask.tagId
            });
            setShowEditTaskModal(false);
            await fetchData();
        } catch (error: any) {
            const errorData = error.response?.data?.error;
            alert((typeof errorData === 'object' ? errorData.message : errorData) || 'Failed to update task');
        }
    };

    const handleCreateTag = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post(`/orgs/${orgId}/tags`, newTag);
            setNewTag({ name: '', color: '#2563eb' });
            setShowCreateTagModal(false);
            await fetchData();
        } catch (error: any) {
            const errorData = error.response?.data?.error;
            alert((typeof errorData === 'object' ? errorData.message : errorData) || 'Failed to create tag');
        }
    };

    const handleCreateOkr = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post(`/orgs/${orgId}/okrs`, {
                ...newOkr,
                keyResults: newOkr.keyResults.filter((kr) => kr.title.trim() && kr.tagName.trim())
            });
            setNewOkr({
                title: '',
                description: '',
                periodStart: '',
                periodEnd: '',
                keyResults: [{ title: '', tagName: '', tagColor: '#2563eb' }]
            });
            setShowCreateOkrModal(false);
            await fetchData();
        } catch (error: any) {
            const errorData = error.response?.data?.error;
            alert((typeof errorData === 'object' ? errorData.message : errorData) || 'Failed to create OKR');
        }
    };

    const handleCreateAppraisal = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post(`/orgs/${orgId}/appraisals/generate`, newAppraisal);
            setNewAppraisal({ subjectUserId: '', cycle: '', summary: '' });
            setShowCreateAppraisalModal(false);
            await fetchData();
        } catch (error: any) {
            const errorData = error.response?.data?.error;
            alert((typeof errorData === 'object' ? errorData.message : errorData) || 'Failed to generate appraisal');
        }
    };

    const resetTeamForm = () => {
        setTeamForm({ name: '', leadUserId: '', memberUserIds: [] });
    };

    const toggleTeamMember = (userId: string) => {
        setTeamForm((prev) => {
            const exists = prev.memberUserIds.includes(userId);
            const next = exists ? prev.memberUserIds.filter((id) => id !== userId) : [...prev.memberUserIds, userId];
            return { ...prev, memberUserIds: next };
        });
    };

    const handleCreateTeam = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!teamForm.name.trim() || !teamForm.leadUserId) {
            alert('Team name and lead are required');
            return;
        }
        try {
            await api.post(`/orgs/${orgId}/teams`, teamForm);
            setShowCreateTeamModal(false);
            resetTeamForm();
            await fetchData();
        } catch (error: any) {
            const errorData = error.response?.data?.error;
            alert((typeof errorData === 'object' ? errorData.message : errorData) || 'Failed to create team');
        }
    };

    const openEditTeam = (team: Team) => {
        setEditingTeam(team);
        setTeamForm({
            name: team.name,
            leadUserId: team.leadUser.id,
            memberUserIds: (team.members || []).map((m) => m.userId || m.id || '').filter(Boolean)
        });
    };

    const handleUpdateTeam = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingTeam) return;
        try {
            await api.patch(`/orgs/${orgId}/teams/${editingTeam.id}`, teamForm);
            setEditingTeam(null);
            resetTeamForm();
            await fetchData();
        } catch (error: any) {
            const errorData = error.response?.data?.error;
            alert((typeof errorData === 'object' ? errorData.message : errorData) || 'Failed to update team');
        }
    };

    const handleDeleteTeam = async (teamId: string) => {
        if (!window.confirm('Delete this team?')) return;
        try {
            await api.delete(`/orgs/${orgId}/teams/${teamId}`);
            if (editingTeam?.id === teamId) {
                setEditingTeam(null);
                resetTeamForm();
            }
            await fetchData();
        } catch (error: any) {
            const errorData = error.response?.data?.error;
            alert((typeof errorData === 'object' ? errorData.message : errorData) || 'Failed to delete team');
        }
    };

    const handleAddLink = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post(`/tasks/${newLink.taskId}/attachments/link`, {
                url: newLink.url,
                fileName: newLink.fileName || undefined
            });
            setNewLink({ taskId: '', url: '', fileName: '' });
            setShowAddLinkModal(false);
            await fetchData();
        } catch {
            alert('Failed to attach link');
        }
    };

    const handleUpdateTaskStatus = async (taskId: string, newStatus: string) => {
        try {
            await api.put(`/tasks/${taskId}`, { status: newStatus });
            await fetchData();
        } catch {
            alert('Failed to update task');
        }
    };

    const handleDeleteTask = async (taskId: string) => {
        if (!window.confirm('Move this task to Recently Deleted?')) return;
        try {
            await api.delete(`/tasks/${taskId}`);
            setSelectedTaskId(null);
            await fetchData();
        } catch {
            alert('Failed to delete task');
        }
    };

    const handleRestoreTask = async (taskId: string) => {
        try {
            await api.post(`/tasks/${taskId}/restore`);
            setSelectedTaskId(null);
            await fetchData();
        } catch {
            alert('Failed to restore task');
        }
    };

    const handleAddComment = async (taskId: string) => {
        const content = (commentDrafts[taskId] || '').trim();
        if (!content) return;

        try {
            setSubmittingCommentTaskId(taskId);
            await api.post(`/tasks/${taskId}/comments`, { content });
            setCommentDrafts((prev) => ({ ...prev, [taskId]: '' }));
            await fetchData();
        } catch {
            alert('Failed to add comment');
        } finally {
            setSubmittingCommentTaskId(null);
        }
    };

    if (loading) {
        return <div className="dashboard loading">Loading...</div>;
    }

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
                    {currentSection === 'tracker' && (
                        <div className="header-actions">
                            <button onClick={() => setShowCreateTaskModal(true)} className="btn-primary">
                                + New Task
                            </button>
                        </div>
                    )}
                    {currentSection === 'tags' && isAdmin && (
                        <div className="header-actions">
                            <button onClick={() => setShowCreateTagModal(true)} className="btn-primary">+ New Tag</button>
                        </div>
                    )}
                    {currentSection === 'okrs' && isAdmin && (
                        <div className="header-actions">
                            <button onClick={() => setShowCreateOkrModal(true)} className="btn-primary">+ New OKR</button>
                        </div>
                    )}
                    {currentSection === 'appraisals' && isAdmin && (
                        <div className="header-actions">
                            <button onClick={() => setShowCreateAppraisalModal(true)} className="btn-primary">Generate Appraisal</button>
                        </div>
                    )}
                    {currentSection === 'team' && isAdmin && (
                        <div className="header-actions">
                            <button onClick={() => setShowCreateTeamModal(true)} className="btn-primary">+ Create Team</button>
                        </div>
                    )}
                </div>

                {currentSection === 'team' && canTrackTeam && (
                    <div className="team-stats-view">
                        <div className="tasks-header">
                            <h2>{isTeamLead ? 'My Team Work Distribution' : 'Team Work Distribution'}</h2>
                        </div>
                        <div className="team-stats-grid">
                            {teams.map((team) => (
                                <div key={team.id} className="task-card" style={{ padding: '20px' }}>
                                    <div className="tasks-header" style={{ marginBottom: 12 }}>
                                        <div>
                                            <h3 style={{ margin: 0 }}>{team.name}</h3>
                                            <p className="org-subtitle" style={{ marginTop: 4 }}>Lead: {team.leadUser.name || team.leadUser.email}</p>
                                        </div>
                                        {isAdmin && (
                                            <div className="header-actions">
                                                <button className="btn-secondary" onClick={() => openEditTeam(team)}>Edit</button>
                                                <button className="btn-logout" onClick={() => handleDeleteTeam(team.id)}>Delete</button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="stat-bar-container" style={{ marginBottom: 10 }}>
                                        <div className="stat-bar created" style={{ width: `${(team.stats.created / (team.stats.total || 1)) * 100}%` }}></div>
                                        <div className="stat-bar progress" style={{ width: `${(team.stats.inProgress / (team.stats.total || 1)) * 100}%` }}></div>
                                        <div className="stat-bar completed" style={{ width: `${(team.stats.completed / (team.stats.total || 1)) * 100}%` }}></div>
                                    </div>
                                    <div className="member-counts" style={{ justifyContent: 'flex-start', marginBottom: 8 }}>
                                        <span className="count created">{team.stats.created}</span>
                                        <span className="count progress">{team.stats.inProgress}</span>
                                        <span className="count completed">{team.stats.completed}</span>
                                    </div>

                                    <div>
                                        <strong>People</strong>
                                        <div className="team-members-list" style={{ marginTop: 8 }}>
                                            {(team.people || team.members || []).map((person: any) => (
                                                <div className="team-member-row" key={person.userId || person.id}>
                                                    <div className="team-member-info">
                                                        <strong>{person.name || person.email}</strong>
                                                        <span>{person.role}</span>
                                                    </div>
                                                    <div className="team-member-role">
                                                        <span className="role-badge created">{person.stats?.created || 0}</span>
                                                        <span className="role-badge in_progress">{person.stats?.inProgress || 0}</span>
                                                        <span className="role-badge completed">{person.stats?.completed || 0}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {currentSection === 'tags' && isAdmin && (
                    <div className="tasks-section">
                        <div className="tasks-header"><h2>Organization Tags</h2></div>
                        <div className="tasks-list">
                            {tags.map((tag) => (
                                <div key={tag.id} className="task-card" style={{ padding: '16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ width: 12, height: 12, borderRadius: 999, background: tag.color, display: 'inline-block' }}></span>
                                        <strong>{tag.name}</strong>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {currentSection === 'okrs' && (isAdmin || isTeamLead || isMember) && (
                    <div className="tasks-section">
                        <div className="tasks-header"><h2>{(isTeamLead || isMember) ? 'My Team OKRs' : 'Global OKRs'}</h2></div>
                        <div className="tasks-list">
                            {okrs.map((okr) => (
                                <div key={okr.id} className="task-card" style={{ padding: '20px' }}>
                                    <div className="task-header">
                                        <h3>{okr.title}</h3>
                                        <p className="task-description">{okr.description || 'No description'}</p>
                                        <div className="task-meta">
                                            <span><strong>Start:</strong> {new Date(okr.periodStart).toLocaleDateString()}</span>
                                            <span><strong>End:</strong> {new Date(okr.periodEnd).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                    <div style={{ marginTop: 12 }}>
                                        <strong>Key Results</strong>
                                        <ul style={{ margin: '8px 0 0 16px', padding: 0 }}>
                                            {(okr.keyResults || []).map((kr) => (
                                                <li key={kr.id} style={{ marginBottom: 6 }}>
                                                    {kr.title} <span className="priority-badge low" style={{ borderColor: kr.tag.color, color: kr.tag.color }}>{kr.tag.name}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {currentSection === 'appraisals' && isAdmin && (
                    <div className="tasks-section">
                        <div className="tasks-header"><h2>Appraisals</h2></div>
                        <div className="tasks-list">
                            {appraisals.map((appraisal) => (
                                <div key={appraisal.id} className="task-card" style={{ padding: '16px' }}>
                                    <div className="task-header" style={{ marginBottom: 8 }}>
                                        <h3>{appraisal.subjectUser?.name || appraisal.subjectUser?.email || 'Team Member'}</h3>
                                        <div className="task-badges">
                                            <span className="status-badge created">{appraisal.cycle}</span>
                                            <span className="status-badge in_progress">{appraisal.status}</span>
                                        </div>
                                    </div>
                                    <p className="task-description">{appraisal.summary}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {currentSection === 'tracker' && (
                    <>
                        {stats && (
                            <div className="stats-grid">
                                <div className="stat-card" onClick={() => setFilter('all')}><h3>Total Workload</h3><p className="stat-value">{stats.total}</p></div>
                                <div className="stat-card" onClick={() => setFilter('in_progress')}><h3>Active Sprints</h3><p className="stat-value">{stats.inProgress}</p></div>
                                <div className="stat-card" onClick={() => setFilter('completed')}><h3>Completed Work</h3><p className="stat-value">{stats.completed}</p></div>
                                <div className="stat-card" onClick={() => setFilter('my')}><h3>Your Focus</h3><p className="stat-value">{stats.myTasks}</p></div>
                            </div>
                        )}

                        <div className="tasks-section">
                            <div className="tasks-header">
                                <h2>{filter === 'recently_deleted' ? 'Recently Deleted' : 'Task Tracker'}</h2>
                                {(isTeamLead || isMember) && (
                                    <p className="org-subtitle" style={{ margin: 0 }}>Your tasks + your team-linked tasks</p>
                                )}
                                <div className="filter-group">
                                    <button type="button" className={`btn-filter ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All</button>
                                    <button type="button" className={`btn-filter ${filter === 'my' ? 'active' : ''}`} onClick={() => setFilter('my')}>My Tasks</button>
                                    <button type="button" className={`btn-filter ${filter === 'created' ? 'active' : ''}`} onClick={() => setFilter('created')}>Created</button>
                                    <button type="button" className={`btn-filter ${filter === 'in_progress' ? 'active' : ''}`} onClick={() => setFilter('in_progress')}>In Progress</button>
                                    <button type="button" className={`btn-filter ${filter === 'completed' ? 'active' : ''}`} onClick={() => setFilter('completed')}>Completed</button>
                                    {isAdmin && (
                                        <button type="button" className={`btn-filter ${filter === 'recently_deleted' ? 'active' : ''}`} onClick={() => setFilter('recently_deleted')}>Recently Deleted</button>
                                    )}
                                </div>
                            </div>

                            <div className="tasks-workspace">
                                <div className="tasks-list">
                                    {tasks.map((task) => (
                                        <button key={task.id} type="button" className={`task-card task-card-compact ${selectedTaskId === task.id ? 'active' : ''}`} onClick={() => setSelectedTaskId(task.id)}>
                                            <div className="task-header">
                                                <h3>{task.title}</h3>
                                                <div className="task-badges">
                                                    <span className={`priority-badge ${task.priority.toLowerCase()}`}>{task.priority}</span>
                                                    <span className={`status-badge ${task.status.toLowerCase()}`}>{task.status.replace('_', ' ')}</span>
                                                    {task.tag && <span className="priority-badge low" style={{ borderColor: task.tag.color, color: task.tag.color }}>{task.tag.name}</span>}
                                                </div>
                                            </div>
                                            <div className="task-meta">
                                                {isDeletedView ? (
                                                    <>
                                                        <div className="meta-item"><strong>Deleted:</strong> {task.deletedAt ? new Date(task.deletedAt).toLocaleDateString() : 'Unknown'}</div>
                                                        <div className="meta-item"><strong>Purge In:</strong> {getDaysUntilPurge(task.deletedAt)} day(s)</div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className="meta-item"><strong>Owner:</strong> {task.assignee?.name || task.assignee?.email || 'Unassigned'}</div>
                                                        <div className="meta-item"><strong>Supporter:</strong> {task.supporter?.name || task.supporter?.email || 'None'}</div>
                                                        <div className="meta-item"><strong>Teams:</strong> {(task.taskTeams || []).map((tt) => tt.team.name).join(', ') || 'None'}</div>
                                                        <div className="meta-item"><strong>Comments:</strong> {task.comments?.length || 0}</div>
                                                    </>
                                                )}
                                            </div>
                                        </button>
                                    ))}
                                </div>

                                <aside className={`task-detail-panel ${selectedTask ? 'open' : ''}`}>
                                    {selectedTask ? (
                                        <div className="task-detail-content" key={selectedTask.id}>
                                            <div className="task-detail-header">
                                                <h3>{selectedTask.title}</h3>
                                                <div className="task-badges">
                                                    <span className={`priority-badge ${selectedTask.priority.toLowerCase()}`}>{selectedTask.priority}</span>
                                                    <span className={`status-badge ${selectedTask.status.toLowerCase()}`}>{selectedTask.status.replace('_', ' ')}</span>
                                                    {selectedTask.tag && <span className="priority-badge low" style={{ borderColor: selectedTask.tag.color, color: selectedTask.tag.color }}>{selectedTask.tag.name}</span>}
                                                </div>
                                            </div>
                                            <div className="task-meta">
                                                <div className="meta-item"><strong>Owner:</strong> {selectedTask.assignee?.name || selectedTask.assignee?.email || 'Unassigned'}</div>
                                                <div className="meta-item"><strong>Supporter:</strong> {selectedTask.supporter?.name || selectedTask.supporter?.email || 'None'}</div>
                                                <div className="meta-item"><strong>Teams:</strong> {(selectedTask.taskTeams || []).map((tt) => tt.team.name).join(', ') || 'None'}</div>
                                            </div>

                                            <div className="task-actions">
                                                {isDeletedView ? (
                                                    <button onClick={() => handleRestoreTask(selectedTask.id)} className="btn-action success">Restore Task</button>
                                                ) : (
                                                    <>
                                                        <button onClick={() => handleOpenEditTask(selectedTask)} className="btn-action secondary">Edit</button>
                                                        {selectedTask.status !== 'IN_PROGRESS' && selectedTask.status !== 'COMPLETED' && (
                                                            <button onClick={() => handleUpdateTaskStatus(selectedTask.id, 'IN_PROGRESS')} className="btn-action">Start Work</button>
                                                        )}
                                                        {selectedTask.status === 'IN_PROGRESS' && (
                                                            <button onClick={() => handleUpdateTaskStatus(selectedTask.id, 'COMPLETED')} className="btn-action success">Complete</button>
                                                        )}
                                                        {selectedTask.status === 'COMPLETED' && (
                                                            <button onClick={() => handleUpdateTaskStatus(selectedTask.id, 'IN_PROGRESS')} className="btn-action">Re-open</button>
                                                        )}

                                                        <label className="btn-action secondary upload-btn">
                                                            Attach File
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
                                                                            await fetchData();
                                                                        } catch {
                                                                            alert('Upload failed');
                                                                        }
                                                                    }
                                                                }}
                                                            />
                                                        </label>
                                                        <button
                                                            type="button"
                                                            className="btn-action secondary"
                                                            onClick={() => {
                                                                setNewLink({ taskId: selectedTask.id, url: '', fileName: '' });
                                                                setShowAddLinkModal(true);
                                                            }}
                                                        >
                                                            Attach Link
                                                        </button>
                                                        {isAdmin && (
                                                            <button onClick={() => handleDeleteTask(selectedTask.id)} className="btn-action danger">Move to Recently Deleted</button>
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
                                                                {att.type === 'LINK' && att.url ? (
                                                                    <a href={att.url} target="_blank" rel="noopener noreferrer">🔗 {att.fileName || att.url}</a>
                                                                ) : (
                                                                    <a href={`${api.defaults.baseURL}/${att.filePath}`} target="_blank" rel="noopener noreferrer">📄 {att.fileName}</a>
                                                                )}
                                                                {isAdmin && !isDeletedView && (
                                                                    <button className="btn-delete-small" onClick={async () => {
                                                                        if (window.confirm('Delete this attachment?')) {
                                                                            await api.delete(`/tasks/attachments/${att.id}`);
                                                                            await fetchData();
                                                                        }
                                                                    }}>Remove</button>
                                                                )}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}

                                            <div className="task-comments">
                                                <div className="task-comments-header">
                                                    <h4>Timeline & Comments</h4>
                                                    <span className="comments-count">{selectedTask.comments?.length || 0} entries</span>
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
                                                                    {!isDeletedView && (user?.id === comment.userId || isAdmin) && (
                                                                        <button className="btn-delete-small" onClick={async () => {
                                                                            if (window.confirm('Delete this comment?')) {
                                                                                await api.delete(`/tasks/comments/${comment.id}`);
                                                                                await fetchData();
                                                                            }
                                                                        }}>Delete</button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <p className="comment-content">{comment.content}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                                {(selectedTask.comments?.length || 0) > COMMENTS_PREVIEW_COUNT && (
                                                    <button type="button" className="btn-thread-toggle" onClick={() => setExpandedCommentThreads((prev) => ({ ...prev, [selectedTask.id]: !prev[selectedTask.id] }))}>
                                                        {expandedCommentThreads[selectedTask.id] ? `Show recent ${COMMENTS_PREVIEW_COUNT}` : `Show all ${selectedTask.comments?.length} comments`}
                                                    </button>
                                                )}
                                                {!isDeletedView && (
                                                    <form className="add-comment" onSubmit={async (e) => { e.preventDefault(); await handleAddComment(selectedTask.id); }}>
                                                        <textarea
                                                            value={commentDrafts[selectedTask.id] || ''}
                                                            placeholder="Write a comment..."
                                                            rows={2}
                                                            onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [selectedTask.id]: e.target.value }))}
                                                        />
                                                        <button type="submit" className="btn-action success" disabled={submittingCommentTaskId === selectedTask.id || !(commentDrafts[selectedTask.id] || '').trim()}>
                                                            {submittingCommentTaskId === selectedTask.id ? 'Posting...' : 'Post'}
                                                        </button>
                                                    </form>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="task-detail-empty"><p>Select a task to view full details</p></div>
                                    )}
                                </aside>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {showCreateTaskModal && (
                <div className="modal-overlay" onClick={() => setShowCreateTaskModal(false)}>
                    <div className="modal large" onClick={(e) => e.stopPropagation()}>
                        <h2>Create New Task</h2>
                        <form onSubmit={handleCreateTask}>
                            <div className="form-group">
                                <label>Title *</label>
                                <input type="text" value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} required autoFocus />
                            </div>
                            <div className="form-group">
                                <label>Description</label>
                                <textarea value={newTask.description} onChange={(e) => setNewTask({ ...newTask, description: e.target.value })} rows={4} />
                            </div>
                            <div className="form-group">
                                <label>Tag *</label>
                                <select value={newTask.tagId} onChange={(e) => setNewTask({ ...newTask, tagId: e.target.value })} required>
                                    <option value="">Select a tag</option>
                                    {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
                                </select>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Priority</label>
                                    <select value={newTask.priority} onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}>
                                        <option value="LOW">Low</option>
                                        <option value="MEDIUM">Medium</option>
                                        <option value="HIGH">High</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Due Date</label>
                                    <input type="date" value={newTask.dueDate} onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })} />
                                </div>
                            </div>
                            {organization?.members && (
                                <div className="form-group">
                                    <label>Primary Assignee *</label>
                                    <select value={newTask.assigneeId} onChange={(e) => setNewTask({ ...newTask, assigneeId: e.target.value, supporterId: newTask.supporterId === e.target.value ? '' : newTask.supporterId })} required>
                                        <option value="">Select assignee</option>
                                        {assignableUsers.map((member) => <option key={member.user.id} value={member.user.id}>{member.user.name || member.user.email}</option>)}
                                    </select>
                                </div>
                            )}
                            {organization?.members && (
                                <div className="form-group">
                                    <label>Supported By (Optional)</label>
                                    <select value={newTask.supporterId} onChange={(e) => setNewTask({ ...newTask, supporterId: e.target.value })}>
                                        <option value="">None</option>
                                        {assignableUsers
                                            .filter((member) => member.user.id !== newTask.assigneeId)
                                            .map((member) => (
                                                <option key={member.user.id} value={member.user.id}>
                                                    {member.user.name || member.user.email}
                                                </option>
                                            ))}
                                    </select>
                                </div>
                            )}
                            <div className="modal-actions">
                                <button type="button" onClick={() => setShowCreateTaskModal(false)} className="btn-secondary">Cancel</button>
                                <button type="submit" className="btn-primary">Create Task</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showEditTaskModal && (
                <div className="modal-overlay" onClick={() => setShowEditTaskModal(false)}>
                    <div className="modal large" onClick={(e) => e.stopPropagation()}>
                        <h2>Edit Task</h2>
                        <form onSubmit={handleUpdateTask}>
                            <div className="form-group">
                                <label>Title *</label>
                                <input type="text" value={editTask.title} onChange={(e) => setEditTask({ ...editTask, title: e.target.value })} required autoFocus />
                            </div>
                            <div className="form-group">
                                <label>Description</label>
                                <textarea value={editTask.description} onChange={(e) => setEditTask({ ...editTask, description: e.target.value })} rows={4} />
                            </div>
                            <div className="form-group">
                                <label>Tag *</label>
                                <select value={editTask.tagId} onChange={(e) => setEditTask({ ...editTask, tagId: e.target.value })} required>
                                    <option value="">Select a tag</option>
                                    {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
                                </select>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Priority</label>
                                    <select value={editTask.priority} onChange={(e) => setEditTask({ ...editTask, priority: e.target.value })}>
                                        <option value="LOW">Low</option>
                                        <option value="MEDIUM">Medium</option>
                                        <option value="HIGH">High</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Due Date</label>
                                    <input type="date" value={editTask.dueDate} onChange={(e) => setEditTask({ ...editTask, dueDate: e.target.value })} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Primary Assignee *</label>
                                <select
                                    value={editTask.assigneeId}
                                    onChange={(e) => setEditTask({
                                        ...editTask,
                                        assigneeId: e.target.value,
                                        supporterId: editTask.supporterId === e.target.value ? '' : editTask.supporterId
                                    })}
                                    required
                                >
                                    <option value="">Select assignee</option>
                                    {assignableUsers.map((member) => <option key={member.user.id} value={member.user.id}>{member.user.name || member.user.email}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Supported By (Optional)</label>
                                <select value={editTask.supporterId} onChange={(e) => setEditTask({ ...editTask, supporterId: e.target.value })}>
                                    <option value="">None</option>
                                    {assignableUsers
                                        .filter((member) => member.user.id !== editTask.assigneeId)
                                        .map((member) => (
                                            <option key={member.user.id} value={member.user.id}>
                                                {member.user.name || member.user.email}
                                            </option>
                                        ))}
                                </select>
                            </div>
                            <div className="modal-actions">
                                <button type="button" onClick={() => setShowEditTaskModal(false)} className="btn-secondary">Cancel</button>
                                <button type="submit" className="btn-primary">Save Changes</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showCreateTeamModal && (
                <div className="modal-overlay" onClick={() => setShowCreateTeamModal(false)}>
                    <div className="modal large" onClick={(e) => e.stopPropagation()}>
                        <h2>Create Team</h2>
                        <form onSubmit={handleCreateTeam}>
                            <div className="form-group">
                                <label>Team Name</label>
                                <input type="text" value={teamForm.name} onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })} required autoFocus />
                            </div>
                            <div className="form-group">
                                <label>Team Lead (TEAM_LEAD role only)</label>
                                <select
                                    value={teamForm.leadUserId}
                                    onChange={(e) => {
                                        const leadId = e.target.value;
                                        setTeamForm((prev) => ({
                                            ...prev,
                                            leadUserId: leadId,
                                            memberUserIds: prev.memberUserIds.includes(leadId) ? prev.memberUserIds : [...prev.memberUserIds, leadId]
                                        }));
                                    }}
                                    required
                                >
                                    <option value="">Select lead</option>
                                    {teamLeadUsers.map((member) => (
                                        <option key={member.user.id} value={member.user.id}>
                                            {member.user.name || member.user.email}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Members</label>
                                <div className="team-members-list" style={{ maxHeight: 220, overflowY: 'auto' }}>
                                    {assignableUsers.map((member) => (
                                        <label key={member.user.id} className="team-member-row" style={{ cursor: 'pointer' }}>
                                            <div className="team-member-info">
                                                <strong>{member.user.name || member.user.email}</strong>
                                                <span>{member.role}</span>
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={teamForm.memberUserIds.includes(member.user.id)}
                                                onChange={() => toggleTeamMember(member.user.id)}
                                            />
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn-secondary" onClick={() => { setShowCreateTeamModal(false); resetTeamForm(); }}>Cancel</button>
                                <button type="submit" className="btn-primary">Create Team</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {editingTeam && (
                <div className="modal-overlay" onClick={() => setEditingTeam(null)}>
                    <div className="modal large" onClick={(e) => e.stopPropagation()}>
                        <h2>Edit Team</h2>
                        <form onSubmit={handleUpdateTeam}>
                            <div className="form-group">
                                <label>Team Name</label>
                                <input type="text" value={teamForm.name} onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })} required autoFocus />
                            </div>
                            <div className="form-group">
                                <label>Team Lead</label>
                                <select
                                    value={teamForm.leadUserId}
                                    onChange={(e) => {
                                        const leadId = e.target.value;
                                        setTeamForm((prev) => ({
                                            ...prev,
                                            leadUserId: leadId,
                                            memberUserIds: prev.memberUserIds.includes(leadId) ? prev.memberUserIds : [...prev.memberUserIds, leadId]
                                        }));
                                    }}
                                    required
                                >
                                    <option value="">Select lead</option>
                                    {teamLeadUsers.map((member) => (
                                        <option key={member.user.id} value={member.user.id}>
                                            {member.user.name || member.user.email}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Members</label>
                                <div className="team-members-list" style={{ maxHeight: 220, overflowY: 'auto' }}>
                                    {assignableUsers.map((member) => (
                                        <label key={member.user.id} className="team-member-row" style={{ cursor: 'pointer' }}>
                                            <div className="team-member-info">
                                                <strong>{member.user.name || member.user.email}</strong>
                                                <span>{member.role}</span>
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={teamForm.memberUserIds.includes(member.user.id)}
                                                onChange={() => toggleTeamMember(member.user.id)}
                                            />
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn-secondary" onClick={() => { setEditingTeam(null); resetTeamForm(); }}>Cancel</button>
                                <button type="submit" className="btn-primary">Save Team</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showCreateTagModal && (
                <div className="modal-overlay" onClick={() => setShowCreateTagModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h2>Create Tag</h2>
                        <form onSubmit={handleCreateTag}>
                            <div className="form-group">
                                <label>Name</label>
                                <input type="text" value={newTag.name} onChange={(e) => setNewTag({ ...newTag, name: e.target.value })} required autoFocus />
                            </div>
                            <div className="form-group">
                                <label>Color</label>
                                <input type="color" value={newTag.color} onChange={(e) => setNewTag({ ...newTag, color: e.target.value })} required />
                            </div>
                            <div className="modal-actions">
                                <button type="button" onClick={() => setShowCreateTagModal(false)} className="btn-secondary">Cancel</button>
                                <button type="submit" className="btn-primary">Create Tag</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showCreateOkrModal && (
                <div className="modal-overlay" onClick={() => setShowCreateOkrModal(false)}>
                    <div className="modal large" onClick={(e) => e.stopPropagation()}>
                        <h2>Create OKR</h2>
                        <form onSubmit={handleCreateOkr}>
                            <div className="form-group">
                                <label>Objective Title</label>
                                <input type="text" value={newOkr.title} onChange={(e) => setNewOkr({ ...newOkr, title: e.target.value })} required autoFocus />
                            </div>
                            <div className="form-group">
                                <label>Description</label>
                                <textarea rows={3} value={newOkr.description} onChange={(e) => setNewOkr({ ...newOkr, description: e.target.value })} />
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Period Start</label>
                                    <input type="date" value={newOkr.periodStart} onChange={(e) => setNewOkr({ ...newOkr, periodStart: e.target.value })} required />
                                </div>
                                <div className="form-group">
                                    <label>Period End</label>
                                    <input type="date" value={newOkr.periodEnd} onChange={(e) => setNewOkr({ ...newOkr, periodEnd: e.target.value })} required />
                                </div>
                            </div>

                            <h3 style={{ marginTop: 8 }}>Key Results</h3>
                            {newOkr.keyResults.map((kr, index) => (
                                <div key={index} style={{ border: '1px solid var(--border-color)', borderRadius: 10, padding: 12, marginBottom: 10 }}>
                                    <div className="form-group">
                                        <label>Key Result</label>
                                        <input
                                            type="text"
                                            value={kr.title}
                                            onChange={(e) => {
                                                const next = [...newOkr.keyResults];
                                                next[index].title = e.target.value;
                                                setNewOkr({ ...newOkr, keyResults: next });
                                            }}
                                            required
                                        />
                                    </div>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Tag Name</label>
                                            <input
                                                type="text"
                                                value={kr.tagName}
                                                onChange={(e) => {
                                                    const next = [...newOkr.keyResults];
                                                    next[index].tagName = e.target.value;
                                                    setNewOkr({ ...newOkr, keyResults: next });
                                                }}
                                                required
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Tag Color</label>
                                            <input
                                                type="color"
                                                value={kr.tagColor}
                                                onChange={(e) => {
                                                    const next = [...newOkr.keyResults];
                                                    next[index].tagColor = e.target.value;
                                                    setNewOkr({ ...newOkr, keyResults: next });
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => setNewOkr({ ...newOkr, keyResults: [...newOkr.keyResults, { title: '', tagName: '', tagColor: '#2563eb' }] })}
                            >
                                + Add Key Result
                            </button>

                            <div className="modal-actions">
                                <button type="button" onClick={() => setShowCreateOkrModal(false)} className="btn-secondary">Cancel</button>
                                <button type="submit" className="btn-primary">Create OKR</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showCreateAppraisalModal && (
                <div className="modal-overlay" onClick={() => setShowCreateAppraisalModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h2>Generate Appraisal</h2>
                        <form onSubmit={handleCreateAppraisal}>
                            <div className="form-group">
                                <label>Team Member</label>
                                <select value={newAppraisal.subjectUserId} onChange={(e) => setNewAppraisal({ ...newAppraisal, subjectUserId: e.target.value })} required>
                                    <option value="">Select member</option>
                                    {(organization?.members || []).map((member) => (
                                        <option key={member.user.id} value={member.user.id}>{member.user.name || member.user.email}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Cycle</label>
                                <input type="text" value={newAppraisal.cycle} onChange={(e) => setNewAppraisal({ ...newAppraisal, cycle: e.target.value })} placeholder="2026-Q1" required />
                            </div>
                            <div className="form-group">
                                <label>Summary</label>
                                <textarea rows={3} value={newAppraisal.summary} onChange={(e) => setNewAppraisal({ ...newAppraisal, summary: e.target.value })} placeholder="Optional summary" />
                            </div>
                            <div className="modal-actions">
                                <button type="button" onClick={() => setShowCreateAppraisalModal(false)} className="btn-secondary">Cancel</button>
                                <button type="submit" className="btn-primary">Generate</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showAddLinkModal && (
                <div className="modal-overlay" onClick={() => setShowAddLinkModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h2>Attach Link</h2>
                        <form onSubmit={handleAddLink}>
                            <div className="form-group">
                                <label>URL</label>
                                <input type="url" value={newLink.url} onChange={(e) => setNewLink({ ...newLink, url: e.target.value })} required autoFocus />
                            </div>
                            <div className="form-group">
                                <label>Label (optional)</label>
                                <input type="text" value={newLink.fileName} onChange={(e) => setNewLink({ ...newLink, fileName: e.target.value })} />
                            </div>
                            <div className="modal-actions">
                                <button type="button" onClick={() => setShowAddLinkModal(false)} className="btn-secondary">Cancel</button>
                                <button type="submit" className="btn-primary">Attach</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DashboardPage;
