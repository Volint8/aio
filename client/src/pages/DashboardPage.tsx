import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import BoardView from '../components/BoardView';
import TaskTrackerView from '../components/TaskTrackerView';
import TeamTrackerView from '../components/TeamTrackerView';
import OkrView from '../components/OkrView';
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
    project?: {
        id: string;
        name: string;
        client?: {
            id: string;
            name: string;
        } | null;
    } | null;
    tag?: Tag | null;
    createdAt: string;
    deletedAt?: string | null;
    comments?: any[];
    attachments?: Attachment[];
}

interface Stats {
    pending: number;
    ongoing: number;
    completed: number;
    overdue: number;
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
    status: string;
    assignments?: Array<{
        id: string;
        targetType: string;
        targetId: string;
        team?: {
            id: string;
            name: string;
        };
    }>;
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

interface InviteRecord {
    id: string;
    email: string;
    name?: string | null;
    role: string;
    status: string;
    expiresAt: string;
}

interface ClientRecord {
    id: string;
    name: string;
    createdByUserId: string;
    visibility: string;
    createdAt: string;
    projectCount?: number;
    taskCount?: number;
    createdBy?: {
        id: string;
        name: string | null;
        email: string;
    };
}

interface ProjectRecord {
    id: string;
    name: string;
    clientId: string;
    organizationId: string;
    createdByUserId: string;
    visibility: string;
    createdAt: string;
    client: {
        id: string;
        name: string;
    };
    createdBy?: {
        id: string;
        name: string | null;
        email: string;
    };
    taskCount?: number;
}

type DashboardSection = 'board' | 'task-tracker' | 'team-tracker' | 'okr' | 'projects' | 'tracker' | 'team' | 'tags' | 'okrs' | 'appraisals';
type TaskFilter = 'all' | 'my' | 'pending' | 'ongoing' | 'completed' | 'overdue' | 'created' | 'in_progress' | 'recently_deleted';
type TrackerView = 'users' | 'teams';
type ProjectsTab = 'clients' | 'projects';

interface MemberStatRecord {
    userId: string;
    name: string;
    stats: {
        pending: number;
        ongoing: number;
        completed: number;
        overdue: number;
        total: number;
        performanceScore?: number;
        temperature?: string;
    };
}

interface TeamDistributionRecord {
    teamId: string;
    teamName: string;
    leadUser: { id: string; name: string | null; email: string };
    stats: { pending: number; ongoing: number; completed: number; overdue: number; total: number; okrProgress?: number };
    people: Array<{
        userId: string;
        name: string;
        role: string;
        stats: {
            pending: number;
            ongoing: number;
            completed: number;
            overdue: number;
            total: number;
            performanceScore?: number;
            temperature?: string;
        };
    }>;
}

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
    const [invites, setInvites] = useState<InviteRecord[]>([]);
    const [memberStats, setMemberStats] = useState<MemberStatRecord[]>([]);
    const [teamDistribution, setTeamDistribution] = useState<TeamDistributionRecord[]>([]);
    const [clients, setClients] = useState<ClientRecord[]>([]);
    const [projects, setProjects] = useState<ProjectRecord[]>([]);

    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<TaskFilter>('all');
    const [assigneeFilterId, setAssigneeFilterId] = useState<string | null>(null);
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [expandedCommentThreads, setExpandedCommentThreads] = useState<Record<string, boolean>>({});
    const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
    const [submittingCommentTaskId, setSubmittingCommentTaskId] = useState<string | null>(null);
    const [submissions, setSubmissions] = useState<Array<{
        id: string;
        taskId: string;
        userId: string;
        description?: string;
        submittedAt: string;
        status: 'PENDING' | 'REVIEWED' | 'APPROVED' | 'REJECTED';
        reviewNotes?: string;
        reviewedAt?: string;
        reviewedBy?: string;
        user?: { id: string; name: string | null; email: string };
    }>>([]);
    const [activityLogs, setActivityLogs] = useState<Array<{
        id: string;
        taskId: string;
        userId?: string;
        action: string;
        description: string;
        metadata?: any;
        createdAt: string;
        user?: { id: string; name: string | null; email: string };
    }>>([]);
    const [showSubmissionModal, setShowSubmissionModal] = useState(false);
    const [submissionDescription, setSubmissionDescription] = useState('');
    const [reviewNotes, setReviewNotes] = useState('');

    const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
    const [showCreateOkrModal, setShowCreateOkrModal] = useState(false);
    const [showCreateAppraisalModal, setShowCreateAppraisalModal] = useState(false);
    const [showAddLinkModal, setShowAddLinkModal] = useState(false);
    const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
    const [editingTeam, setEditingTeam] = useState<Team | null>(null);
    const [showSendAlertModal, setShowSendAlertModal] = useState(false);
    const [alertForm, setAlertForm] = useState({
        targetType: 'INDIVIDUAL',
        targetId: '',
        type: 'DEADLINE_REMINDER',
        message: ''
    });

    const orgId = localStorage.getItem('selectedOrgId');

    const handleSendAlert = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (!alertForm.targetId) {
                alert('Target is required');
                return;
            }
            if (!alertForm.message) {
                alert('Message is required');
                return;
            }
            await api.post('/notifications/send-alert', {
                ...alertForm,
                organizationId: orgId
            });
            setShowSendAlertModal(false);
            setAlertForm({ targetType: 'INDIVIDUAL', targetId: '', type: 'DEADLINE_REMINDER', message: '' });
            alert('Alert sent successfully');
        } catch (error: any) {
            alert(error.response?.data?.error || 'Failed to send alert');
        }
    };

    const [showEditTaskModal, setShowEditTaskModal] = useState(false);
    const [showCreateClientModal, setShowCreateClientModal] = useState(false);
    const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
    const [editingClient, setEditingClient] = useState<ClientRecord | null>(null);
    const [editingProject, setEditingProject] = useState<ProjectRecord | null>(null);
    const [showEditOkrModal, setShowEditOkrModal] = useState(false);
    const [editingOkr, setEditingOkr] = useState<Okr | null>(null);
    const [showTagModal, setShowTagModal] = useState(false);
    const [editingTag, setEditingTag] = useState<Tag | null>(null);
    const [tagForm, setTagForm] = useState({ name: '', color: '#2563eb' });

    const [newTask, setNewTask] = useState({
        title: '',
        description: '',
        priority: 'LOW',
        dueDate: '',
        assigneeId: '',
        supporterId: '',
        tagId: '',
        projectId: '',
        alertTeamLead: false
    });

    const [editTask, setEditTask] = useState({
        id: '',
        title: '',
        description: '',
        priority: 'LOW',
        dueDate: '',
        assigneeId: '',
        supporterId: '',
        tagId: '',
        projectId: ''
    });

    const [newOkr, setNewOkr] = useState({
        title: '',
        description: '',
        periodStart: '',
        periodEnd: '',
        assignedToTeamId: '',
        supportedByTeamIds: [] as string[],
        keyResults: [{ title: '', tagName: '', tagColor: '#2563eb' }]
    });

    const [editOkrForm, setEditOkrForm] = useState({
        title: '',
        description: '',
        periodStart: '',
        periodEnd: '',
        assignedToTeamId: '',
        supportedByTeamIds: [] as string[],
        keyResults: [{ title: '', tagName: '', tagColor: '#2563eb' }],
        status: 'OPEN'
    });
    const [newAppraisal, setNewAppraisal] = useState({ subjectUserId: '', cycle: '', summary: '' });
    const [newLink, setNewLink] = useState({ taskId: '', url: '', fileName: '' });
    const [teamForm, setTeamForm] = useState({
        name: '',
        leadUserId: '',
        memberUserIds: [] as string[]
    });
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteName, setInviteName] = useState('');
    const [inviteRole, setInviteRole] = useState('MEMBER');
    const [inviting, setInviting] = useState(false);
    const [teamError, setTeamError] = useState('');
    const [projectsTab, setProjectsTab] = useState<ProjectsTab>('projects');
    const [clientFormName, setClientFormName] = useState('');
    const [clientFormVisibility, setClientFormVisibility] = useState('ORG_WIDE');
    const [projectForm, setProjectForm] = useState({ name: '', clientId: '', visibility: 'ORG_WIDE' });
    const [taskClientFilter, setTaskClientFilter] = useState('all');
    const [taskProjectFilter, setTaskProjectFilter] = useState('all');

    const { user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const requestedSection = (new URLSearchParams(location.search).get('section') || 'tracker') as DashboardSection;
    const requestedTrackerView = (new URLSearchParams(location.search).get('view') || 'users') as TrackerView;
    const isAdmin = organization?.userRole === 'ADMIN';
    const isTeamLead = organization?.userRole === 'TEAM_LEAD';
    const isMember = organization?.userRole === 'MEMBER';
    const canTrackTeam = organization?.userRole === 'ADMIN' || organization?.userRole === 'TEAM_LEAD';
    const canUseTrackerCharts = isAdmin || isTeamLead;
    const canManageProjects = isTeamLead || isMember;
    const trackerView: TrackerView = requestedTrackerView === 'teams' ? 'teams' : 'users';

    const currentSection: DashboardSection = useMemo(() => {
        if (requestedSection === 'board') return 'board';
        if (requestedSection === 'task-tracker') return 'task-tracker';
        if (requestedSection === 'team-tracker' && canTrackTeam) return 'team-tracker';
        if (requestedSection === 'okr') return 'okr';
        if (requestedSection === 'projects') return 'projects';
        if (requestedSection === 'tracker') return 'tracker';
        if (requestedSection === 'team' && canTrackTeam) return 'team';
        if (requestedSection === 'tags' && isAdmin) return 'tags';
        if (requestedSection === 'okrs' && (isAdmin || isTeamLead || isMember)) return 'okrs';
        if (requestedSection === 'appraisals' && isAdmin) return 'appraisals';
        return 'board';
    }, [requestedSection, canTrackTeam, isAdmin, isTeamLead, isMember]);

    const tagSourceMap = useMemo(() => {
        const map: Record<string, { okrTitle: string; krTitle: string }> = {};
        okrs.forEach(okr => {
            okr.keyResults?.forEach(kr => {
                if (kr.tag) {
                    map[kr.tag.id] = { okrTitle: okr.title, krTitle: kr.title };
                }
            });
        });
        return map;
    }, [okrs]);

    const userChartData = memberStats.map((item) => ({
        id: item.userId,
        label: item.name,
        pending: item.stats.pending,
        ongoing: item.stats.ongoing,
        completed: item.stats.completed,
        overdue: item.stats.overdue,
        total: item.stats.total
    }));

    const teamChartData = teamDistribution.map((item) => ({
        id: item.teamId,
        label: item.teamName,
        pending: item.stats.pending,
        ongoing: item.stats.ongoing,
        completed: item.stats.completed,
        overdue: item.stats.overdue,
        total: item.stats.total
    }));

    const currentChartData = trackerView === 'teams' ? teamChartData : userChartData;
    const chartMaxValue = Math.max(
        1,
        ...currentChartData.flatMap((item) => [item.pending, item.ongoing, item.completed, item.overdue])
    );

    const workersActiveCount = useMemo(() => {
        if (trackerView === 'users') {
            return userChartData.filter((item) => item.total > 0).length;
        }

        const activeIds = new Set<string>();
        teamDistribution.forEach((team) => {
            team.people
                .filter((person) => person.stats.total > 0)
                .forEach((person) => activeIds.add(person.userId));
        });
        return activeIds.size;
    }, [trackerView, userChartData, teamDistribution]);

    const handleTrackerViewChange = (view: TrackerView) => {
        if (trackerView === view) return;
        const params = new URLSearchParams(location.search);
        params.set('section', 'tracker');
        params.set('view', view);
        navigate(`/dashboard?${params.toString()}`);
    };

    const assignableUsers = (organization?.members || []).filter((member) => member.role !== 'ADMIN');
    const teamLeadUsers = (organization?.members || []).filter((member) => member.role === 'TEAM_LEAD');
    const selectedCreateTaskProject = projects.find((project) => project.id === newTask.projectId) || null;
    const selectedEditTaskProject = projects.find((project) => project.id === editTask.projectId) || null;
    const trackerProjectOptions = taskClientFilter === 'all'
        ? projects
        : projects.filter((project) => project.clientId === taskClientFilter);

    useEffect(() => {
        if (taskProjectFilter === 'all') return;
        if (!trackerProjectOptions.some((project) => project.id === taskProjectFilter)) {
            setTaskProjectFilter('all');
        }
    }, [taskClientFilter, taskProjectFilter, projects]);

    useEffect(() => {
        if (selectedTaskId) {
            fetchSubmissions(selectedTaskId);
            fetchActivity(selectedTaskId);
        } else {
            setSubmissions([]);
            setActivityLogs([]);
        }
    }, [selectedTaskId]);

    useEffect(() => {
        if (!orgId) {
            // Auto-select the first organization
            api.get('/orgs')
                .then((res) => {
                    const organizations = Array.isArray(res.data) ? res.data : [];
                    if (organizations.length > 0) {
                        const firstOrg = organizations[0];
                        localStorage.setItem('selectedOrgId', firstOrg.id);
                        localStorage.setItem('selectedOrgRole', firstOrg.userRole);
                        window.location.reload(); // Reload to apply the selected org
                    }
                })
                .catch(() => {
                    console.error('Failed to fetch organizations');
                });
            return;
        }
        fetchData();
    }, [orgId, filter, taskClientFilter, taskProjectFilter, assigneeFilterId]);

    const handleMemberClick = (userId: string) => {
        setAssigneeFilterId(userId);
        const params = new URLSearchParams(location.search);
        params.set('section', 'projects');
        navigate(`/dashboard?${params.toString()}`);
    };

    const fetchData = async () => {
        try {
            const isDeletedView = filter === 'recently_deleted';
            const [tasksRes, statsRes, orgRes, tagsRes, okrRes, appraisalRes] = await Promise.all([
                api.get('/tasks', {
                    params: {
                        organizationId: orgId,
                        view: isDeletedView ? 'deleted' : 'active',
                        ...(taskClientFilter !== 'all' ? { clientId: taskClientFilter } : {}),
                        ...(taskProjectFilter !== 'all' ? { projectId: taskProjectFilter } : {})
                    }
                }),
                api.get('/tasks/stats', {
                    params: {
                        organizationId: orgId,
                        ...(taskClientFilter !== 'all' ? { clientId: taskClientFilter } : {}),
                        ...(taskProjectFilter !== 'all' ? { projectId: taskProjectFilter } : {})
                    }
                }),
                api.get(`/orgs/${orgId}`),
                api.get(`/orgs/${orgId}/tags`),
                api.get(`/orgs/${orgId}/okrs`),
                api.get(`/orgs/${orgId}/appraisals`)
            ]);

            const [clientsRes, projectsRes] = await Promise.all([
                api.get(`/orgs/${orgId}/clients`),
                api.get(`/orgs/${orgId}/projects`)
            ]);

            const role = orgRes.data.userRole;
            localStorage.setItem('selectedOrgRole', role);

            if (role === 'ADMIN') {
                const [teamsRes, invitesRes, memberStatsRes, distributionRes] = await Promise.all([
                    api.get(`/orgs/${orgId}/teams`),
                    api.get(`/orgs/${orgId}/invites`),
                    api.get('/tasks/team-stats', { params: { organizationId: orgId } }),
                    api.get('/tasks/team-distribution', { params: { organizationId: orgId } })
                ]);
                setTeams(teamsRes.data || []);
                setInvites(invitesRes.data || []);
                setMemberStats(memberStatsRes.data || []);
                setTeamDistribution(distributionRes.data || []);
            } else if (role === 'TEAM_LEAD') {
                const [memberStatsRes, distRes] = await Promise.all([
                    api.get('/tasks/team-stats', { params: { organizationId: orgId } }),
                    api.get('/tasks/team-distribution', { params: { organizationId: orgId } })
                ]);
                const distributionData = distRes.data || [];
                setTeams(distributionData.map((item: any) => ({
                    id: item.teamId,
                    name: item.teamName,
                    leadUser: item.leadUser,
                    stats: item.stats,
                    members: [],
                    people: item.people || []
                })));
                setInvites([]);
                setMemberStats(memberStatsRes.data || []);
                setTeamDistribution(distributionData);
            } else {
                setTeams([]);
                setInvites([]);
                setMemberStats([]);
                setTeamDistribution([]);
            }

            let filteredTasks = tasksRes.data as Task[];
            if (assigneeFilterId) {
                filteredTasks = filteredTasks.filter((t: Task) => t.assignee?.id === assigneeFilterId);
            }

            if (filter === 'my') {
                filteredTasks = filteredTasks.filter((t: Task) => t.assignee?.id === user?.id);
            } else if (filter === 'overdue') {
                const now = new Date();
                filteredTasks = filteredTasks.filter((t: Task) =>
                    t.dueDate &&
                    new Date(t.dueDate) < now &&
                    t.status !== 'COMPLETED'
                );
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
            setClients(clientsRes.data || []);
            setProjects(projectsRes.data || []);

            if (tagsRes.data?.[0]?.id) {
                setNewTask((prev) => ({ ...prev, tagId: prev.tagId || tagsRes.data[0].id }));
                setEditTask((prev) => ({ ...prev, tagId: prev.tagId || tagsRes.data[0].id }));
            }
            if (projectsRes.data?.[0]?.id) {
                setNewTask((prev) => ({ ...prev, projectId: prev.projectId || projectsRes.data[0].id }));
                setEditTask((prev) => ({ ...prev, projectId: prev.projectId || projectsRes.data[0].id }));
                setProjectForm((prev) => ({ ...prev, clientId: prev.clientId || projectsRes.data[0].clientId }));
            } else if (clientsRes.data?.[0]?.id) {
                setProjectForm((prev) => ({ ...prev, clientId: prev.clientId || clientsRes.data[0].id }));
            }
        } catch (error: any) {
            console.error('Failed to fetch dashboard data:', error);
            // Set organization to null on error to prevent rendering with stale data
            setOrganization(null);
            // Show error message to user
            const errorMessage = error.response?.data?.error || error.message || 'Failed to load data';
            alert(`Error loading dashboard: ${errorMessage}`);
        } finally {
            setLoading(false);
        }
    };

    const selectedTask = tasks.find((task) => task.id === selectedTaskId) || null;
    const selectedCreateTaskTag = tags.find((tag) => tag.id === newTask.tagId) || null;
    const selectedEditTaskTag = tags.find((tag) => tag.id === editTask.tagId) || null;
    const isDeletedView = filter === 'recently_deleted';

    const isOverdue = (task: Task) => {
        if (!task.dueDate || task.status === 'COMPLETED') return false;
        return new Date(task.dueDate) < new Date();
    };

    const getDaysOverdue = (task: Task) => {
        if (!task.dueDate) return 0;
        const dueDate = new Date(task.dueDate);
        const now = new Date();
        if (dueDate >= now) return 0;
        const diffMs = now.getTime() - dueDate.getTime();
        return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
    };

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
            if (!newTask.projectId) {
                alert('Project is required');
                return;
            }
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
            setNewTask({
                title: '',
                description: '',
                priority: 'LOW',
                dueDate: '',
                assigneeId: '',
                supporterId: '',
                tagId: tags[0]?.id || '',
                projectId: projects[0]?.id || '',
                alertTeamLead: false
            });
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
            tagId: task.tag?.id || tags[0]?.id || '',
            projectId: task.project?.id || projects[0]?.id || ''
        });
        setShowEditTaskModal(true);
    };

    const handleUpdateTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editTask.projectId) {
            alert('Project is required');
            return;
        }
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
                tagId: editTask.tagId,
                projectId: editTask.projectId
            });
            setShowEditTaskModal(false);
            await fetchData();
        } catch (error: any) {
            const errorData = error.response?.data?.error;
            alert((typeof errorData === 'object' ? errorData.message : errorData) || 'Failed to update task');
        }
    };


    const handleCreateOkr = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const assignments = [];
            if (newOkr.assignedToTeamId) {
                assignments.push({ targetType: 'TEAM', targetId: newOkr.assignedToTeamId });
            }
            newOkr.supportedByTeamIds.forEach((teamId) => {
                assignments.push({ targetType: 'TEAM', targetId: teamId });
            });

            await api.post(`/orgs/${orgId}/okrs`, {
                ...newOkr,
                assignments,
                keyResults: newOkr.keyResults.filter((kr) => kr.title.trim() && kr.tagName.trim())
            });
            setNewOkr({
                title: '',
                description: '',
                periodStart: '',
                periodEnd: '',
                assignedToTeamId: '',
                supportedByTeamIds: [],
                keyResults: [{ title: '', tagName: '', tagColor: '#2563eb' }]
            });
            setShowCreateOkrModal(false);
            await fetchData();
        } catch (error: any) {
            const errorData = error.response?.data?.error;
            alert((typeof errorData === 'object' ? errorData.message : errorData) || 'Failed to create OKR');
        }
    };

    const handleOpenEditOkr = (okr: Okr) => {
        setEditingOkr(okr);
        const assignedToTeamId = okr.assignments?.find(a => a.targetType === 'TEAM')?.targetId || '';
        const supportedByTeamIds = okr.assignments?.filter(a => a.targetType === 'TEAM').map(a => a.targetId) || [];

        setEditOkrForm({
            title: okr.title,
            description: okr.description || '',
            periodStart: okr.periodStart ? new Date(okr.periodStart).toISOString().split('T')[0] : '',
            periodEnd: okr.periodEnd ? new Date(okr.periodEnd).toISOString().split('T')[0] : '',
            assignedToTeamId: assignedToTeamId,
            supportedByTeamIds: supportedByTeamIds,
            keyResults: okr.keyResults?.map(kr => ({
                title: kr.title,
                tagName: kr.tag.name,
                tagColor: kr.tag.color
            })) || [{ title: '', tagName: '', tagColor: '#2563eb' }],
            status: okr.status || 'OPEN'
        });
        setShowEditOkrModal(true);
    };

    const handleUpdateOkr = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingOkr) return;
        try {
            const assignments = [];
            if (editOkrForm.assignedToTeamId) {
                assignments.push({ targetType: 'TEAM', targetId: editOkrForm.assignedToTeamId });
            }
            editOkrForm.supportedByTeamIds.forEach((teamId) => {
                if (teamId !== editOkrForm.assignedToTeamId) {
                    assignments.push({ targetType: 'TEAM', targetId: teamId });
                }
            });

            await api.patch(`/orgs/${orgId}/okrs/${editingOkr.id}`, {
                ...editOkrForm,
                assignments,
                keyResults: editOkrForm.keyResults.filter((kr) => kr.title.trim() && kr.tagName.trim())
            });
            setShowEditOkrModal(false);
            setEditingOkr(null);
            await fetchData();
        } catch (error: any) {
            alert(error.response?.data?.error || 'Failed to update OKR');
        }
    };

    const handleDeleteOkr = async (okrId: string) => {
        if (!window.confirm('Are you sure you want to delete this OKR? This action cannot be undone.')) return;
        try {
            await api.delete(`/orgs/${orgId}/okrs/${okrId}`);
            await fetchData();
        } catch (error: any) {
            alert(error.response?.data?.error || 'Failed to delete OKR');
        }
    };

    const handleMakeOkrGlobal = async (okrId: string) => {
        try {
            await api.patch(`/orgs/${orgId}/okrs/${okrId}`, {
                assignments: []
            });
            await fetchData();
        } catch (error: any) {
            alert(error.response?.data?.error || 'Failed to make OKR global');
        }
    };

    const handleTagSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingTag) {
                await api.patch(`/orgs/${orgId}/tags/${editingTag.id}`, tagForm);
            } else {
                await api.post(`/orgs/${orgId}/tags`, tagForm);
            }
            setShowTagModal(false);
            setEditingTag(null);
            setTagForm({ name: '', color: '#2563eb' });
            await fetchData();
        } catch (error: any) {
            alert(error.response?.data?.error || 'Failed to save tag');
        }
    };

    const handleDeleteTag = async (tagId: string) => {
        if (!window.confirm('Are you sure you want to delete this tag?')) return;
        try {
            await api.delete(`/orgs/${orgId}/tags/${tagId}`);
            await fetchData();
        } catch (error: any) {
            alert(error.response?.data?.error || 'Failed to delete tag');
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

    const handleInviteMember = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!orgId || !inviteEmail.trim()) return;

        try {
            setTeamError('');
            setInviting(true);
            await api.post(`/orgs/${orgId}/invites`, {
                email: inviteEmail,
                role: inviteRole,
                name: inviteName || undefined
            });
            setInviteEmail('');
            setInviteName('');
            setInviteRole('MEMBER');
            const invitesRes = await api.get(`/orgs/${orgId}/invites`);
            setInvites(invitesRes.data || []);
        } catch (error: any) {
            const errorData = error.response?.data?.error;
            const message = typeof errorData === 'object' ? errorData.message : errorData;
            setTeamError(message || 'Failed to send invite');
        } finally {
            setInviting(false);
        }
    };

    const handleResendInvite = async (inviteId: string) => {
        if (!orgId || !window.confirm('Resend this invitation?')) return;

        try {
            await api.post(`/orgs/${orgId}/invites/${inviteId}/resend`);
            const invitesRes = await api.get(`/orgs/${orgId}/invites`);
            setInvites(invitesRes.data || []);
        } catch (error: any) {
            const errorData = error.response?.data?.error;
            const message = typeof errorData === 'object' ? errorData.message : errorData;
            alert(message || 'Failed to resend invite');
        }
    };

    const handleCreateClient = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!orgId || !clientFormName.trim()) return;
        try {
            await api.post(`/orgs/${orgId}/clients`, { name: clientFormName, visibility: clientFormVisibility });
            setClientFormName('');
            setClientFormVisibility('ORG_WIDE');
            setShowCreateClientModal(false);
            await fetchData();
        } catch (error: any) {
            const errorData = error.response?.data?.error;
            alert((typeof errorData === 'object' ? errorData.message : errorData) || 'Failed to create client');
        }
    };

    const handleUpdateClient = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!orgId || !editingClient || !clientFormName.trim()) return;
        try {
            await api.patch(`/orgs/${orgId}/clients/${editingClient.id}`, { name: clientFormName, visibility: clientFormVisibility });
            setEditingClient(null);
            setClientFormName('');
            await fetchData();
        } catch (error: any) {
            const errorData = error.response?.data?.error;
            alert((typeof errorData === 'object' ? errorData.message : errorData) || 'Failed to update client');
        }
    };

    const handleDeleteClient = async (clientId: string) => {
        if (!orgId || !window.confirm('Delete this client?')) return;
        try {
            await api.delete(`/orgs/${orgId}/clients/${clientId}`);
            await fetchData();
        } catch (error: any) {
            const errorData = error.response?.data?.error;
            alert((typeof errorData === 'object' ? errorData.message : errorData) || 'Failed to delete client');
        }
    };

    const handleCreateProject = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!orgId || !projectForm.name.trim() || !projectForm.clientId) return;
        try {
            await api.post(`/orgs/${orgId}/projects`, {
                name: projectForm.name,
                clientId: projectForm.clientId,
                visibility: projectForm.visibility
            });
            setProjectForm({ name: '', clientId: clients[0]?.id || '', visibility: 'ORG_WIDE' });
            setShowCreateProjectModal(false);
            await fetchData();
        } catch (error: any) {
            const errorData = error.response?.data?.error;
            alert((typeof errorData === 'object' ? errorData.message : errorData) || 'Failed to create project');
        }
    };

    const handleUpdateProject = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!orgId || !editingProject || !projectForm.name.trim() || !projectForm.clientId) return;
        try {
            await api.patch(`/orgs/${orgId}/projects/${editingProject.id}`, {
                name: projectForm.name,
                clientId: projectForm.clientId,
                visibility: projectForm.visibility
            });
            setEditingProject(null);
            setProjectForm({ name: '', clientId: clients[0]?.id || '', visibility: 'ORG_WIDE' });
            await fetchData();
        } catch (error: any) {
            const errorData = error.response?.data?.error;
            alert((typeof errorData === 'object' ? errorData.message : errorData) || 'Failed to update project');
        }
    };

    const handleDeleteProject = async (projectId: string) => {
        if (!orgId || !window.confirm('Delete this project?')) return;
        try {
            await api.delete(`/orgs/${orgId}/projects/${projectId}`);
            await fetchData();
        } catch (error: any) {
            const errorData = error.response?.data?.error;
            alert((typeof errorData === 'object' ? errorData.message : errorData) || 'Failed to delete project');
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
            await fetchSubmissions(taskId);
            await fetchActivity(taskId);
            await fetchData();
        } catch {
            alert('Failed to add comment');
        } finally {
            setSubmittingCommentTaskId(null);
        }
    };

    const fetchSubmissions = async (taskId: string) => {
        try {
            const res = await api.get(`/tasks/${taskId}/submissions`);
            setSubmissions(res.data);
        } catch (error) {
            console.error('Failed to fetch submissions');
        }
    };

    const fetchActivity = async (taskId: string) => {
        try {
            const res = await api.get(`/tasks/${taskId}/activity`);
            setActivityLogs(res.data);
        } catch (error) {
            console.error('Failed to fetch activity');
        }
    };

    const handleSubmitWork = async () => {
        if (!selectedTaskId || !submissionDescription.trim()) return;
        try {
            await api.post(`/tasks/${selectedTaskId}/submit`, {
                description: submissionDescription.trim()
            });
            setSubmissionDescription('');
            setShowSubmissionModal(false);
            await fetchSubmissions(selectedTaskId);
            await fetchActivity(selectedTaskId);
            await fetchData();
        } catch {
            alert('Failed to submit work');
        }
    };

    const handleReviewSubmission = async (submissionId: string, status: 'APPROVED' | 'REJECTED') => {
        if (!selectedTaskId) return;
        try {
            await api.post(`/tasks/${selectedTaskId}/submissions/${submissionId}/review`, {
                status,
                reviewNotes: reviewNotes.trim() || undefined
            });
            setReviewNotes('');
            await fetchSubmissions(selectedTaskId);
            await fetchActivity(selectedTaskId);
            await fetchData();
        } catch {
            alert('Failed to review submission');
        }
    };

    if (loading) {
        return <div className="dashboard loading">Loading...</div>;
    }

    return (
        <div className="dashboard">
            <div className="dashboard-container">
                {currentSection === 'board' && (
                    <BoardView
                        memberStats={memberStats}
                        teamDistribution={teamDistribution}
                        userRole={organization?.userRole as 'ADMIN' | 'TEAM_LEAD' | 'MEMBER'}
                        onCreateTask={() => setShowCreateTaskModal(true)}
                    />
                )}

                {currentSection === 'task-tracker' && (
                    <TaskTrackerView
                        tasks={tasks}
                        filter={filter === 'recently_deleted' || filter === 'my' ? 'all' : filter === 'in_progress' ? 'ongoing' : filter === 'created' ? 'pending' : filter}
                        onFilterChange={(f) => setFilter(f === 'all' ? 'all' : f === 'pending' ? 'created' : f === 'ongoing' ? 'in_progress' : f === 'completed' ? 'completed' : f === 'overdue' ? 'overdue' : 'all')}
                        onTaskClick={(task) => setSelectedTaskId(task.id)}
                        onCreateTask={() => setShowCreateTaskModal(true)}
                        onSendAlert={() => setShowSendAlertModal(true)}
                    />
                )}

                {currentSection === 'team-tracker' && canTrackTeam && (
                    <TeamTrackerView
                        tasks={tasks}
                        members={(organization?.members || []).map(m => ({
                            userId: m.userId,
                            name: m.user.name || m.user.email
                        }))}
                        selectedMemberId={assigneeFilterId}
                        onMemberSelect={(id) => setAssigneeFilterId(id)}
                        filter={filter === 'recently_deleted' || filter === 'my' ? 'all' : filter === 'in_progress' ? 'ongoing' : filter === 'created' ? 'pending' : filter}
                        onFilterChange={(f) => setFilter(f === 'all' ? 'all' : f === 'pending' ? 'created' : f === 'ongoing' ? 'in_progress' : f === 'completed' ? 'completed' : f === 'overdue' ? 'overdue' : 'all')}
                        onTaskClick={(task) => setSelectedTaskId(task.id)}
                        onCreateTask={() => setShowCreateTaskModal(true)}
                        onSendAlert={() => setShowSendAlertModal(true)}
                    />
                )}

                {currentSection === 'okr' && organization && (
                    <OkrView
                        okrs={okrs}
                        userRole={organization.userRole as 'ADMIN' | 'TEAM_LEAD' | 'MEMBER'}
                        onCreateTask={() => setShowCreateTaskModal(true)}
                        onSendAlert={() => setShowSendAlertModal(true)}
                        onEditOkr={handleOpenEditOkr}
                        onDeleteOkr={handleDeleteOkr}
                    />
                )}

                {currentSection === 'okr' && !organization && (
                    <div className="empty-state">
                        <p>Loading organization...</p>
                    </div>
                )}

                <div className="dashboard-header">
                    <div>
                        <p className="org-subtitle">
                            {organization?.userRole} • {organization?.members?.length || 0} Team Members
                        </p>
                    </div>
                    {currentSection === 'projects' && canManageProjects && (
                        <div className="header-actions">
                            <button onClick={() => setShowCreateClientModal(true)} className="btn-secondary">+ New Client</button>
                            <button onClick={() => setShowCreateProjectModal(true)} className="btn-primary">+ New Project</button>
                        </div>
                    )}
                    {currentSection === 'tracker' && (
                        <div className="header-actions">
                            {assigneeFilterId && (
                                <button onClick={() => setAssigneeFilterId(null)} className="btn-secondary">
                                    Show All
                                </button>
                            )}
                            {(isAdmin || isTeamLead) && (
                                <button onClick={() => setShowSendAlertModal(true)} className="btn-secondary">
                                    Send Alert
                                </button>
                            )}
                            <button onClick={() => setShowCreateTaskModal(true)} className="btn-primary">
                                + New Task
                            </button>
                        </div>
                    )}
                    {currentSection === 'tags' && isAdmin && (
                        <div className="header-actions">
                            <button onClick={() => setShowCreateOkrModal(true)} className="btn-primary">+ New OKR</button>
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
                        {isAdmin && (
                            <div className="team-invite-panel">
                                <h3>Team Invites</h3>
                                {teamError && <p className="team-error">{teamError}</p>}
                                <form className="team-invite-form" onSubmit={handleInviteMember}>
                                    <input
                                        type="text"
                                        value={inviteName}
                                        onChange={(e) => setInviteName(e.target.value)}
                                        placeholder="Full name (optional)"
                                    />
                                    <input
                                        type="email"
                                        value={inviteEmail}
                                        onChange={(e) => setInviteEmail(e.target.value)}
                                        placeholder="name@company.com"
                                        required
                                    />
                                    <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                                        <option value="MEMBER">Member</option>
                                        <option value="TEAM_LEAD">Team Lead</option>
                                    </select>
                                    <button type="submit" className="btn-primary" disabled={inviting}>
                                        {inviting ? 'Sending...' : 'Send Invite'}
                                    </button>
                                </form>

                                {invites.length > 0 && (
                                    <div className="team-invites-list">
                                        {invites.slice(0, 8).map((invite) => (
                                            <div key={invite.id} className="team-invite-row">
                                                <div className="team-member-info">
                                                    <div>
                                                        {invite.name ? (
                                                            <>
                                                                <strong>{invite.name}</strong>
                                                                <span className="invite-email">{invite.email}</span>
                                                            </>
                                                        ) : (
                                                            <strong>{invite.email}</strong>
                                                        )}
                                                    </div>
                                                    <span>Expires {new Date(invite.expiresAt).toLocaleDateString()}</span>
                                                </div>
                                                <div className="team-member-role">
                                                    {invite.status === 'PENDING' && (
                                                        <button
                                                            type="button"
                                                            className="btn-secondary"
                                                            style={{ padding: '4px 10px', fontSize: '0.8em', marginRight: '8px' }}
                                                            onClick={() => handleResendInvite(invite.id)}
                                                        >
                                                            Resend
                                                        </button>
                                                    )}
                                                    <span className="role-badge low">{invite.role}</span>
                                                    <span className={`role-badge ${invite.status.toLowerCase()}`}>{invite.status}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="team-stats-grid">
                            {teams.map((team) => (
                                <div key={team.id} className="task-card" style={{ padding: '20px' }}>
                                    <div className="tasks-header" style={{ marginBottom: 12 }}>
                                        <div>
                                            <h3 style={{ margin: 0 }}>{team.name}</h3>
                                            <p className="org-subtitle" style={{ marginTop: 4 }}>Lead: {team.leadUser.name || team.leadUser.email}</p>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '1.2em', fontWeight: 700, color: '#2563eb' }}>{team.stats.completed}%</div>
                                            <div style={{ fontSize: '0.7em', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Completion Rate</div>
                                        </div>
                                    </div>

                                    <div className="stat-bar-container" style={{ marginBottom: 10 }}>
                                        <div className="stat-bar created" style={{ width: `${(team.stats.created / (team.stats.total || 1)) * 100}%` }}></div>
                                        <div className="stat-bar progress" style={{ width: `${(team.stats.inProgress / (team.stats.total || 1)) * 100}%` }}></div>
                                        <div className="stat-bar completed" style={{ width: `${(team.stats.completed / (team.stats.total || 1)) * 100}%` }}></div>
                                    </div>
                                    <div className="member-counts" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <span className="count completed" title="Tasks Completed">{team.stats.completed} Completed</span>
                                            <span className="count created" title="Tasks Created">{team.stats.created} Created</span>
                                        </div>
                                        {isAdmin && (
                                            <div className="header-actions" style={{ margin: 0 }}>
                                                <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.8em' }} onClick={() => openEditTeam(team)}>Edit</button>
                                                <button className="btn-logout" style={{ padding: '4px 8px', fontSize: '0.8em' }} onClick={() => handleDeleteTeam(team.id)}>Delete</button>
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <strong>People</strong>
                                        <div className="team-members-list" style={{ marginTop: 8 }}>
                                            {(team.people || team.members || []).map((person: any) => (
                                                <div
                                                    className="team-member-row"
                                                    key={person.userId || person.id}
                                                    onClick={() => handleMemberClick(person.userId || person.id)}
                                                    style={{ cursor: 'pointer' }}
                                                >
                                                    <div className="team-member-info">
                                                        <strong style={{ color: '#2563eb' }}>{person.name || person.email}</strong>
                                                        <div style={{ fontSize: '0.8em', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                                            <span>{person.role}</span>
                                                            <span title={`Score: ${person.stats?.performanceScore || 0}%`}>
                                                                • {person.stats?.temperature || '🔴 Low Activity'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="team-member-role">
                                                        <span className="role-badge created" title="Pending">{person.stats?.pending || 0}</span>
                                                        <span className="role-badge in_progress" title="Ongoing">{person.stats?.ongoing || 0}</span>
                                                        <span className="role-badge completed" title="Completed">{person.stats?.completed || 0}</span>
                                                        <span className="role-badge overdue" title="Overdue">{person.stats?.overdue || 0}</span>
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

                {currentSection === 'projects' && (
                    <div className="tasks-section">
                        <div className="projects-tabs">
                            <button
                                type="button"
                                className={projectsTab === 'projects' ? 'active' : ''}
                                onClick={() => setProjectsTab('projects')}
                            >
                                Projects
                            </button>
                            <button
                                type="button"
                                className={projectsTab === 'clients' ? 'active' : ''}
                                onClick={() => setProjectsTab('clients')}
                            >
                                Clients
                            </button>
                        </div>

                        {projectsTab === 'projects' ? (
                            <div className="tasks-list">
                                {projects.map((project) => {
                                    const isOwner = project.createdByUserId === user?.id;
                                    return (
                                        <div key={project.id} className="task-card" style={{ padding: '16px' }}>
                                            <div className="tasks-header" style={{ marginBottom: 8 }}>
                                                <div>
                                                    <h3 style={{ margin: 0 }}>{project.name}</h3>
                                                    <p className="org-subtitle" style={{ marginTop: 4 }}>
                                                        Client: {project.client?.name || 'Unknown'} • Tasks: {project.taskCount || 0}
                                                    </p>
                                                </div>
                                                {canManageProjects && isOwner && (
                                                    <div className="header-actions">
                                                        <button
                                                            className="btn-secondary"
                                                            onClick={() => {
                                                                setEditingProject(project);
                                                                setProjectForm({ name: project.name, clientId: project.clientId, visibility: project.visibility });
                                                            }}
                                                        >
                                                            Edit
                                                        </button>
                                                        <button className="btn-logout" onClick={() => handleDeleteProject(project.id)}>
                                                            Delete
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            <p className="task-description" style={{ marginBottom: 0 }}>
                                                Owner: {project.createdBy?.name || project.createdBy?.email || 'Unknown'} • Created:{' '}
                                                {new Date(project.createdAt).toLocaleDateString()}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="tasks-list">
                                {clients.map((client) => {
                                    const isOwner = client.createdByUserId === user?.id;
                                    return (
                                        <div key={client.id} className="task-card" style={{ padding: '16px' }}>
                                            <div className="tasks-header" style={{ marginBottom: 8 }}>
                                                <div>
                                                    <h3 style={{ margin: 0 }}>{client.name}</h3>
                                                    <p className="org-subtitle" style={{ marginTop: 4 }}>
                                                        Projects: {client.projectCount || 0} • Tasks: {client.taskCount || 0}
                                                    </p>
                                                </div>
                                                {canManageProjects && isOwner && (
                                                    <div className="header-actions">
                                                        <button
                                                            className="btn-secondary"
                                                            onClick={() => {
                                                                setEditingClient(client);
                                                                setClientFormName(client.name);
                                                                setClientFormVisibility(client.visibility);
                                                            }}
                                                        >
                                                            Edit
                                                        </button>
                                                        <button className="btn-logout" onClick={() => handleDeleteClient(client.id)}>
                                                            Delete
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            <p className="task-description" style={{ marginBottom: 0 }}>
                                                Owner: {client.createdBy?.name || client.createdBy?.email || 'Unknown'} • Created:{' '}
                                                {new Date(client.createdAt).toLocaleDateString()}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {currentSection === 'tags' && isAdmin && (
                    <div className="tasks-section">
                        <div className="tasks-header">
                            <h2>Organization Tags</h2>
                            <button className="btn-primary" onClick={() => {
                                setEditingTag(null);
                                setTagForm({ name: '', color: '#2563eb' });
                                setShowTagModal(true);
                            }}>+ New Tag</button>
                        </div>
                        <div className="tasks-list">
                            {tags.map((tag: any) => (
                                <div key={tag.id} className="task-card" style={{ padding: '16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <span style={{ width: 14, height: 14, borderRadius: 999, background: tag.color, display: 'inline-block', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}></span>
                                            <div>
                                                <strong style={{ fontSize: '1.1em' }} title={tagSourceMap[tag.id] ? `Objective: ${tagSourceMap[tag.id].okrTitle} | KR: ${tagSourceMap[tag.id].krTitle}` : ''}>
                                                    {tag.name}
                                                </strong>
                                                <div style={{ fontSize: '0.85em', color: 'var(--text-muted)', marginTop: 2 }}>
                                                    Used in {tag.taskCount || 0} tasks
                                                </div>
                                            </div>
                                        </div>
                                        <div className="header-actions" style={{ margin: 0 }}>
                                            <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.8em' }} onClick={() => {
                                                setEditingTag(tag);
                                                setTagForm({ name: tag.name, color: tag.color });
                                                setShowTagModal(true);
                                            }}>Edit</button>
                                            <button className="btn-logout" style={{ padding: '4px 8px', fontSize: '0.8em' }} onClick={() => handleDeleteTag(tag.id)}>Delete</button>
                                        </div>
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
                                    <div className="task-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <h3 style={{ margin: 0 }}>{okr.title}</h3>
                                                <span className={`priority-badge ${okr.status === 'COMPLETED' ? 'low' : 'medium'}`} style={{
                                                    backgroundColor: okr.status === 'COMPLETED' ? 'var(--success-color)' : 'var(--warning-color)',
                                                    color: 'white',
                                                    borderColor: 'transparent'
                                                }}>
                                                    {okr.status}
                                                </span>
                                            </div>
                                            <p className="task-description" style={{ marginTop: 8 }}>{okr.description || 'No description'}</p>
                                        </div>
                                        {isAdmin && (
                                            <div className="header-actions" style={{ margin: 0 }}>
                                                <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.8em' }} onClick={() => handleOpenEditOkr(okr)}>Edit</button>
                                                {okr.assignments && okr.assignments.length > 0 && (
                                                    <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.8em' }} onClick={() => handleMakeOkrGlobal(okr.id)}>Make Global</button>
                                                )}
                                                <button className="btn-logout" style={{ padding: '4px 8px', fontSize: '0.8em' }} onClick={() => handleDeleteOkr(okr.id)}>Delete</button>
                                            </div>
                                        )}
                                    </div>
                                    <div className="task-header" style={{ marginTop: 4 }}>
                                        {(okr.assignments && okr.assignments.length > 0) && (
                                            <div className="task-meta" style={{ marginTop: 8 }}>
                                                {okr.assignments.filter((a) => a.targetType === 'TEAM' && a.team).some((a) => a.targetType === 'TEAM') && (
                                                    <div style={{ marginBottom: 4 }}>
                                                        <strong>Assigned To:</strong>{' '}
                                                        {okr.assignments
                                                            .filter((a) => a.targetType === 'TEAM' && a.team)
                                                            .map((a) => a.team!.name)
                                                            .join(', ')}
                                                    </div>
                                                )}
                                            </div>
                                        )}
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
                                                    {kr.title} <span className="priority-badge low" style={{ borderColor: kr.tag.color, color: kr.tag.color }} title={`Objective: ${okr.title} | KR: ${kr.title}`}>{kr.tag.name}</span>
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
                            {appraisals.map((appraisal: any) => (
                                <div key={appraisal.id} className="task-card" style={{ padding: '24px' }}>
                                    <div className="task-header" style={{ marginBottom: 16 }}>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: '1.2em' }}>{appraisal.subjectUser?.name || appraisal.subjectUser?.email || 'Team Member'}</h3>
                                            <p className="org-subtitle" style={{ marginTop: 4 }}>Cycle: {appraisal.cycle}</p>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '1.4em', fontWeight: 800, color: appraisal.overallRating === 'EXCELLENT' ? '#16a34a' : appraisal.overallRating === 'GOOD' ? '#2563eb' : '#f97316' }}>
                                                {appraisal.overallRating}
                                            </div>
                                            <div style={{ fontSize: '0.7em', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Overall Rating</div>
                                        </div>
                                    </div>

                                    <div className="appraisal-metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px', background: '#f8fafc', padding: '16px', borderRadius: '12px' }}>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: '1.1em', fontWeight: 700 }}>{Math.round(appraisal.tasksCompleted || 0)}%</div>
                                            <div style={{ fontSize: '0.65em', color: '#64748b', textTransform: 'uppercase' }}>Tasks Completed</div>
                                        </div>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: '1.1em', fontWeight: 700 }}>{Math.round(appraisal.deadlinesMet || 0)}%</div>
                                            <div style={{ fontSize: '0.65em', color: '#64748b', textTransform: 'uppercase' }}>Deadlines Met</div>
                                        </div>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: '1.1em', fontWeight: 700 }}>{appraisal.okrContribution}</div>
                                            <div style={{ fontSize: '0.65em', color: '#64748b', textTransform: 'uppercase' }}>OKR Contribution</div>
                                        </div>
                                    </div>

                                    <p className="task-description" style={{ whiteSpace: 'pre-wrap', marginBottom: '20px', color: '#475569' }}>{appraisal.summary}</p>

                                    <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                                        <button
                                            className="btn-secondary"
                                            onClick={() => window.open(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/appraisals/${appraisal.id}/export?token=${localStorage.getItem('token')}`, '_blank')}
                                        >
                                            Export Report (CSV)
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {currentSection === 'tracker' && (
                    <>
                        {canUseTrackerCharts && (
                            <section className="tracker-analytics">
                                <div className="tracker-hero">
                                    <div>
                                        <h2>Tracker</h2>
                                    </div>
                                    <div className="tracker-hero-right">
                                        <p><strong>Workers:</strong> {workersActiveCount} people active</p>
                                        <div className="tracker-legend">
                                            <span className="legend-chip pending">Pending</span>
                                            <span className="legend-chip ongoing">Ongoing</span>
                                            <span className="legend-chip completed">Completed</span>
                                            <span className="legend-chip overdue">Overdue</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="tracker-view-tabs">
                                    <button
                                        type="button"
                                        className={trackerView === 'users' ? 'active' : ''}
                                        onClick={() => handleTrackerViewChange('users')}
                                    >
                                        By Users
                                    </button>
                                    <button
                                        type="button"
                                        className={trackerView === 'teams' ? 'active' : ''}
                                        onClick={() => handleTrackerViewChange('teams')}
                                    >
                                        By Teams
                                    </button>
                                </div>

                                <div className="tracker-chart-panel">
                                    <div className="tracker-chart-scroll">
                                        <div
                                            className="tracker-chart-grid"
                                            style={{ minWidth: `${Math.max(currentChartData.length * 110, 680)}px` }}
                                        >
                                            {[1, 0.75, 0.5, 0.25, 0].map((tick) => (
                                                <div
                                                    key={tick}
                                                    className="tracker-grid-line"
                                                    style={{ bottom: `${tick * 100}%` }}
                                                >
                                                    <span>{Math.round(chartMaxValue * tick)}</span>
                                                </div>
                                            ))}

                                            <div className="tracker-chart-bars">
                                                {currentChartData.map((item) => (
                                                    <div key={item.id} className="tracker-bar-group">
                                                        <div className="tracker-bars">
                                                            <span
                                                                className="tracker-bar pending"
                                                                style={{ height: `${(item.pending / chartMaxValue) * 100}%` }}
                                                                title={`Pending: ${item.pending}`}
                                                            />
                                                            <span
                                                                className="tracker-bar ongoing"
                                                                style={{ height: `${(item.ongoing / chartMaxValue) * 100}%` }}
                                                                title={`Ongoing: ${item.ongoing}`}
                                                            />
                                                            <span
                                                                className="tracker-bar completed"
                                                                style={{ height: `${(item.completed / chartMaxValue) * 100}%` }}
                                                                title={`Completed: ${item.completed}`}
                                                            />
                                                            <span
                                                                className="tracker-bar overdue"
                                                                style={{ height: `${(item.overdue / chartMaxValue) * 100}%` }}
                                                                title={`Overdue: ${item.overdue}`}
                                                            />
                                                        </div>
                                                        <div className="tracker-bar-label">{item.label}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        )}

                        {!canUseTrackerCharts && stats && (
                            <div className="stats-grid">
                                {(isMember || isTeamLead) && (
                                    <div className="stat-card performance-highlight">
                                        <h3>My Performance</h3>
                                        <p className="stat-value">{memberStats.find(m => m.userId === user?.id)?.stats.temperature || '🔴 Low Activity'}</p>
                                        <small>Score: {memberStats.find(m => m.userId === user?.id)?.stats.performanceScore || 0}%</small>
                                    </div>
                                )}
                                <div className="stat-card" onClick={() => setFilter('all')}><h3>Total Workload</h3><p className="stat-value">{stats.total}</p></div>
                                <div className="stat-card" onClick={() => setFilter('in_progress')}><h3>Ongoing Tasks</h3><p className="stat-value">{stats.ongoing}</p></div>
                                <div className="stat-card" onClick={() => setFilter('completed')}><h3>Completed Work</h3><p className="stat-value">{stats.completed}</p></div>
                                <div className="stat-card" onClick={() => setFilter('overdue')}><h3>Overdue</h3><p className="stat-value" style={{ color: '#ef4444' }}>{stats.overdue}</p></div>
                                {!isAdmin && (
                                    <div className="stat-card" onClick={() => setFilter('my')}><h3>Your Focus</h3><p className="stat-value">{stats.myTasks}</p></div>
                                )}
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
                                    {!isAdmin && (
                                        <button type="button" className={`btn-filter ${filter === 'my' ? 'active' : ''}`} onClick={() => setFilter('my')}>My Tasks</button>
                                    )}
                                    <button type="button" className={`btn-filter ${filter === 'created' ? 'active' : ''}`} onClick={() => setFilter('created')}>Pending</button>
                                    <button type="button" className={`btn-filter ${filter === 'in_progress' ? 'active' : ''}`} onClick={() => setFilter('in_progress')}>Ongoing</button>
                                    <button type="button" className={`btn-filter ${filter === 'completed' ? 'active' : ''}`} onClick={() => setFilter('completed')}>Completed</button>
                                    <button type="button" className={`btn-filter overdue ${filter === 'overdue' ? 'active' : ''}`} onClick={() => setFilter('overdue')}>Overdue</button>
                                    {isAdmin && (
                                        <button type="button" className={`btn-filter ${filter === 'recently_deleted' ? 'active' : ''}`} onClick={() => setFilter('recently_deleted')}>Recently Deleted</button>
                                    )}
                                    <select
                                        className="tracker-select-filter"
                                        value={taskClientFilter}
                                        onChange={(e) => setTaskClientFilter(e.target.value)}
                                    >
                                        <option value="all">All Clients</option>
                                        {clients.map((client) => (
                                            <option key={client.id} value={client.id}>{client.name}</option>
                                        ))}
                                    </select>
                                    <select
                                        className="tracker-select-filter"
                                        value={taskProjectFilter}
                                        onChange={(e) => setTaskProjectFilter(e.target.value)}
                                    >
                                        <option value="all">All Projects</option>
                                        {trackerProjectOptions.map((project) => (
                                            <option key={project.id} value={project.id}>{project.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="tasks-workspace">
                                <div className="tasks-list">
                                    {tasks.map((task) => (
                                        <button key={task.id} type="button" className={`task-card task-card-compact ${selectedTaskId === task.id ? 'active' : ''} ${isOverdue(task) ? 'overdue' : ''}`} onClick={() => setSelectedTaskId(task.id)}>
                                            <div className="task-header">
                                                <h3>{task.title}</h3>
                                                <div className="task-badges">
                                                    <span className={`priority-badge ${task.priority.toLowerCase()}`}>{task.priority}</span>
                                                    <span className={`status-badge ${task.status.toLowerCase()}`}>{task.status.replace('_', ' ')}</span>
                                                    {isOverdue(task) && (
                                                        <span className="status-badge overdue" title={`Due: ${new Date(task.dueDate!).toLocaleDateString()} (${getDaysOverdue(task)} days overdue)`}>
                                                            Overdue
                                                        </span>
                                                    )}
                                                    {task.tag && (
                                                        <span
                                                            className="priority-badge low"
                                                            style={{ borderColor: task.tag.color, color: task.tag.color }}
                                                            title={tagSourceMap[task.tag.id] ? `Objective: ${tagSourceMap[task.tag.id].okrTitle} | KR: ${tagSourceMap[task.tag.id].krTitle}` : ''}
                                                        >
                                                            {task.tag.name}
                                                        </span>
                                                    )}
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
                                                        <div className="meta-item"><strong>Project:</strong> {task.project?.name || 'Unassigned'}</div>
                                                        <div className="meta-item"><strong>Client:</strong> {task.project?.client?.name || 'Unassigned'}</div>
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
                                                <div className="task-detail-header-actions">
                                                    <button
                                                        type="button"
                                                        className="btn-icon-close"
                                                        onClick={() => setSelectedTaskId(null)}
                                                        title="Close"
                                                    >
                                                        ×
                                                    </button>
                                                    <div className="task-badges">
                                                        <span className={`priority-badge ${selectedTask.priority.toLowerCase()}`}>{selectedTask.priority}</span>
                                                        <span className={`status-badge ${selectedTask.status.toLowerCase()}`}>{selectedTask.status.replace('_', ' ')}</span>
                                                        {selectedTask.tag && (
                                                            <span
                                                                className="priority-badge low"
                                                                style={{ borderColor: selectedTask.tag.color, color: selectedTask.tag.color }}
                                                                title={tagSourceMap[selectedTask.tag.id] ? `Objective: ${tagSourceMap[selectedTask.tag.id].okrTitle} | KR: ${tagSourceMap[selectedTask.tag.id].krTitle}` : ''}
                                                            >
                                                                {selectedTask.tag.name}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="task-meta">
                                                <div className="meta-item"><strong>Owner:</strong> {selectedTask.assignee?.name || selectedTask.assignee?.email || 'Unassigned'}</div>
                                                <div className="meta-item"><strong>Supporter:</strong> {selectedTask.supporter?.name || selectedTask.supporter?.email || 'None'}</div>
                                                <div className="meta-item"><strong>Project:</strong> {selectedTask.project?.name || 'Unassigned'}</div>
                                                <div className="meta-item"><strong>Client:</strong> {selectedTask.project?.client?.name || 'Unassigned'}</div>
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

                                            {!isDeletedView && selectedTask.status !== 'COMPLETED' && (user?.id === selectedTask.assignee?.id || user?.id === selectedTask.supporter?.id) && (
                                                <div className="task-work-submission">
                                                    <h4>Work Submission</h4>
                                                    <button
                                                        type="button"
                                                        className="btn-action success"
                                                        onClick={() => setShowSubmissionModal(true)}
                                                    >
                                                        Submit Work
                                                    </button>
                                                </div>
                                            )}

                                            {!isDeletedView && submissions.length > 0 && (
                                                <div className="task-submissions-list">
                                                    <h4>Submissions</h4>
                                                    <div className="submissions-list">
                                                        {submissions.map((sub) => (
                                                            <div key={sub.id} className="submission-item">
                                                                <div className="submission-header">
                                                                    <span className="submission-author">
                                                                        {sub.user?.name || 'Unknown'}
                                                                    </span>
                                                                    <span className={`submission-status status-${sub.status.toLowerCase()}`}>
                                                                        {sub.status}
                                                                    </span>
                                                                </div>
                                                                <div className="submission-meta">
                                                                    <span>Submitted: {new Date(sub.submittedAt).toLocaleString()}</span>
                                                                    {sub.reviewedAt && (
                                                                        <span>Reviewed: {new Date(sub.reviewedAt).toLocaleString()}</span>
                                                                    )}
                                                                </div>
                                                                {sub.description && (
                                                                    <p className="submission-description">{sub.description}</p>
                                                                )}
                                                                {sub.reviewNotes && (
                                                                    <p className="submission-review-notes"><strong>Review Notes:</strong> {sub.reviewNotes}</p>
                                                                )}
                                                                {isAdmin && sub.status === 'PENDING' && (
                                                                    <div className="submission-actions">
                                                                        <button
                                                                            className="btn-action success"
                                                                            onClick={() => {
                                                                                handleReviewSubmission(sub.id, 'APPROVED');
                                                                            }}
                                                                        >
                                                                            Approve
                                                                        </button>
                                                                        <button
                                                                            className="btn-action danger"
                                                                            onClick={() => {
                                                                                handleReviewSubmission(sub.id, 'REJECTED');
                                                                            }}
                                                                        >
                                                                            Reject
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {!isDeletedView && activityLogs.length > 0 && (
                                                <div className="task-activity-timeline">
                                                    <h4>Activity Timeline</h4>
                                                    <div className="activity-list">
                                                        {activityLogs.map((log) => (
                                                            <div key={log.id} className="activity-item">
                                                                <div className="activity-icon">
                                                                    {log.action === 'COMMENT_ADDED' && '💬'}
                                                                    {log.action === 'COMMENT_DELETED' && '🗑️'}
                                                                    {log.action === 'STATUS_CHANGED' && '📊'}
                                                                    {log.action === 'ASSIGNEE_CHANGED' && '👤'}
                                                                    {log.action === 'SUPPORTER_CHANGED' && '🤝'}
                                                                    {log.action === 'SUBMISSION_CREATED' && '📝'}
                                                                    {log.action === 'SUBMISSION_REVIEWED' && '✅'}
                                                                    {log.action === 'ATTACHMENT_ADDED' && '📎'}
                                                                    {log.action === 'ATTACHMENT_DELETED' && '📎'}
                                                                    {log.action === 'TASK_UPDATED' && '✏️'}
                                                                </div>
                                                                <div className="activity-content">
                                                                    <div className="activity-header">
                                                                        <span className="activity-user">{log.user?.name || 'System'}</span>
                                                                        <span className="activity-time">{new Date(log.createdAt).toLocaleString()}</span>
                                                                    </div>
                                                                    <p className="activity-description">{log.description}</p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
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

            {showCreateClientModal && (
                <div className="modal-overlay" onClick={() => setShowCreateClientModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h2>Create Client</h2>
                        <form onSubmit={handleCreateClient}>
                            <div className="form-group">
                                <label>Client Name</label>
                                <input
                                    type="text"
                                    value={clientFormName}
                                    onChange={(e) => setClientFormName(e.target.value)}
                                    required
                                    autoFocus
                                />
                            </div>
                            <div className="form-group">
                                <label>Visibility</label>
                                <select
                                    value={clientFormVisibility}
                                    onChange={(e) => setClientFormVisibility(e.target.value)}
                                >
                                    <option value="ORG_WIDE">Organization-wide (All members)</option>
                                    <option value="CREATOR_ONLY">Only me (Creator)</option>
                                </select>
                            </div>
                            <div className="modal-notice">
                                <small>This client will be visible to all team members and team leads.</small>
                            </div>
                            <div className="modal-actions">
                                <button type="button" onClick={() => setShowCreateClientModal(false)} className="btn-secondary">Cancel</button>
                                <button type="submit" className="btn-primary">Create Client</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {editingClient && (
                <div className="modal-overlay" onClick={() => setEditingClient(null)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h2>Edit Client</h2>
                        <form onSubmit={handleUpdateClient}>
                            <div className="form-group">
                                <label>Client Name</label>
                                <input
                                    type="text"
                                    value={clientFormName}
                                    onChange={(e) => setClientFormName(e.target.value)}
                                    required
                                    autoFocus
                                />
                            </div>
                            <div className="form-group">
                                <label>Visibility</label>
                                <select
                                    value={clientFormVisibility}
                                    onChange={(e) => setClientFormVisibility(e.target.value)}
                                >
                                    <option value="ORG_WIDE">Organization-wide (All members)</option>
                                    <option value="CREATOR_ONLY">Only me (Creator)</option>
                                </select>
                            </div>
                            <div className="modal-actions">
                                <button type="button" onClick={() => setEditingClient(null)} className="btn-secondary">Cancel</button>
                                <button type="submit" className="btn-primary">Save Client</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showCreateProjectModal && (
                <div className="modal-overlay" onClick={() => setShowCreateProjectModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h2>Create Project</h2>
                        <form onSubmit={handleCreateProject}>
                            <div className="form-group">
                                <label>Project Name</label>
                                <input
                                    type="text"
                                    value={projectForm.name}
                                    onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                                    required
                                    autoFocus
                                />
                            </div>
                            <div className="form-group">
                                <label>Client</label>
                                <select
                                    value={projectForm.clientId}
                                    onChange={(e) => setProjectForm({ ...projectForm, clientId: e.target.value })}
                                    required
                                >
                                    <option value="">Select client</option>
                                    {clients.map((client) => (
                                        <option key={client.id} value={client.id}>{client.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Visibility</label>
                                <select
                                    value={projectForm.visibility}
                                    onChange={(e) => setProjectForm({ ...projectForm, visibility: e.target.value })}
                                >
                                    <option value="ORG_WIDE">Organization-wide (All members)</option>
                                    <option value="CREATOR_ONLY">Only me (Creator)</option>
                                </select>
                            </div>
                            <div className="modal-notice">
                                <small>This project will be visible to all team members and team leads.</small>
                            </div>
                            <div className="modal-actions">
                                <button type="button" onClick={() => setShowCreateProjectModal(false)} className="btn-secondary">Cancel</button>
                                <button type="submit" className="btn-primary">Create Project</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {editingProject && (
                <div className="modal-overlay" onClick={() => setEditingProject(null)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h2>Edit Project</h2>
                        <form onSubmit={handleUpdateProject}>
                            <div className="form-group">
                                <label>Project Name</label>
                                <input
                                    type="text"
                                    value={projectForm.name}
                                    onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                                    required
                                    autoFocus
                                />
                            </div>
                            <div className="form-group">
                                <label>Client</label>
                                <select
                                    value={projectForm.clientId}
                                    onChange={(e) => setProjectForm({ ...projectForm, clientId: e.target.value })}
                                    required
                                >
                                    <option value="">Select client</option>
                                    {clients.map((client) => (
                                        <option key={client.id} value={client.id}>{client.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Visibility</label>
                                <select
                                    value={projectForm.visibility}
                                    onChange={(e) => setProjectForm({ ...projectForm, visibility: e.target.value })}
                                >
                                    <option value="ORG_WIDE">Organization-wide (All members)</option>
                                    <option value="CREATOR_ONLY">Only me (Creator)</option>
                                </select>
                            </div>
                            <div className="modal-actions">
                                <button type="button" onClick={() => setEditingProject(null)} className="btn-secondary">Cancel</button>
                                <button type="submit" className="btn-primary">Save Project</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

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
                                <label>Project *</label>
                                <select value={newTask.projectId} onChange={(e) => setNewTask({ ...newTask, projectId: e.target.value })} required>
                                    <option value="">Select a project</option>
                                    {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                                </select>
                                {selectedCreateTaskProject && (
                                    <div className="selected-tag-preview">
                                        <span>Client: <strong>{selectedCreateTaskProject.client?.name || 'Unknown'}</strong></span>
                                    </div>
                                )}
                            </div>
                            <div className="form-group">
                                <label>Tag *</label>
                                <select value={newTask.tagId} onChange={(e) => setNewTask({ ...newTask, tagId: e.target.value })} required>
                                    <option value="">Select a tag</option>
                                    {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
                                </select>
                                {selectedCreateTaskTag && (
                                    <div className="selected-tag-preview">
                                        <span className="color-preview-chip" style={{ background: selectedCreateTaskTag.color }} aria-hidden="true"></span>
                                        <span>Selected tag: <strong title={tagSourceMap[selectedCreateTaskTag.id] ? `Objective: ${tagSourceMap[selectedCreateTaskTag.id].okrTitle} | KR: ${tagSourceMap[selectedCreateTaskTag.id].krTitle}` : ''}>{selectedCreateTaskTag.name}</strong></span>
                                    </div>
                                )}
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
                            {!isTeamLead && (
                                <div className="form-group">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={newTask.alertTeamLead}
                                            onChange={(e) => setNewTask({ ...newTask, alertTeamLead: e.target.checked })}
                                            style={{ width: 'auto', margin: 0 }}
                                        />
                                        <span>Alert Team Lead about this task</span>
                                    </label>
                                    <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: 4 }}>
                                        Team leads will be notified about this task for review.
                                    </small>
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
                                <label>Project *</label>
                                <select value={editTask.projectId} onChange={(e) => setEditTask({ ...editTask, projectId: e.target.value })} required>
                                    <option value="">Select a project</option>
                                    {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                                </select>
                                {selectedEditTaskProject && (
                                    <div className="selected-tag-preview">
                                        <span>Client: <strong>{selectedEditTaskProject.client?.name || 'Unknown'}</strong></span>
                                    </div>
                                )}
                            </div>
                            <div className="form-group">
                                <label>Tag *</label>
                                <select value={editTask.tagId} onChange={(e) => setEditTask({ ...editTask, tagId: e.target.value })} required>
                                    <option value="">Select a tag</option>
                                    {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
                                </select>
                                {selectedEditTaskTag && (
                                    <div className="selected-tag-preview">
                                        <span className="color-preview-chip" style={{ background: selectedEditTaskTag.color }} aria-hidden="true"></span>
                                        <span>Selected tag: <strong title={tagSourceMap[selectedEditTaskTag.id] ? `Objective: ${tagSourceMap[selectedEditTaskTag.id].okrTitle} | KR: ${tagSourceMap[selectedEditTaskTag.id].krTitle}` : ''}>{selectedEditTaskTag.name}</strong></span>
                                    </div>
                                )}
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

            {showSendAlertModal && (
                <div className="modal-overlay" onClick={() => setShowSendAlertModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h2>Send Alert</h2>
                        <form onSubmit={handleSendAlert}>
                            <div className="form-group">
                                <label>Target Type</label>
                                <select
                                    value={alertForm.targetType}
                                    onChange={(e) => setAlertForm({ ...alertForm, targetType: e.target.value, targetId: '' })}
                                >
                                    <option value="INDIVIDUAL">Individual Member</option>
                                    <option value="TEAM">Entire Team</option>
                                    <option value="PROJECT">Project Group</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Recipient</label>
                                <select
                                    value={alertForm.targetId}
                                    onChange={(e) => setAlertForm({ ...alertForm, targetId: e.target.value })}
                                    required
                                >
                                    <option value="">Select Recipient</option>
                                    {alertForm.targetType === 'INDIVIDUAL' && assignableUsers.map(u => (
                                        <option key={u.userId} value={u.userId}>{u.user.name || u.user.email}</option>
                                    ))}
                                    {alertForm.targetType === 'TEAM' && teamDistribution.map(t => (
                                        <option key={t.teamId} value={t.teamId}>{t.teamName}</option>
                                    ))}
                                    {alertForm.targetType === 'PROJECT' && projects.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Alert Type</label>
                                <select
                                    value={alertForm.type}
                                    onChange={(e) => setAlertForm({ ...alertForm, type: e.target.value })}
                                >
                                    <option value="DEADLINE_REMINDER">Deadline Reminder</option>
                                    <option value="PRIORITY_ALERT">Task Priority Notification</option>
                                    <option value="FEEDBACK">Feedback Message</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Message</label>
                                <textarea
                                    rows={4}
                                    value={alertForm.message}
                                    onChange={(e) => setAlertForm({ ...alertForm, message: e.target.value })}
                                    placeholder="Enter your alert message here..."
                                    required
                                />
                            </div>

                            <div className="modal-actions">
                                <button type="button" onClick={() => setShowSendAlertModal(false)} className="btn-secondary">Cancel</button>
                                <button type="submit" className="btn-primary">Send Alert</button>
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

                            <div className="form-group">
                                <label>Assigned To (Primary Team)</label>
                                <select
                                    value={newOkr.assignedToTeamId}
                                    onChange={(e) => setNewOkr({ ...newOkr, assignedToTeamId: e.target.value })}
                                >
                                    <option value="">Select a team</option>
                                    {teams.map((team) => (
                                        <option key={team.id} value={team.id}>{team.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Supported By (Contributing Teams)</label>
                                <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 8, padding: 8 }}>
                                    {teams.map((team) => (
                                        <label key={team.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                checked={newOkr.supportedByTeamIds.includes(team.id)}
                                                onChange={(e) => {
                                                    const checked = e.target.checked;
                                                    setNewOkr((prev) => ({
                                                        ...prev,
                                                        supportedByTeamIds: checked
                                                            ? [...prev.supportedByTeamIds, team.id]
                                                            : prev.supportedByTeamIds.filter((id) => id !== team.id)
                                                    }));
                                                }}
                                            />
                                            <span>{team.name}</span>
                                        </label>
                                    ))}
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

            {showEditOkrModal && (
                <div className="modal-overlay" onClick={() => setShowEditOkrModal(false)}>
                    <div className="modal large" onClick={(e) => e.stopPropagation()}>
                        <h2>Edit OKR</h2>
                        <form onSubmit={handleUpdateOkr}>
                            <div className="form-group">
                                <label>Objective Title</label>
                                <input type="text" value={editOkrForm.title} onChange={(e) => setEditOkrForm({ ...editOkrForm, title: e.target.value })} required autoFocus />
                            </div>
                            <div className="form-group">
                                <label>Description</label>
                                <textarea rows={3} value={editOkrForm.description} onChange={(e) => setEditOkrForm({ ...editOkrForm, description: e.target.value })} />
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Period Start</label>
                                    <input type="date" value={editOkrForm.periodStart} onChange={(e) => setEditOkrForm({ ...editOkrForm, periodStart: e.target.value })} required />
                                </div>
                                <div className="form-group">
                                    <label>Period End</label>
                                    <input type="date" value={editOkrForm.periodEnd} onChange={(e) => setEditOkrForm({ ...editOkrForm, periodEnd: e.target.value })} required />
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Status</label>
                                <select
                                    value={editOkrForm.status}
                                    onChange={(e) => setEditOkrForm({ ...editOkrForm, status: e.target.value })}
                                >
                                    <option value="OPEN">Open</option>
                                    <option value="COMPLETED">Completed</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Assigned To (Primary Team)</label>
                                <select
                                    value={editOkrForm.assignedToTeamId}
                                    onChange={(e) => setEditOkrForm({ ...editOkrForm, assignedToTeamId: e.target.value })}
                                >
                                    <option value="">Select a team</option>
                                    {teams.map((team) => (
                                        <option key={team.id} value={team.id}>{team.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Supported By (Contributing Teams)</label>
                                <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 8, padding: 8 }}>
                                    {teams.map((team) => (
                                        <label key={team.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                checked={editOkrForm.supportedByTeamIds.includes(team.id)}
                                                onChange={(e) => {
                                                    const checked = e.target.checked;
                                                    setEditOkrForm((prev) => ({
                                                        ...prev,
                                                        supportedByTeamIds: checked
                                                            ? [...prev.supportedByTeamIds, team.id]
                                                            : prev.supportedByTeamIds.filter((id) => id !== team.id)
                                                    }));
                                                }}
                                            />
                                            <span>{team.name}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <h3 style={{ marginTop: 8 }}>Key Results</h3>
                            {editOkrForm.keyResults.map((kr, index) => (
                                <div key={index} style={{ border: '1px solid var(--border-color)', borderRadius: 10, padding: 12, marginBottom: 10 }}>
                                    <div className="form-group">
                                        <label>Key Result</label>
                                        <input
                                            type="text"
                                            value={kr.title}
                                            onChange={(e) => {
                                                const next = [...editOkrForm.keyResults];
                                                next[index].title = e.target.value;
                                                setEditOkrForm({ ...editOkrForm, keyResults: next });
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
                                                    const next = [...editOkrForm.keyResults];
                                                    next[index].tagName = e.target.value;
                                                    setEditOkrForm({ ...editOkrForm, keyResults: next });
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
                                                    const next = [...editOkrForm.keyResults];
                                                    next[index].tagColor = e.target.value;
                                                    setEditOkrForm({ ...editOkrForm, keyResults: next });
                                                }}
                                            />
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        className="btn-logout"
                                        style={{ padding: '4px 8px', fontSize: '0.8em', marginTop: 8 }}
                                        onClick={() => {
                                            const next = editOkrForm.keyResults.filter((_, i) => i !== index);
                                            setEditOkrForm({ ...editOkrForm, keyResults: next.length ? next : [{ title: '', tagName: '', tagColor: '#2563eb' }] });
                                        }}
                                    >
                                        Remove KR
                                    </button>
                                </div>
                            ))}
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => setEditOkrForm({ ...editOkrForm, keyResults: [...editOkrForm.keyResults, { title: '', tagName: '', tagColor: '#2563eb' }] })}
                            >
                                + Add Key Result
                            </button>

                            <div className="modal-actions">
                                <button type="button" onClick={() => setShowEditOkrModal(false)} className="btn-secondary">Cancel</button>
                                <button type="submit" className="btn-primary">Update OKR</button>
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

            {showSubmissionModal && (
                <div className="modal-overlay" onClick={() => setShowSubmissionModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h2>Submit Work</h2>
                        <form onSubmit={(e) => { e.preventDefault(); handleSubmitWork(); }}>
                            <div className="form-group">
                                <label>Description</label>
                                <textarea
                                    value={submissionDescription}
                                    onChange={(e) => setSubmissionDescription(e.target.value)}
                                    placeholder="Describe the work you're submitting..."
                                    rows={4}
                                    required
                                    autoFocus
                                />
                            </div>
                            <div className="modal-actions">
                                <button type="button" onClick={() => setShowSubmissionModal(false)} className="btn-secondary">Cancel</button>
                                <button type="submit" className="btn-primary">Submit Work</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showTagModal && (
                <div className="modal-overlay" onClick={() => setShowTagModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h2>{editingTag ? 'Edit Tag' : 'Create Tag'}</h2>
                        <form onSubmit={handleTagSubmit}>
                            <div className="form-group">
                                <label>Tag Name</label>
                                <input
                                    type="text"
                                    value={tagForm.name}
                                    onChange={(e) => setTagForm({ ...tagForm, name: e.target.value })}
                                    required
                                    autoFocus
                                    placeholder="e.g. Critical, Q1 Priority"
                                />
                            </div>
                            <div className="form-group">
                                <label>Color</label>
                                <input
                                    type="color"
                                    value={tagForm.color}
                                    onChange={(e) => setTagForm({ ...tagForm, color: e.target.value })}
                                />
                            </div>
                            <div className="modal-actions">
                                <button type="button" onClick={() => setShowTagModal(false)} className="btn-secondary">Cancel</button>
                                <button type="submit" className="btn-primary">{editingTag ? 'Update Tag' : 'Create Tag'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DashboardPage;
