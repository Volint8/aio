import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import BoardView from '../components/BoardView';
import TaskTrackerView from '../components/TaskTrackerView';
import TeamTrackerView from '../components/TeamTrackerView';
import OkrView from '../components/OkrView';
import SubscriptionPage from './SubscriptionPage';
import * as XLSX from 'xlsx';
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

interface QuoteRecord {
    id: string;
    text: string;
    author: string | null;
    createdAt: string;
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

type DashboardSection = 'board' | 'task-tracker' | 'team-tracker' | 'okr' | 'tracker' | 'team' | 'tags' | 'appraisals' | 'subscription' | 'settings' | 'support';
type TaskFilter = 'all' | 'my' | 'supporting' | 'pending' | 'ongoing' | 'completed' | 'overdue' | 'created' | 'in_progress' | 'recently_deleted';
type TrackerView = 'users' | 'teams';

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
    const location = useLocation();
    const requestedFilter = (new URLSearchParams(location.search).get('filter') || 'all') as TaskFilter;

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

    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<TaskFilter>(requestedFilter);
    const [assigneeFilterId, setAssigneeFilterId] = useState<string | null>(null);
    const [ownerFilter, setOwnerFilter] = useState<string>('all');
    const [supporterFilter, setSupporterFilter] = useState<string>('all');
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [menuOpenTaskId, setMenuOpenTaskId] = useState<string | null>(null);
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
    const [editingClient, setEditingClient] = useState<ClientRecord | null>(null);
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
        tagId: ''
    });

    const [newOkr, setNewOkr] = useState({
        title: '',
        description: '',
        periodStart: '',
        periodEnd: '',
        status: 'NOT_YET_OPEN',
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
    const [selectedOkrIds, setSelectedOkrIds] = useState<string[]>([]);
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
    const [clientFormName, setClientFormName] = useState('');
    const [clientFormVisibility, setClientFormVisibility] = useState('ORG_WIDE');
    const [taskClientFilter, setTaskClientFilter] = useState('all');

    // Bulk invite state
    const [showBulkInviteModal, setShowBulkInviteModal] = useState(false);
    const [bulkInviteFile, setBulkInviteFile] = useState<File | null>(null);
    const [bulkInvitePreview, setBulkInvitePreview] = useState<any[]>([]);
    const [bulkInviteErrors, setBulkInviteErrors] = useState<Array<{ row: number; email: string; error: string }>>([]);
    const [bulkInviteSubmitting, setBulkInviteSubmitting] = useState(false);
    const [bulkInviteResult, setBulkInviteResult] = useState<any>(null);

    // Settings state
    const [passwordForm, setPasswordForm] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [passwordChanging, setPasswordChanging] = useState(false);
    const [passwordError, setPasswordError] = useState('');
    const [passwordSuccess, setPasswordSuccess] = useState('');

    // Quote state
    const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
    const [quoteForm, setQuoteForm] = useState({ text: '', author: '' });
    const [quoteSubmitting, setQuoteSubmitting] = useState(false);

    const { user } = useAuth();
    const navigate = useNavigate();
    const requestedSection = (new URLSearchParams(location.search).get('section') || 'board') as DashboardSection;
    const requestedTrackerView = (new URLSearchParams(location.search).get('view') || 'users') as TrackerView;
    const isAdmin = organization?.userRole === 'ADMIN';
    const isTeamLead = organization?.userRole === 'TEAM_LEAD';
    const isMember = organization?.userRole === 'MEMBER';
    const canTrackTeam = organization?.userRole === 'ADMIN' || organization?.userRole === 'TEAM_LEAD';
    const canUseTrackerCharts = isAdmin || isTeamLead;
    const trackerView: TrackerView = requestedTrackerView === 'teams' ? 'teams' : 'users';

    const currentSection: DashboardSection = useMemo(() => {
        if (requestedSection === 'board') return 'board';
        if (requestedSection === 'task-tracker') return 'task-tracker';
        if (requestedSection === 'team-tracker' && canTrackTeam) return 'team-tracker';
        if (requestedSection === 'okr') return 'okr';
        if (requestedSection === 'tracker') return 'tracker';
        if (requestedSection === 'team' && canTrackTeam) return 'team';
        if (requestedSection === 'tags' && isAdmin) return 'tags';
        if (requestedSection === 'appraisals' && isAdmin) return 'appraisals';
        if (requestedSection === 'subscription' && isAdmin) return 'subscription';
        if (requestedSection === 'settings') return 'settings';
        if (requestedSection === 'support') return 'support';
        return 'board';
    }, [requestedSection, canTrackTeam, isAdmin, isTeamLead, isMember]);

    const tagSourceMap = useMemo(() => {
        const map: Record<string, { okrTitle: string; krTitle: string; periodEnd: string }> = {};
        const now = new Date();
        okrs.forEach(okr => {
            // Only include tags from OKRs that haven't expired
            const periodEnd = new Date(okr.periodEnd);
            const isExpired = periodEnd < now;
            
            if (!isExpired) {
                okr.keyResults?.forEach(kr => {
                    if (kr.tag) {
                        map[kr.tag.id] = { okrTitle: okr.title, krTitle: kr.title, periodEnd: okr.periodEnd };
                    }
                });
            }
        });
        return map;
    }, [okrs]);

    // Filter tags to only show active ones (from non-expired OKRs or tags not linked to any OKR)
    const availableTags = useMemo(() => {
        const now = new Date();
        return tags.filter(tag => {
            const okrInfo = tagSourceMap[tag.id];
            // If tag is not in map, check if it was from an expired OKR
            if (!okrInfo) {
                // Find if this tag belongs to any expired OKR
                const linkedOkr = okrs.find(okr => 
                    okr.keyResults?.some(kr => kr.tag?.id === tag.id)
                );
                if (linkedOkr) {
                    const periodEnd = new Date(linkedOkr.periodEnd);
                    return periodEnd >= now; // Only include if not expired
                }
                return true; // Tag not linked to any OKR, include it
            }
            return true; // Tag is in active OKR, include it
        });
    }, [tags, tagSourceMap, okrs]);

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

    useEffect(() => {
        if (selectedTaskId) {
            fetchSubmissions(selectedTaskId);
            fetchActivity(selectedTaskId);
        } else {
            setSubmissions([]);
            setActivityLogs([]);
        }
    }, [selectedTaskId]);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = () => {
            if (menuOpenTaskId) {
                setMenuOpenTaskId(null);
            }
        };

        document.addEventListener('click', handleClickOutside);
        return () => {
            document.removeEventListener('click', handleClickOutside);
        };
    }, [menuOpenTaskId]);

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
    }, [orgId, filter, taskClientFilter, assigneeFilterId]);

    const getInitials = (name: string) => {
        return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
    };

    const formatRole = (role: string) => {
        if (role === 'ADMIN') return 'Admin';
        if (role === 'TEAM_LEAD') return 'Team Lead';
        if (role === 'MEMBER') return 'Team Member';
        return role;
    };

    const handleStatClick = (filterValue: TaskFilter) => {
        const params = new URLSearchParams(location.search);
        params.set('section', 'task-tracker');
        params.set('filter', filterValue);
        navigate(`/dashboard?${params.toString()}`);
    };

    const handleFilterClick = (filterValue: TaskFilter) => {
        const params = new URLSearchParams(location.search);
        params.set('filter', filterValue);
        navigate(`/dashboard?${params.toString()}`);
    };

    const handleTeamClick = (teamId: string) => {
        const params = new URLSearchParams(location.search);
        params.set('section', 'team-tracker');
        params.set('teamId', teamId);
        navigate(`/dashboard?${params.toString()}`);
    };

    const fetchQuotes = async () => {
        if (!orgId) return;
        try {
            const res = await api.get(`/orgs/${orgId}/quotes`);
            setQuotes(res.data);
        } catch (error) {
            console.error('Failed to fetch quotes:', error);
        }
    };

    const handleAddQuote = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!orgId || !quoteForm.text.trim()) return;
        try {
            setQuoteSubmitting(true);
            await api.post(`/orgs/${orgId}/quotes`, quoteForm);
            setQuoteForm({ text: '', author: '' });
            await fetchQuotes();
        } catch (error: any) {
            alert(error.response?.data?.error || 'Failed to add quote');
        } finally {
            setQuoteSubmitting(false);
        }
    };

    const handleDeleteQuote = async (quoteId: string) => {
        if (!orgId || !window.confirm('Delete this quote?')) return;
        try {
            await api.delete(`/orgs/${orgId}/quotes/${quoteId}`);
            await fetchQuotes();
        } catch (error: any) {
            alert(error.response?.data?.error || 'Failed to delete quote');
        }
    };

    const fetchData = async () => {
        try {
            const isDeletedView = filter === 'recently_deleted';
            const [tasksRes, statsRes, orgRes, tagsRes, okrRes, appraisalRes, quotesRes] = await Promise.all([
                api.get('/tasks', {
                    params: {
                        organizationId: orgId,
                        view: isDeletedView ? 'deleted' : 'active',
                        ...(taskClientFilter !== 'all' ? { clientId: taskClientFilter } : {})
                    }
                }),
                api.get('/tasks/stats', {
                    params: {
                        organizationId: orgId,
                        ...(taskClientFilter !== 'all' ? { clientId: taskClientFilter } : {})
                    }
                }),
                api.get(`/orgs/${orgId}`),
                api.get(`/orgs/${orgId}/tags`),
                api.get(`/orgs/${orgId}/okrs`),
                api.get(`/orgs/${orgId}/appraisals`),
                api.get(`/orgs/${orgId}/quotes`)
            ]);

            setQuotes(quotesRes.data || []);

            const [clientsRes] = await Promise.all([
                api.get(`/orgs/${orgId}/clients`)
            ]);

            const role = orgRes.data.userRole;
            const orgMembers = orgRes.data.members || [];
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
                // Filter out ADMIN users from member stats
                const filteredMemberStats = (memberStatsRes.data || []).filter((m: any) => {
                    const member = orgMembers.find((orgMember: any) => orgMember.userId === m.userId);
                    return member?.role !== 'ADMIN';
                });
                setMemberStats(filteredMemberStats);
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
                // Filter out ADMIN users from member stats
                const filteredMemberStats = (memberStatsRes.data || []).filter((m: any) => {
                    const member = orgMembers.find((orgMember: any) => orgMember.userId === m.userId);
                    return member?.role !== 'ADMIN';
                });
                setMemberStats(filteredMemberStats);
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
            } else if (filter === 'supporting') {
                filteredTasks = filteredTasks.filter((t: Task) => t.supporter?.id === user?.id);
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

            if (tagsRes.data?.[0]?.id) {
                setNewTask((prev) => ({ ...prev, tagId: prev.tagId || tagsRes.data[0].id }));
                setEditTask((prev) => ({ ...prev, tagId: prev.tagId || tagsRes.data[0].id }));
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
                status: 'NOT_YET_OPEN',
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

    // @ts-ignore - Function kept for potential future use
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
            await api.post(`/orgs/${orgId}/appraisals/generate`, {
                ...newAppraisal,
                okrIds: selectedOkrIds.length > 0 ? selectedOkrIds : undefined
            });
            setNewAppraisal({ subjectUserId: '', cycle: '', summary: '' });
            setSelectedOkrIds([]);
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
        if (!teamForm.name.trim()) {
            alert('Team name is required');
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

    const handleDeleteInvite = async (inviteId: string) => {
        if (!orgId) return;
        if (!window.confirm('Delete this invite? This action cannot be undone.')) return;

        try {
            await api.delete(`/orgs/${orgId}/invites/${inviteId}`);
            const invitesRes = await api.get(`/orgs/${orgId}/invites`);
            setInvites(invitesRes.data || []);
        } catch (error: any) {
            const errorData = error.response?.data?.error;
            const message = typeof errorData === 'object' ? errorData.message : errorData;
            alert(message || 'Failed to delete invite');
        }
    };

    // Bulk invite handlers
    const handleDownloadSampleSheet = () => {
        const data = [
            { Email: 'john.doe@company.com', Name: 'John Doe', Team: 'Growth', Category: 'Sales', Role: 'TEAM_LEAD' },
            { Email: 'jane.smith@company.com', Name: 'Jane Smith', Team: 'Operations', Category: 'Support', Role: 'MEMBER' },
            { Email: 'bob.wilson@company.com', Name: 'Bob Wilson', Team: 'Growth', Category: 'Marketing', Role: 'MEMBER' }
        ];

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        
        // Set column widths
        ws['!cols'] = [
            { wch: 30 }, // Email
            { wch: 20 }, // Name
            { wch: 15 }, // Team
            { wch: 15 }, // Category
            { wch: 12 }  // Role
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'Invite Template');
        
        // Add instructions sheet
        const instructions = [
            ['BULK INVITE INSTRUCTIONS'],
            [''],
            ['Required Columns:'],
            ['- Email: Work email address (required)'],
            ['- Role: TEAM_LEAD or MEMBER (required)'],
            [''],
            ['Optional Columns:'],
            ['- Name: Full name of the invitee'],
            ['- Team: Must match an existing team name'],
            ['- Category: Department or function (e.g., Sales, Marketing)'],
            [''],
            ['Notes:'],
            ['- Maximum file size: 5MB'],
            ['- Supported formats: .xlsx, .xls, .csv'],
            ['- Invites expire after 72 hours']
        ];
        const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
        wsInstructions['!cols'] = [{ wch: 50 }];
        XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions');
        
        XLSX.writeFile(wb, 'bulk-invite-template.xlsx');
    };

    const handleBulkInviteFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        const validTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'text/csv'
        ];
        if (!validTypes.includes(file.type) && !file.name.endsWith('.csv')) {
            alert('Invalid file type. Please upload an Excel or CSV file.');
            return;
        }

        // Validate file size (5MB)
        if (file.size > 5 * 1024 * 1024) {
            alert('File size must be less than 5MB');
            return;
        }

        setBulkInviteFile(file);
        setBulkInviteErrors([]);
        setBulkInviteResult(null);

        try {
            // Read and parse file
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet);

            if (jsonData.length === 0) {
                setBulkInviteErrors([{ row: 1, email: '', error: 'Spreadsheet is empty' }]);
                return;
            }

            // Validate columns
            const requiredColumns = ['Email', 'Role'];
            const firstRow = jsonData[0];
            const missingColumns = requiredColumns.filter(col => !(col in firstRow));
            
            if (missingColumns.length > 0) {
                setBulkInviteErrors([{ 
                    row: 1, 
                    email: '', 
                    error: `Missing columns: ${missingColumns.join(', ')}` 
                }]);
                return;
            }

            // Show preview (first 10 rows)
            setBulkInvitePreview(jsonData.slice(0, 10));

        } catch (error: any) {
            setBulkInviteErrors([{ row: 1, email: '', error: error.message || 'Failed to parse file' }]);
        }
    };

    const handleBulkInviteSubmit = async () => {
        if (!bulkInviteFile || !orgId) return;

        try {
            setBulkInviteSubmitting(true);
            setBulkInviteErrors([]);

            const formData = new FormData();
            formData.append('file', bulkInviteFile);

            const response = await api.post(`/orgs/${orgId}/invites/bulk`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });

            setBulkInviteResult(response.data);
            
            // Refresh invites list
            const invitesRes = await api.get(`/orgs/${orgId}/invites`);
            setInvites(invitesRes.data || []);

        } catch (error: any) {
            const errorData = error.response?.data?.error;
            const message = typeof errorData === 'object' ? errorData.message : errorData;
            setBulkInviteErrors([{ row: 0, email: '', error: message || 'Failed to process bulk invite' }]);
        } finally {
            setBulkInviteSubmitting(false);
        }
    };

    const handleOpenBulkInviteModal = () => {
        setShowBulkInviteModal(true);
        setBulkInviteFile(null);
        setBulkInvitePreview([]);
        setBulkInviteErrors([]);
        setBulkInviteResult(null);
    };

    const handleCloseBulkInviteModal = () => {
        setShowBulkInviteModal(false);
        setBulkInviteFile(null);
        setBulkInvitePreview([]);
        setBulkInviteErrors([]);
        setBulkInviteResult(null);
    };

    const getSidebarIcon = (iconName: string) => {
        const common = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
        switch (iconName) {
            case 'settings':
                return (
                    <svg {...common}>
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                    </svg>
                );
            case 'support':
                return (
                    <svg {...common}>
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                );
            default:
                return (
                    <svg {...common}>
                        <circle cx="12" cy="12" r="8"></circle>
                    </svg>
                );
        }
    };

    const handleRemoveMember = async (memberId: string) => {
        if (!orgId) return;
        if (!window.confirm('Remove this member from the organization?')) return;

        try {
            await api.delete(`/orgs/${orgId}/members/${memberId}`);
            await fetchData();
        } catch (error: any) {
            const errorData = error.response?.data?.error;
            const message = typeof errorData === 'object' ? errorData.message : errorData;
            alert(message || 'Failed to remove member');
        }
    };

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        setPasswordError('');
        setPasswordSuccess('');

        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            setPasswordError('New passwords do not match');
            return;
        }

        if (passwordForm.newPassword.length < 6) {
            setPasswordError('Password must be at least 6 characters');
            return;
        }

        try {
            setPasswordChanging(true);
            await api.post('/auth/change-password', {
                currentPassword: passwordForm.currentPassword,
                newPassword: passwordForm.newPassword
            });
            setPasswordSuccess('Password changed successfully');
            setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
        } catch (error: any) {
            setPasswordError(error.response?.data?.error || 'Failed to change password');
        } finally {
            setPasswordChanging(false);
        }
    };

    const renderSettingsSection = () => {
        return (
            <div className="settings-view">
                <div className="settings-header">
                    <h2>Account Settings</h2>
                    <p className="section-subtitle">Manage your account security and organization preferences</p>
                </div>

                <div className="settings-grid">
                    <div className="settings-card">
                        <div className="card-header">
                            <div className="card-icon">{getSidebarIcon('settings')}</div>
                            <h3>Security</h3>
                        </div>
                        <p className="card-description">Change your password to keep your account secure</p>
                        
                        <form onSubmit={handlePasswordChange} className="settings-form">
                            {passwordError && <div className="alert alert-error">{passwordError}</div>}
                            {passwordSuccess && <div className="alert alert-success">{passwordSuccess}</div>}
                            
                            <div className="form-group">
                                <label>Current Password</label>
                                <input 
                                    type="password" 
                                    value={passwordForm.currentPassword}
                                    onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                                    placeholder="••••••••"
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>New Password</label>
                                <input 
                                    type="password" 
                                    value={passwordForm.newPassword}
                                    onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                                    placeholder="••••••••"
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Confirm New Password</label>
                                <input 
                                    type="password" 
                                    value={passwordForm.confirmPassword}
                                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                                    placeholder="••••••••"
                                    required
                                />
                            </div>
                            <button type="submit" className="btn-primary" disabled={passwordChanging}>
                                {passwordChanging ? 'Updating...' : 'Update Password'}
                            </button>
                        </form>
                    </div>

                    {isAdmin && (
                        <>
                        <div className="settings-card">
                            <div className="card-header">
                                <div className="card-icon">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="2" y="5" width="20" height="14" rx="2" />
                                        <line x1="2" y1="10" x2="22" y2="10" />
                                    </svg>
                                </div>
                                <h3>Subscription</h3>
                            </div>
                            <p className="card-description">Manage your organization's plan and billing status</p>
                            
                            <div className="subscription-status">
                                <div className="plan-badge">Standard Plan</div>
                                <div className="plan-detail">
                                    <span>Status:</span>
                                    <span className="status-active">Active</span>
                                </div>
                                <div className="plan-detail">
                                    <span>Organization:</span>
                                    <span>{organization?.name}</span>
                                </div>
                                <div className="plan-usage">
                                    <div className="usage-header">
                                        <span>Team Members</span>
                                        <span>{(organization?.members?.length || 0)} / 50</span>
                                    </div>
                                    <div className="usage-bar">
                                        <div className="usage-fill" style={{ width: `${Math.min(((organization?.members?.length || 0) / 50) * 100, 100)}%` }}></div>
                                    </div>
                                </div>
                            </div>
                            <button className="btn-secondary" style={{ width: '100%', marginTop: 'auto' }}>
                                Manage Billing
                            </button>
                        </div>

                        <div className="settings-card quotes-management">
                            <div className="card-header">
                                <div className="card-icon">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M17 6.1L12.7 10.4M12.7 10.4L8.4 6.1" />
                                        <circle cx="12" cy="12" r="10" />
                                        <path d="M11 16h2" />
                                    </svg>
                                </div>
                                <h3>Quotes Management</h3>
                            </div>
                            <p className="card-description">Add motivational quotes or announcements for your organization</p>
                            
                            <form onSubmit={handleAddQuote} className="settings-form">
                                <div className="form-group">
                                    <label>Quote Text</label>
                                    <textarea 
                                        value={quoteForm.text}
                                        onChange={(e) => setQuoteForm({ ...quoteForm, text: e.target.value })}
                                        placeholder="Enter quote or announcement..."
                                        rows={2}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Author (Optional)</label>
                                    <input 
                                        type="text" 
                                        value={quoteForm.author}
                                        onChange={(e) => setQuoteForm({ ...quoteForm, author: e.target.value })}
                                        placeholder="e.g. CEO or Anonymous"
                                    />
                                </div>
                                <button type="submit" className="btn-primary" disabled={quoteSubmitting}>
                                    {quoteSubmitting ? 'Adding...' : 'Add Quote'}
                                </button>
                            </form>

                            {quotes.length > 0 && (
                                <div className="quotes-list">
                                    <h4>Active Quotes ({quotes.length})</h4>
                                    <div className="quotes-container">
                                        {quotes.map((q) => (
                                            <div key={q.id} className="quote-item">
                                                <div className="quote-item-content">
                                                    <p>"{q.text}"</p>
                                                    {q.author && <small>— {q.author}</small>}
                                                </div>
                                                <button 
                                                    className="delete-quote-btn"
                                                    onClick={() => handleDeleteQuote(q.id)}
                                                    title="Delete Quote"
                                                >
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                    </svg>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        </>
                    )}
                </div>
            </div>
        );
    };

    const renderSupportSection = () => {
        return (
            <div className="support-view">
                <div className="support-card">
                    <div className="support-icon">{getSidebarIcon('support')}</div>
                    <h2>How can we help?</h2>
                    <p>Have questions or need assistance? Our support team is here to help you get the most out of Apraizal.</p>
                    
                    <div className="contact-methods">
                        <div className="contact-method">
                            <strong>Email Support</strong>
                            <p>Contact us anytime at:</p>
                            <a href="mailto:Hello@apraizal.com" className="support-email">Hello@apraizal.com</a>
                        </div>
                    </div>

                    <a href="mailto:Hello@apraizal.com" className="btn-primary" style={{ textDecoration: 'none', display: 'inline-block' }}>
                        Email Support Now
                    </a>
                </div>
            </div>
        );
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
                        onNavigate={(path) => navigate(path)}
                        organizationName={organization?.name}
                        organizationMembers={(organization?.members || []).map(m => ({ userId: m.userId, role: m.role }))}
                        quotes={quotes}
                    />
                )}

                {currentSection === 'task-tracker' && (
                    <TaskTrackerView
                        tasks={isTeamLead ? tasks.filter(t => t.assignee?.id === user?.id) : tasks}
                        filter={filter}
                        onFilterChange={(f) => setFilter(f === 'all' ? 'all' : f === 'pending' ? 'created' : f === 'ongoing' ? 'in_progress' : f === 'completed' ? 'completed' : f === 'overdue' ? 'overdue' : f === 'supporting' ? 'supporting' : 'my')}
                        onTaskClick={(task) => setSelectedTaskId(task.id)}
                        onCreateTask={() => setShowCreateTaskModal(true)}
                        onSendAlert={() => setShowSendAlertModal(true)}
                        assignableUsers={assignableUsers.map(m => ({ userId: m.userId, name: m.user.name, email: m.user.email }))}
                        tags={tags}
                        hideOwnerFilter={isTeamLead}
                        userRole={organization?.userRole as 'ADMIN' | 'TEAM_LEAD' | 'MEMBER'}
                    />
                )}

                {currentSection === 'team-tracker' && canTrackTeam && (
                    <TeamTrackerView
                        tasks={isTeamLead ? tasks.filter(t => t.assignee?.id !== user?.id) : tasks}
                        members={(organization?.members || [])
                            .filter(m => m.userId !== user?.id)
                            .map(m => ({
                                userId: m.userId,
                                name: m.user.name || m.user.email
                            }))}
                        selectedMemberId={assigneeFilterId}
                        onMemberSelect={(id) => setAssigneeFilterId(id)}
                        filter={filter}
                        onFilterChange={(f) => setFilter(f === 'all' ? 'all' : f === 'pending' ? 'created' : f === 'ongoing' ? 'in_progress' : f === 'completed' ? 'completed' : f === 'overdue' ? 'overdue' : f === 'supporting' ? 'supporting' : 'my')}
                        onTaskClick={(task) => setSelectedTaskId(task.id)}
                        onCreateTask={() => setShowCreateTaskModal(true)}
                        onSendAlert={() => setShowSendAlertModal(true)}
                        tags={tags}
                        userRole={organization?.userRole as 'ADMIN' | 'TEAM_LEAD' | 'MEMBER'}
                    />
                )}

                {currentSection === 'okr' && organization && (
                    <OkrView
                        okrs={okrs}
                        userRole={organization.userRole as 'ADMIN' | 'TEAM_LEAD' | 'MEMBER'}
                        onCreateTask={() => setShowCreateTaskModal(true)}
                        onCreateOkr={() => setShowCreateOkrModal(true)}
                        onEditOkr={handleOpenEditOkr}
                        onDeleteOkr={handleDeleteOkr}
                        onNavigate={(path) => navigate(path)}
                    />
                )}

                {currentSection === 'settings' && renderSettingsSection()}
                {currentSection === 'subscription' && isAdmin && organization && (
                    <SubscriptionPage organizationId={organization.id} />
                )}
                {currentSection === 'support' && renderSupportSection()}

                <div className="dashboard-header">
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
                    {currentSection === 'team' && isAdmin && (
                        <div className="header-actions">
                            <button onClick={() => setShowCreateTeamModal(true)} className="btn-primary">+ Create Team</button>
                        </div>
                    )}
                </div>

                {currentSection === 'team' && canTrackTeam && (
                    <div className="team-management-view">
                        {isAdmin && (
                            <>
                                <div className="team-invite-panel">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                        <h3 style={{ margin: 0 }}>Invite Team Members</h3>
                                        <button 
                                            type="button" 
                                            className="btn-secondary" 
                                            onClick={handleOpenBulkInviteModal}
                                            style={{ padding: '8px 16px', fontSize: '0.9em' }}
                                        >
                                            📊 Bulk Invite
                                        </button>
                                    </div>
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
                                            <h4>Pending Invites</h4>
                                            {invites.filter(invite => invite.status !== 'ACCEPTED').map((invite) => (
                                                <div key={invite.id} className="team-invite-row">
                                                    <div className="team-member-info">
                                                        <div>
                                                            <strong>{invite.name && invite.name.trim() ? invite.name : invite.email}</strong>
                                                        </div>
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
                                                    {invite.status !== 'ACCEPTED' && (
                                                        <button
                                                            type="button"
                                                            className="btn-delete-small"
                                                            onClick={() => handleDeleteInvite(invite.id)}
                                                        >
                                                            Delete
                                                        </button>
                                                    )}
                                                    <span className="role-badge low">{formatRole(invite.role)}</span>
                                                    <span className={`role-badge ${invite.status?.toLowerCase() || ''}`}>{invite.status}</span>
                                                </div>
                                            </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="teams-list-section">
                                    <h3>Teams</h3>
                                    {teams.length === 0 ? (
                                        <p className="empty-state">No teams yet. Create your first team to get started.</p>
                                    ) : (
                                        <div className="teams-grid">
                                            {teams.map((team) => (
                                                <div
                                                    key={team.id}
                                                    className="team-card"
                                                >
                                                    <div
                                                        onClick={() => handleTeamClick(team.id)}
                                                        style={{ cursor: 'pointer', flex: 1 }}
                                                    >
                                                        <h4>{team.name}</h4>
                                                        <p className="team-lead">Lead: {team.leadUser.name || team.leadUser.email}</p>
                                                        <p className="team-members-count">{(team.people || []).filter((p) => p.role !== 'ADMIN').length || 0} members</p>
                                                    </div>
                                                    <div className="team-card-actions" style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                                                        <button
                                                            className="btn-secondary"
                                                            style={{ padding: '4px 10px', fontSize: '0.8em' }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                openEditTeam(team);
                                                            }}
                                                        >
                                                            Edit
                                                        </button>
                                                        <button
                                                            className="btn-logout"
                                                            style={{ padding: '4px 10px', fontSize: '0.8em' }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDeleteTeam(team.id);
                                                            }}
                                                        >
                                                            Delete
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        <div className="team-members-section">
                            <h3>{isAdmin ? 'All Members' : 'Team Members'}</h3>

                            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                                <select
                                    value={ownerFilter}
                                    onChange={(e) => setOwnerFilter(e.target.value)}
                                    style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: '#fff', fontSize: '0.9em', minWidth: '160px' }}
                                >
                                    <option value="all">All Owners</option>
                                    {(organization?.members || []).filter((member) => member.role !== 'ADMIN' && member.userId !== user?.id).map((member) => (
                                        <option key={member.userId} value={member.userId}>{member.user.name || member.user.email}</option>
                                    ))}
                                </select>

                                <select
                                    value={supporterFilter}
                                    onChange={(e) => setSupporterFilter(e.target.value)}
                                    style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: '#fff', fontSize: '0.9em', minWidth: '160px' }}
                                >
                                    <option value="all">All Supporters</option>
                                    {(organization?.members || []).filter((member) => member.role !== 'ADMIN' && member.userId !== user?.id).map((member) => (
                                        <option key={member.userId} value={member.userId}>{member.user.name || member.user.email}</option>
                                    ))}
                                </select>

                                {(ownerFilter !== 'all' || supporterFilter !== 'all') && (
                                    <button
                                        onClick={() => {
                                            setOwnerFilter('all');
                                            setSupporterFilter('all');
                                        }}
                                        className="btn-secondary"
                                        style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', background: '#fff', fontSize: '0.9em', cursor: 'pointer' }}
                                    >
                                        Clear Filters
                                    </button>
                                )}
                            </div>

                            <div className="members-table-container" style={{ overflowX: 'auto' }}>
                                <table className="members-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
                                    <thead>
                                        <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border-color)' }}>
                                            <th style={{ padding: '12px 16px', fontWeight: 600 }}>Name</th>
                                            <th style={{ padding: '12px 16px', fontWeight: 600 }}>Email</th>
                                            <th style={{ padding: '12px 16px', fontWeight: 600 }}>Team</th>
                                            <th style={{ padding: '12px 16px', fontWeight: 600 }}>Role</th>
                                            <th style={{ padding: '12px 16px', fontWeight: 600 }}>Category</th>
                                            <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'center' }}>Remove</th>
                                            <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'center' }}>View</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(organization?.members || [])
                                            .filter((member) => {
                                                // Exclude ADMIN and current user
                                                if (member.role === 'ADMIN' || member.userId === user?.id) return false;

                                                // Apply owner filter - show members who are assignees on tasks
                                                if (ownerFilter !== 'all' && member.userId !== ownerFilter) return false;

                                                // Apply supporter filter - show members who are supporters on tasks
                                                if (supporterFilter !== 'all' && member.userId !== supporterFilter) return false;

                                                return true;
                                            })
                                            .map((member) => {
                                                // Find member stats
                                                const stats = memberStats.find(m => m.userId === member.userId);
                                                
                                                // Find member's team
                                                const memberTeam = teams.find(t => t.members?.some(m => m.userId === member.userId));
                                                
                                                // Determine category based on task stats
                                                let category = 'Regular';
                                                if (stats) {
                                                    if (stats.stats.total > 20) category = 'High Performer';
                                                    else if (stats.stats.total > 10) category = 'Active';
                                                    else if (stats.stats.total > 5) category = 'Moderate';
                                                    else category = 'New';
                                                }

                                                return (
                                                    <tr key={member.id} className="member-table-row" style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = 'var(--hover-bg)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                                                        <td style={{ padding: '12px 16px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                                <div className="member-avatar" style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--primary-color)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85em', fontWeight: 600 }}>
                                                                    {getInitials(member.user.name || member.user.email)}
                                                                </div>
                                                                <strong>{member.user.name || member.user.email}</strong>
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{member.user.email}</td>
                                                        <td style={{ padding: '12px 16px' }}>{memberTeam ? memberTeam.name : 'No team'}</td>
                                                        <td style={{ padding: '12px 16px' }}>
                                                            <span className={`role-badge ${member.role.toLowerCase()}`}>{formatRole(member.role)}</span>
                                                        </td>
                                                        <td style={{ padding: '12px 16px' }}>
                                                            <span className="category-badge" style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '0.8em', background: category === 'High Performer' ? '#DCFCE7' : category === 'Active' ? '#E0F2FE' : category === 'Moderate' ? '#FEF3C7' : '#F1F5F9', color: category === 'High Performer' ? '#166534' : category === 'Active' ? '#0369A1' : category === 'Moderate' ? '#92400E' : '#475569' }}>
                                                                {category}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                            <button
                                                                className="btn-delete-small"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleRemoveMember(member.id);
                                                                }}
                                                                style={{ padding: '6px 12px', fontSize: '0.8em' }}
                                                            >
                                                                Remove
                                                            </button>
                                                        </td>
                                                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                            <button
                                                                className="btn-action"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setAssigneeFilterId(member.userId);
                                                                    const params = new URLSearchParams(location.search);
                                                                    params.set('section', 'team-tracker');
                                                                    navigate(`/dashboard?${params.toString()}`);
                                                                }}
                                                                style={{ padding: '6px 12px', fontSize: '0.8em' }}
                                                            >
                                                                View Details
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
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
                            {tags.map((tag: any) => {
                                const okrInfo = tagSourceMap[tag.id];
                                const hasOkr = !!okrInfo;
                                return (
                                    <div key={tag.id} className="task-card" style={{ padding: '16px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div 
                                                style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: hasOkr ? 'pointer' : 'default' }}
                                                onClick={() => {
                                                    if (hasOkr) {
                                                        navigate('/dashboard?section=okr');
                                                    }
                                                }}
                                                title={hasOkr ? `Click to view OKR: ${okrInfo.okrTitle}` : ''}
                                            >
                                                <span style={{ width: 14, height: 14, borderRadius: 999, background: tag.color, display: 'inline-block', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}></span>
                                                <div>
                                                    <strong style={{ fontSize: '1.1em', color: hasOkr ? 'var(--primary-color)' : 'inherit' }}>
                                                        {tag.name}
                                                    </strong>
                                                    <div style={{ fontSize: '0.85em', color: 'var(--text-muted)', marginTop: 2 }}>
                                                        Used in {tag.taskCount || 0} tasks
                                                        {hasOkr && (
                                                            <span style={{ marginLeft: '8px', color: 'var(--primary-color)' }}>
                                                                → {okrInfo.okrTitle}
                                                            </span>
                                                        )}
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
                                );
                            })}
                        </div>
                    </div>
                )}

                {currentSection === 'appraisals' && isAdmin && (
                    <div className="tasks-section">
                        <div className="tasks-header">
                            <h2>Appraisals</h2>
                            <button className="btn-primary" onClick={() => setShowCreateAppraisalModal(true)}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                </svg>
                                Generate Appraisal
                            </button>
                        </div>
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
                                    <div className="stat-card performance-highlight" title="View your performance metrics">
                                        <h3>My Performance</h3>
                                        <p className="stat-value">{memberStats.find(m => m.userId === user?.id)?.stats.temperature || '🔴 Low Activity'}</p>
                                        <small>Score: {memberStats.find(m => m.userId === user?.id)?.stats.performanceScore || 0}%</small>
                                    </div>
                                )}
                                <div className="stat-card" onClick={() => handleStatClick('all')} title="View all tasks"><h3>Total Workload</h3><p className="stat-value">{stats.total}</p></div>
                                <div className="stat-card" onClick={() => handleStatClick('in_progress')} title="View ongoing tasks"><h3>Ongoing Tasks</h3><p className="stat-value">{stats.ongoing}</p></div>
                                <div className="stat-card" onClick={() => handleStatClick('completed')} title="View completed tasks"><h3>Completed Work</h3><p className="stat-value">{stats.completed}</p></div>
                                <div className="stat-card" onClick={() => handleStatClick('overdue')} title="View overdue tasks"><h3>Overdue</h3><p className="stat-value" style={{ color: '#ef4444' }}>{stats.overdue}</p></div>
                                {!isAdmin && (
                                    <div className="stat-card" onClick={() => handleStatClick('my')} title="View your assigned tasks"><h3>Your Focus</h3><p className="stat-value">{stats.myTasks}</p></div>
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
                                    {!isAdmin && (
                                        <>
                                            <button type="button" className={`btn-filter ${filter === 'supporting' ? 'active' : ''}`} onClick={() => handleFilterClick('supporting')}>Supporting</button>
                                        </>
                                    )}
                                    <button type="button" className={`btn-filter ${filter === 'created' ? 'active' : ''}`} onClick={() => handleFilterClick('created')}>Pending</button>
                                    <button type="button" className={`btn-filter ${filter === 'in_progress' ? 'active' : ''}`} onClick={() => handleFilterClick('in_progress')}>Ongoing</button>
                                    <button type="button" className={`btn-filter ${filter === 'completed' ? 'active' : ''}`} onClick={() => handleFilterClick('completed')}>Completed</button>
                                    <button type="button" className={`btn-filter overdue ${filter === 'overdue' ? 'active' : ''}`} onClick={() => handleFilterClick('overdue')}>Overdue</button>
                                    {isAdmin && (
                                        <button type="button" className={`btn-filter ${filter === 'recently_deleted' ? 'active' : ''}`} onClick={() => handleFilterClick('recently_deleted')}>Recently Deleted</button>
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
                                </div>
                            </div>

                            <div className="tasks-workspace">
                                <div className="tasks-list">
                                    {tasks.map((task) => (
                                        <div key={task.id} className="task-card-wrapper" style={{ position: 'relative' }}>
                                            <button key={task.id} type="button" className={`task-card task-card-compact ${selectedTaskId === task.id ? 'active' : ''} ${isOverdue(task) ? 'overdue' : ''}`} onClick={() => setSelectedTaskId(task.id)}>
                                                <div className="task-header">
                                                    <h3>{task.title}</h3>
                                                    <div className="task-badges">
                                                        <span className={`priority-badge ${task.priority?.toLowerCase() || ''}`}>{task.priority}</span>
                                                        <span className={`status-badge ${task.status?.toLowerCase() || ''}`}>{task.status.replace('_', ' ')}</span>
                                                        {isOverdue(task) && (
                                                            <span className="status-badge overdue" title={`Due: ${new Date(task.dueDate!).toLocaleDateString()} (${getDaysOverdue(task)} days overdue)`}>
                                                                Overdue
                                                            </span>
                                                        )}
                                                        {task.tag && (
                                                            <span
                                                                className="priority-badge low"
                                                                style={{ borderColor: task.tag.color, color: task.tag.color, cursor: tagSourceMap[task.tag.id] ? 'pointer' : 'default' }}
                                                                title={tagSourceMap[task.tag.id] ? `Objective: ${tagSourceMap[task.tag.id].okrTitle} | KR: ${tagSourceMap[task.tag.id].krTitle}` : ''}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (task.tag && tagSourceMap[task.tag.id]) {
                                                                        navigate('/dashboard?section=okr');
                                                                    }
                                                                }}
                                                            >
                                                                {task.tag.name}{task.tag && tagSourceMap[task.tag.id] && ' →'}
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
                                                        <div className="meta-item"><strong>Teams:</strong> {(task.taskTeams || []).map((tt) => tt.team.name).join(', ') || 'None'}</div>
                                                        <div className="meta-item"><strong>Comments:</strong> {task.comments?.length || 0}</div>
                                                    </>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                className="task-menu-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setMenuOpenTaskId(menuOpenTaskId === task.id ? null : task.id);
                                                }}
                                                style={{
                                                    position: 'absolute',
                                                    top: '12px',
                                                    right: '12px',
                                                    background: 'transparent',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    padding: '4px',
                                                    borderRadius: '4px',
                                                    color: 'var(--text-muted)',
                                                    fontSize: '20px',
                                                    lineHeight: '1'
                                                }}
                                            >
                                                ⋮
                                            </button>
                                        </button>
                                        
                                        {menuOpenTaskId === task.id && (
                                            <div
                                                className="task-menu-dropdown"
                                                onClick={(e) => e.stopPropagation()}
                                                style={{
                                                    position: 'absolute',
                                                    top: '40px',
                                                    right: '12px',
                                                    background: 'white',
                                                    border: '1px solid var(--border-color)',
                                                    borderRadius: '8px',
                                                    boxShadow: 'var(--shadow-lg)',
                                                    zIndex: 100,
                                                    minWidth: '160px'
                                                }}
                                            >
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleOpenEditTask(task);
                                                        setMenuOpenTaskId(null);
                                                    }}
                                                    style={{
                                                        display: 'block',
                                                        width: '100%',
                                                        padding: '10px 16px',
                                                        background: 'none',
                                                        border: 'none',
                                                        textAlign: 'left',
                                                        cursor: 'pointer',
                                                        fontSize: '0.9em',
                                                        color: 'var(--text-main)',
                                                        borderRadius: '8px 8px 0 0'
                                                    }}
                                                >
                                                    Edit
                                                </button>
                                                {task.status !== 'COMPLETED' && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleUpdateTaskStatus(task.id, 'COMPLETED');
                                                            setMenuOpenTaskId(null);
                                                        }}
                                                        style={{
                                                            display: 'block',
                                                            width: '100%',
                                                            padding: '10px 16px',
                                                            background: 'none',
                                                            border: 'none',
                                                            textAlign: 'left',
                                                            cursor: 'pointer',
                                                            fontSize: '0.9em',
                                                            color: 'var(--text-main)',
                                                            borderTop: '1px solid var(--border-color)'
                                                        }}
                                                    >
                                                        Mark as Complete
                                                    </button>
                                                )}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDeleteTask(task.id);
                                                        setMenuOpenTaskId(null);
                                                    }}
                                                    style={{
                                                        display: 'block',
                                                        width: '100%',
                                                        padding: '10px 16px',
                                                        background: 'none',
                                                        border: 'none',
                                                        textAlign: 'left',
                                                        cursor: 'pointer',
                                                        fontSize: '0.9em',
                                                        color: '#DC2626',
                                                        borderTop: '1px solid var(--border-color)',
                                                        borderRadius: '0 0 8px 8px'
                                                    }}
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                                </div>

                                <div 
                                    className={`task-detail-backdrop ${selectedTaskId ? 'active' : ''}`} 
                                    onClick={() => setSelectedTaskId(null)}
                                />
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
                                                        <span className={`priority-badge ${selectedTask.priority?.toLowerCase() || ''}`}>{selectedTask.priority}</span>
                                                        <span className={`status-badge ${selectedTask.status?.toLowerCase() || ''}`}>{selectedTask.status.replace('_', ' ')}</span>
                                                        {selectedTask.tag && (
                                                            <span
                                                                className="priority-badge low"
                                                                style={{ borderColor: selectedTask.tag.color, color: selectedTask.tag.color, cursor: tagSourceMap[selectedTask.tag.id] ? 'pointer' : 'default' }}
                                                                title={tagSourceMap[selectedTask.tag.id] ? `Objective: ${tagSourceMap[selectedTask.tag.id].okrTitle} | KR: ${tagSourceMap[selectedTask.tag.id].krTitle}` : ''}
                                                                onClick={() => {
                                                                    if (selectedTask.tag && tagSourceMap[selectedTask.tag.id]) {
                                                                        navigate('/dashboard?section=okr');
                                                                    }
                                                                }}
                                                            >
                                                                {selectedTask.tag.name}{selectedTask.tag && tagSourceMap[selectedTask.tag.id] && ' →'}
                                                            </span>
                                                        )}
                                                    </div>
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
                                                                    <span className={`submission-status status-${sub.status?.toLowerCase() || ''}`}>
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
                                    {availableTags.map((tag) => {
                                        const okrInfo = tagSourceMap[tag.id];
                                        const displayText = okrInfo 
                                            ? `${tag.name} - ${okrInfo.krTitle}`
                                            : tag.name;
                                        return (
                                            <option 
                                                key={tag.id} 
                                                value={tag.id}
                                                title={okrInfo ? `OKR: ${okrInfo.okrTitle} | KR: ${okrInfo.krTitle}` : ''}
                                            >
                                                {displayText}
                                            </option>
                                        );
                                    })}
                                </select>
                                {selectedCreateTaskTag && (
                                    <div className="selected-tag-preview" style={{ marginTop: '8px', padding: '8px 12px', background: '#F1F5F9', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                        <span className="color-preview-chip" style={{ background: selectedCreateTaskTag.color, width: '12px', height: '12px', borderRadius: '3px', display: 'inline-block', marginRight: '8px', flexShrink: 0 }} aria-hidden="true"></span>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                            <span style={{ fontSize: '0.9em', color: 'var(--text-main)', flexShrink: 0 }}>Selected:</span>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                                                    <span title={selectedCreateTaskTag.name}>{selectedCreateTaskTag.name}</span>
                                                </div>
                                                {tagSourceMap[selectedCreateTaskTag.id] && (
                                                    <div style={{ fontSize: '0.8em', color: 'var(--text-muted)' }}>
                                                        <div style={{ marginBottom: '2px' }}>
                                                            <strong>OKR:</strong>{' '}
                                                            <span title={tagSourceMap[selectedCreateTaskTag.id].okrTitle}>
                                                                {tagSourceMap[selectedCreateTaskTag.id].okrTitle.length > 60 
                                                                    ? `${tagSourceMap[selectedCreateTaskTag.id].okrTitle.substring(0, 60)}...`
                                                                    : tagSourceMap[selectedCreateTaskTag.id].okrTitle
                                                                }
                                                            </span>
                                                        </div>
                                                        <div>
                                                            <strong>Key Result:</strong>{' '}
                                                            <span title={tagSourceMap[selectedCreateTaskTag.id].krTitle}>
                                                                {tagSourceMap[selectedCreateTaskTag.id].krTitle.length > 60
                                                                    ? `${tagSourceMap[selectedCreateTaskTag.id].krTitle.substring(0, 60)}...`
                                                                    : tagSourceMap[selectedCreateTaskTag.id].krTitle
                                                                }
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
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
                                        {assignableUsers.map((member) => (
                                            <option key={member.user.id} value={member.user.id}>
                                                {member.user.id === user?.id ? `Me (${member.user.name || member.user.email})` : member.user.name || member.user.email}
                                            </option>
                                        ))}
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
                                                    {member.user.id === user?.id ? `Me (${member.user.name || member.user.email})` : member.user.name || member.user.email}
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
                                <label>Tag *</label>
                                <select value={editTask.tagId} onChange={(e) => setEditTask({ ...editTask, tagId: e.target.value })} required>
                                    <option value="">Select a tag</option>
                                    {availableTags.map((tag) => {
                                        const okrInfo = tagSourceMap[tag.id];
                                        const displayText = okrInfo 
                                            ? `${tag.name} - ${okrInfo.krTitle}`
                                            : tag.name;
                                        return (
                                            <option 
                                                key={tag.id} 
                                                value={tag.id}
                                                title={okrInfo ? `OKR: ${okrInfo.okrTitle} | KR: ${okrInfo.krTitle}` : ''}
                                            >
                                                {displayText}
                                            </option>
                                        );
                                    })}
                                </select>
                                {selectedEditTaskTag && (
                                    <div className="selected-tag-preview" style={{ marginTop: '8px', padding: '8px 12px', background: '#F1F5F9', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                        <span className="color-preview-chip" style={{ background: selectedEditTaskTag.color, width: '12px', height: '12px', borderRadius: '3px', display: 'inline-block', marginRight: '8px', flexShrink: 0 }} aria-hidden="true"></span>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                            <span style={{ fontSize: '0.9em', color: 'var(--text-main)', flexShrink: 0 }}>Selected:</span>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                                                    <span title={selectedEditTaskTag.name}>{selectedEditTaskTag.name}</span>
                                                </div>
                                                {tagSourceMap[selectedEditTaskTag.id] && (
                                                    <div style={{ fontSize: '0.8em', color: 'var(--text-muted)' }}>
                                                        <div style={{ marginBottom: '2px' }}>
                                                            <strong>OKR:</strong>{' '}
                                                            <span title={tagSourceMap[selectedEditTaskTag.id].okrTitle}>
                                                                {tagSourceMap[selectedEditTaskTag.id].okrTitle.length > 60 
                                                                    ? `${tagSourceMap[selectedEditTaskTag.id].okrTitle.substring(0, 60)}...`
                                                                    : tagSourceMap[selectedEditTaskTag.id].okrTitle
                                                                }
                                                            </span>
                                                        </div>
                                                        <div>
                                                            <strong>Key Result:</strong>{' '}
                                                            <span title={tagSourceMap[selectedEditTaskTag.id].krTitle}>
                                                                {tagSourceMap[selectedEditTaskTag.id].krTitle.length > 60
                                                                    ? `${tagSourceMap[selectedEditTaskTag.id].krTitle.substring(0, 60)}...`
                                                                    : tagSourceMap[selectedEditTaskTag.id].krTitle
                                                                }
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
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
                                    {assignableUsers.map((member) => (
                                        <option key={member.user.id} value={member.user.id}>
                                            {member.user.id === user?.id ? `Me (${member.user.name || member.user.email})` : member.user.name || member.user.email}
                                        </option>
                                    ))}
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
                                                {member.user.id === user?.id ? `Me (${member.user.name || member.user.email})` : member.user.name || member.user.email}
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
                                    <option value="OTHER">Other</option>
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
                                <label>Team Lead (Team Lead role only) - Optional</label>
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
                                    style={{ maxHeight: '200px', overflowY: 'auto' }}
                                >
                                    <option value="">Select lead (optional)</option>
                                    {teamLeadUsers.length > 0 ? (
                                        teamLeadUsers.map((member) => (
                                            <option key={member.user.id} value={member.user.id}>
                                                {member.user.name || member.user.email}
                                            </option>
                                        ))
                                    ) : (
                                        <option disabled value="">No team leads available</option>
                                    )}
                                </select>
                                {teamLeadUsers.length === 0 && (
                                    <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                                        No users with Team Lead role. You can create a team without a lead for now.
                                    </small>
                                )}
                            </div>
                            <div className="form-group">
                                <label>Members</label>
                                <div className="team-members-list" style={{ maxHeight: 220, overflowY: 'auto' }}>
                                    {assignableUsers.map((member) => (
                                        <label key={member.user.id} className="team-member-row" style={{ cursor: 'pointer' }}>
                                            <div className="team-member-info">
                                                <strong>{member.user.name || member.user.email}</strong>
                                                <span>{formatRole(member.role)}</span>
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
                                    {teamLeadUsers.length > 0 ? (
                                        teamLeadUsers.map((member) => (
                                            <option key={member.user.id} value={member.user.id}>
                                                {member.user.name || member.user.email}
                                            </option>
                                        ))
                                    ) : (
                                        <option disabled value="">No team leads available</option>
                                    )}
                                </select>
                                {teamLeadUsers.length === 0 && (
                                    <small style={{ color: '#DC2626', display: 'block', marginTop: '4px' }}>
                                        No users with Team Lead role. Please invite someone as a Team Lead first.
                                    </small>
                                )}
                            </div>
                            <div className="form-group">
                                <label>Members</label>
                                <div className="team-members-list" style={{ maxHeight: 220, overflowY: 'auto' }}>
                                    {assignableUsers.map((member) => (
                                        <label key={member.user.id} className="team-member-row" style={{ cursor: 'pointer' }}>
                                            <div className="team-member-info">
                                                <strong>{member.user.name || member.user.email}</strong>
                                                <span>{formatRole(member.role)}</span>
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
                                    <input type="date" value={newOkr.periodStart} onChange={(e) => {
                                        const startDate = e.target.value;
                                        const endDate = newOkr.periodEnd;
                                        const today = new Date().toISOString().split('T')[0];
                                        
                                        // Auto-calculate status based on dates
                                        let newStatus = newOkr.status;
                                        if (startDate && endDate) {
                                            if (startDate > today) {
                                                newStatus = 'NOT_YET_OPEN';
                                            } else if (endDate < today) {
                                                newStatus = 'COMPLETED';
                                            } else {
                                                newStatus = 'OPEN';
                                            }
                                        }
                                        
                                        setNewOkr({ ...newOkr, periodStart: startDate, status: newStatus });
                                    }} required />
                                </div>
                                <div className="form-group">
                                    <label>Period End</label>
                                    <input type="date" value={newOkr.periodEnd} onChange={(e) => {
                                        const endDate = e.target.value;
                                        const startDate = newOkr.periodStart;
                                        const today = new Date().toISOString().split('T')[0];
                                        
                                        // Auto-calculate status based on dates
                                        let newStatus = newOkr.status;
                                        if (startDate && endDate) {
                                            if (startDate > today) {
                                                newStatus = 'NOT_YET_OPEN';
                                            } else if (endDate < today) {
                                                newStatus = 'COMPLETED';
                                            } else {
                                                newStatus = 'OPEN';
                                            }
                                        }
                                        
                                        setNewOkr({ ...newOkr, periodEnd: endDate, status: newStatus });
                                    }} required />
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Status</label>
                                <select
                                    value={newOkr.status}
                                    onChange={(e) => setNewOkr({ ...newOkr, status: e.target.value })}
                                >
                                    <option value="NOT_YET_OPEN">Not yet Open</option>
                                    <option value="OPEN">Open</option>
                                    <option value="COMPLETED">Completed</option>
                                </select>
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
                                {teams.length > 0 ? (
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
                                ) : (
                                    <p style={{ fontSize: '0.85em', color: 'var(--text-muted)', margin: '8px 0' }}>No teams available. Create teams first to assign them as supporters.</p>
                                )}
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
                                    <option value="NOT_YET_OPEN">Not yet Open</option>
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
                                {teams.length > 0 ? (
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
                                ) : (
                                    <p style={{ fontSize: '0.85em', color: 'var(--text-muted)', margin: '8px 0' }}>No teams available. Create teams first to assign them as supporters.</p>
                                )}
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
                            <div className="form-group">
                                <label>OKRs (Optional)</label>
                                <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 8, padding: 8 }}>
                                    {okrs.length > 0 ? (
                                        okrs.map((okr) => (
                                            <label key={okr.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedOkrIds.includes(okr.id)}
                                                    onChange={(e) => {
                                                        const checked = e.target.checked;
                                                        setSelectedOkrIds((prev) =>
                                                            checked
                                                                ? [...prev, okr.id]
                                                                : prev.filter((id) => id !== okr.id)
                                                        );
                                                    }}
                                                />
                                                <span>{okr.title} ({new Date(okr.periodStart).toLocaleDateString()} - {new Date(okr.periodEnd).toLocaleDateString()})</span>
                                            </label>
                                        ))
                                    ) : (
                                        <p style={{ fontSize: '0.85em', color: 'var(--text-muted)', margin: '8px 0' }}>No OKRs available</p>
                                    )}
                                </div>
                                {selectedOkrIds.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setSelectedOkrIds([])}
                                        style={{ marginTop: '8px', fontSize: '0.8em', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                                    >
                                        Clear OKR Selection
                                    </button>
                                )}
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

            {showBulkInviteModal && (
                <div className="modal-overlay" onClick={handleCloseBulkInviteModal}>
                    <div className="modal bulk-invite-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Bulk Invite Members</h2>
                            <button className="btn-icon-close" onClick={handleCloseBulkInviteModal}>&times;</button>
                        </div>
                        
                        <div className="modal-body">
                            {!bulkInviteResult ? (
                                <>
                                    <div className="invite-instructions">
                                        <p>Upload a spreadsheet (.xlsx or .csv) to invite multiple members at once. The file must contain <strong>Email</strong> and <strong>Role</strong> (MEMBER or TEAM_LEAD) columns.</p>
                                        <button onClick={handleDownloadSampleSheet} className="btn-text">Download Sample Template</button>
                                    </div>

                                    <div className="upload-section">
                                        <input
                                            type="file"
                                            accept=".xlsx, .xls, .csv"
                                            onChange={handleBulkInviteFileChange}
                                            id="bulk-invite-upload"
                                            className="hidden-input"
                                        />
                                        <label htmlFor="bulk-invite-upload" className="upload-dropzone">
                                            <div className="upload-icon">
                                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                                                </svg>
                                            </div>
                                            <span>{bulkInviteFile ? bulkInviteFile.name : 'Select file or drag & drop'}</span>
                                        </label>
                                    </div>

                                    {bulkInvitePreview.length > 0 && (
                                        <div className="preview-section">
                                            <h4>Preview (First 10 rows)</h4>
                                            <div className="table-container">
                                                <table>
                                                    <thead>
                                                        <tr>
                                                            <th>Email</th>
                                                            <th>Role</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {bulkInvitePreview.map((row, i) => (
                                                            <tr key={i}>
                                                                <td>{row.Email}</td>
                                                                <td>{row.Role}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    {bulkInviteErrors.length > 0 && (
                                        <div className="error-section">
                                            <h4>Errors Found ({bulkInviteErrors.length})</h4>
                                            <ul className="error-list">
                                                {bulkInviteErrors.map((err, i) => (
                                                    <li key={i}>
                                                        {err.row > 0 && <span>Row {err.row}: </span>}
                                                        {err.email && <span>{err.email} - </span>}
                                                        {err.error}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="result-section">
                                    <div className="result-header success">
                                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                            <polyline points="22 4 12 14.01 9 11.01" />
                                        </svg>
                                        <h3>Processing Complete</h3>
                                    </div>
                                    <div className="result-stats">
                                        <div className="stat">
                                            <div className="stat-label">Successful</div>
                                            <div className="stat-num success">{bulkInviteResult.successCount}</div>
                                        </div>
                                        <div className="stat">
                                            <div className="stat-label">Skipped (Already in Org)</div>
                                            <div className="stat-num">{bulkInviteResult.skippedCount}</div>
                                        </div>
                                        {bulkInviteResult.errors && bulkInviteResult.errors.length > 0 && (
                                            <div className="stat">
                                                <div className="stat-label">Failed</div>
                                                <div className="stat-num error">{bulkInviteResult.errors.length}</div>
                                            </div>
                                        )}
                                    </div>
                                    {bulkInviteResult.errors && bulkInviteResult.errors.length > 0 && (
                                        <div className="result-errors">
                                            <h4>Failed Invites</h4>
                                            <ul>
                                                {bulkInviteResult.errors.map((err: any, i: number) => (
                                                    <li key={i}>{err.email}: {err.error}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="modal-footer">
                            {!bulkInviteResult ? (
                                <>
                                    <button onClick={handleCloseBulkInviteModal} className="btn-secondary">Cancel</button>
                                    <button 
                                        onClick={handleBulkInviteSubmit} 
                                        className="btn-primary" 
                                        disabled={!bulkInviteFile || bulkInviteSubmitting || bulkInviteErrors.length > 0}
                                    >
                                        {bulkInviteSubmitting ? 'Inviting...' : 'Send Bulk Invites'}
                                    </button>
                                </>
                            ) : (
                                <button onClick={handleCloseBulkInviteModal} className="btn-primary">Close</button>
                            )}
                        </div>
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
