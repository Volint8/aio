/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../context/useAuth";
import { connectSocket } from "../services/socket";
import BoardView from "../components/BoardView";
import TaskTrackerView from "../components/TaskTrackerView";
import TeamTrackerView from "../components/TeamTrackerView";
import OkrView from "../components/OkrView";
import SubscriptionPage from "./SubscriptionPage";
import ErrorDialog from "../components/ErrorDialog";
import DebouncedButton from "../components/common/DebouncedButton";
import { PasswordInput } from "../components/common/PasswordInput";
import CustomSelect from "../components/common/CustomSelect";
import * as XLSX from "xlsx";
import "../styles/Dashboard.css";

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
  approvalStatus?: string | null;
  approvedAt?: string | null;
  approvalNotes?: string | null;
  priority: string;
  dueDate: string | null;
  createdByUserId?: string | null;
  createdBy?: {
    id: string;
    name: string | null;
    email: string;
  } | null;
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
  createdAt: string;
  deletedAt?: string | null;
  comments?: any[];
  attachments?: Attachment[];
  alertTeamLead?: boolean;
  krImpacts?: Array<{
    id: string;
    okrKeyResult: {
      id: string;
      title: string;
      isGeneral?: boolean;
      okr: {
        id: string;
        title: string;
      };
    };
  }>;
}

interface Stats {
  pending: number;
  ongoing: number;
  completed: number;
  overdue: number;
  onHold: number;
  myTasks: number;
  total: number;
}

interface OrganizationMember {
  id: string;
  userId: string;
  role: string;
  teamId?: string | null;
  team?: {
    id: string;
    name: string;
  } | null;
  primaryTeam?: {
    id: string;
    name: string;
  } | null;
  teams?: Array<{
    id: string;
    name: string;
  }>;
  joinedAt?: string | null;
  user: {
    id: string;
    email: string;
    name: string | null;
    jobTitle?: string | null;
    initialRole?: string | null;
    createdAt?: string;
  };
}

interface Team {
  id: string;
  name: string;
  leadUser?: { id: string; name: string | null; email: string } | null;
  stats: {
    created: number;
    inProgress: number;
    completed: number;
    total: number;
  };
  members: Array<{
    id?: string;
    userId?: string;
    name?: string | null;
    email?: string;
    role: string;
    stats?: {
      created: number;
      inProgress: number;
      completed: number;
      total: number;
    };
  }>;
  people?: Array<{
    userId: string;
    name: string;
    role: string;
    stats: {
      created: number;
      inProgress: number;
      completed: number;
      total: number;
    };
  }>;
}

interface TeamMultiDropdownProps {
  teams: Team[];
  value: string[];
  onChange: (teamIds: string[]) => void;
  disabledTeamId?: string;
  emptyMessage: string;
}

const TeamMultiDropdown = ({
  teams,
  value,
  onChange,
  disabledTeamId,
  emptyMessage,
}: TeamMultiDropdownProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const availableTeams = teams.filter((team) => team.id !== disabledTeamId);
  const selectedTeams = teams.filter(
    (team) => team.id !== disabledTeamId && value.includes(team.id),
  );

  const toggleTeam = (teamId: string) => {
    onChange(
      value.includes(teamId)
        ? value.filter((id) => id !== teamId)
        : [...value, teamId],
    );
  };

  const removeTeam = (teamId: string) => {
    onChange(value.filter((id) => id !== teamId));
  };

  return (
    <div
      className="team-multi-select"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setIsOpen(false);
        }
      }}
    >
      <button
        type="button"
        className={`team-multi-select-trigger ${isOpen ? "open" : ""}`}
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="team-multi-select-values">
          {selectedTeams.length > 0 ? (
            selectedTeams.map((team) => (
              <span className="team-selection-chip" key={team.id}>
                <span className="team-selection-label">{team.name}</span>
                <span
                  role="button"
                  tabIndex={0}
                  className="team-selection-remove"
                  aria-label={`Remove ${team.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTeam(team.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      removeTeam(team.id);
                    }
                  }}
                >
                  x
                </span>
              </span>
            ))
          ) : (
            <span className="team-multi-select-placeholder">
              Select contributing teams
            </span>
          )}
        </span>
        <span className="team-multi-select-caret">v</span>
      </button>

      {isOpen && (
        <div
          className="team-multi-select-menu"
          role="listbox"
          aria-multiselectable="true"
        >
          {availableTeams.length > 0 ? (
            availableTeams.map((team) => {
              const isSelected = value.includes(team.id);
              return (
                <label
                  className={`team-multi-select-option ${isSelected ? "selected" : ""}`}
                  key={team.id}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleTeam(team.id)}
                  />
                  <span>{team.name}</span>
                </label>
              );
            })
          ) : (
            <div className="team-multi-select-empty">{emptyMessage}</div>
          )}
        </div>
      )}
    </div>
  );
};

const getMemberTeams = (member?: OrganizationMember | null) => {
  if (!member) return [];
  const teams = member.teams || [];
  if (teams.length > 0) return teams;
  if (member.primaryTeam) return [member.primaryTeam];
  if (member.team) return [member.team];
  return [];
};

const getMemberTeamIds = (member?: OrganizationMember | null) =>
  getMemberTeams(member).map((team) => team.id);

const getMemberTeamLabel = (member?: OrganizationMember | null) =>
  getMemberTeams(member)
    .map((team) => team.name)
    .filter(Boolean)
    .join(", ");

type MemberOption = {
  id: string;
  name: string | null;
  email: string;
};

interface MemberMultiSelectProps {
  options: MemberOption[];
  value: string[];
  onChange: (userIds: string[]) => void;
  lockedIds?: string[];
  maxVisibleChips?: number;
}

const MemberMultiSelect = ({
  options,
  value,
  onChange,
  lockedIds = [],
  maxVisibleChips = 8,
}: MemberMultiSelectProps) => {
  const locked = useMemo(() => new Set(lockedIds.filter(Boolean)), [lockedIds]);
  const selected = useMemo(() => new Set(value), [value]);

  const filteredOptions = useMemo(() => options, [options]);

  const selectedOptions = useMemo(
    () => options.filter((o) => selected.has(o.id)),
    [options, selected],
  );

  const visibleChips = selectedOptions.slice(0, maxVisibleChips);
  const hiddenChipCount = Math.max(
    0,
    selectedOptions.length - visibleChips.length,
  );

  const getInitials = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return "U";
    const parts = trimmed.split(/\s+/);
    const initials = parts
      .slice(0, 2)
      .map((p) => p[0])
      .join("");
    return initials.toUpperCase();
  };

  const toggle = (userId: string) => {
    if (locked.has(userId)) return;
    onChange(
      selected.has(userId)
        ? value.filter((id) => id !== userId)
        : [...value, userId],
    );
  };

  const remove = (userId: string) => {
    if (locked.has(userId)) return;
    onChange(value.filter((id) => id !== userId));
  };

  // Bulk actions and per-instance search removed per UX decision.

  return (
    <div className="member-picker">
      <div className="member-picker-top">
        <div className="member-picker-meta">
          <span className="member-picker-title">
            Selected: {selectedOptions.length}
          </span>
        </div>
      </div>

      {selectedOptions.length > 0 && (
        <div className="member-picker-chips">
          {visibleChips.map((o) => (
            <button
              key={o.id}
              type="button"
              className="member-chip"
              onClick={() => remove(o.id)}
              disabled={locked.has(o.id)}
              title={locked.has(o.id) ? "Locked" : "Remove"}
            >
              <span>{o.name || o.email}</span>
              {!locked.has(o.id) && <span aria-hidden="true">×</span>}
            </button>
          ))}
          {hiddenChipCount > 0 && (
            <span className="member-chip-more">+{hiddenChipCount} more</span>
          )}
        </div>
      )}

      <div
        className="member-picker-list"
        role="listbox"
        aria-multiselectable="true"
      >
        {filteredOptions.length === 0 ? (
          <div className="member-picker-empty">No members available.</div>
        ) : (
          filteredOptions.map((o) => {
            const isLocked = locked.has(o.id);
            const isChecked = selected.has(o.id);
            return (
              <button
                type="button"
                key={o.id}
                className={`member-picker-row ${isChecked ? "selected" : ""} ${isLocked ? "locked" : ""}`}
                role="option"
                aria-selected={isChecked}
                onClick={() => toggle(o.id)}
                disabled={false}
              >
                <span className="member-picker-avatar">
                  {getInitials(o.name || o.email)}
                </span>
                <span className="member-picker-info">
                  <span className="member-picker-name">
                    {o.name || o.email}
                  </span>
                  <span className="member-picker-email">{o.email}</span>
                </span>
                <input
                  type="checkbox"
                  checked={isChecked}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggle(o.id)}
                  disabled={isLocked}
                  aria-label={`Select ${o.name || o.email}`}
                />
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

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
  objectiveTargetValue?: number | null;
  objectiveMetricUnit?: string | null;
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
    assignedUserId: string | null;
    isGeneral?: boolean;
    assignedUser: {
      id: string;
      name: string | null;
      email: string;
    };
    metricName?: string | null;
    metricUnit?: string | null;
    targetValue?: number | null;
    weight?: number;
    contributionValue?: number | null;
    contributionPct?: number | null;
    approvalStatus?: string;
    approvalNotes?: string | null;
    approvedAt?: string | null;
    approver?: {
      id: string;
      name: string | null;
      email: string;
    } | null;
    okrId?: string;
  }>;
}

interface AppraisalOkrImpactKr {
  krId: string;
  krTitle: string;
  assignedUserId: string;
  assignedUserName?: string | null;
  assignedUserEmail?: string | null;
  metricName?: string | null;
  metricUnit?: string | null;
  targetValue?: number | null;
  actualValue: number;
  contributionValue?: number | null;
  contributionPct?: number | null;
  achievedPct?: number | null;
  approvalStatus?: string;
  approvedByName?: string | null;
  approvedAt?: string | null;
  approvalNotes?: string | null;
}

interface AppraisalOkrImpactSummary {
  okrs: Array<{
    okrId: string;
    okrTitle: string;
    objectiveTargetValue?: number | null;
    objectiveMetricUnit?: string | null;
    achievedPct?: number | null;
    targetValueTotal?: number | null;
    actualValueTotal: number;
    keyResults: AppraisalOkrImpactKr[];
  }>;
  totals?: {
    achievedPct?: number | null;
    quantitativeOkrCount?: number;
    excludedOkrCount?: number;
  };
}

interface AppraisalReportSections {
  header?: {
    name?: string;
    role?: string | null;
    team?: string | null;
    appraisalPeriod?: string;
    purpose?: string;
  };
  overviewSummary?: string;
  okrPerformanceBreakdown?: Array<{
    objective: string;
    keyResults: string[];
    owner: string;
    timeline: string;
    status: string;
    performanceInsight: string;
  }>;
  strengths?: string[];
  areasForImprovement?: string[];
  skillsCapabilityInsights?: string[];
  recommendations?: string[];
  finalRating?: string;
  nextSteps?: string[];
}

interface OkrKeyResultForm {
  title: string;
  assignedUserId: string | null;
  ownerUserIds?: string[];
  id?: string;
}

interface Appraisal {
  id: string;
  batchId?: string | null;
  subjectType?: "INDIVIDUAL" | "TEAM";
  subjectTeamId?: string | null;
  subjectName?: string | null;
  cycle: string;
  summary: string;
  status: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  purposes?: string[] | null;
  customFocus?: string | null;
  tasksCompleted?: number | null;
  deadlinesMet?: number | null;
  okrContribution?: string | null;
  okrImpactScore?: number | null;
  okrImpactSummary?: AppraisalOkrImpactSummary | null;
  reportSections?: AppraisalReportSections | null;
  fallbackReason?: string | null;
  batch?: {
    id: string;
    outputFormat: "SINGLE_PDF" | "SEPARATE_PDFS";
    scope: string;
  } | null;
  overallRating?: string | null;
  subjectUser?: {
    id: string;
    name?: string | null;
    email: string;
    team?: { id: string; name: string } | null;
  };
}

interface InviteRecord {
  id: string;
  email: string;
  name?: string | null;
  role: string;
  status: string;
  expiresAt: string;
  teamId?: string | null;
  primaryTeamId?: string | null;
  team?: string | null;
  teams?: Array<{ id: string; name: string }>;
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

type DashboardSection =
  | "board"
  | "task-tracker"
  | "team-tracker"
  | "okr"
  | "tracker"
  | "team"
  | "appraisals"
  | "subscription"
  | "settings"
  | "support";
type TaskFilter =
  | "all"
  | "my"
  | "supporting"
  | "pending"
  | "ongoing"
  | "in_review"
  | "completed"
  | "pending_approval"
  | "overdue"
  | "created"
  | "in_progress"
  | "recently_deleted";
type TrackerView = "users" | "teams";

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

interface MemberRow {
  member: OrganizationMember;
  stats?: MemberStatRecord;
  teamName: string;
  category: string;
  roleLabel: string;
}

interface TeamDistributionRecord {
  teamId: string;
  teamName: string;
  leadUser: { id: string; name: string | null; email: string };
  stats: {
    pending: number;
    ongoing: number;
    completed: number;
    overdue: number;
    total: number;
    okrProgress?: number;
  };
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

const parseDateOnly = (value: string) => {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
};

const isDueDateOverdue = (dueDateValue: string | null | undefined) => {
  if (!dueDateValue) return false;
  const dueDate = parseDateOnly(dueDateValue);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return dueDate < today;
};

const isTaskCompleted = (status: string | null | undefined) =>
  status === "COMPLETED" || status === "DONE";

const formatStatusLabel = (status: string | null | undefined): string => {
  if (!status) return "Unknown";
  switch (status) {
    case "CREATED":
    case "TODO":
      return "To Do";
    case "IN_PROGRESS":
      return "In Progress";
    case "IN_REVIEW":
      return "In Review";
    case "ON_HOLD":
      return "On Hold";
    case "COMPLETED":
    case "DONE":
      return "Done";
    case "CANCELLED":
      return "Cancelled";
    case "NOT_YET_OPEN":
      return "Not yet Open";
    case "OPEN":
      return "Open";
    case "PENDING":
      return "Pending";
    case "REVIEWED":
      return "Reviewed";
    case "APPROVED":
      return "Approved";
    case "REJECTED":
      return "Rejected";
    default:
      return status.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }
};

const formatActivityDescription = (description: string): string => {
  if (!description) return "";
  return description
    .replace(/\bIN_PROGRESS\b/g, "In Progress")
    .replace(/\bIN_REVIEW\b/g, "In Review")
    .replace(/\bON_HOLD\b/g, "On Hold")
    .replace(/\bCREATED\b/g, "To Do")
    .replace(/\bTODO\b/g, "To Do")
    .replace(/\bCOMPLETED\b/g, "Done")
    .replace(/\bDONE\b/g, "Done")
    .replace(/\bCANCELLED\b/g, "Cancelled")
    .replace(/\bNOT_YET_OPEN\b/g, "Not yet Open")
    .replace(/\bNOT_SUBMITTED\b/g, "Not Submitted")
    .replace(/\bAPPROVED\b/g, "Approved")
    .replace(/\bREJECTED\b/g, "Rejected")
    .replace(/\bPENDING\b/g, "Pending");
};

const formatDateTimeWithoutSeconds = (dateInput: string | Date | number | null | undefined): string => {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return "";
  const day = d.getDate();
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const year = d.getFullYear();
  const timeStr = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${day} ${month} ${year} • ${timeStr}`;
};

const DashboardPage = () => {
  const location = useLocation();
  const { user } = useAuth();
  const requestedFilter = (new URLSearchParams(location.search).get("filter") ||
    "all") as TaskFilter;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [okrs, setOkrs] = useState<Okr[]>([]);
  const [linkableOkrsByUserId, setLinkableOkrsByUserId] = useState<
    Record<string, Okr[]>
  >({});
  const [appraisals, setAppraisals] = useState<Appraisal[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [invites, setInvites] = useState<InviteRecord[]>([]);
  const [memberStats, setMemberStats] = useState<MemberStatRecord[]>([]);
  const [reactivateEmail, setReactivateEmail] = useState("");
  const [reactivateRole, setReactivateRole] = useState("MEMBER");
  const [reactivateLoading, setReactivateLoading] = useState(false);
  const [reactivateError, setReactivateError] = useState("");
  const [reactivateSuccess, setReactivateSuccess] = useState("");
  const [teamDistribution, setTeamDistribution] = useState<
    TeamDistributionRecord[]
  >([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);

  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TaskFilter>(requestedFilter);
  const [assigneeFilterId, setAssigneeFilterId] = useState<string | null>(null);
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isExpandedFullScreen, setIsExpandedFullScreen] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isExpandedFullScreen) {
          setIsExpandedFullScreen(false);
        } else if (selectedTaskId) {
          setSelectedTaskId(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isExpandedFullScreen, selectedTaskId]);
  const [editingDescriptionText, setEditingDescriptionText] = useState("");
  const [menuOpenTaskId, setMenuOpenTaskId] = useState<string | null>(null);
  const [expandedCommentThreads, setExpandedCommentThreads] = useState<
    Record<string, boolean>
  >({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {},
  );
  const [submittingCommentTaskId, setSubmittingCommentTaskId] = useState<
    string | null
  >(null);
  const [submissions, setSubmissions] = useState<
    Array<{
      id: string;
      taskId: string;
      userId: string;
      description?: string;
      submittedAt: string;
      status: "PENDING" | "REVIEWED" | "APPROVED" | "REJECTED";
      reviewNotes?: string;
      reviewedAt?: string;
      reviewedBy?: string;
      user?: { id: string; name: string | null; email: string };
    }>
  >([]);
  const [activityLogs, setActivityLogs] = useState<
    Array<{
      id: string;
      taskId: string;
      userId?: string;
      action: string;
      description: string;
      metadata?: any;
      createdAt: string;
      user?: { id: string; name: string | null; email: string };
    }>
  >([]);
  const [showSubmissionModal, setShowSubmissionModal] = useState(false);
  const [submissionDescription, setSubmissionDescription] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");

  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [showCreateOkrModal, setShowCreateOkrModal] = useState(false);
  const [creatingOkr, setCreatingOkr] = useState(false);
  const [showCreateAppraisalModal, setShowCreateAppraisalModal] =
    useState(false);
  const [showAddLinkModal, setShowAddLinkModal] = useState(false);
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [showSendAlertModal, setShowSendAlertModal] = useState(false);
  const [alertForm, setAlertForm] = useState({
    targetType: "INDIVIDUAL",
    targetId: "",
    type: "DEADLINE_REMINDER",
    message: "",
  });

  const orgId = localStorage.getItem("selectedOrgId");

  const handleSendAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const targetId =
        isTeamLead && alertForm.targetType === "ADMINS"
          ? "ADMINS"
          : isTeamLead && alertForm.targetType === "TEAM"
            ? currentOrgMember?.teamId || ""
            : alertForm.targetId;

      if (!targetId) {
        showError("Validation Error", "Target is required");
        return;
      }
      if (!alertForm.message) {
        showError("Validation Error", "Message is required");
        return;
      }
      await api.post("/notifications/send-alert", {
        ...alertForm,
        targetId,
        organizationId: orgId,
      });
      setShowSendAlertModal(false);
      setAlertForm({
        targetType: isTeamLead ? "ADMINS" : "INDIVIDUAL",
        targetId: "",
        type: "DEADLINE_REMINDER",
        message: "",
      });
      showError("Success", "Alert sent successfully");
    } catch (error: any) {
      showError("Error", error.response?.data?.error || "Failed to send alert");
    }
  };

  const [showEditTaskModal, setShowEditTaskModal] = useState(false);
  const [taskReviewDialog, setTaskReviewDialog] = useState<{
    taskId: string;
    taskTitle: string;
    action: "REJECT";
  } | null>(null);
  const [taskReviewNotes, setTaskReviewNotes] = useState("");
  const [showCreateClientModal, setShowCreateClientModal] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientRecord | null>(null);
  const [createMore, setCreateMore] = useState(false);
  const [showEditOkrModal, setShowEditOkrModal] = useState(false);
  const [editingOkr, setEditingOkr] = useState<Okr | null>(null);
  const [selectedMemberDetail, setSelectedMemberDetail] =
    useState<MemberRow | null>(null);

  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    priority: "LOW",
    dueDate: "",
    assigneeId: user?.id || "",
    supporterId: "",
    alertTeamLead: false,
    okrId: "",
    keyResultIds: [] as string[],
    status: "TODO",
  });

  const [editTask, setEditTask] = useState({
    id: "",
    title: "",
    description: "",
    priority: "LOW",
    dueDate: "",
    assigneeId: "",
    supporterId: "",
    alertTeamLead: false,
    okrId: "",
    keyResultIds: [] as string[],
    status: "TODO",
  });

  const [newOkr, setNewOkr] = useState({
    title: "",
    description: "",
    periodStart: "",
    periodEnd: "",
    status: "NOT_YET_OPEN",
    assignedToTeamId: "",
    supportedByTeamIds: [] as string[],
    keyResults: [
      {
        title: "",
        assignedUserId: "",
        ownerUserIds: [] as string[],
      },
    ] as OkrKeyResultForm[],
  });

  const [editOkrForm, setEditOkrForm] = useState({
    title: "",
    description: "",
    periodStart: "",
    periodEnd: "",
    assignedToTeamId: "",
    supportedByTeamIds: [] as string[],
    keyResults: [
      {
        title: "",
        assignedUserId: "",
        ownerUserIds: [] as string[],
      },
    ] as OkrKeyResultForm[],
    status: "OPEN",
  });
  const [newAppraisal, setNewAppraisal] = useState({
    scope: "INDIVIDUALS",
    subjectIds: [] as string[],
    outputFormat: "SINGLE_PDF",
    periodStart: "",
    periodEnd: "",
    purposes: ["Performance Review"] as string[],
    otherPurpose: "",
    customFocus: "",
  });
  const [selectedOkrIds, setSelectedOkrIds] = useState<string[]>([]);
  const [appraisalPreview, setAppraisalPreview] = useState<{
    subjects: Array<{
      type: string;
      id: string;
      name: string;
      role?: string | null;
      teamName?: string | null;
    }>;
    okrs: Array<{
      id: string;
      title: string;
      periodStart: string;
      periodEnd: string;
      status: string;
      keyResultCount: number;
    }>;
    setupSummary: string;
    selectedOkrIds: string[];
  } | null>(null);
  const [appraisalPreviewLoading, setAppraisalPreviewLoading] = useState(false);
  const [appraisalSelectionDirty, setAppraisalSelectionDirty] = useState(false);
  const [generatingAppraisal, setGeneratingAppraisal] = useState(false);
  const [newLink, setNewLink] = useState({ taskId: "", url: "", fileName: "" });
  const [teamForm, setTeamForm] = useState({
    name: "",
    leadUserId: "",
    memberUserIds: [] as string[],
  });
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("MEMBER");
  const [inviteName, setInviteName] = useState("");
  const [inviteTeamIds, setInviteTeamIds] = useState<string[]>([]);
  const [inviteCategory, setInviteCategory] = useState("");
  const [inviting, setInviting] = useState(false);
  const [teamError, setTeamError] = useState("");
  const [clientFormName, setClientFormName] = useState("");
  const [clientFormVisibility, setClientFormVisibility] = useState("ORG_WIDE");
  const [taskClientFilter, setTaskClientFilter] = useState("all");
  const [taskDeleteTargetId, setTaskDeleteTargetId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requested = (params.get("filter") || "all") as TaskFilter;
    setFilter((prev) => (prev === requested ? prev : requested));
  }, [location.search]);

  // Bulk invite state
  const [showBulkInviteModal, setShowBulkInviteModal] = useState(false);
  const [bulkInviteFile, setBulkInviteFile] = useState<File | null>(null);
  const [bulkInvitePreview, setBulkInvitePreview] = useState<any[]>([]);
  const [bulkInviteErrors, setBulkInviteErrors] = useState<
    Array<{ row: number; email: string; error: string }>
  >([]);
  const [bulkInviteSubmitting, setBulkInviteSubmitting] = useState(false);
  const [bulkInviteResult, setBulkInviteResult] = useState<any>(null);

  // Settings state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordChanging, setPasswordChanging] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  // Profile state
  const [profileForm, setProfileForm] = useState({
    name: "",
    jobTitle: "",
  });
  const [profileUpdating, setProfileUpdating] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");

  // Quote state
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [quoteForm, setQuoteForm] = useState({ text: "", author: "" });
  const [quoteSubmitting, setQuoteSubmitting] = useState(false);

  // Error dialog state
  const [errorDialog, setErrorDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  }>({ isOpen: false, title: "", message: "" });

  // Helper function to show error dialog
  const showError = (title: string, message: string) => {
    setErrorDialog({ isOpen: true, title, message });
  };

  const navigate = useNavigate();
  const requestedSection = (new URLSearchParams(location.search).get(
    "section",
  ) || "board") as DashboardSection;
  const requestedTrackerView = (new URLSearchParams(location.search).get(
    "view",
  ) || "users") as TrackerView;
  const storedOrgRole = (
    localStorage.getItem("selectedOrgRole") || ""
  ).toUpperCase();
  const effectiveOrgRole = (
    organization?.userRole || storedOrgRole
  ).toUpperCase();
  const isAdmin = effectiveOrgRole === "ADMIN";
  const isTeamLead = effectiveOrgRole === "TEAM_LEAD";
  const isMember = effectiveOrgRole === "MEMBER";
  const canTrackTeam =
    effectiveOrgRole === "ADMIN" || effectiveOrgRole === "TEAM_LEAD";
  const canReviewSubmissions =
    Boolean((organization as any)?.canReviewSubmissions) || isAdmin;
  const canReviewTasks = isAdmin || isTeamLead;
  const canUseTrackerCharts = isAdmin || isTeamLead;
  const ledTeamMemberIds = useMemo(() => {
    if (!isTeamLead || !teamDistribution || !user?.id) return [] as string[];
    return teamDistribution
      .filter((d) => d.leadUser?.id === user.id)
      .flatMap((d) => (d.people || []).map((p) => p.userId));
  }, [teamDistribution, user?.id, isTeamLead]);
  const ledTeamIds = useMemo(() => {
    if (!isTeamLead || !teamDistribution || !user?.id) return [] as string[];
    return teamDistribution
      .filter((d) => d.leadUser?.id === user.id)
      .map((d) => d.teamId);
  }, [teamDistribution, user?.id, isTeamLead]);
  const trackerView: TrackerView =
    requestedTrackerView === "teams" ? "teams" : "users";

  // Extract team name for team tracker display
  const urlTeamId = new URLSearchParams(location.search).get("teamId");
  const teamTrackerName = useMemo(() => {
    // If a specific team is selected via URL, use that team's name
    if (urlTeamId) {
      const team = teamDistribution.find((t) => t.teamId === urlTeamId);
      if (team) return team.teamName;
    }
    // For admins viewing without specific team, return null to show generic title
    return null;
  }, [urlTeamId, teamDistribution]);

  const currentSection: DashboardSection = useMemo(() => {
    if (requestedSection === "board") return "board";
    if (requestedSection === "task-tracker") return "task-tracker";
    if (requestedSection === "team-tracker" && canTrackTeam)
      return "team-tracker";
    if (requestedSection === "okr") return "okr";
    if (requestedSection === "tracker") return "tracker";
    if (requestedSection === "team" && canTrackTeam) return "team";
    if (requestedSection === "appraisals" && isAdmin) return "appraisals";
    if (requestedSection === "subscription" && isAdmin) return "subscription";
    if (requestedSection === "settings") return "settings";
    if (requestedSection === "support") return "support";
    return "board";
  }, [requestedSection, canTrackTeam, isAdmin]);

  const loadLinkableOkrs = async (targetUserId: string) => {
    if (!orgId || !targetUserId) {
      return [] as Okr[];
    }

    if (linkableOkrsByUserId[targetUserId]) {
      return linkableOkrsByUserId[targetUserId];
    }

    try {
      const response = await api.get(
        `/orgs/${orgId}/okrs/user/${targetUserId}`,
      );
      const nextOkrs = response.data || [];
      setLinkableOkrsByUserId((prev) => ({
        ...prev,
        [targetUserId]: nextOkrs,
      }));
      return nextOkrs;
    } catch (error) {
      console.error("Failed to fetch linkable OKRs:", error);
      setLinkableOkrsByUserId((prev) => ({
        ...prev,
        [targetUserId]: [],
      }));
      return [] as Okr[];
    }
  };

  const newTaskLinkableOkrs = newTask.assigneeId
    ? linkableOkrsByUserId[newTask.assigneeId] || []
    : [];
  const editTaskLinkableOkrs = editTask.assigneeId
    ? linkableOkrsByUserId[editTask.assigneeId] || []
    : [];

  const findTaskOkrDateViolation = (
    dueDate: string,
    selectedKeyResultIds: string[],
    linkableOkrs: Okr[],
  ) => {
    if (!dueDate || selectedKeyResultIds.length === 0) return null;

    for (const okr of linkableOkrs) {
      const selectedInOkr = (okr.keyResults || []).some((kr) =>
        selectedKeyResultIds.includes(kr.id),
      );
      if (!selectedInOkr) continue;

      const periodStart = okr.periodStart?.slice(0, 10);
      const periodEnd = okr.periodEnd?.slice(0, 10);
      const isBeforePeriod = periodStart ? dueDate < periodStart : false;
      const isAfterPeriod = periodEnd ? dueDate > periodEnd : false;

      if (isBeforePeriod || isAfterPeriod) {
        return `Task due date must be within "${okr.title}" (${periodStart || "unknown"} to ${periodEnd || "unknown"}).`;
      }
    }

    return null;
  };

  const toggleTaskKeyResult = (selectedIds: string[], keyResultId: string) =>
    selectedIds.includes(keyResultId)
      ? selectedIds.filter((id) => id !== keyResultId)
      : [...selectedIds, keyResultId];

  const createEmptyKrForm = (): OkrKeyResultForm => ({
    title: "",
    assignedUserId: null,
    ownerUserIds: [] as string[],
    id: undefined,
  });

  const userChartData = memberStats.map((item) => ({
    id: item.userId,
    label: item.name,
    pending: item.stats.pending,
    ongoing: item.stats.ongoing,
    completed: item.stats.completed,
    overdue: item.stats.overdue,
    total: item.stats.total,
  }));

  const teamChartData = teamDistribution.map((item) => ({
    id: item.teamId,
    label: item.teamName,
    pending: item.stats.pending,
    ongoing: item.stats.ongoing,
    completed: item.stats.completed,
    overdue: item.stats.overdue,
    total: item.stats.total,
  }));

  const currentChartData =
    trackerView === "teams" ? teamChartData : userChartData;
  const chartMaxValue = Math.max(
    1,
    ...currentChartData.flatMap((item) => [
      item.pending,
      item.ongoing,
      item.completed,
      item.overdue,
    ]),
  );

  const workersActiveCount = useMemo(() => {
    if (trackerView === "users") {
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
    params.set("section", "tracker");
    params.set("view", view);
    navigate(`/dashboard?${params.toString()}`);
  };

  const assignableUsers = (organization?.members || []).filter(
    (member) => member.role !== "ADMIN",
  );

  const taskAssignableUsers = useMemo(() => {
    const myMember = (organization?.members || []).find(
      (m) => m.userId === user?.id,
    );
    if (!myMember) return [];

    const myTeamIds = getMemberTeamIds(myMember);

    // Get OKR IDs where the current user is assigned
    const myOkrIds = okrs
      .filter((okr) => {
        const teamAssigned = okr.assignments?.some(
          (assign) =>
            assign.targetType === "TEAM" && myTeamIds.includes(assign.targetId),
        );
        const krAssigned = okr.keyResults?.some(
          (kr) =>
            kr.assignedUserId === user?.id || kr.assignedUser?.id === user?.id,
        );
        return teamAssigned || krAssigned;
      })
      .map((okr) => okr.id);

    return assignableUsers.filter((member) => {
      // Always allow assigning to self
      if (member.userId === user?.id) return true;

      // Check if they share any team
      const memberTeamIds = getMemberTeamIds(member);
      const sharesTeam = memberTeamIds.some((id) => myTeamIds.includes(id));
      if (sharesTeam) return true;

      // Check if they share any OKR
      const memberOkrIds = okrs
        .filter((okr) => {
          const teamAssigned = okr.assignments?.some(
            (assign) =>
              assign.targetType === "TEAM" &&
              memberTeamIds.includes(assign.targetId),
          );
          const krAssigned = okr.keyResults?.some(
            (kr) =>
              kr.assignedUserId === member.userId ||
              kr.assignedUser?.id === member.userId,
          );
          return teamAssigned || krAssigned;
        })
        .map((okr) => okr.id);

      const sharesOkr = memberOkrIds.some((id) => myOkrIds.includes(id));
      return sharesOkr;
    });
  }, [assignableUsers, organization?.members, user?.id, okrs]);
  const appraisalPurposeOptions = [
    "Promotion",
    "Salary Review",
    "Performance Review",
    "Layoffs",
    "Skills Gap Analysis",
    "Other",
  ];
  const appraisalSubjects =
    newAppraisal.scope === "TEAMS"
      ? teams.map((team) => ({
          id: team.id,
          label: team.name,
          meta: `${team.members?.length || 0} member${
            (team.members?.length || 0) === 1 ? "" : "s"
          }`,
        }))
      : assignableUsers.map((member) => ({
          id: member.user.id,
          label: member.user.name || member.user.email,
          meta: [
            member.user.jobTitle || member.role,
            getMemberTeamLabel(member),
          ]
            .filter(Boolean)
            .join(" • "),
        }));
  const normalizedAppraisalPurposes = useMemo(
    () =>
      newAppraisal.purposes
        .filter((purpose) => purpose !== "Other")
        .concat(
          newAppraisal.purposes.includes("Other") &&
            newAppraisal.otherPurpose.trim()
            ? [newAppraisal.otherPurpose.trim()]
            : [],
        ),
    [newAppraisal.purposes, newAppraisal.otherPurpose],
  );

  const currentOrgMember = (organization?.members || []).find(
    (member) => member.userId === user?.id,
  );
  const currentOrgMemberTeamIds = getMemberTeamIds(currentOrgMember);

  const alertRecipientUsers = isMember
    ? (organization?.members || []).filter(
        (member) =>
          member.userId !== user?.id &&
          (member.role === "ADMIN" ||
            (member.role === "TEAM_LEAD" &&
              getMemberTeamIds(member).some((teamId) =>
                currentOrgMemberTeamIds.includes(teamId),
              ))),
      )
    : isTeamLead
      ? (organization?.members || []).filter(
          (member) => member.role === "ADMIN",
        )
      : assignableUsers;

  const alertRecipientTeams = isTeamLead
    ? teamDistribution.filter((team) =>
        currentOrgMemberTeamIds.includes(team.teamId),
      )
    : teamDistribution;

  const openSendAlertModal = () => {
    setAlertForm((prev) => ({
      ...prev,
      targetType: isTeamLead ? "ADMINS" : "INDIVIDUAL",
      targetId: "",
    }));
    setShowSendAlertModal(true);
  };

  const teamLeadUsers = (organization?.members || []).filter(
    (member) => member.role === "TEAM_LEAD",
  );

  useEffect(() => {
    if (!showCreateAppraisalModal || !orgId) return;
    if (!newAppraisal.periodStart || !newAppraisal.periodEnd) {
      setAppraisalPreview(null);
      setSelectedOkrIds([]);
      return;
    }
    if (
      newAppraisal.scope !== "ORGANIZATION" &&
      newAppraisal.subjectIds.length === 0
    ) {
      setAppraisalPreview(null);
      setSelectedOkrIds([]);
      return;
    }

    let cancelled = false;
    const loadPreview = async () => {
      setAppraisalPreviewLoading(true);
      try {
        const res = await api.post(`/orgs/${orgId}/appraisals/preview`, {
          scope: newAppraisal.scope,
          subjectIds: newAppraisal.subjectIds,
          periodStart: newAppraisal.periodStart,
          periodEnd: newAppraisal.periodEnd,
          purposes: normalizedAppraisalPurposes,
          customFocus: newAppraisal.customFocus || undefined,
          selectedOkrIds: appraisalSelectionDirty ? selectedOkrIds : undefined,
        });
        if (cancelled) return;
        setAppraisalPreview(res.data);
        if (!appraisalSelectionDirty) {
          setSelectedOkrIds(res.data.selectedOkrIds || []);
        }
      } catch (error) {
        if (!cancelled) {
          setAppraisalPreview(null);
          setSelectedOkrIds([]);
          console.error("Failed to preview appraisal:", error);
        }
      } finally {
        if (!cancelled) setAppraisalPreviewLoading(false);
      }
    };

    loadPreview();
    return () => {
      cancelled = true;
    };
  }, [
    showCreateAppraisalModal,
    orgId,
    newAppraisal.scope,
    newAppraisal.subjectIds,
    newAppraisal.periodStart,
    newAppraisal.periodEnd,
    newAppraisal.customFocus,
    normalizedAppraisalPurposes,
    appraisalSelectionDirty,
    selectedOkrIds,
  ]);

  useEffect(() => {
    if (selectedTaskId) {
      fetchSubmissions(selectedTaskId);
      fetchActivity(selectedTaskId);
      const currentTask = allTasks.find((t) => t.id === selectedTaskId);
      setEditingDescriptionText(currentTask?.description || "");
      setIsEditingDescription(false);
    } else {
      setSubmissions([]);
      setActivityLogs([]);
      setEditingDescriptionText("");
      setIsEditingDescription(false);
    }
  }, [selectedTaskId, allTasks]);

  useEffect(() => {
    if (showCreateTaskModal && user?.id) {
      setNewTask((prev) => {
        if (!prev.assigneeId) {
          void loadLinkableOkrs(user.id);
          return { ...prev, assigneeId: user.id };
        }
        return prev;
      });
    }
  }, [showCreateTaskModal, user?.id]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (menuOpenTaskId) {
        setMenuOpenTaskId(null);
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, [menuOpenTaskId]);

  // Real-time socket listeners
  useEffect(() => {
    if (!organization?.id) return;
    const orgId = organization.id;
    const socket = connectSocket(orgId);

    const handleCreated = (task: any) => {
      setAllTasks((prev) => [task, ...prev]);
      setTasks((prev) => [task, ...prev]);
    };
    const handleUpdated = (task: any) => {
      setAllTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
    };
    const handleDeleted = ({ id }: { id: string }) => {
      setAllTasks((prev) => prev.filter((t) => t.id !== id));
      setTasks((prev) => prev.filter((t) => t.id !== id));
      if (selectedTaskId === id) setSelectedTaskId(null);
    };

    socket.on("task:created", handleCreated);
    socket.on("task:updated", handleUpdated);
    socket.on("task:deleted", handleDeleted);

    return () => {
      try {
        socket.off("task:created", handleCreated);
        socket.off("task:updated", handleUpdated);
        socket.off("task:deleted", handleDeleted);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (e) {
        /* ignore */
      }
    };
  }, [organization?.id, selectedTaskId]);

  useEffect(() => {
    // Check if we're in a reload loop (max 2 attempts)
    const reloadCount = parseInt(
      sessionStorage.getItem("orgReloadCount") || "0",
      10,
    );
    if (reloadCount >= 2) {
      console.error(
        "Too many org reload attempts, stopping to prevent infinite loop",
      );
      sessionStorage.removeItem("orgReloadCount");
      setLoading(false);
      setOrganization(null);
      setErrorDialog({
        isOpen: true,
        title: "Unable to Load",
        message:
          "We couldn't load your organization data. Please check your internet connection and refresh the page.",
      });
      return;
    }

    if (!orgId) {
      // Auto-select the first organization
      api
        .get("/orgs")
        .then((res) => {
          const organizations = Array.isArray(res.data) ? res.data : [];
          if (organizations.length > 0) {
            const firstOrg = organizations[0];
            localStorage.setItem("selectedOrgId", firstOrg.id);
            localStorage.setItem("selectedOrgRole", firstOrg.userRole);
            sessionStorage.setItem("orgReloadCount", "1");
            window.location.reload();
          } else {
            // No organizations available, show empty state
            sessionStorage.removeItem("orgReloadCount");
            setLoading(false);
            setOrganization(null);
          }
        })
        .catch(() => {
          console.error("Failed to fetch organizations");
          // Increment reload counter
          sessionStorage.setItem("orgReloadCount", String(reloadCount + 1));
          // Clear stale org data
          localStorage.removeItem("selectedOrgId");
          localStorage.removeItem("selectedOrgRole");
          localStorage.removeItem("selectedOrgName");

          if (reloadCount < 1) {
            // Only reload once more
            window.location.reload();
          } else {
            // Stop reloading, show error dialog
            sessionStorage.removeItem("orgReloadCount");
            setLoading(false);
            setErrorDialog({
              isOpen: true,
              title: "Connection Error",
              message:
                "Unable to load organizations. Please check your internet connection and try again.",
            });
          }
        });
      return;
    }

    // Validate that the selected org still exists and user has access
    setTasksLoading(true);
    api
      .get(`/orgs/${orgId}`)
      .then(() => {
        // Org is valid, proceed with fetching dashboard data
        sessionStorage.removeItem("orgReloadCount");
        fetchData();
      })
      .catch((error) => {
        // Org doesn't exist or user lost access
        console.error("Selected org is invalid or inaccessible:", error);
        localStorage.removeItem("selectedOrgId");
        localStorage.removeItem("selectedOrgRole");
        localStorage.removeItem("selectedOrgName");

        // Increment reload counter
        sessionStorage.setItem("orgReloadCount", String(reloadCount + 1));

        if (reloadCount < 1) {
          // Only reload once more to trigger auto-selection
          window.location.reload();
        } else {
          // Stop reloading to prevent infinite loop
          sessionStorage.removeItem("orgReloadCount");
          setTasksLoading(false);
          setLoading(false);
          setErrorDialog({
            isOpen: true,
            title: "Access Error",
            message:
              "Unable to access this organization. You may have been removed or the organization no longer exists.",
          });
        }
      });
  }, [orgId, filter, taskClientFilter, assigneeFilterId]);

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  const formatRole = (role: string) => {
    if (role === "ADMIN") return "Admin";
    if (role === "TEAM_LEAD") return "Team Lead";
    if (role === "MEMBER") return "Team Member";
    return role;
  };

  const formatMemberCategory = (stats?: MemberStatRecord) => {
    if (!stats) return "Regular";
    const total = stats.stats.total;
    if (total > 20) return "High Performer";
    if (total > 10) return "Active";
    if (total > 5) return "Moderate";
    return "New";
  };

  const formatJoinedDate = (date?: string | null) => {
    if (!date) return "Unknown";
    return new Date(date).toLocaleDateString();
  };

  // removed unused getCategoryStyles helper to fix TS6133 unused variable error

  const handleStatClick = (filterValue: TaskFilter) => {
    const params = new URLSearchParams(location.search);
    params.set("section", "task-tracker");
    params.set("filter", filterValue);
    navigate(`/dashboard?${params.toString()}`);
  };

  const handleFilterClick = (filterValue: TaskFilter) => {
    const params = new URLSearchParams(location.search);
    params.set("filter", filterValue);
    navigate(`/dashboard?${params.toString()}`);
  };

  const handleTeamClick = (teamId: string) => {
    setAssigneeFilterId(null);
    const params = new URLSearchParams(location.search);
    params.set("section", "team-tracker");
    params.set("teamId", teamId);
    navigate(`/dashboard?${params.toString()}`);
  };

  const handleOpenMemberDetail = (row: MemberRow) => {
    setSelectedMemberDetail(row);
  };

  const handleCloseMemberDetail = () => {
    setSelectedMemberDetail(null);
  };

  const memberRows = useMemo<MemberRow[]>(() => {
    if (!organization) return [];
    return (organization.members || [])
      .filter((member) => {
        if (member.role === "ADMIN" || member.userId === user?.id) return false;
        if (ownerFilter !== "all" && member.userId !== ownerFilter)
          return false;
        return true;
      })
      .map((member) => {
        const stats = memberStats.find((m) => m.userId === member.userId);
        const roleLabel =
          member.user.initialRole?.trim() || formatRole(member.role);
        const category = formatMemberCategory(stats);
        const teamName = getMemberTeamLabel(member) || "No team";
        return { member, stats, teamName, category, roleLabel };
      });
  }, [organization, ownerFilter, memberStats, teams, user?.id]);

  const fetchQuotes = async () => {
    if (!orgId) return;
    try {
      const res = await api.get(`/orgs/${orgId}/quotes`);
      setQuotes(res.data);
    } catch (error) {
      console.error("Failed to fetch quotes:", error);
    }
  };

  const handleAddQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !quoteForm.text.trim()) return;
    try {
      setQuoteSubmitting(true);
      await api.post(`/orgs/${orgId}/quotes`, quoteForm);
      setQuoteForm({ text: "", author: "" });
      await fetchQuotes();
    } catch (error: any) {
      showError("Error", error.response?.data?.error || "Failed to add quote");
    } finally {
      setQuoteSubmitting(false);
    }
  };

  const handleDeleteQuote = async (quoteId: string) => {
    if (!orgId || !window.confirm("Delete this quote?")) return;
    try {
      await api.delete(`/orgs/${orgId}/quotes/${quoteId}`);
      await fetchQuotes();
    } catch (error: any) {
      showError(
        "Error",
        error.response?.data?.error || "Failed to delete quote",
      );
    }
  };

  const fetchData = async () => {
    try {
      const isDeletedView = filter === "recently_deleted";
      const [tasksRes, statsRes, orgRes, okrRes, appraisalRes, quotesRes] =
        await Promise.all([
          api.get("/tasks", {
            params: {
              organizationId: orgId,
              view: isDeletedView ? "deleted" : "active",
              ...(taskClientFilter !== "all"
                ? { clientId: taskClientFilter }
                : {}),
            },
          }),
          api.get("/tasks/stats", {
            params: {
              organizationId: orgId,
              ...(taskClientFilter !== "all"
                ? { clientId: taskClientFilter }
                : {}),
            },
          }),
          api.get(`/orgs/${orgId}`),
          api.get(`/orgs/${orgId}/okrs`),
          api.get(`/orgs/${orgId}/appraisals`),
          api.get(`/orgs/${orgId}/quotes`),
        ]);

      setQuotes(quotesRes.data || []);

      // Fetch clients separately with error handling
      let clientsRes;
      try {
        clientsRes = await api.get(`/orgs/${orgId}/clients`);
      } catch (error) {
        console.error("Failed to fetch clients:", error);
        clientsRes = { data: [] };
      }

      const role = orgRes.data.userRole;
      const orgMembers = orgRes.data.members || [];
      localStorage.setItem("selectedOrgRole", role);

      if (role === "ADMIN") {
        try {
          const [teamsRes, invitesRes, memberStatsRes, distributionRes] =
            await Promise.all([
              api.get(`/orgs/${orgId}/teams`),
              api.get(`/orgs/${orgId}/invites`),
              api.get("/tasks/team-stats", {
                params: { organizationId: orgId },
              }),
              api.get("/tasks/team-distribution", {
                params: { organizationId: orgId },
              }),
            ]);
          setTeams(teamsRes.data || []);
          setInvites(invitesRes.data || []);
          // Filter out ADMIN users from member stats
          const filteredMemberStats = (memberStatsRes.data || []).filter(
            (m: any) => {
              const member = orgMembers.find(
                (orgMember: any) => orgMember.userId === m.userId,
              );
              return member?.role !== "ADMIN";
            },
          );
          setMemberStats(filteredMemberStats);
          setTeamDistribution(distributionRes.data || []);
        } catch (error) {
          console.error("Failed to fetch admin data:", error);
          setTeams([]);
          setInvites([]);
          setMemberStats([]);
          setTeamDistribution([]);
        }
      } else if (role === "TEAM_LEAD") {
        try {
          const [memberStatsRes, distRes] = await Promise.all([
            api.get("/tasks/team-stats", { params: { organizationId: orgId } }),
            api.get("/tasks/team-distribution", {
              params: { organizationId: orgId },
            }),
          ]);
          const distributionData = distRes.data || [];
          setTeams(
            distributionData.map((item: any) => ({
              id: item.teamId,
              name: item.teamName,
              leadUser: item.leadUser,
              stats: item.stats,
              members: [],
              people: item.people || [],
            })),
          );
          setInvites([]);
          // Filter out ADMIN users from member stats
          const filteredMemberStats = (memberStatsRes.data || []).filter(
            (m: any) => {
              const member = orgMembers.find(
                (orgMember: any) => orgMember.userId === m.userId,
              );
              return member?.role !== "ADMIN";
            },
          );
          setMemberStats(filteredMemberStats);
          setTeamDistribution(distributionData);
        } catch (error) {
          console.error("Failed to fetch team lead data:", error);
          setTeams([]);
          setInvites([]);
          setMemberStats([]);
          setTeamDistribution([]);
        }
      } else {
        setTeams([]);
        setInvites([]);
        setMemberStats([]);
        setTeamDistribution([]);
      }

      const allFetchedTasks = tasksRes.data as Task[];
      setAllTasks(allFetchedTasks);

      let filteredTasks = allFetchedTasks;
      if (assigneeFilterId && currentSection === "team-tracker") {
        filteredTasks = filteredTasks.filter(
          (t: Task) => t.assignee?.id === assigneeFilterId,
        );
      }

      if (filter === "my") {
        filteredTasks = filteredTasks.filter(
          (t: Task) => t.assignee?.id === user?.id,
        );
      } else if (filter === "supporting") {
        filteredTasks = filteredTasks.filter(
          (t: Task) => t.supporter?.id === user?.id,
        );
      } else if (filter === "overdue") {
        filteredTasks = filteredTasks.filter(
          (t: Task) => !isTaskCompleted(t.status) && isDueDateOverdue(t.dueDate),
        );
      } else if (filter === "pending_approval") {
        filteredTasks = filteredTasks.filter(
          (t: Task) => t.approvalStatus === "PENDING",
        );
      } else if (filter !== "all" && filter !== "recently_deleted") {
        const statusMap: Record<string, string | string[]> = {
          pending: "CREATED",
          created: "CREATED",
          in_progress: "IN_PROGRESS",
          completed: ["COMPLETED", "DONE"],
        };
        filteredTasks = filteredTasks.filter(
          (t: Task) => {
            const matchingStatuses = statusMap[filter];
            return Array.isArray(matchingStatuses)
              ? matchingStatuses.includes(t.status)
              : t.status === matchingStatuses;
          },
        );
      }

      setTasks(filteredTasks);
      setStats(statsRes.data);
      setOrganization(orgRes.data);

      // Initialize profile form with user data
      const currentUser = orgRes.data.members?.find(
        (m: any) => m.userId === user?.id,
      );
      if (currentUser) {
        setProfileForm({
          name: currentUser.user.name || "",
          jobTitle: currentUser.user.jobTitle || "",
        });
      }

      setOkrs(okrRes.data || []);

      setAppraisals(appraisalRes.data || []);
      setClients(clientsRes.data || []);

      // No additional defaults needed for new tasks
    } catch (error: any) {
      console.error("Failed to fetch dashboard data:", error);
      // Set organization to null on error to prevent rendering with stale data
      setOrganization(null);
      // Show error message to user
      const errorMessage =
        error.response?.data?.error || error.message || "Failed to load data";
      showError("Dashboard Error", `Error loading dashboard: ${errorMessage}`);
    } finally {
      setTasksLoading(false);
      setLoading(false);
    }
  };

  const selectedTask =
    allTasks.find((task) => task.id === selectedTaskId) || null;
  const isDeletedView = filter === "recently_deleted";
  const canDeleteTask = (task: Task) => {
    if (isAdmin) return true;
    if (task.createdByUserId === user?.id) return true;
    if (isTeamLead) {
      const isCreatorMember = task.createdByUserId && ledTeamMemberIds.includes(task.createdByUserId);
      const isAssigneeMember = task.assignee?.id && ledTeamMemberIds.includes(task.assignee.id);
      const isTaskTeamLed = task.taskTeams?.some((tt) => ledTeamIds.includes(tt.team.id));
      if (isCreatorMember || isAssigneeMember || isTaskTeamLed) {
        return true;
      }
    }
    return false;
  };
  const focusMembers =
    new URLSearchParams(location.search).get("focus") === "members";

  const isOverdue = (task: Task) => {
    if (!task.dueDate || isTaskCompleted(task.status)) return false;
    return isDueDateOverdue(task.dueDate);
  };

  const getDaysOverdue = (task: Task) => {
    if (!task.dueDate) return 0;
    const dueDate = parseDateOnly(task.dueDate);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
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
    if (creatingTask) return;

    try {
      if (!newTask.assigneeId) {
        showError("Validation Error", "Primary assignee is required");
        return;
      }
      if (newTask.supporterId && newTask.supporterId === newTask.assigneeId) {
        showError(
          "Validation Error",
          "Supporter cannot be the same as primary assignee",
        );
        return;
      }
      const okrDateViolation = findTaskOkrDateViolation(
        newTask.dueDate,
        newTask.keyResultIds,
        newTaskLinkableOkrs,
      );
      if (okrDateViolation) {
        showError("Validation Error", okrDateViolation);
        return;
      }

      setCreatingTask(true);
      const createResponse = await api.post("/tasks", {
        // send only createable fields
        title: newTask.title,
        description: newTask.description,
        priority: newTask.priority,
        dueDate: newTask.dueDate,
        assigneeId: newTask.assigneeId,
        supporterId: newTask.supporterId,
        alertTeamLead: newTask.alertTeamLead,
        organizationId: orgId,
        status: newTask.status,
      });

      if (newTask.keyResultIds.length > 0 && createResponse.data?.id) {
        await api.put(`/tasks/${createResponse.data.id}/kr-impacts`, {
          impacts: newTask.keyResultIds.map((okrKeyResultId) => ({
            okrKeyResultId,
            actualValue: 0,
          })),
        });
      }

      setNewTask({
        title: "",
        description: "",
        priority: "LOW",
        dueDate: "",
        assigneeId: user?.id || "",
        supporterId: "",
        alertTeamLead: false,
        okrId: "",
        keyResultIds: [],
        status: "TODO",
      });
      if (!createMore) {
        setShowCreateTaskModal(false);
      }
      await fetchData();
    } catch (error: any) {
      const errorData = error.response?.data?.error;
      showError(
        "Error",
        (typeof errorData === "object" ? errorData.message : errorData) ||
          "Failed to create task",
      );
    } finally {
      setCreatingTask(false);
    }
  };

  const handleOpenEditTask = (task: Task) => {
    setEditTask({
      id: task.id,
      title: task.title,
      description: task.description || "",
      priority: task.priority,
      dueDate: task.dueDate ? task.dueDate.slice(0, 10) : "",
      assigneeId: task.assignee?.id || "",
      supporterId: task.supporter?.id || "",
      alertTeamLead: task.alertTeamLead || false,
      okrId: (task as any).okrId || "",
      keyResultIds: (task.krImpacts || []).map(
        (impact) => impact.okrKeyResult.id,
      ),
      status: task.status || "TODO",
    });
    if (task.assignee?.id) {
      void loadLinkableOkrs(task.assignee.id);
    }
    setShowEditTaskModal(true);
  };

  const handleDuplicateTask = (task: Task) => {
    const isDelegated = task.assignee?.id
      ? task.assignee.id !== user?.id
      : false;
    setNewTask({
      title: `${task.title} (Copy)`,
      description: task.description || "",
      priority: task.priority,
      dueDate: task.dueDate ? task.dueDate.slice(0, 10) : "",
      assigneeId: task.assignee?.id || "",
      supporterId: task.supporter?.id || "",
      alertTeamLead: task.alertTeamLead || isDelegated,
      okrId: (task as any).okrId || "",
      keyResultIds: (task.krImpacts || []).map(
        (impact) => impact.okrKeyResult.id,
      ),
      status: task.status || "TODO",
    });
    if (task.assignee?.id) {
      void loadLinkableOkrs(task.assignee.id);
    }
    setShowCreateTaskModal(true);
  };

  const handleUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTask.assigneeId) {
      showError("Validation Error", "Primary assignee is required");
      return;
    }
    if (editTask.supporterId && editTask.supporterId === editTask.assigneeId) {
      showError(
        "Validation Error",
        "Supporter cannot be the same as primary assignee",
      );
      return;
    }
    const okrDateViolation = findTaskOkrDateViolation(
      editTask.dueDate,
      editTask.keyResultIds,
      editTaskLinkableOkrs,
    );
    if (okrDateViolation) {
      showError("Validation Error", okrDateViolation);
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
        alertTeamLead: editTask.alertTeamLead,
        status: editTask.status,
      });

      await api.put(`/tasks/${editTask.id}/kr-impacts`, {
        impacts: editTask.keyResultIds.map((okrKeyResultId) => ({
          okrKeyResultId,
          actualValue: 0,
        })),
      });

      setShowEditTaskModal(false);
      await fetchData();
      if (selectedTaskId === editTask.id) {
        await fetchActivity(editTask.id);
      }
    } catch (error: any) {
      const errorData = error.response?.data?.error;
      showError(
        "Error",
        (typeof errorData === "object" ? errorData.message : errorData) ||
          "Failed to update task",
      );
    }
  };

  const handleCreateOkr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creatingOkr) return;
    try {
      setCreatingOkr(true);
      const assignments = [];
      if (newOkr.assignedToTeamId) {
        assignments.push({
          targetType: "TEAM",
          targetId: newOkr.assignedToTeamId,
        });
      }
      newOkr.supportedByTeamIds.forEach((teamId) => {
        assignments.push({ targetType: "TEAM", targetId: teamId });
      });

      const keyResultsPayload = newOkr.keyResults
        .map((kr) => ({
          ...kr,
          title: kr.title.trim(),
          assignedUserId: (kr.ownerUserIds || [])[0] || null,
          ownerUserIds: kr.ownerUserIds || [],
          isGeneral: (kr.ownerUserIds || []).length === 0,
        }))
        .filter((kr) => kr.title);

      const memberOwnerIds = Array.from(
        new Set(
          keyResultsPayload
            .flatMap((kr) => kr.ownerUserIds || [])
            .filter(Boolean),
        ),
      );
      memberOwnerIds.forEach((userId) => {
        assignments.push({ targetType: "MEMBER", targetId: userId });
      });

      await api.post(`/orgs/${orgId}/okrs`, {
        ...newOkr,
        assignments,
        keyResults: keyResultsPayload,
      });
      setNewOkr({
        title: "",
        description: "",
        periodStart: "",
        periodEnd: "",
        status: "NOT_YET_OPEN",
        assignedToTeamId: "",
        supportedByTeamIds: [],
        keyResults: [createEmptyKrForm()],
      });
      setShowCreateOkrModal(false);
      setCreatingOkr(false);
      await fetchData();
    } catch (error: any) {
      const errorData = error.response?.data?.error;
      showError(
        "Error",
        (typeof errorData === "object" ? errorData.message : errorData) ||
          "Failed to create OKR",
      );
      setCreatingOkr(false);
    }
  };

  const handleOpenEditOkr = (okr: Okr) => {
    setEditingOkr(okr);
    const assignedToTeamId =
      okr.assignments?.find((a) => a.targetType === "TEAM")?.targetId || "";
    const supportedByTeamIds =
      okr.assignments
        ?.filter((a) => a.targetType === "TEAM")
        .map((a) => a.targetId)
        .filter((teamId) => teamId !== assignedToTeamId) || [];

    setEditOkrForm({
      title: okr.title,
      description: okr.description || "",
      periodStart: okr.periodStart
        ? new Date(okr.periodStart).toISOString().split("T")[0]
        : "",
      periodEnd: okr.periodEnd
        ? new Date(okr.periodEnd).toISOString().split("T")[0]
        : "",
      assignedToTeamId: assignedToTeamId,
      supportedByTeamIds: supportedByTeamIds,
      keyResults: okr.keyResults?.map((kr) => ({
        id: (kr as any).id,
        title: kr.title,
        assignedUserId: kr.assignedUserId,
        ownerUserIds:
          (kr as any).ownerUserIds ||
          (kr as any).ownerIds ||
          (kr.assignedUserId ? [kr.assignedUserId] : []),
      })) || [createEmptyKrForm()],
      status: okr.status || "OPEN",
    });
    setShowEditOkrModal(true);
  };

  const handleUpdateOkr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOkr) return;
    try {
      const assignments = [];
      if (editOkrForm.assignedToTeamId) {
        assignments.push({
          targetType: "TEAM",
          targetId: editOkrForm.assignedToTeamId,
        });
      }
      editOkrForm.supportedByTeamIds.forEach((teamId) => {
        if (teamId !== editOkrForm.assignedToTeamId) {
          assignments.push({ targetType: "TEAM", targetId: teamId });
        }
      });

      const keyResultsPayload = editOkrForm.keyResults
        .map((kr) => ({
          ...kr,
          title: kr.title.trim(),
          assignedUserId: (kr.ownerUserIds || [])[0] || null,
          ownerUserIds: kr.ownerUserIds || [],
          isGeneral: (kr.ownerUserIds || []).length === 0,
        }))
        .filter((kr) => kr.title);

      const memberOwnerIds = Array.from(
        new Set(
          keyResultsPayload
            .flatMap((kr) => kr.ownerUserIds || [])
            .filter(Boolean),
        ),
      );
      memberOwnerIds.forEach((userId) => {
        assignments.push({ targetType: "MEMBER", targetId: userId });
      });

      await api.patch(`/orgs/${orgId}/okrs/${editingOkr.id}`, {
        ...editOkrForm,
        assignments,
        keyResults: keyResultsPayload,
      });
      setShowEditOkrModal(false);
      setEditingOkr(null);
      await fetchData();
    } catch (error: any) {
      showError("Error", error.response?.data?.error || "Failed to update OKR");
    }
  };

  const handleDeleteOkr = async (okrId: string) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this OKR? This action cannot be undone.",
      )
    )
      return;
    try {
      await api.delete(`/orgs/${orgId}/okrs/${okrId}`);
      await fetchData();
    } catch (error: any) {
      showError("Error", error.response?.data?.error || "Failed to delete OKR");
    }
  };

  const handleDuplicateOkr = async (okr: Okr) => {
    if (
      !window.confirm(
        `Are you sure you want to duplicate the OKR "${okr.title}"?`,
      )
    ) {
      return;
    }
    try {
      await api.post(`/orgs/${orgId}/okrs/${okr.id}/duplicate`);
      await fetchData();
    } catch (error: any) {
      showError(
        "Error",
        error.response?.data?.error || "Failed to duplicate OKR",
      );
    }
  };

  const handleCloseOkr = async (okr: Okr) => {
    if (
      !window.confirm(
        `Close the OKR "${okr.title}"? This will mark it as completed.`,
      )
    ) {
      return;
    }

    try {
      await api.patch(`/orgs/${orgId}/okrs/${okr.id}`, {
        status: "COMPLETED",
      });
      await fetchData();
    } catch (error: any) {
      showError("Error", error.response?.data?.error || "Failed to close OKR");
    }
  };

  const handleCreateAppraisal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (generatingAppraisal) return;
    try {
      if (
        newAppraisal.scope !== "ORGANIZATION" &&
        newAppraisal.subjectIds.length === 0
      ) {
        showError("Validation Error", "Select at least one appraisal subject");
        return;
      }
      if (!newAppraisal.periodStart || !newAppraisal.periodEnd) {
        showError("Validation Error", "Select an appraisal date range");
        return;
      }
      setGeneratingAppraisal(true);
      await api.post(`/orgs/${orgId}/appraisals/generate`, {
        scope: newAppraisal.scope,
        subjectIds: newAppraisal.subjectIds,
        outputFormat: newAppraisal.outputFormat,
        periodStart: newAppraisal.periodStart,
        periodEnd: newAppraisal.periodEnd,
        purposes: normalizedAppraisalPurposes,
        customFocus: newAppraisal.customFocus || undefined,
        selectedOkrIds,
      });
      setNewAppraisal({
        scope: "INDIVIDUALS",
        subjectIds: [],
        outputFormat: "SINGLE_PDF",
        periodStart: "",
        periodEnd: "",
        purposes: ["Performance Review"],
        otherPurpose: "",
        customFocus: "",
      });
      setSelectedOkrIds([]);
      setAppraisalPreview(null);
      setAppraisalSelectionDirty(false);
      setShowCreateAppraisalModal(false);
      await fetchData();
    } catch (error: any) {
      const errorData = error.response?.data?.error;
      showError(
        "Error",
        (typeof errorData === "object" ? errorData.message : errorData) ||
          "Failed to generate appraisal",
      );
    } finally {
      setGeneratingAppraisal(false);
    }
  };

  const handleDeleteAppraisal = async (appraisalId: string) => {
    if (
      !window.confirm(
        "Delete this appraisal report? This action cannot be undone.",
      )
    )
      return;

    try {
      await api.delete(`/orgs/${orgId}/appraisals/${appraisalId}`);
      setAppraisals((prev) =>
        prev.filter((appraisal) => appraisal.id !== appraisalId),
      );
      await fetchData();
    } catch (error: any) {
      showError(
        "Error",
        error.response?.data?.error || "Failed to delete appraisal",
      );
    }
  };

  const resetTeamForm = () => {
    setTeamForm({ name: "", leadUserId: "", memberUserIds: [] });
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamForm.name.trim()) {
      showError("Validation Error", "Team name is required");
      return;
    }
    try {
      await api.post(`/orgs/${orgId}/teams`, teamForm);
      setShowCreateTeamModal(false);
      resetTeamForm();
      await fetchData();
    } catch (error: any) {
      const errorData = error.response?.data?.error;
      showError(
        "Error",
        (typeof errorData === "object" ? errorData.message : errorData) ||
          "Failed to create team",
      );
    }
  };

  const openEditTeam = (team: Team) => {
    setEditingTeam(team);
    setTeamForm({
      name: team.name,
      leadUserId: team.leadUser?.id || "",
      memberUserIds: (team.members || [])
        .map((m) => m.userId || m.id || "")
        .filter(Boolean),
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
      showError(
        "Error",
        (typeof errorData === "object" ? errorData.message : errorData) ||
          "Failed to update team",
      );
    }
  };

  const handleDeleteTeam = async (teamId: string) => {
    if (!window.confirm("Delete this team?")) return;
    try {
      await api.delete(`/orgs/${orgId}/teams/${teamId}`);
      if (editingTeam?.id === teamId) {
        setEditingTeam(null);
        resetTeamForm();
      }
      await fetchData();
    } catch (error: any) {
      const errorData = error.response?.data?.error;
      showError(
        "Error",
        (typeof errorData === "object" ? errorData.message : errorData) ||
          "Failed to delete team",
      );
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !inviteEmail.trim()) return;

    try {
      setTeamError("");
      setInviting(true);
      await api.post(`/orgs/${orgId}/invites`, {
        email: inviteEmail.trim(),
        role: inviteRole,
        name: inviteName.trim() || undefined,
        teamIds: inviteTeamIds.length > 0 ? inviteTeamIds : undefined,
        primaryTeamId: inviteTeamIds[0] || undefined,
        category: inviteCategory.trim() || undefined,
      });
      setInviteEmail("");
      setInviteRole("MEMBER");
      setInviteName("");
      setInviteTeamIds([]);
      setInviteCategory("");
      const invitesRes = await api.get(`/orgs/${orgId}/invites`);
      setInvites(invitesRes.data || []);
    } catch (error: any) {
      const errorData = error.response?.data?.error;
      const message =
        typeof errorData === "object" ? errorData.message : errorData;
      setTeamError(message || "Failed to send invite");
    } finally {
      setInviting(false);
    }
  };

  const handleResendInvite = async (inviteId: string) => {
    if (!orgId || !window.confirm("Resend this invitation?")) return;

    try {
      await api.post(`/orgs/${orgId}/invites/${inviteId}/resend`);
      const invitesRes = await api.get(`/orgs/${orgId}/invites`);
      setInvites(invitesRes.data || []);
    } catch (error: any) {
      const errorData = error.response?.data?.error;
      const message =
        typeof errorData === "object" ? errorData.message : errorData;
      showError("Error", message || "Failed to resend invite");
    }
  };

  const handleDeleteInvite = async (inviteId: string) => {
    if (!orgId) return;
    if (!window.confirm("Delete this invite? This action cannot be undone."))
      return;

    try {
      await api.delete(`/orgs/${orgId}/invites/${inviteId}`);
      const invitesRes = await api.get(`/orgs/${orgId}/invites`);
      setInvites(invitesRes.data || []);
    } catch (error: any) {
      const errorData = error.response?.data?.error;
      const message =
        typeof errorData === "object" ? errorData.message : errorData;
      showError("Error", message || "Failed to delete invite");
    }
  };

  // Bulk invite handlers
  const handleDownloadSampleSheet = () => {
    const data = [
      { Email: "john.doe@company.com", Team: "Growth", Role: "Team Lead" },
      { Email: "jane.smith@company.com", Team: "Operations", Role: "Member" },
      { Email: "bob.wilson@company.com", Team: "Growth", Role: "Member" },
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();

    // Set column widths
    ws["!cols"] = [
      { wch: 30 }, // Email
      { wch: 20 }, // Team
      { wch: 12 }, // Role
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Invite Template");

    // Add instructions sheet
    const instructions = [
      ["BULK INVITE INSTRUCTIONS"],
      [""],
      ["Required Columns:"],
      ["- Email: Work email address (required)"],
      ["- Role: Team Lead or Member (required)"],
      [""],
      ["Optional Columns:"],
      ["- Team: Team name (will be created automatically if it doesn't exist)"],
      [""],
      ["Notes:"],
      ["- Maximum file size: 5MB"],
      ["- Supported formats: .xlsx, .xls, .csv"],
      ["- Teams will be created automatically from the upload"],
      ["- Team leads are identified by the Team Lead role"],
      ["- Invites expire after 72 hours"],
    ];
    const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
    wsInstructions["!cols"] = [{ wch: 60 }];
    XLSX.utils.book_append_sheet(wb, wsInstructions, "Instructions");

    XLSX.writeFile(wb, "bulk-invite-template.xlsx");
  };

  const handleBulkInviteFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
    ];
    if (!validTypes.includes(file.type) && !file.name.endsWith(".csv")) {
      showError(
        "Invalid File",
        "Invalid file type. Please upload an Excel or CSV file.",
      );
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      showError("File Too Large", "File size must be less than 5MB");
      return;
    }

    setBulkInviteFile(file);
    setBulkInviteErrors([]);
    setBulkInviteResult(null);

    try {
      // Read and parse file
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet);

      if (jsonData.length === 0) {
        setBulkInviteErrors([
          { row: 1, email: "", error: "Spreadsheet is empty" },
        ]);
        return;
      }

      // Validate columns
      const requiredColumns = ["Email", "Team", "Role"];
      const firstRow = jsonData[0];
      const missingColumns = requiredColumns.filter(
        (col) => !(col in firstRow),
      );

      if (missingColumns.length > 0) {
        setBulkInviteErrors([
          {
            row: 1,
            email: "",
            error: `Missing columns: ${missingColumns.join(", ")}. Required: Email, Team, Role`,
          },
        ]);
        return;
      }

      // Show preview (first 10 rows)
      setBulkInvitePreview(jsonData.slice(0, 10));
    } catch (error: any) {
      setBulkInviteErrors([
        { row: 1, email: "", error: error.message || "Failed to parse file" },
      ]);
    }
  };

  const handleBulkInviteSubmit = async () => {
    if (!bulkInviteFile || !orgId) return;

    try {
      setBulkInviteSubmitting(true);
      setBulkInviteErrors([]);

      const formData = new FormData();
      formData.append("file", bulkInviteFile);

      const response = await api.post(`/orgs/${orgId}/invites/bulk`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      setBulkInviteResult(response.data);

      // Refresh invites list
      const invitesRes = await api.get(`/orgs/${orgId}/invites`);
      setInvites(invitesRes.data || []);
    } catch (error: any) {
      const errorData = error.response?.data?.error;
      const message =
        typeof errorData === "object" ? errorData.message : errorData;
      setBulkInviteErrors([
        {
          row: 0,
          email: "",
          error: message || "Failed to process bulk invite",
        },
      ]);
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
    const common = {
      width: 20,
      height: 20,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round" as const,
      strokeLinejoin: "round" as const,
    };
    switch (iconName) {
      case "settings":
        return (
          <svg {...common}>
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        );
      case "support":
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
    if (!window.confirm("Remove this member from the organization?")) return;

    try {
      await api.delete(`/orgs/${orgId}/members/${memberId}`);
      await fetchData();
    } catch (error: any) {
      const errorData = error.response?.data?.error;
      const message =
        typeof errorData === "object" ? errorData.message : errorData;
      showError("Error", message || "Failed to remove member");
    }
  };

  const handleReactivateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;
    setReactivateError("");
    setReactivateSuccess("");
    if (!reactivateEmail.trim()) {
      setReactivateError("Email is required");
      return;
    }
    try {
      setReactivateLoading(true);
      await api.post(`/orgs/${orgId}/members/reactivate`, {
        email: reactivateEmail.trim(),
        role: reactivateRole,
      });
      setReactivateSuccess(
        `Member reactivated successfully as ${reactivateRole.charAt(0) + reactivateRole.slice(1).toLowerCase()}.`,
      );
      setReactivateEmail("");
      setReactivateRole("MEMBER");
      await fetchData();
    } catch (error: any) {
      const errorData = error.response?.data?.error;
      const message =
        typeof errorData === "object" ? errorData.message : errorData;
      setReactivateError(message || "Failed to reactivate member");
    } finally {
      setReactivateLoading(false);
    }
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError("");
    setProfileSuccess("");

    if (!profileForm.name.trim()) {
      setProfileError("Name is required");
      return;
    }

    try {
      setProfileUpdating(true);
      await api.put(`/auth/users/${user?.id}`, {
        name: profileForm.name.trim(),
        jobTitle: profileForm.jobTitle.trim() || null,
      });
      setProfileSuccess("Profile updated successfully");
      await fetchData();
    } catch (error: any) {
      setProfileError(
        error.response?.data?.error || "Failed to update profile",
      );
    } finally {
      setProfileUpdating(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError("New passwords do not match");
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters");
      return;
    }

    try {
      setPasswordChanging(true);
      await api.post("/auth/change-password", {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordSuccess("Password changed successfully");
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch (error: any) {
      setPasswordError(
        error.response?.data?.error || "Failed to change password",
      );
    } finally {
      setPasswordChanging(false);
    }
  };

  const renderSettingsSection = () => {
    return (
      <div className="settings-view">
        <div className="settings-header">
          <h2>Account Settings</h2>
          <p className="section-subtitle">
            Manage your account security and organization preferences
          </p>
        </div>

        <div className="settings-grid">
          <div className="settings-card">
            <div className="card-header">
              <div className="card-icon">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <h3>Profile</h3>
            </div>
            <p className="card-description">
              Update your name and professional role
            </p>

            <form onSubmit={handleProfileUpdate} className="settings-form">
              {profileError && (
                <div className="alert alert-error">{profileError}</div>
              )}
              {profileSuccess && (
                <div className="alert alert-success">{profileSuccess}</div>
              )}

              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={profileForm.name}
                  onChange={(e) =>
                    setProfileForm({
                      ...profileForm,
                      name: e.target.value,
                    })
                  }
                  placeholder="Your name"
                  required
                />
              </div>
              <div className="form-group">
                <label>Professional Role (Optional)</label>
                <input
                  type="text"
                  value={profileForm.jobTitle}
                  onChange={(e) =>
                    setProfileForm({
                      ...profileForm,
                      jobTitle: e.target.value,
                    })
                  }
                  placeholder="e.g., Software Engineer, Marketer, Designer"
                />
              </div>
              <button
                type="submit"
                className="btn-primary"
                disabled={profileUpdating}
              >
                {profileUpdating ? "Updating..." : "Update Profile"}
              </button>
            </form>
          </div>

          <div className="settings-card">
            <div className="card-header">
              <div className="card-icon">{getSidebarIcon("settings")}</div>
              <h3>Security</h3>
            </div>
            <p className="card-description">
              Change your password to keep your account secure
            </p>

            <form onSubmit={handlePasswordChange} className="settings-form">
              {passwordError && (
                <div className="alert alert-error">{passwordError}</div>
              )}
              {passwordSuccess && (
                <div className="alert alert-success">{passwordSuccess}</div>
              )}

              <div className="form-group">
                <label>Current Password</label>
                <PasswordInput
                  value={passwordForm.currentPassword}
                  onChange={(e) =>
                    setPasswordForm({
                      ...passwordForm,
                      currentPassword: e.target.value,
                    })
                  }
                  placeholder="••••••••"
                  required
                />
              </div>
              <div className="form-group">
                <label>New Password</label>
                <PasswordInput
                  value={passwordForm.newPassword}
                  onChange={(e) =>
                    setPasswordForm({
                      ...passwordForm,
                      newPassword: e.target.value,
                    })
                  }
                  placeholder="••••••••"
                  required
                />
              </div>
              <div className="form-group">
                <label>Confirm New Password</label>
                <PasswordInput
                  value={passwordForm.confirmPassword}
                  onChange={(e) =>
                    setPasswordForm({
                      ...passwordForm,
                      confirmPassword: e.target.value,
                    })
                  }
                  placeholder="••••••••"
                  required
                />
              </div>
              <button
                type="submit"
                className="btn-primary"
                disabled={passwordChanging}
              >
                {passwordChanging ? "Updating..." : "Update Password"}
              </button>
            </form>
          </div>

          {isAdmin && (
            <>
              <div className="settings-card quotes-management">
                <div className="card-header">
                  <div className="card-icon">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M17 6.1L12.7 10.4M12.7 10.4L8.4 6.1" />
                      <circle cx="12" cy="12" r="10" />
                      <path d="M11 16h2" />
                    </svg>
                  </div>
                  <h3>Quotes Management</h3>
                </div>
                <p className="card-description">
                  Add motivational quotes or announcements for your organization
                </p>

                <form onSubmit={handleAddQuote} className="settings-form">
                  <div className="form-group">
                    <label>Quote Text</label>
                    <textarea
                      value={quoteForm.text}
                      onChange={(e) =>
                        setQuoteForm({ ...quoteForm, text: e.target.value })
                      }
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
                      onChange={(e) =>
                        setQuoteForm({ ...quoteForm, author: e.target.value })
                      }
                      placeholder="e.g. CEO or Anonymous"
                    />
                  </div>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={quoteSubmitting}
                  >
                    {quoteSubmitting ? "Adding..." : "Add Quote"}
                  </button>
                </form>

                {quotes.length > 0 && (
                  <div className="quotes-list">
                    <h4>Active Quotes ({quotes.length})</h4>
                    <div className="quotes-container">
                      {quotes.map((q) => (
                        <div key={q.id} className="quote-item">
                          <div className="quote-item-content">
                            <p className="quote-text">"{q.text}"</p>
                            {q.author && (
                              <small className="quote-author">
                                — {q.author}
                              </small>
                            )}
                          </div>
                          <button
                            type="button"
                            className="delete-quote-btn"
                            onClick={() => handleDeleteQuote(q.id)}
                            title="Delete Quote"
                            aria-label="Delete quote"
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
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
          <div className="support-icon">{getSidebarIcon("support")}</div>
          <h2>How can we help?</h2>
          <p>
            Have questions or need assistance? Our support team is here to help
            you get the most out of Apraizal.
          </p>

          <div className="contact-methods">
            <div className="contact-method">
              <strong>Email Support</strong>
              <p>Contact us anytime at:</p>
              <a href="mailto:Hello@apraizal.com" className="support-email">
                Hello@apraizal.com
              </a>
            </div>
          </div>

          <a
            href="mailto:Hello@apraizal.com"
            className="btn-primary"
            style={{ textDecoration: "none", display: "inline-block" }}
          >
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
      await api.post(`/orgs/${orgId}/clients`, {
        name: clientFormName,
        visibility: clientFormVisibility,
      });
      setClientFormName("");
      setClientFormVisibility("ORG_WIDE");
      setShowCreateClientModal(false);
      await fetchData();
    } catch (error: any) {
      const errorData = error.response?.data?.error;
      showError(
        "Error",
        (typeof errorData === "object" ? errorData.message : errorData) ||
          "Failed to create client",
      );
    }
  };

  const handleUpdateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !editingClient || !clientFormName.trim()) return;
    try {
      await api.patch(`/orgs/${orgId}/clients/${editingClient.id}`, {
        name: clientFormName,
        visibility: clientFormVisibility,
      });
      setEditingClient(null);
      setClientFormName("");
      await fetchData();
    } catch (error: any) {
      const errorData = error.response?.data?.error;
      showError(
        "Error",
        (typeof errorData === "object" ? errorData.message : errorData) ||
          "Failed to update client",
      );
    }
  };

  const handleAddLink = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post(`/tasks/${newLink.taskId}/attachments/link`, {
        url: newLink.url,
        fileName: newLink.fileName || undefined,
      });
      setNewLink({ taskId: "", url: "", fileName: "" });
      setShowAddLinkModal(false);
      await fetchData();
    } catch {
      showError("Error", "Failed to attach link");
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, newStatus: string) => {
    try {
      await api.put(`/tasks/${taskId}`, { status: newStatus });
      await fetchData();
      if (selectedTaskId === taskId) {
        await fetchActivity(taskId);
      }
    } catch {
      showError("Error", "Failed to update task");
    }
  };

  const handleApprovalAction = async (
    taskId: string,
    action: "APPROVE" | "REJECT",
    notes?: string,
  ) => {
    if (action === "REJECT" && notes === undefined) {
      const task =
        tasks.find((item) => item.id === taskId) ||
        allTasks.find((item) => item.id === taskId);
      setTaskReviewDialog({
        taskId,
        taskTitle: task?.title || "this task",
        action: "REJECT",
      });
      setTaskReviewNotes("");
      return;
    }

    try {
      await api.put(`/tasks/${taskId}`, {
        approvalAction: action,
        approvalNotes: notes || null,
      });
      setTaskReviewDialog(null);
      setTaskReviewNotes("");
      await fetchData();
    } catch {
      showError("Error", "Failed to perform approval action");
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await api.delete(`/tasks/${taskId}`);
      setSelectedTaskId(null);
      await fetchData();
    } catch (error: any) {
      showError(
        "Error",
        error.response?.data?.error || "Failed to delete task",
      );
    }
  };

  const openTaskDeleteDialog = (taskId: string) => {
    setTaskDeleteTargetId(taskId);
  };

  const closeTaskDeleteDialog = () => {
    setTaskDeleteTargetId(null);
  };

  const confirmTaskDelete = async () => {
    if (!taskDeleteTargetId) return;
    const targetId = taskDeleteTargetId;
    closeTaskDeleteDialog();
    await handleDeleteTask(targetId);
  };

  const handleRestoreTask = async (taskId: string) => {
    try {
      await api.post(`/tasks/${taskId}/restore`);
      setSelectedTaskId(null);
      await fetchData();
    } catch {
      showError("Error", "Failed to restore task");
    }
  };

  const handleUpdateTaskDescription = async () => {
    if (!selectedTaskId) return;
    try {
      await api.put(`/tasks/${selectedTaskId}`, {
        description: editingDescriptionText,
      });
      await fetchData();
      await fetchActivity(selectedTaskId);
      setIsEditingDescription(false);
    } catch {
      showError("Error", "Failed to update description");
    }
  };

  const handleAddComment = async (taskId: string) => {
    const content = (commentDrafts[taskId] || "").trim();
    if (!content) return;

    try {
      setSubmittingCommentTaskId(taskId);
      await api.post(`/tasks/${taskId}/comments`, { content });
      setCommentDrafts((prev) => ({ ...prev, [taskId]: "" }));
      await fetchSubmissions(taskId);
      await fetchActivity(taskId);
      await fetchData();
    } catch {
      showError("Error", "Failed to add comment");
    } finally {
      setSubmittingCommentTaskId(null);
    }
  };

  const fetchSubmissions = async (taskId: string) => {
    try {
      const res = await api.get(`/tasks/${taskId}/submissions`);
      setSubmissions(res.data);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      console.error("Failed to fetch submissions");
    }
  };

  const fetchActivity = async (taskId: string) => {
    try {
      const res = await api.get(`/tasks/${taskId}/activity`);
      setActivityLogs(res.data);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      console.error("Failed to fetch activity");
    }
  };

  const handleSubmitWork = async () => {
    if (!selectedTaskId || !submissionDescription.trim()) return;
    try {
      await api.post(`/tasks/${selectedTaskId}/submit`, {
        description: submissionDescription.trim(),
      });
      setSubmissionDescription("");
      setShowSubmissionModal(false);
      await fetchSubmissions(selectedTaskId);
      await fetchActivity(selectedTaskId);
      await fetchData();
    } catch {
      showError("Error", "Failed to submit work");
    }
  };

  const handleReviewSubmission = async (
    submissionId: string,
    status: "APPROVED" | "REJECTED",
  ) => {
    if (!selectedTaskId) return;
    try {
      await api.post(
        `/tasks/${selectedTaskId}/submissions/${submissionId}/review`,
        {
          status,
          reviewNotes: reviewNotes.trim() || undefined,
        },
      );
      setReviewNotes("");
      await fetchSubmissions(selectedTaskId);
      await fetchActivity(selectedTaskId);
      await fetchData();
    } catch {
      showError("Error", "Failed to review submission");
    }
  };

  const renderActivityIcon = (action: string) => {
    switch (action) {
      case "TASK_CREATED":
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-vermilion)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="16" />
            <line x1="8" y1="12" x2="16" y2="12" />
          </svg>
        );
      case "COMMENT_ADDED":
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        );
      case "COMMENT_DELETED":
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-slate)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        );
      case "STATUS_CHANGED":
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-ledger)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
        );
      case "ASSIGNEE_CHANGED":
      case "SUPPORTER_CHANGED":
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        );
      case "SUBMISSION_CREATED":
      case "SUBMISSION_REVIEWED":
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-ledger)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <path d="M9 15l2 2 4-4" />
          </svg>
        );
      case "ATTACHMENT_ADDED":
      case "ATTACHMENT_DELETED":
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        );
      default:
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        );
    }
  };

  const renderTaskDetailPanelInner = () => {
    const isCompleted = selectedTask?.status === "COMPLETED" || selectedTask?.status === "DONE";
    const isApproved = selectedTask?.approvalStatus === "APPROVED";

    return selectedTask ? (
      <div className="task-detail-content" key={selectedTask.id}>
        <div className="task-detail-header" style={{ paddingBottom: "16px", borderBottom: "1px solid var(--color-line)" }}>
          <div className="task-detail-header-top" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span className={`status-pill ${selectedTask.priority?.toLowerCase() || ""}`}>
                {selectedTask.priority} PRIORITY
              </span>
              {selectedTask.approvalStatus && selectedTask.approvalStatus !== "NOT_SUBMITTED" && (
                <span
                  className={`status-pill ${
                    selectedTask.approvalStatus === "APPROVED"
                      ? "done"
                      : selectedTask.approvalStatus === "REJECTED"
                        ? "cancelled"
                        : "in_progress"
                  }`}
                  title="Approval status"
                >
                  {selectedTask.approvalStatus === "PENDING"
                    ? "AWAITING APPROVAL"
                    : selectedTask.approvalStatus}
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <button
                type="button"
                className="btn-icon-expand"
                onClick={() => setIsExpandedFullScreen((prev) => !prev)}
                title={isExpandedFullScreen ? "Exit Full Screen (Esc)" : "Expand to Full Screen"}
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--color-line)",
                  background: "#FFFFFF",
                  color: "var(--color-ink)",
                  fontSize: "0.9em",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  transition: "all 0.15s ease"
                }}
              >
                {isExpandedFullScreen ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="4 14 10 14 10 20" />
                    <polyline points="20 10 14 10 14 4" />
                    <line x1="14" y1="10" x2="21" y2="3" />
                    <line x1="10" y1="14" x2="3" y2="21" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 3 21 3 21 9" />
                    <polyline points="9 21 3 21 3 15" />
                    <line x1="21" y1="3" x2="14" y2="10" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                )}
              </button>
              <button
                type="button"
                className="btn-icon-close"
                onClick={() => {
                  setSelectedTaskId(null);
                  setIsExpandedFullScreen(false);
                }}
                title="Close Panel"
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--color-line)",
                  background: "#FFFFFF",
                  color: "var(--color-ink)",
                  fontSize: "1.2em",
                  cursor: "pointer"
                }}
              >
                ×
              </button>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
            <h3 style={{
              fontFamily: "var(--font-heading)",
              fontSize: "1.35em",
              fontWeight: 700,
              color: "var(--color-ink)",
              margin: 0,
              lineHeight: 1.3
            }}>
              {selectedTask.title}
            </h3>
            {(isCompleted || isApproved) && (
              <span className="stamp-badge stamp-badge-ledger stamp-badge-sm" style={{ flexShrink: 0 }}>
                ✓ VERIFIED RECORD
              </span>
            )}
          </div>

          {/* Status Dropdown - Custom Select */}
          {!isDeletedView && (
            <div className="task-status-selector" style={{ marginTop: "16px" }}>
              <label
                style={{
                  fontSize: "0.72em",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  color: "var(--color-slate)",
                  letterSpacing: "0.08em",
                  marginBottom: "6px",
                  display: "block",
                }}
              >
                Record Status
              </label>
              <CustomSelect
                value={
                  selectedTask.status === "CREATED"
                    ? "TODO"
                    : selectedTask.status === "COMPLETED"
                      ? "DONE"
                      : selectedTask.status
                }
                onChange={(val) =>
                  handleUpdateTaskStatus(selectedTask.id, val)
                }
                options={[
                  { value: "TODO", label: "To Do" },
                  { value: "IN_PROGRESS", label: "In Progress" },
                  { value: "IN_REVIEW", label: "In Review" },
                  { value: "DONE", label: "Done" },
                  { value: "ON_HOLD", label: "On Hold" },
                  { value: "CANCELLED", label: "Cancelled" },
                ]}
              />
            </div>
          )}
        </div>

        {/* Task Description Section */}
        <div
          className="task-description-section"
          style={{
            marginTop: "16px",
            padding: "16px",
            background: "var(--color-fog)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--color-line)",
            borderLeft: "3px solid var(--color-ink)",
            cursor: isEditingDescription ? "default" : "pointer",
          }}
          onClick={() => {
            if (!isEditingDescription) {
              setEditingDescriptionText(selectedTask.description || "");
              setIsEditingDescription(true);
            }
          }}
          title={isEditingDescription ? undefined : "Click to edit description"}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <label
              style={{
                fontSize: "0.72em",
                fontWeight: 700,
                textTransform: "uppercase",
                color: "var(--color-slate)",
                letterSpacing: "0.08em",
                margin: 0,
                display: "block",
              }}
            >
              Description & Notes
            </label>
            {!isEditingDescription && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72em", color: "var(--color-vermilion)", fontWeight: 700, textTransform: "uppercase" }}>
                [EDIT DESCRIPTION]
              </span>
            )}
          </div>
          {isEditingDescription ? (
            <div onClick={(e) => e.stopPropagation()}>
              <textarea
                value={editingDescriptionText}
                onChange={(e) => setEditingDescriptionText(e.target.value)}
                rows={4}
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--color-line)",
                  fontFamily: "var(--font-body)",
                  fontSize: "0.9em",
                  color: "var(--color-ink)",
                  background: "#FFFFFF",
                  resize: "vertical",
                  marginBottom: "10px",
                  display: "block",
                  boxSizing: "border-box",
                }}
                placeholder="Write task description..."
                autoFocus
              />
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={handleUpdateTaskDescription}
                  className="btn-primary"
                  style={{ padding: "6px 14px", fontSize: "0.82em" }}
                >
                  Save Notes
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingDescription(false)}
                  className="btn-secondary"
                  style={{ padding: "6px 14px", fontSize: "0.82em" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p
              style={{
                margin: 0,
                fontSize: "0.9em",
                color: selectedTask.description ? "var(--color-ink)" : "var(--color-slate)",
                fontFamily: "var(--font-body)",
                lineHeight: "1.6",
                whiteSpace: "pre-wrap",
              }}
            >
              {selectedTask.description || "No description recorded for this task."}
            </p>
          )}
        </div>

        {/* Linked OKRs Section */}
        <div
          className="task-okr-section"
          style={{
            marginTop: "16px",
            padding: "16px",
            background: "#FFFFFF",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--color-line)",
          }}
        >
          <label
            style={{
              fontSize: "0.72em",
              fontWeight: 700,
              textTransform: "uppercase",
              color: "var(--color-slate)",
              letterSpacing: "0.08em",
              marginBottom: "10px",
              display: "block",
            }}
          >
            OKR Alignment
          </label>
          {selectedTask.krImpacts && selectedTask.krImpacts.length > 0 ? (
            <div
              style={{
                display: "grid",
                gap: "8px",
              }}
            >
              {selectedTask.krImpacts.map((impact) => (
                <div
                  key={impact.id}
                  style={{
                    padding: "12px",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--color-fog)",
                    border: "1px solid var(--color-line)",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.88em",
                      fontWeight: 600,
                      color: "var(--color-ink)",
                      fontFamily: "var(--font-body)",
                      lineHeight: 1.4,
                    }}
                  >
                    {impact.okrKeyResult.isGeneral
                      ? "General Objective"
                      : impact.okrKeyResult.title}
                  </div>
                  <div
                    style={{
                      marginTop: "4px",
                      fontSize: "0.78em",
                      fontFamily: "var(--font-mono)",
                      color: "var(--color-slate)",
                      lineHeight: 1.4,
                    }}
                  >
                    Target: {impact.okrKeyResult.okr.title}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p
              style={{
                margin: 0,
                fontSize: "0.88em",
                color: "var(--color-slate)",
                fontFamily: "var(--font-body)",
                lineHeight: "1.5",
              }}
            >
              No key result linked.
            </p>
          )}
        </div>

        {/* Task Metadata Grid */}
        <div className="task-meta-grid" style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "10px",
          marginTop: "16px",
          padding: "16px",
          background: "#FFFFFF",
          border: "1px solid var(--color-line)",
          borderRadius: "var(--radius-sm)"
        }}>
          <div>
            <div style={{ fontSize: "0.7em", fontWeight: 700, textTransform: "uppercase", color: "var(--color-slate)", letterSpacing: "0.08em" }}>Owner</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.85em", color: "var(--color-ink)", marginTop: "3px", fontWeight: 600 }}>
              {selectedTask.assignee?.name || selectedTask.assignee?.email || "Unassigned"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "0.7em", fontWeight: 700, textTransform: "uppercase", color: "var(--color-slate)", letterSpacing: "0.08em" }}>Supporter</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.85em", color: "var(--color-ink)", marginTop: "3px", fontWeight: 600 }}>
              {selectedTask.supporter?.name || selectedTask.supporter?.email || "None"}
            </div>
          </div>
          {selectedTask.createdBy && selectedTask.createdBy.id !== selectedTask.assignee?.id && (
            <div>
              <div style={{ fontSize: "0.7em", fontWeight: 700, textTransform: "uppercase", color: "var(--color-slate)", letterSpacing: "0.08em" }}>Assigned By</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.85em", color: "var(--color-ink)", marginTop: "3px" }}>
                {selectedTask.createdBy.name || selectedTask.createdBy.email}
              </div>
            </div>
          )}
          <div>
            <div style={{ fontSize: "0.7em", fontWeight: 700, textTransform: "uppercase", color: "var(--color-slate)", letterSpacing: "0.08em" }}>Due Date</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.85em", color: selectedTask.dueDate ? "var(--color-vermilion)" : "var(--color-slate)", marginTop: "3px", fontWeight: 600 }}>
              {selectedTask.dueDate ? selectedTask.dueDate.slice(0, 10) : "No Due Date Set"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "0.7em", fontWeight: 700, textTransform: "uppercase", color: "var(--color-slate)", letterSpacing: "0.08em" }}>Created Date</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.85em", color: "var(--color-ink)", marginTop: "3px" }}>
              {new Date(selectedTask.createdAt).toLocaleDateString()}
            </div>
          </div>
        </div>

        {/* Task Actions Bar */}
        <div className="task-actions" style={{ marginTop: "16px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {isDeletedView ? (
            <button
              onClick={() => handleRestoreTask(selectedTask.id)}
              className="btn-ledger"
              style={{ width: "100%" }}
            >
              Restore Task Record
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => handleOpenEditTask(selectedTask)}
                className="task-action-btn"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ marginRight: "6px" }}>
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Edit Task
              </button>

              <button
                type="button"
                onClick={() => handleDuplicateTask(selectedTask)}
                className="task-action-btn"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ marginRight: "6px" }}>
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                Duplicate
              </button>

              <label className="task-action-btn upload-btn" style={{ cursor: "pointer" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ marginRight: "6px" }}>
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
                Attach File
                <input
                  type="file"
                  style={{ display: "none" }}
                  onChange={async (e) => {
                    if (e.target.files && e.target.files[0]) {
                      const formData = new FormData();
                      formData.append("file", e.target.files[0]);
                      try {
                        await api.post(
                          `/tasks/${selectedTask.id}/attachments`,
                          formData,
                          {
                            headers: {
                              "Content-Type": "multipart/form-data",
                            },
                          },
                        );
                        await fetchData();
                      } catch {
                        showError("Error", "Upload failed");
                      }
                    }
                  }}
                />
              </label>

              <button
                type="button"
                className="task-action-btn"
                onClick={() => {
                  setNewLink({
                    taskId: selectedTask.id,
                    url: "",
                    fileName: "",
                  });
                  setShowAddLinkModal(true);
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ marginRight: "6px" }}>
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                Attach Link
              </button>

              {canReviewTasks && selectedTask.approvalStatus === "PENDING" && (
                <>
                  <button
                    type="button"
                    className="btn-vermilion"
                    style={{ flex: "1 1 100%" }}
                    onClick={() =>
                      handleApprovalAction(selectedTask.id, "APPROVE")
                    }
                  >
                    Approve Task Record
                  </button>
                  <button
                    type="button"
                    className="task-action-btn task-action-btn-danger"
                    onClick={() =>
                      handleApprovalAction(selectedTask.id, "REJECT")
                    }
                  >
                    Reject
                  </button>
                </>
              )}

              {canDeleteTask(selectedTask) && (
                <button
                  type="button"
                  onClick={() => handleDeleteTask(selectedTask.id)}
                  className="task-action-btn task-action-btn-danger"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ marginRight: "6px" }}>
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
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
                  {att.type === "LINK" && att.url ? (
                    <a href={att.url} target="_blank" rel="noopener noreferrer">
                      🔗 {att.fileName || att.url}
                    </a>
                  ) : (
                    <a
                      href={`${api.defaults.baseURL}/${att.filePath}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      📄 {att.fileName}
                    </a>
                  )}
                  {isAdmin && !isDeletedView && (
                    <button
                      className="btn-delete-small"
                      onClick={async () => {
                        if (window.confirm("Delete this attachment?")) {
                          await api.delete(`/tasks/attachments/${att.id}`);
                          await fetchData();
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

        {!isDeletedView &&
          !isTaskCompleted(selectedTask.status) &&
          (user?.id === selectedTask.assignee?.id ||
            user?.id === selectedTask.supporter?.id) && (
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
                      {sub.user?.name || "Unknown"}
                    </span>
                    <span
                      className={`submission-status status-${sub.status?.toLowerCase() || ""}`}
                    >
                      {formatStatusLabel(sub.status)}
                    </span>
                  </div>
                  <div className="submission-meta">
                    <span>
                      Submitted: {formatDateTimeWithoutSeconds(sub.submittedAt)}
                    </span>
                    {sub.reviewedAt && (
                      <span>
                        Reviewed: {formatDateTimeWithoutSeconds(sub.reviewedAt)}
                      </span>
                    )}
                  </div>
                  {sub.description && (
                    <p className="submission-description">{sub.description}</p>
                  )}
                  {sub.reviewNotes && (
                    <p className="submission-review-notes">
                      <strong>Review Notes:</strong> {sub.reviewNotes}
                    </p>
                  )}
                  {canReviewSubmissions && sub.status === "PENDING" && (
                    <div className="submission-actions">
                      <button
                        className="btn-action success"
                        onClick={() => {
                          handleReviewSubmission(sub.id, "APPROVED");
                        }}
                      >
                        Approve
                      </button>
                      <button
                        className="btn-action danger"
                        onClick={() => {
                          handleReviewSubmission(sub.id, "REJECTED");
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
          <div className="task-activity-timeline" style={{ marginTop: "20px" }}>
            <h4 style={{
              fontSize: "0.75em",
              fontWeight: 700,
              textTransform: "uppercase",
              color: "var(--color-slate)",
              letterSpacing: "0.08em",
              marginBottom: "12px"
            }}>
              Activity Timeline
            </h4>
            <div className="activity-list" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {activityLogs.map((log) => (
                <div key={log.id} className="activity-item" style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  padding: "10px 12px",
                  background: "var(--color-fog)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--color-line)",
                  borderLeft: "2px solid var(--color-line)"
                }}>
                  <div className="activity-icon" style={{
                    width: "26px",
                    height: "26px",
                    borderRadius: "var(--radius-sm)",
                    background: "#FFFFFF",
                    border: "1px solid var(--color-line)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    marginTop: "2px"
                  }}>
                    {renderActivityIcon(log.action)}
                  </div>
                  <div className="activity-content" style={{ flex: 1, minWidth: 0 }}>
                    <div className="activity-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2px" }}>
                      <span className="activity-user" style={{ fontSize: "0.82em", fontWeight: 700, color: "var(--color-ink)" }}>
                        {log.user?.name || "System Record"}
                      </span>
                      <span className="activity-time" style={{ fontFamily: "var(--font-mono)", fontSize: "0.72em", color: "var(--color-slate)" }}>
                        {formatDateTimeWithoutSeconds(log.createdAt)}
                      </span>
                    </div>
                    <p className="activity-description" style={{ margin: 0, fontSize: "0.82em", color: "var(--color-ink)", lineHeight: 1.4 }}>
                      {formatActivityDescription(log.description)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="task-comments" style={{ marginTop: "24px" }}>
          <div className="task-comments-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <h4 style={{
              fontSize: "0.75em",
              fontWeight: 700,
              textTransform: "uppercase",
              color: "var(--color-slate)",
              letterSpacing: "0.08em",
              margin: 0
            }}>
              Timeline & Comments
            </h4>
            <span className="comments-count" style={{ fontFamily: "var(--font-mono)", fontSize: "0.75em", color: "var(--color-slate)" }}>
              {selectedTask.comments?.length || 0} ENTRIES
            </span>
          </div>
          <div className="comments-list" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {(expandedCommentThreads[selectedTask.id]
              ? selectedTask.comments || []
              : (selectedTask.comments || []).slice(0, COMMENTS_PREVIEW_COUNT)
            ).map((comment: any) => (
              <div key={comment.id} className="comment-item" style={{
                padding: "12px 14px",
                background: "#FFFFFF",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--color-line)"
              }}>
                <div className="comment-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <strong style={{ fontSize: "0.88em", color: "var(--color-ink)", fontWeight: 700 }}>
                    {comment.user.name || comment.user.email}
                  </strong>
                  <div className="comment-meta" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72em", color: "var(--color-slate)" }}>
                      {formatDateTimeWithoutSeconds(comment.createdAt)}
                    </span>
                    {!isDeletedView &&
                      (user?.id === comment.userId || isAdmin) && (
                        <button
                          className="btn-secondary"
                          style={{
                            padding: "2px 6px",
                            fontSize: "0.7em",
                            color: "var(--color-vermilion)",
                            borderColor: "var(--color-line)",
                          }}
                          onClick={async () => {
                            if (window.confirm("Delete this comment?")) {
                              await api.delete(`/tasks/comments/${comment.id}`);
                              await fetchData();
                              if (selectedTaskId) {
                                await fetchActivity(selectedTaskId);
                              }
                            }
                          }}
                        >
                          Remove
                        </button>
                      )}
                  </div>
                </div>
                <p className="comment-content" style={{ margin: 0, fontSize: "0.88em", color: "var(--color-ink)", lineHeight: 1.5, fontFamily: "var(--font-body)", whiteSpace: "pre-wrap" }}>
                  {comment.content}
                </p>
              </div>
            ))}
          </div>
          {(selectedTask.comments?.length || 0) > COMMENTS_PREVIEW_COUNT && (
            <button
              type="button"
              className="btn-thread-toggle"
              style={{
                marginTop: "10px",
                background: "transparent",
                border: "none",
                fontFamily: "var(--font-mono)",
                fontSize: "0.78em",
                color: "var(--color-vermilion)",
                fontWeight: 700,
                cursor: "pointer",
                padding: 0
              }}
              onClick={() =>
                setExpandedCommentThreads((prev) => ({
                  ...prev,
                  [selectedTask.id]: !prev[selectedTask.id],
                }))
              }
            >
              {expandedCommentThreads[selectedTask.id]
                ? `SHOW RECENT ${COMMENTS_PREVIEW_COUNT}`
                : `SHOW ALL ${selectedTask.comments?.length} COMMENTS`}
            </button>
          )}
          {!isDeletedView && (
            <form
              className="add-comment"
              style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "8px" }}
              onSubmit={async (e) => {
                e.preventDefault();
                await handleAddComment(selectedTask.id);
              }}
            >
              <textarea
                value={commentDrafts[selectedTask.id] || ""}
                placeholder="Write a comment..."
                rows={3}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--color-line)",
                  background: "#FFFFFF",
                  color: "var(--color-ink)",
                  fontFamily: "var(--font-body)",
                  fontSize: "0.88em",
                  resize: "vertical",
                  boxSizing: "border-box"
                }}
                onChange={(e) =>
                  setCommentDrafts((prev) => ({
                    ...prev,
                    [selectedTask.id]: e.target.value,
                  }))
                }
              />
              <button
                type="submit"
                className="btn-primary"
                style={{ alignSelf: "flex-end", padding: "6px 16px", fontSize: "0.82em" }}
                disabled={
                  submittingCommentTaskId === selectedTask.id ||
                  !(commentDrafts[selectedTask.id] || "").trim()
                }
              >
                {submittingCommentTaskId === selectedTask.id
                  ? "Posting..."
                  : "Post Comment"}
              </button>
            </form>
          )}
        </div>
      </div>
    ) : (
      <div className="task-detail-empty">
        <p>Select a task to view full details</p>
      </div>
    );
  };

  if (loading) {
    return <div className="dashboard loading">Loading...</div>;
  }

  return (
    <div className="dashboard">
      <div className="dashboard-container">
        {currentSection === "board" && (
          <BoardView
            stats={stats}
            memberStats={memberStats}
            teamDistribution={teamDistribution}
            userRole={
              organization?.userRole as "ADMIN" | "TEAM_LEAD" | "MEMBER"
            }
            onCreateTask={() => setShowCreateTaskModal(true)}
            onNavigate={(path) => navigate(path)}
            organizationName={organization?.name}
            teamsCount={teams.length}
            organizationMembers={(organization?.members || []).map((m) => ({
              userId: m.userId,
              role: m.role,
            }))}
            quotes={quotes}
          />
        )}

        {currentSection === "task-tracker" && (
          <TaskTrackerView
            tasks={
              isTeamLead && filter !== "pending_approval"
                ? tasks.filter((t) => t.assignee?.id === user?.id)
                : tasks
            }
            filter={filter}
            onFilterChange={(f) =>
              setFilter(
                f === "all"
                  ? "all"
                  : f === "pending"
                    ? "created"
                    : f === "ongoing"
                      ? "in_progress"
                      : f === "in_review"
                        ? "in_review"
                        : f === "completed"
                          ? "completed"
                          : f === "pending_approval"
                            ? "pending_approval"
                            : f === "overdue"
                              ? "overdue"
                              : f === "supporting"
                                ? "supporting"
                                : "my",
              )
            }
            onTaskClick={(task) => setSelectedTaskId(task.id)}
            onCreateTask={() => setShowCreateTaskModal(true)}
            onSendAlert={openSendAlertModal}
            assignableUsers={taskAssignableUsers.map((m) => ({
              userId: m.userId,
              name: m.user.name,
              email: m.user.email,
            }))}
            hideOwnerFilter={isTeamLead}
            userRole={
              organization?.userRole as "ADMIN" | "TEAM_LEAD" | "MEMBER"
            }
            loading={tasksLoading}
            onEdit={handleOpenEditTask}
            onDuplicate={handleDuplicateTask}
            onDelete={(id) => openTaskDeleteDialog(id)}
            onChangeStatus={handleUpdateTaskStatus}
            onApprovalAction={handleApprovalAction}
          />
        )}

        {currentSection === "team-tracker" && canTrackTeam && (
          <TeamTrackerView
            teamName={teamTrackerName}
            tasks={(() => {
              let base = isTeamLead
                ? tasks.filter((t) => {
                    const assigneeId = t.assignee?.id || "";
                    return ledTeamMemberIds.includes(assigneeId);
                  })
                : tasks;
              if (urlTeamId) {
                base = base.filter((t) =>
                  (t.taskTeams || []).some((tt) => tt?.team?.id === urlTeamId),
                );
              }
              return base;
            })()}
            members={(organization?.members || [])
              .filter((m) => m.userId !== user?.id)
              .filter((m) => {
                // If team lead and not viewing a specific team, only show members of the lead's team
                if (isTeamLead && !urlTeamId) {
                  return ledTeamMemberIds.includes(m.userId);
                }
                if (!urlTeamId) return true;
                // match by explicit team relation or by searching teams data
                if (getMemberTeamIds(m).includes(urlTeamId)) return true;
                const teamObj = teams.find((t) => t.id === urlTeamId);
                if (!teamObj) return false;
                const inMembers = (teamObj.members || []).some(
                  (tm) => (tm.userId || tm.id) === m.userId,
                );
                const inPeople = (teamObj.people || []).some(
                  (p) => p.userId === m.userId,
                );
                return inMembers || inPeople;
              })
              .map((m) => ({
                userId: m.userId,
                name: m.user.name || m.user.email,
              }))}
            selectedMemberId={assigneeFilterId}
            onMemberSelect={(id) => setAssigneeFilterId(id)}
            filter={filter}
            onFilterChange={(f) =>
              setFilter(
                f === "all"
                  ? "all"
                  : f === "pending"
                    ? "created"
                    : f === "ongoing"
                      ? "in_progress"
                      : f === "in_review"
                        ? "in_review"
                        : f === "completed"
                          ? "completed"
                          : f === "pending_approval"
                            ? "pending_approval"
                            : f === "overdue"
                              ? "overdue"
                              : f === "supporting"
                                ? "supporting"
                                : "my",
              )
            }
            onTaskClick={(task) => setSelectedTaskId(task.id)}
            onCreateTask={() => setShowCreateTaskModal(true)}
            onSendAlert={openSendAlertModal}
            userRole={
              organization?.userRole as "ADMIN" | "TEAM_LEAD" | "MEMBER"
            }
            loading={tasksLoading}
            onEdit={handleOpenEditTask}
            onDuplicate={handleDuplicateTask}
            onDelete={(id) => openTaskDeleteDialog(id)}
            onChangeStatus={handleUpdateTaskStatus}
            onApprovalAction={handleApprovalAction}
          />
        )}

        {currentSection === "okr" && organization && (
          <OkrView
            okrs={okrs}
            userRole={organization.userRole as "ADMIN" | "TEAM_LEAD" | "MEMBER"}
            onCreateTask={() => setShowCreateTaskModal(true)}
            onCreateOkr={() => setShowCreateOkrModal(true)}
            onEditOkr={handleOpenEditOkr as any}
            onDuplicateOkr={handleDuplicateOkr as any}
            onDeleteOkr={handleDeleteOkr}
            onCloseOkr={handleCloseOkr as any}
          />
        )}

        {currentSection === "settings" && renderSettingsSection()}
        {currentSection === "subscription" && isAdmin && organization && (
          <SubscriptionPage organizationId={organization.id} />
        )}
        {currentSection === "support" && renderSupportSection()}

        {selectedMemberDetail && (
          <div className="modal-overlay" onClick={handleCloseMemberDetail}>
            <div
              className="member-detail-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "16px",
                }}
              >
                <h3 style={{ margin: 0 }}>Member Details</h3>
                <button
                  className="btn-secondary"
                  style={{ fontSize: "0.85em", padding: "6px 12px" }}
                  onClick={handleCloseMemberDetail}
                >
                  Close
                </button>
              </div>
              <div style={{ marginBottom: "12px" }}>
                <strong style={{ fontSize: "1.1em" }}>
                  {selectedMemberDetail.member.user.name ||
                    selectedMemberDetail.member.user.email}
                </strong>
                <div style={{ fontSize: "0.85em", color: "var(--text-muted)" }}>
                  {selectedMemberDetail.member.user.email}
                </div>
              </div>
              <div className="member-detail-grid">
                <div>
                  <small className="detail-label">Team</small>
                  <p>{selectedMemberDetail.teamName}</p>
                </div>
                <div>
                  <small className="detail-label">Role</small>
                  <p>
                    {selectedMemberDetail.roleLabel
                      ? formatRole(selectedMemberDetail.roleLabel)
                      : "-"}
                  </p>
                </div>
                <div>
                  <small className="detail-label">Category</small>
                  <p>{selectedMemberDetail.category}</p>
                </div>
                <div>
                  <small className="detail-label">Date Joined</small>
                  <p>
                    {formatJoinedDate(selectedMemberDetail.member.joinedAt)}
                  </p>
                </div>
              </div>
              <div className="member-detail-stats">
                {(
                  [
                    "pending",
                    "ongoing",
                    "completed",
                    "overdue",
                    "total",
                  ] as const
                ).map((key) => {
                  const detailStats = selectedMemberDetail.stats?.stats;
                  const value = detailStats ? detailStats[key] || 0 : 0;
                  return (
                    <div key={key} className="member-detail-stat-card">
                      <div className="member-detail-stat-label">
                        {key.charAt(0).toUpperCase() + key.slice(1)}
                      </div>
                      <div className="member-detail-stat-value">{value}</div>
                    </div>
                  );
                })}
              </div>
              <div
                className="member-detail-actions"
                style={{
                  marginTop: "20px",
                  display: "flex",
                  gap: "12px",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  className="btn-outline-blue"
                  onClick={() => {
                    const member = selectedMemberDetail.member;
                    setAssigneeFilterId(member.userId);
                    const params = new URLSearchParams(location.search);
                    params.set("section", "team-tracker");
                    navigate(`/dashboard?${params.toString()}`);
                    handleCloseMemberDetail();
                  }}
                >
                  View Tasks
                </button>
                <button
                  className="btn-secondary"
                  onClick={handleCloseMemberDetail}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="dashboard-header">
          {currentSection === "tracker" && (
            <div className="header-actions">
              {assigneeFilterId && (
                <button
                  onClick={() => setAssigneeFilterId(null)}
                  className="btn-secondary"
                >
                  Show All
                </button>
              )}
              {(isAdmin || isTeamLead) && (
                <button onClick={openSendAlertModal} className="btn-secondary">
                  Send Alert
                </button>
              )}
              <button
                onClick={() => setShowCreateTaskModal(true)}
                className="btn-primary"
              >
                + New Task
              </button>
            </div>
          )}
          {currentSection === "team" && isAdmin && (
            <div className="header-actions">
              <button
                onClick={() => setShowCreateTeamModal(true)}
                className="btn-primary"
              >
                + Create Team
              </button>
            </div>
          )}
        </div>

        {currentSection === "team" && canTrackTeam && (
          <div className="team-management-view">
            {isAdmin && !focusMembers && (
              <>
                <div className="team-invite-panel">
                  <div className="team-panel-header">
                    <h3>Invite Team Members</h3>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handleOpenBulkInviteModal}
                      disabled={!isAdmin}
                    >
                      Bulk Invite
                    </button>
                  </div>
                  {teamError && (
                    <div className="team-error">
                      <span>{teamError}</span>
                      <button
                        type="button"
                        onClick={fetchData}
                      >
                        Refresh Data
                      </button>
                    </div>
                  )}
                  <form
                    className="team-invite-form"
                    onSubmit={handleInviteMember}
                  >
                    <div className="team-invite-fields">
                      <input
                        type="text"
                        value={inviteName}
                        onChange={(e) => setInviteName(e.target.value)}
                        placeholder="Member name"
                        disabled={!isAdmin || inviting}
                      />
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="team.member@company.com"
                        required
                        disabled={!isAdmin || inviting}
                      />
                      <CustomSelect
                        value={inviteRole}
                        onChange={(val) => setInviteRole(val)}
                        disabled={!isAdmin || inviting}
                        options={[
                          { value: "MEMBER", label: "Member" },
                          { value: "TEAM_LEAD", label: "Team Lead" },
                        ]}
                      />
                      <TeamMultiDropdown
                        teams={teams}
                        value={inviteTeamIds}
                        onChange={setInviteTeamIds}
                        emptyMessage="No teams available"
                      />
                      <input
                        type="text"
                        value={inviteCategory}
                        onChange={(e) => setInviteCategory(e.target.value)}
                        placeholder="Category"
                        disabled={!isAdmin || inviting}
                      />
                    </div>
                    <DebouncedButton
                      type="submit"
                      className="btn-primary"
                      disabled={!isAdmin || inviting}
                      debounceMs={800}
                    >
                      {inviting ? "Sending..." : "Send Invite"}
                    </DebouncedButton>
                  </form>

                  {invites.length > 0 && (
                    <div className="team-invites-list">
                      <h4>Pending Invites</h4>
                      {invites
                        .filter((invite) => invite.status !== "ACCEPTED")
                        .map((invite) => (
                          <div key={invite.id} className="team-invite-row">
                            <div className="team-member-info">
                              <div>
                                <strong>{invite.email}</strong>
                              </div>
                              {invite.teams && invite.teams.length > 0 && (
                                <div>
                                  {invite.teams
                                    .map((team) => team.name)
                                    .join(", ")}
                                </div>
                              )}
                            </div>
                            <div className="team-member-role">
                              {invite.status === "PENDING" && (
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  style={{
                                    padding: "4px 10px",
                                    fontSize: "0.8em",
                                    marginRight: "8px",
                                  }}
                                  onClick={() => handleResendInvite(invite.id)}
                                >
                                  Resend
                                </button>
                              )}
                              {invite.status !== "ACCEPTED" && (
                                <button
                                  type="button"
                                  className="btn-delete-small"
                                  onClick={() => handleDeleteInvite(invite.id)}
                                >
                                  Delete
                                </button>
                              )}
                              <span className="role-badge low">
                                {formatRole(invite.role)}
                              </span>
                              <span
                                className={`role-badge ${invite.status?.toLowerCase() || ""}`}
                              >
                                {invite.status}
                              </span>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                <div className="teams-list-section">
                  <h3>Teams</h3>
                  {teams.length === 0 ? (
                    <p className="empty-state">
                      No teams yet. Create your first team to get started.
                    </p>
                  ) : (
                    <div className="teams-grid">
                      {teams.map((team) => (
                        <div key={team.id} className="team-card">
                          <div
                            onClick={() => handleTeamClick(team.id)}
                            style={{ cursor: "pointer", flex: 1 }}
                          >
                            <h4>{team.name}</h4>
                            <p
                              className={`team-lead ${team.leadUser ? "" : "team-lead-missing"}`}
                            >
                              Lead:{" "}
                              {team.leadUser?.name ||
                                team.leadUser?.email ||
                                "Unassigned"}
                            </p>
                            <p className="team-members-count">
                              {(team.members || []).filter(
                                (m) => m.role !== "ADMIN",
                              ).length || 0}{" "}
                              members
                            </p>
                          </div>
                          <div
                            className="team-card-actions"
                            style={{
                              display: "flex",
                              gap: "8px",
                              marginTop: "12px",
                            }}
                          >
                            <button
                              className="btn-secondary"
                              style={{ padding: "4px 10px", fontSize: "0.8em" }}
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditTeam(team);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className="btn-logout"
                              style={{ padding: "4px 10px", fontSize: "0.8em" }}
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
              <h3>{isAdmin ? "All Members" : "Team Members"}</h3>

              <div
                className="team-members-toolbar"
              >
                <CustomSelect
                  value={ownerFilter}
                  onChange={(val) => setOwnerFilter(val)}
                  style={{ minWidth: "160px" }}
                  options={[
                    { value: "all", label: "All Owners" },
                    ...(organization?.members || [])
                      .filter(
                        (member) =>
                          member.role !== "ADMIN" && member.userId !== user?.id,
                      )
                      .map((member) => ({
                        value: member.userId,
                        label: member.user.name || member.user.email,
                      }))
                  ]}
                />

                {ownerFilter !== "all" && (
                  <button
                    onClick={() => {
                      setOwnerFilter("all");
                    }}
                    className="btn-secondary"
                  >
                    Clear Filters
                  </button>
                )}
              </div>

              <div className="members-table-container">
                <table
                  className="members-table"
                >
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Job Title</th>
                      <th>Team</th>
                      <th>Role</th>
                      <th className="team-table-action-col">Remove</th>
                      <th className="team-table-action-col">View</th>
                    </tr>
                  </thead>
                  <tbody>
                    {memberRows.length > 0 ? (
                      memberRows.map((row) => (
                        <tr
                          key={row.member.id}
                          className="member-table-row"
                        >
                          <td style={{ padding: "12px 16px" }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "12px",
                              }}
                            >
                              <div
                                className="member-avatar"
                                style={{
                                  width: "36px",
                                  height: "36px",
                                  borderRadius: "50%",
                                  background: "var(--primary-color)",
                                  color: "#fff",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: "0.85em",
                                  fontWeight: 600,
                                }}
                              >
                                {getInitials(
                                  row.member.user.name || row.member.user.email,
                                )}
                              </div>
                              <strong>
                                {row.member.user.name || row.member.user.email}
                              </strong>
                            </div>
                          </td>
                          <td
                            style={{
                              padding: "12px 16px",
                              color: "var(--text-muted)",
                            }}
                          >
                            {row.member.user.email}
                          </td>
                          <td
                            style={{
                              padding: "12px 16px",
                              color: "var(--text-muted)",
                            }}
                          >
                            {row.member.user.jobTitle || "-"}
                          </td>
                          <td style={{ padding: "12px 16px" }}>
                            {row.teamName}
                          </td>
                          <td style={{ padding: "12px 16px" }}>
                            <span
                              className={`role-badge ${row.member.role.toLowerCase()}`}
                            >
                              {row.roleLabel
                                ? formatRole(row.roleLabel)
                                : formatRole(row.member.role)}
                            </span>
                          </td>
                          {/* Category column removed as not needed */}
                          <td
                            style={{
                              padding: "12px 16px",
                              textAlign: "center",
                            }}
                          >
                            <button
                              className="btn-delete-small"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveMember(row.member.id);
                              }}
                              style={{ padding: "6px 12px", fontSize: "0.8em" }}
                            >
                              Remove
                            </button>
                          </td>
                          <td
                            style={{
                              padding: "12px 16px",
                              textAlign: "center",
                            }}
                          >
                            <button
                              className="btn-secondary"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenMemberDetail(row);
                              }}
                              style={{ padding: "6px 12px", fontSize: "0.8em" }}
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={7}
                          style={{
                            padding: "16px",
                            textAlign: "center",
                            color: "var(--text-muted)",
                          }}
                        >
                          No members found in this category.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {isAdmin && (
              <div
                className="task-card"
                style={{ padding: "24px", marginTop: "24px" }}
              >
                <h3 style={{ margin: "0 0 8px 0", fontSize: "1em" }}>
                  Reactivate Deactivated Member
                </h3>
                <p
                  style={{
                    margin: "0 0 16px 0",
                    fontSize: "0.875em",
                    color: "var(--text-muted)",
                  }}
                >
                  Restore a previously removed member by their email address.
                  This only works before their account is permanently purged
                  (within 7 days of removal).
                </p>
                <form
                  onSubmit={handleReactivateMember}
                  style={{
                    display: "flex",
                    gap: "12px",
                    flexWrap: "wrap",
                    alignItems: "flex-end",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                      flex: "1 1 220px",
                    }}
                  >
                    <label
                      htmlFor="reactivate-email"
                      style={{
                        fontSize: "0.8em",
                        fontWeight: 600,
                        color: "var(--text-muted)",
                      }}
                    >
                      Email address
                    </label>
                    <input
                      id="reactivate-email"
                      type="email"
                      value={reactivateEmail}
                      onChange={(e) => {
                        setReactivateEmail(e.target.value);
                        setReactivateError("");
                        setReactivateSuccess("");
                      }}
                      placeholder="member@example.com"
                      style={{
                        padding: "8px 12px",
                        border: "1px solid var(--border-color, #e2e8f0)",
                        borderRadius: "6px",
                        fontSize: "0.9em",
                        background: "var(--input-bg, #fff)",
                        color: "var(--text-primary)",
                      }}
                      required
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                    }}
                  >
                    <label
                      htmlFor="reactivate-role"
                      style={{
                        fontSize: "0.8em",
                        fontWeight: 600,
                        color: "var(--text-muted)",
                      }}
                    >
                      Role
                    </label>
                    <CustomSelect
                      value={reactivateRole}
                      onChange={(val) => setReactivateRole(val)}
                      options={[
                        { value: "MEMBER", label: "Member" },
                        { value: "TEAM_LEAD", label: "Team Lead" },
                      ]}
                    />
                  </div>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={reactivateLoading}
                    style={{ padding: "8px 20px", alignSelf: "flex-end" }}
                  >
                    {reactivateLoading ? "Reactivating…" : "Reactivate"}
                  </button>
                </form>
                {reactivateError && (
                  <p
                    style={{
                      margin: "12px 0 0 0",
                      color: "var(--error-color, #dc2626)",
                      fontSize: "0.875em",
                    }}
                  >
                    {reactivateError}
                  </p>
                )}
                {reactivateSuccess && (
                  <p
                    style={{
                      margin: "12px 0 0 0",
                      color: "var(--success-color, #16a34a)",
                      fontSize: "0.875em",
                    }}
                  >
                    {reactivateSuccess}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {currentSection === "appraisals" && isAdmin && (
          <div className="tasks-section">
            <div className="tasks-header">
              <h2>Appraisals</h2>
              <button
                className="btn-primary"
                onClick={() => setShowCreateAppraisalModal(true)}
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ display: "block" }}
                >
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                <span style={{ lineHeight: 1 }}>{"Generate Appraisal"}</span>
              </button>
            </div>
            <div className="tasks-list">
              {appraisals.map((appraisal: Appraisal) => (
                <div
                  key={appraisal.id}
                  className="task-card"
                  style={{ padding: "24px" }}
                >
                  <div className="task-header" style={{ marginBottom: 16 }}>
                    <div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          marginBottom: "8px",
                        }}
                      >
                        <h3 style={{ margin: 0, fontFamily: "var(--font-heading)", fontSize: "1.3em", fontWeight: 800 }}>
                          {appraisal.subjectName ||
                            appraisal.reportSections?.header?.name ||
                            appraisal.subjectUser?.name ||
                            appraisal.subjectUser?.email ||
                            "Appraisal Subject"}
                        </h3>
                        <span className="stamp-badge stamp-badge-sm">
                          OFFICIAL RECORD
                        </span>
                        {(appraisal.reportSections?.header?.team ||
                          appraisal.subjectUser?.team ||
                          appraisal.subjectType === "TEAM") && (
                          <span
                            style={{
                              background: "var(--color-fog)",
                              color: "var(--color-ink)",
                              border: "1px solid var(--color-line)",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              fontFamily: "var(--font-mono)",
                              fontSize: "0.72em",
                              fontWeight: 700,
                              textTransform: "uppercase",
                            }}
                          >
                            {appraisal.reportSections?.header?.team ||
                              appraisal.subjectUser?.team?.name ||
                              "Team"}
                          </span>
                        )}
                      </div>
                      <p className="org-subtitle" style={{ marginTop: 4 }}>
                        Cycle: {appraisal.cycle}
                      </p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div
                        style={{
                          fontSize: "1.4em",
                          fontWeight: 800,
                          color:
                            appraisal.overallRating === "EXCELLENT"
                              ? "#16a34a"
                              : appraisal.overallRating === "GOOD"
                                ? "#2563eb"
                                : "#f97316",
                        }}
                      >
                        {appraisal.reportSections?.finalRating ||
                          appraisal.overallRating}
                      </div>
                      <div
                        style={{
                          fontSize: "0.7em",
                          color: "#64748b",
                          textTransform: "uppercase",
                          fontWeight: 700,
                        }}
                      >
                        Overall Rating
                      </div>
                    </div>
                  </div>

                  <div
                    className="appraisal-metrics"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, 1fr)",
                      gap: "16px",
                      marginBottom: "20px",
                      background: "#f8fafc",
                      padding: "16px",
                      borderRadius: "12px",
                    }}
                  >
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "1.1em", fontWeight: 700 }}>
                        {Math.round(appraisal.tasksCompleted || 0)}%
                      </div>
                      <div
                        style={{
                          fontSize: "0.65em",
                          color: "#64748b",
                          textTransform: "uppercase",
                        }}
                      >
                        Tasks Completed
                      </div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "1.1em", fontWeight: 700 }}>
                        {Math.round(appraisal.deadlinesMet || 0)}%
                      </div>
                      <div
                        style={{
                          fontSize: "0.65em",
                          color: "#64748b",
                          textTransform: "uppercase",
                        }}
                      >
                        Deadlines Met
                      </div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "1.1em", fontWeight: 700 }}>
                        {Math.round(appraisal.okrImpactScore || 0)}%
                      </div>
                      <div
                        style={{
                          fontSize: "0.65em",
                          color: "#64748b",
                          textTransform: "uppercase",
                        }}
                      >
                        OKR Impact
                      </div>
                    </div>
                  </div>

                  <p
                    className="task-description"
                    style={{
                      whiteSpace: "pre-wrap",
                      marginBottom: "20px",
                      color: "#475569",
                    }}
                  >
                    {appraisal.reportSections?.overviewSummary ||
                      appraisal.summary}
                  </p>

                  {appraisal.reportSections && (
                    <div className="appraisal-report-sections">
                      {[
                        ["Strengths", appraisal.reportSections.strengths],
                        [
                          "Areas for Improvement",
                          appraisal.reportSections.areasForImprovement,
                        ],
                        [
                          "Skills / Capability Insights",
                          appraisal.reportSections.skillsCapabilityInsights,
                        ],
                        [
                          "Recommendations",
                          appraisal.reportSections.recommendations,
                        ],
                        ["Next Steps", appraisal.reportSections.nextSteps],
                      ].map(([title, items]) => (
                        <div
                          key={title as string}
                          className="appraisal-section"
                        >
                          <h4>{title as string}</h4>
                          <ul>
                            {((items as string[] | undefined) || []).map(
                              (item) => (
                                <li key={item}>{item}</li>
                              ),
                            )}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}

                  {appraisal.okrImpactSummary?.okrs &&
                    appraisal.okrImpactSummary.okrs.length > 0 && (
                      <div
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: 10,
                          padding: 12,
                          marginBottom: 20,
                          background: "#ffffff",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "0.8em",
                            fontWeight: 700,
                            color: "#334155",
                            marginBottom: 8,
                            textTransform: "uppercase",
                          }}
                        >
                          Assigned KR Performance
                        </div>
                        {appraisal.okrImpactSummary.okrs
                          .map((okr) => (
                            <div key={okr.okrId} style={{ marginBottom: 8 }}>
                              <div
                                style={{ fontWeight: 600, fontSize: "0.9em" }}
                              >
                                {okr.okrTitle}
                              </div>
                              <div
                                style={{ fontSize: "0.85em", color: "#475569" }}
                              >
                                {okr.targetValueTotal &&
                                okr.targetValueTotal > 0
                                  ? `${Math.round((okr.actualValueTotal || 0) * 100) / 100} / ${Math.round((okr.targetValueTotal || 0) * 100) / 100} (${Math.round(okr.achievedPct || 0)}%)`
                                  : "N/A (no quantitative target configured)"}
                              </div>
                              <div style={{ marginTop: 6 }}>
                                {okr.keyResults.map((kr) => (
                                  <div
                                    key={kr.krId}
                                    style={{
                                      fontSize: "0.8em",
                                      color: "#475569",
                                      marginBottom: 4,
                                    }}
                                  >
                                    {kr.krTitle}{" "}
                                    {kr.contributionPct !== null &&
                                    kr.contributionPct !== undefined
                                      ? `(${Math.round(kr.contributionPct)}%)`
                                      : ""}
                                    {" • "}
                                    {kr.approvalStatus || "PENDING"}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                      </div>
                    )}

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: "10px",
                      borderTop: "1px solid #e2e8f0",
                      paddingTop: "16px",
                    }}
                  >
                    <button
                      className="btn-secondary"
                      onClick={() =>
                        window.open(
                          appraisal.batchId
                            ? `${import.meta.env.VITE_API_URL || "http://localhost:3000"}/orgs/${orgId}/appraisals/${appraisal.batchId}/${appraisal.batch?.outputFormat === "SEPARATE_PDFS" ? "export.zip" : "export"}?token=${localStorage.getItem("token")}`
                            : `${import.meta.env.VITE_API_URL || "http://localhost:3000"}/appraisals/${appraisal.id}/export?token=${localStorage.getItem("token")}`,
                          "_blank",
                        )
                      }
                    >
                      {appraisal.batchId
                        ? "Export Report"
                        : "Export Report (CSV)"}
                    </button>
                    <button
                      className="btn-action danger"
                      onClick={() => handleDeleteAppraisal(appraisal.id)}
                    >
                      Delete Report
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentSection === "tracker" && (
          <>
            {canUseTrackerCharts && (
              <section className="tracker-analytics">
                <div className="tracker-hero">
                  <div>
                    <h2>Tracker</h2>
                  </div>
                  <div className="tracker-hero-right">
                    <p>
                      <strong>Workers:</strong> {workersActiveCount} people
                      active
                    </p>
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
                    className={trackerView === "users" ? "active" : ""}
                    onClick={() => handleTrackerViewChange("users")}
                  >
                    By Users
                  </button>
                  <button
                    type="button"
                    className={trackerView === "teams" ? "active" : ""}
                    onClick={() => handleTrackerViewChange("teams")}
                  >
                    By Teams
                  </button>
                </div>

                <div className="tracker-chart-panel">
                  <div className="tracker-chart-scroll">
                    <div
                      className="tracker-chart-grid"
                      style={{
                        minWidth: `${Math.max(currentChartData.length * 110, 680)}px`,
                      }}
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
                                style={{
                                  height: `${(item.pending / chartMaxValue) * 100}%`,
                                }}
                                title={`Pending: ${item.pending}`}
                              />
                              <span
                                className="tracker-bar ongoing"
                                style={{
                                  height: `${(item.ongoing / chartMaxValue) * 100}%`,
                                }}
                                title={`Ongoing: ${item.ongoing}`}
                              />
                              <span
                                className="tracker-bar completed"
                                style={{
                                  height: `${(item.completed / chartMaxValue) * 100}%`,
                                }}
                                title={`Completed: ${item.completed}`}
                              />
                              <span
                                className="tracker-bar overdue"
                                style={{
                                  height: `${(item.overdue / chartMaxValue) * 100}%`,
                                }}
                                title={`Overdue: ${item.overdue}`}
                              />
                            </div>
                            <div className="tracker-bar-label">
                              {item.label}
                            </div>
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
                  <div
                    className="stat-card performance-highlight"
                    title="View your performance metrics"
                  >
                    <h3>My Performance</h3>
                    <p className="stat-value">
                      {memberStats.find((m) => m.userId === user?.id)?.stats
                        .temperature || "🔴 Low Activity"}
                    </p>
                    <small>
                      Score:{" "}
                      {memberStats.find((m) => m.userId === user?.id)?.stats
                        .performanceScore || 0}
                      %
                    </small>
                  </div>
                )}
                <div
                  className="stat-card"
                  onClick={() => handleStatClick("all")}
                  title="View all tasks"
                >
                  <h3>Total Workload</h3>
                  <p className="stat-value">{stats.total}</p>
                </div>
                <div
                  className="stat-card"
                  onClick={() => handleStatClick("in_progress")}
                  title="View ongoing tasks"
                >
                  <h3>Ongoing Tasks</h3>
                  <p className="stat-value">{stats.ongoing}</p>
                </div>
                <div
                  className="stat-card"
                  onClick={() => handleStatClick("completed")}
                  title="View completed tasks"
                >
                  <h3>Completed Work</h3>
                  <p className="stat-value">{stats.completed}</p>
                </div>
                <div
                  className="stat-card"
                  onClick={() => handleStatClick("overdue")}
                  title="View overdue tasks"
                >
                  <h3>Overdue</h3>
                  <p className="stat-value" style={{ color: "#ef4444" }}>
                    {stats.overdue}
                  </p>
                </div>
                {!isAdmin && (
                  <div
                    className="stat-card"
                    onClick={() => handleStatClick("my")}
                    title="View your assigned tasks"
                  >
                    <h3>Your Focus</h3>
                    <p className="stat-value">{stats.myTasks}</p>
                  </div>
                )}
              </div>
            )}

            <div className="tasks-section">
              <div className="tasks-header">
                <h2>
                  {filter === "recently_deleted"
                    ? "Recently Deleted"
                    : "Task Tracker"}
                </h2>
                {(isMember || isTeamLead) && (
                  <p className="org-subtitle" style={{ margin: 0 }}>
                    Your tasks + your team-linked tasks
                  </p>
                )}
                <div className="filter-group">
                  {!isAdmin && (
                    <>
                      <button
                        type="button"
                        className={`btn-filter ${filter === "supporting" ? "active" : ""}`}
                        onClick={() => handleFilterClick("supporting")}
                      >
                        Supporting
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className={`btn-filter ${filter === "created" ? "active" : ""}`}
                    onClick={() => handleFilterClick("created")}
                  >
                    Pending
                  </button>
                  <button
                    type="button"
                    className={`btn-filter ${filter === "in_progress" ? "active" : ""}`}
                    onClick={() => handleFilterClick("in_progress")}
                  >
                    Ongoing
                  </button>
                  <button
                    type="button"
                    className={`btn-filter ${filter === "completed" ? "active" : ""}`}
                    onClick={() => handleFilterClick("completed")}
                  >
                    Completed
                  </button>
                  {canReviewTasks && (
                    <button
                      type="button"
                      className={`btn-filter ${filter === "pending_approval" ? "active" : ""}`}
                      onClick={() => handleFilterClick("pending_approval")}
                    >
                      Pending Approval
                    </button>
                  )}
                  <button
                    type="button"
                    className={`btn-filter overdue ${filter === "overdue" ? "active" : ""}`}
                    onClick={() => handleFilterClick("overdue")}
                  >
                    Overdue
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      className={`btn-filter ${filter === "recently_deleted" ? "active" : ""}`}
                      onClick={() => handleFilterClick("recently_deleted")}
                    >
                      Recently Deleted
                    </button>
                  )}
                  <CustomSelect
                    value={taskClientFilter}
                    onChange={(val) => setTaskClientFilter(val)}
                    style={{ minWidth: "150px" }}
                    options={[
                      { value: "all", label: "All Clients" },
                      ...clients.map((client) => ({
                        value: client.id,
                        label: client.name,
                      }))
                    ]}
                  />
                </div>
              </div>

              <div className="tasks-workspace">
                <div className="tasks-list">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      className="task-card-wrapper"
                      style={{ position: "relative" }}
                    >
                      <div
                        key={task.id}
                        className={`task-card task-card-compact clickable ${selectedTaskId === task.id ? "active" : ""} ${isOverdue(task) ? "overdue" : ""}`}
                        onClick={() => setSelectedTaskId(task.id)}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="task-header">
                          <h3>{task.title}</h3>
                          <div className="task-badges">
                            <span
                              className={`priority-badge ${task.priority?.toLowerCase() || ""}`}
                            >
                              {task.priority}
                            </span>
                            <span
                              className={`status-badge ${task.status?.toLowerCase() || ""}`}
                            >
                              {formatStatusLabel(task.status)}
                            </span>
                            {isOverdue(task) && (
                              <span
                                className="status-badge overdue"
                                title={`Due: ${new Date(task.dueDate!).toLocaleDateString()} (${getDaysOverdue(task)} days overdue)`}
                              >
                                Overdue
                              </span>
                            )}
                            {task.approvalStatus &&
                              task.approvalStatus !== "NOT_SUBMITTED" && (
                                <span
                                  className="status-badge"
                                  style={{
                                    background:
                                      task.approvalStatus === "APPROVED"
                                        ? "#dcfce7"
                                        : task.approvalStatus === "REJECTED"
                                          ? "#fee2e2"
                                          : "#fef3c7",
                                    color:
                                      task.approvalStatus === "APPROVED"
                                        ? "#166534"
                                        : task.approvalStatus === "REJECTED"
                                          ? "#b91c1c"
                                          : "#92400e",
                                    borderColor:
                                      task.approvalStatus === "APPROVED"
                                        ? "#86efac"
                                        : task.approvalStatus === "REJECTED"
                                          ? "#fecaca"
                                          : "#fde68a",
                                  }}
                                  title="Approval status"
                                >
                                  {formatStatusLabel(task.approvalStatus)}
                                </span>
                              )}
                          </div>
                        </div>
                        <div className="task-meta">
                          {isDeletedView ? (
                            <>
                              <div className="meta-item">
                                <strong>Deleted:</strong>{" "}
                                {task.deletedAt
                                  ? new Date(
                                      task.deletedAt,
                                    ).toLocaleDateString()
                                  : "Unknown"}
                              </div>
                              <div className="meta-item">
                                <strong>Purge In:</strong>{" "}
                                {getDaysUntilPurge(task.deletedAt)} day(s)
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="meta-item">
                                <strong>Due Date:</strong>{" "}
                                {task.dueDate
                                  ? new Date(task.dueDate).toLocaleDateString()
                                  : "No Due Date"}
                              </div>
                              <div className="meta-item">
                                <strong>Owner:</strong>{" "}
                                {task.assignee?.name ||
                                  task.assignee?.email ||
                                  "Unassigned"}
                              </div>
                              <div className="meta-item">
                                <strong>Supporter:</strong>{" "}
                                {task.supporter?.name ||
                                  task.supporter?.email ||
                                  "None"}
                              </div>
                              <div className="meta-item">
                                <strong>Teams:</strong>{" "}
                                {(task.taskTeams || [])
                                  .map((tt) => tt.team.name)
                                  .join(", ") || "None"}
                              </div>
                              <div className="meta-item">
                                <strong>Comments:</strong>{" "}
                                {task.comments?.length || 0}
                              </div>
                            </>
                          )}
                        </div>
                        <button
                          type="button"
                          className="task-menu-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpenTaskId(
                              menuOpenTaskId === task.id ? null : task.id,
                            );
                          }}
                          style={{
                            position: "absolute",
                            top: "12px",
                            right: "12px",
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            padding: "4px",
                            borderRadius: "4px",
                            color: "var(--text-muted)",
                            fontSize: "20px",
                            lineHeight: "1",
                          }}
                        >
                          ⋮
                        </button>
                      </div>

                      {menuOpenTaskId === task.id && (
                        <div
                          className="task-menu-dropdown"
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            position: "absolute",
                            top: "40px",
                            right: "12px",
                            background: "white",
                            border: "1px solid var(--border-color)",
                            borderRadius: "8px",
                            boxShadow: "var(--shadow-lg)",
                            zIndex: 100,
                            minWidth: "160px",
                          }}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditTask(task);
                              setMenuOpenTaskId(null);
                            }}
                            style={{
                              display: "block",
                              width: "100%",
                              padding: "10px 16px",
                              background: "none",
                              border: "none",
                              textAlign: "left",
                              cursor: "pointer",
                              fontSize: "0.9em",
                              color: "var(--text-main)",
                              borderRadius: "8px 8px 0 0",
                            }}
                          >
                            Edit
                          </button>
                          {!isTaskCompleted(task.status) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUpdateTaskStatus(task.id, "COMPLETED");
                                setMenuOpenTaskId(null);
                              }}
                              style={{
                                display: "block",
                                width: "100%",
                                padding: "10px 16px",
                                background: "none",
                                border: "none",
                                textAlign: "left",
                                cursor: "pointer",
                                fontSize: "0.9em",
                                color: "var(--text-main)",
                                borderTop: "1px solid var(--border-color)",
                              }}
                            >
                              Mark as Complete
                            </button>
                          )}
                          {canDeleteTask(task) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openTaskDeleteDialog(task.id);
                                setMenuOpenTaskId(null);
                              }}
                              style={{
                                display: "block",
                                width: "100%",
                                padding: "10px 16px",
                                background: "none",
                                border: "none",
                                textAlign: "left",
                                cursor: "pointer",
                                fontSize: "0.9em",
                                color: "#DC2626",
                                borderTop: "1px solid var(--border-color)",
                                borderRadius: "0 0 8px 8px",
                              }}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div
                  className={`task-detail-backdrop ${selectedTaskId ? "active" : ""} ${isExpandedFullScreen ? "full-screen-backdrop" : ""}`}
                  onClick={() => {
                    setSelectedTaskId(null);
                    setIsExpandedFullScreen(false);
                  }}
                />
                <aside
                  className={`task-detail-panel ${selectedTask ? "open" : ""} ${isExpandedFullScreen ? "full-screen" : ""}`}
                >
                  {renderTaskDetailPanelInner()}
                </aside>
              </div>
            </div>
          </>
        )}
      </div>

      {showCreateClientModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowCreateClientModal(false)}
        >
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
                <CustomSelect
                  value={clientFormVisibility}
                  onChange={(val) => setClientFormVisibility(val)}
                  options={[
                    { value: "ORG_WIDE", label: "Organization-wide (All members)" },
                    { value: "CREATOR_ONLY", label: "Only me (Creator)" },
                  ]}
                />
              </div>
              <div className="modal-notice">
                <small>
                  This client will be visible to all team members and team
                  leads.
                </small>
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => setShowCreateClientModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Create Client
                </button>
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
                <CustomSelect
                  value={clientFormVisibility}
                  onChange={(val) => setClientFormVisibility(val)}
                  options={[
                    { value: "ORG_WIDE", label: "Organization-wide (All members)" },
                    { value: "CREATOR_ONLY", label: "Only me (Creator)" },
                  ]}
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => setEditingClient(null)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save Client
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCreateTaskModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowCreateTaskModal(false)}
        >
          <div
            className="modal large no-scroll"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-record-header">
              <div>
                <h2>Create New Task</h2>
                <p>Capture ownership, timeline, priority, and OKR impact.</p>
              </div>
              <span className="stamp-badge stamp-badge-sm">TASK ENTRY</span>
            </div>
            <form onSubmit={handleCreateTask} className="record-dialog-form">
              <div className="dialog-section">
                <div className="dialog-section-title">Task Brief</div>
                <div className="form-group">
                  <label>Title *</label>
                  <input
                    type="text"
                    value={newTask.title}
                    onChange={(e) =>
                      setNewTask({ ...newTask, title: e.target.value })
                    }
                    required
                    autoFocus
                  />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    value={newTask.description}
                    onChange={(e) =>
                      setNewTask({ ...newTask, description: e.target.value })
                    }
                    rows={4}
                  />
                </div>
              </div>
              <div className="dialog-section">
                <div className="dialog-section-title">Status & Timeline</div>
                <div className="form-row form-row-three">
                  <div className="form-group">
                    <label>Priority</label>
                    <CustomSelect
                      value={newTask.priority}
                      onChange={(val) => setNewTask({ ...newTask, priority: val })}
                      options={[
                        { value: "LOW", label: "Low" },
                        { value: "MEDIUM", label: "Medium" },
                        { value: "HIGH", label: "High" },
                      ]}
                    />
                  </div>
                  <div className="form-group">
                    <label>Due Date</label>
                    <input
                      type="date"
                      value={newTask.dueDate}
                      onChange={(e) =>
                        setNewTask({ ...newTask, dueDate: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <CustomSelect
                      value={newTask.status}
                      onChange={(val) => setNewTask({ ...newTask, status: val })}
                      options={[
                        { value: "TODO", label: "To Do" },
                        { value: "IN_PROGRESS", label: "In Progress" },
                        { value: "IN_REVIEW", label: "In Review" },
                        { value: "DONE", label: "Done" },
                        { value: "ON_HOLD", label: "On Hold" },
                        { value: "CANCELLED", label: "Cancelled" },
                      ]}
                    />
                  </div>
                </div>
              </div>
              <div className="dialog-section">
                <div className="dialog-section-title">Ownership</div>
                {organization?.members && (
                  <div className="form-group">
                    <label>Primary Assignee *</label>
                    <CustomSelect
                      value={newTask.assigneeId}
                      placeholder="Select assignee"
                      onChange={(assigneeId) => {
                        const isDelegated = assigneeId && assigneeId !== user?.id;
                        setNewTask({
                          ...newTask,
                          assigneeId,
                          supporterId: newTask.supporterId === assigneeId ? "" : newTask.supporterId,
                          alertTeamLead: isDelegated ? true : newTask.alertTeamLead,
                          okrId: "",
                          keyResultIds: [],
                        });
                        if (assigneeId) {
                          void loadLinkableOkrs(assigneeId);
                        }
                      }}
                      options={taskAssignableUsers.map((member) => ({
                        value: member.user.id,
                        label: member.user.id === user?.id
                          ? `Me (${member.user.name || member.user.email})`
                          : member.user.name || member.user.email,
                      }))}
                    />
                  </div>
                )}
                {organization?.members && (
                  <div className="form-group">
                    <label>Supported By (Optional)</label>
                    <CustomSelect
                      value={newTask.supporterId}
                      placeholder="Select supporter (optional)"
                      onChange={(val) => setNewTask({ ...newTask, supporterId: val })}
                      options={[
                        { value: "", label: "None (Optional)" },
                        ...taskAssignableUsers
                          .filter((member) => member.user.id !== newTask.assigneeId)
                          .map((member) => ({
                            value: member.user.id,
                            label: member.user.id === user?.id
                              ? `Me (${member.user.name || member.user.email})`
                              : member.user.name || member.user.email,
                          }))
                      ]}
                    />
                  </div>
                )}
                {!isTeamLead && (
                  <div className="form-group">
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={
                          newTask.alertTeamLead ||
                          (newTask.assigneeId &&
                            newTask.assigneeId !== user?.id) ||
                          false
                        }
                        disabled={
                          newTask.assigneeId && newTask.assigneeId !== user?.id
                            ? true
                            : false
                        }
                        onChange={(e) =>
                          setNewTask({
                            ...newTask,
                            alertTeamLead: e.target.checked,
                          })
                        }
                        style={{ width: "auto", margin: 0 }}
                      />
                      <span>
                        Alert Team Lead about this task
                        {newTask.assigneeId && newTask.assigneeId !== user?.id
                          ? " (Locked: Delegated task)"
                          : ""}
                      </span>
                    </label>
                    <small
                      style={{
                        color: "var(--text-muted)",
                        display: "block",
                        marginTop: 4,
                      }}
                    >
                      Reviewers will be notified about this task.
                    </small>
                  </div>
                )}
              </div>
              <div className="form-group">
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={createMore}
                    onChange={(e) => setCreateMore(e.target.checked)}
                    style={{ width: "auto", margin: 0 }}
                  />
                  <span>Create more (keep this form open after saving)</span>
                </label>
              </div>
              <div className="dialog-section">
                <div className="dialog-section-title">OKR Contribution</div>
              <div className="form-group">
                <label>OKR Key Results</label>
                <div className="task-kr-toolbar">
                  <span className="task-kr-count-pill">
                    {newTask.keyResultIds.length > 0
                      ? `${newTask.keyResultIds.length} selected`
                      : "General selected"}
                  </span>
                </div>
                {newTask.assigneeId ? (
                  <>
                    <div style={{ marginBottom: 10 }}>
                      <button
                        type="button"
                        className={`task-kr-option ${newTask.keyResultIds.length === 0 ? "selected" : ""}`}
                        aria-pressed={newTask.keyResultIds.length === 0}
                        onClick={() =>
                          setNewTask({
                            ...newTask,
                            okrId: "",
                            keyResultIds: [],
                          })
                        }
                      >
                        <span className="task-kr-option-label">
                          General (Not attached to any OKR)
                        </span>
                      </button>
                    </div>
                    {newTaskLinkableOkrs.length > 0 ? (
                      <div className="task-kr-picker">
                        {newTaskLinkableOkrs.map((okr) => (
                          <div key={okr.id} className="task-kr-group">
                            <div className="task-kr-group-title">
                              {okr.title}
                            </div>
                            <div className="helper-text">
                              {okr.periodStart?.slice(0, 10)} to{" "}
                              {okr.periodEnd?.slice(0, 10)}
                            </div>
                            <div className="task-kr-options">
                              {(okr.keyResults || []).map((kr) => {
                                const selected = newTask.keyResultIds.includes(
                                  kr.id,
                                );
                                return (
                                  <button
                                    key={kr.id}
                                    type="button"
                                    className={`task-kr-option ${selected ? "selected" : ""}`}
                                    aria-pressed={selected}
                                    onClick={() =>
                                      setNewTask({
                                        ...newTask,
                                        okrId: okr.id,
                                        keyResultIds: toggleTaskKeyResult(
                                          newTask.keyResultIds,
                                          kr.id,
                                        ),
                                      })
                                    }
                                  >
                                    <span className="task-kr-option-label">
                                      {kr.isGeneral ? "General" : kr.title}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="task-kr-empty">
                        No key results found for this assignee.
                      </div>
                    )}
                  </>
                ) : (
                  <div className="task-kr-empty">
                    Select an assignee first to load their key results.
                  </div>
                )}
                <small className="modal-helper-text" style={{ marginTop: 8 }}>
                  {newTask.keyResultIds.length > 0
                    ? `This task will contribute to ${newTask.keyResultIds.length} selected key result${newTask.keyResultIds.length > 1 ? "s" : ""}`
                    : "This task is marked as General and not attached to any OKR"}
                </small>
              </div>
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => setShowCreateTaskModal(false)}
                  className="btn-secondary"
                  disabled={creatingTask}
                >
                  Cancel
                </button>
                <DebouncedButton
                  type="submit"
                  className="btn-primary"
                  debounceMs={1200}
                  disabled={creatingTask}
                  aria-busy={creatingTask}
                >
                  {creatingTask ? "Creating..." : "Create Task"}
                </DebouncedButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditTaskModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowEditTaskModal(false)}
        >
          <div
            className="modal large no-scroll"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Edit Task</h2>
            <form onSubmit={handleUpdateTask}>
              <div className="form-group">
                <label>Title *</label>
                <input
                  type="text"
                  value={editTask.title}
                  onChange={(e) =>
                    setEditTask({ ...editTask, title: e.target.value })
                  }
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={editTask.description}
                  onChange={(e) =>
                    setEditTask({ ...editTask, description: e.target.value })
                  }
                  rows={4}
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Priority</label>
                  <CustomSelect
                    value={editTask.priority}
                    onChange={(val) =>
                      setEditTask({ ...editTask, priority: val })
                    }
                    options={[
                      { value: "LOW", label: "Low" },
                      { value: "MEDIUM", label: "Medium" },
                      { value: "HIGH", label: "High" },
                    ]}
                  />
                </div>
                <div className="form-group">
                  <label>Due Date</label>
                  <input
                    type="date"
                    value={editTask.dueDate}
                    onChange={(e) =>
                      setEditTask({ ...editTask, dueDate: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <CustomSelect
                    value={editTask.status}
                    onChange={(val) =>
                      setEditTask({ ...editTask, status: val })
                    }
                    options={[
                      { value: "TODO", label: "To Do" },
                      { value: "IN_PROGRESS", label: "In Progress" },
                      { value: "IN_REVIEW", label: "In Review" },
                      { value: "DONE", label: "Done" },
                      { value: "ON_HOLD", label: "On Hold" },
                      { value: "CANCELLED", label: "Cancelled" },
                    ]}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Primary Assignee *</label>
                <CustomSelect
                  value={editTask.assigneeId}
                  placeholder="Select assignee"
                  onChange={(assigneeId) => {
                    const isDelegated = assigneeId && assigneeId !== user?.id;
                    setEditTask({
                      ...editTask,
                      assigneeId,
                      supporterId: editTask.supporterId === assigneeId ? "" : editTask.supporterId,
                      alertTeamLead: isDelegated ? true : editTask.alertTeamLead,
                      okrId: "",
                      keyResultIds: [],
                    });
                    if (assigneeId) {
                      void loadLinkableOkrs(assigneeId);
                    }
                  }}
                  options={taskAssignableUsers.map((member) => ({
                    value: member.user.id,
                    label: member.user.id === user?.id
                      ? `Me (${member.user.name || member.user.email})`
                      : member.user.name || member.user.email,
                  }))}
                />
              </div>
              <div className="form-group">
                <label>OKR Key Results</label>
                {editTask.assigneeId ? (
                  <>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        cursor: "pointer",
                        marginBottom: 8,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={editTask.keyResultIds.length === 0}
                        onChange={() =>
                          setEditTask({
                            ...editTask,
                            okrId: "",
                            keyResultIds: [],
                          })
                        }
                      />
                      <span>General (Not attached to any OKR)</span>
                    </label>
                    {editTaskLinkableOkrs.length > 0 ? (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 12,
                          maxHeight: 220,
                          overflowY: "auto",
                          padding: 12,
                          border: "1px solid var(--border-color)",
                          borderRadius: 12,
                          background: "#fff",
                        }}
                      >
                        {editTaskLinkableOkrs.map((okr) => (
                          <div key={okr.id}>
                            <div
                              style={{
                                fontWeight: 600,
                                marginBottom: 6,
                                color: "var(--text-main)",
                              }}
                            >
                              {okr.title}
                            </div>
                            <div className="helper-text">
                              {okr.periodStart?.slice(0, 10)} to{" "}
                              {okr.periodEnd?.slice(0, 10)}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 8,
                              }}
                            >
                              {(okr.keyResults || []).map((kr) => (
                                <label
                                  key={kr.id}
                                  style={{
                                    display: "flex",
                                    alignItems: "flex-start",
                                    gap: 8,
                                    cursor: "pointer",
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={editTask.keyResultIds.includes(
                                      kr.id,
                                    )}
                                    onChange={() =>
                                      setEditTask({
                                        ...editTask,
                                        okrId: okr.id,
                                        keyResultIds: toggleTaskKeyResult(
                                          editTask.keyResultIds,
                                          kr.id,
                                        ),
                                      })
                                    }
                                    style={{ marginTop: 2 }}
                                  />
                                  <span>
                                    {kr.isGeneral ? "General" : kr.title}
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="helper-text">
                        No key results found for this assignee.
                      </div>
                    )}
                  </>
                ) : (
                  <div className="helper-text">
                    Select an assignee first to load their key results.
                  </div>
                )}
                <small
                  style={{
                    color: "var(--text-muted)",
                    display: "block",
                    marginTop: 4,
                  }}
                >
                  {editTask.keyResultIds.length > 0
                    ? `This task is linked to ${editTask.keyResultIds.length} key result${editTask.keyResultIds.length > 1 ? "s" : ""}`
                    : "This task is marked as General and not attached to any OKR"}
                </small>
              </div>
              <div className="form-group">
                <label>Supported By (Optional)</label>
                <CustomSelect
                  value={editTask.supporterId}
                  placeholder="Select supporter (optional)"
                  onChange={(val) =>
                    setEditTask({ ...editTask, supporterId: val })
                  }
                  options={[
                    { value: "", label: "None (Optional)" },
                    ...taskAssignableUsers
                      .filter((member) => member.user.id !== editTask.assigneeId)
                      .map((member) => ({
                        value: member.user.id,
                        label: member.user.id === user?.id
                          ? `Me (${member.user.name || member.user.email})`
                          : member.user.name || member.user.email,
                      }))
                  ]}
                />
              </div>
              {!isTeamLead && (
                <div className="form-group">
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={
                        editTask.alertTeamLead ||
                        (editTask.assigneeId &&
                          editTask.assigneeId !== user?.id) ||
                        false
                      }
                      disabled={
                        editTask.assigneeId && editTask.assigneeId !== user?.id
                          ? true
                          : false
                      }
                      onChange={(e) =>
                        setEditTask({
                          ...editTask,
                          alertTeamLead: e.target.checked,
                        })
                      }
                      style={{ width: "auto", margin: 0 }}
                    />
                    <span>
                      Send task alert for review
                      {editTask.assigneeId && editTask.assigneeId !== user?.id
                        ? " (Locked: Delegated task)"
                        : ""}
                    </span>
                  </label>
                  <p
                    style={{
                      margin: "4px 0 0 0",
                      fontSize: "0.85em",
                      color: "var(--text-secondary)",
                    }}
                  >
                    Reviewers will be notified about this task.
                  </p>
                </div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => setShowEditTaskModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSendAlertModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowSendAlertModal(false)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-record-header">
              <div>
                <h2>Send Dispatch Alert</h2>
                <p>Notify the right recipient with a clear follow-up signal.</p>
              </div>
              <span className="stamp-badge stamp-badge-sm">SIGNAL DISPATCH</span>
            </div>
            <form onSubmit={handleSendAlert} className="record-dialog-form">
              <div className="dialog-section">
                <div className="dialog-section-title">Routing</div>
                <div className="form-group">
                  <label>Target Type</label>
                  <CustomSelect
                    value={alertForm.targetType}
                    onChange={(val) =>
                      setAlertForm({
                        ...alertForm,
                        targetType: val,
                        targetId: "",
                      })
                    }
                    options={isTeamLead ? [
                      { value: "ADMINS", label: "Admin" },
                      { value: "TEAM", label: "My Team", disabled: !currentOrgMember?.teamId },
                    ] : [
                      { value: "INDIVIDUAL", label: isMember ? "Admin or Team Lead" : "Individual Member" },
                      ...(!isMember ? [{ value: "TEAM", label: "Entire Team" }] : [])
                    ]}
                  />
                </div>

                {!isTeamLead && (
                  <div className="form-group">
                    <label>Recipient</label>
                    <CustomSelect
                      value={alertForm.targetId}
                      placeholder="Select Recipient"
                      onChange={(val) =>
                        setAlertForm({ ...alertForm, targetId: val })
                      }
                      options={alertForm.targetType === "INDIVIDUAL"
                        ? alertRecipientUsers.map((u) => ({ value: u.userId, label: u.user.name || u.user.email }))
                        : alertRecipientTeams.map((t) => ({ value: t.teamId, label: t.teamName }))}
                    />
                  </div>
                )}
              </div>

              <div className="dialog-section">
                <div className="dialog-section-title">Message</div>
                <div className="form-group">
                  <label>Alert Type</label>
                  <CustomSelect
                    value={alertForm.type}
                    onChange={(val) =>
                      setAlertForm({ ...alertForm, type: val })
                    }
                    options={[
                      { value: "DEADLINE_REMINDER", label: "Deadline Reminder" },
                      { value: "PRIORITY_ALERT", label: "Task Priority Notification" },
                      { value: "URGENT_SUPPORT", label: "Urgent Support" },
                      { value: "MANAGER_CHECK_IN", label: "Manager Check-in" },
                      { value: "CUSTOM", label: "Custom Message" },
                    ]}
                  />
                </div>

                <div className="form-group">
                  <label>Message</label>
                  <textarea
                    rows={4}
                    value={alertForm.message}
                    onChange={(e) =>
                      setAlertForm({ ...alertForm, message: e.target.value })
                    }
                    placeholder="Enter your alert message here..."
                    required
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => setShowSendAlertModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Send Alert
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCreateTeamModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowCreateTeamModal(false)}
        >
          <div
            className="modal large no-scroll team-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-record-header">
              <div>
                <h2>Create Team Record</h2>
                <p>Define team ownership and membership in one place.</p>
              </div>
              <span className="stamp-badge stamp-badge-sm">TEAM STRUCTURE</span>
            </div>
            <form onSubmit={handleCreateTeam} className="modal-form record-dialog-form">
              <div className="dialog-section">
                <div className="dialog-section-title">Team Details</div>
                <div className="form-group">
                  <label>Team Name</label>
                  <input
                    type="text"
                    value={teamForm.name}
                    onChange={(e) =>
                      setTeamForm({ ...teamForm, name: e.target.value })
                    }
                    required
                    autoFocus
                  />
                </div>
                <div className="form-group">
                  <label>Team Lead (Optional)</label>
                  <CustomSelect
                    value={teamForm.leadUserId}
                    placeholder="Select lead (optional)"
                    onChange={(leadId) => {
                      setTeamForm((prev) => ({
                        ...prev,
                        leadUserId: leadId,
                        memberUserIds: prev.memberUserIds.includes(leadId)
                          ? prev.memberUserIds
                          : [...prev.memberUserIds, leadId],
                      }));
                    }}
                    options={[
                      { value: "", label: "None (Optional)" },
                      ...teamLeadUsers.map((member) => ({
                        value: member.user.id,
                        label: member.user.name || member.user.email,
                      }))
                    ]}
                  />
                </div>
              </div>
              <div className="dialog-section">
                <div className="dialog-section-title">Members</div>
              <div className="form-group">
                <label>Members</label>
                <MemberMultiSelect
                  options={assignableUsers.map((member) => ({
                    id: member.user.id,
                    name: member.user.name,
                    email: member.user.email,
                  }))}
                  value={Array.from(
                    new Set(
                      [
                        ...teamForm.memberUserIds,
                        ...(teamForm.leadUserId ? [teamForm.leadUserId] : []),
                      ].filter(Boolean),
                    ),
                  )}
                  lockedIds={teamForm.leadUserId ? [teamForm.leadUserId] : []}
                  onChange={(memberUserIds) =>
                    setTeamForm((prev) => ({
                      ...prev,
                      memberUserIds:
                        prev.leadUserId &&
                        !memberUserIds.includes(prev.leadUserId)
                          ? [...memberUserIds, prev.leadUserId]
                          : memberUserIds,
                    }))
                  }
                />
              </div>
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setShowCreateTeamModal(false);
                    resetTeamForm();
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Create Team
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingTeam && (
        <div className="modal-overlay" onClick={() => setEditingTeam(null)}>
          <div
            className="modal large no-scroll"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Edit Team</h2>
            <form onSubmit={handleUpdateTeam}>
              <div className="form-group">
                <label>Team Name</label>
                <input
                  type="text"
                  value={teamForm.name}
                  onChange={(e) =>
                    setTeamForm({ ...teamForm, name: e.target.value })
                  }
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Lead (Optional)</label>
                <CustomSelect
                  value={teamForm.leadUserId}
                  placeholder="Select lead (optional)"
                  onChange={(leadId) => {
                    setTeamForm((prev) => ({
                      ...prev,
                      leadUserId: leadId,
                      memberUserIds: prev.memberUserIds.includes(leadId)
                        ? prev.memberUserIds
                        : [...prev.memberUserIds, leadId],
                    }));
                  }}
                  options={[
                    { value: "", label: "None (Optional)" },
                    ...teamLeadUsers.map((member) => ({
                      value: member.user.id,
                      label: member.user.name || member.user.email,
                    }))
                  ]}
                />
              </div>
              <div className="form-group">
                <label>Members</label>
                <MemberMultiSelect
                  options={assignableUsers.map((member) => ({
                    id: member.user.id,
                    name: member.user.name,
                    email: member.user.email,
                  }))}
                  value={Array.from(
                    new Set(
                      [
                        ...teamForm.memberUserIds,
                        ...(teamForm.leadUserId ? [teamForm.leadUserId] : []),
                      ].filter(Boolean),
                    ),
                  )}
                  lockedIds={teamForm.leadUserId ? [teamForm.leadUserId] : []}
                  onChange={(memberUserIds) =>
                    setTeamForm((prev) => ({
                      ...prev,
                      memberUserIds:
                        prev.leadUserId &&
                        !memberUserIds.includes(prev.leadUserId)
                          ? [...memberUserIds, prev.leadUserId]
                          : memberUserIds,
                    }))
                  }
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setEditingTeam(null);
                    resetTeamForm();
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save Team
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCreateOkrModal && (
        <div
          className="modal-overlay"
          onClick={() => {
            if (!creatingOkr) setShowCreateOkrModal(false);
          }}
        >
          <div
            className="modal large no-scroll okr-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-record-header">
              <div>
                <h2>Create OKR Ledger</h2>
                <p>Set the objective, accountable team, support teams, and measurable results.</p>
              </div>
              <span className="stamp-badge stamp-badge-sm">TARGET SETUP</span>
            </div>
            <form onSubmit={handleCreateOkr} className="modal-form record-dialog-form">
              <div className="dialog-section">
                <div className="dialog-section-title">Objective</div>
                <div className="form-group">
                  <label>Objective Title</label>
                  <input
                    type="text"
                    value={newOkr.title}
                    onChange={(e) =>
                      setNewOkr({ ...newOkr, title: e.target.value })
                    }
                    required
                    autoFocus
                  />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    rows={3}
                    value={newOkr.description}
                    onChange={(e) =>
                      setNewOkr({ ...newOkr, description: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="dialog-section">
                <div className="dialog-section-title">Period & Status</div>
              <div className="form-row">
                <div className="form-group">
                  <label>Period Start</label>
                  <input
                    type="date"
                    value={newOkr.periodStart}
                    onChange={(e) => {
                      setNewOkr({
                        ...newOkr,
                        periodStart: e.target.value,
                      });
                    }}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Period End</label>
                  <input
                    type="date"
                    value={newOkr.periodEnd}
                    onChange={(e) => {
                      setNewOkr({
                        ...newOkr,
                        periodEnd: e.target.value,
                      });
                    }}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Status</label>
                <CustomSelect
                  value={newOkr.status}
                  onChange={(val) =>
                    setNewOkr({ ...newOkr, status: val })
                  }
                  options={[
                    { value: "NOT_YET_OPEN", label: "Not yet Open" },
                    { value: "OPEN", label: "Open" },
                    { value: "COMPLETED", label: "Completed" },
                  ]}
                />
              </div>
            </div>

            <div className="dialog-section">
              <div className="dialog-section-title">Team Coverage</div>
              <div className="form-group">
                <label>Assigned To (Primary Team)</label>
                <CustomSelect
                  value={newOkr.assignedToTeamId}
                  placeholder="Select a team"
                  onChange={(assignedToTeamId) => {
                    setNewOkr((prev) => ({
                      ...prev,
                      assignedToTeamId,
                      supportedByTeamIds: prev.supportedByTeamIds.filter(
                        (teamId) => teamId !== assignedToTeamId,
                      ),
                    }));
                  }}
                  options={[
                    { value: "", label: "None (Optional)" },
                    ...teams.map((team) => ({
                      value: team.id,
                      label: team.name,
                    }))
                  ]}
                />
              </div>

              <div className="form-group">
                <label>Supported By (Contributing Teams)</label>
                {teams.length > 0 ? (
                  <TeamMultiDropdown
                    teams={teams}
                    value={newOkr.supportedByTeamIds}
                    disabledTeamId={newOkr.assignedToTeamId}
                    onChange={(supportedByTeamIds) =>
                      setNewOkr((prev) => ({
                        ...prev,
                        supportedByTeamIds,
                      }))
                    }
                    emptyMessage="No other teams available."
                  />
                ) : (
                  <p
                    style={{
                      fontSize: "0.85em",
                      color: "var(--text-muted)",
                      margin: "8px 0",
                    }}
                  >
                    No teams available. Create teams first to assign them as
                    supporters.
                  </p>
                )}
              </div>
              </div>

              <div className="dialog-section">
                <div className="dialog-section-title">Key Results</div>
              {newOkr.keyResults.map((kr, index) => (
                <div key={index} className="okr-kr-form-card">
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
                  <div className="form-group">
                    <label>Owners (Members)</label>
                    <MemberMultiSelect
                      options={assignableUsers.map((member) => ({
                        id: member.user.id,
                        name: member.user.name,
                        email: member.user.email,
                      }))}
                      value={kr.ownerUserIds || []}
                      onChange={(ownerUserIds) => {
                        const next = [...newOkr.keyResults];
                        next[index].ownerUserIds = ownerUserIds;
                        setNewOkr({ ...newOkr, keyResults: next });
                      }}
                      maxVisibleChips={3}
                    />
                  </div>

                  <div className="modal-helper-text">
                    Parsed contribution is calculated automatically from the
                    first number in the KR title.
                  </div>
                  <button
                    type="button"
                    className="modal-inline-danger"
                    onClick={() => {
                      const next = newOkr.keyResults.filter(
                        (_, i) => i !== index,
                      );
                      setNewOkr({
                        ...newOkr,
                        keyResults: next.length ? next : [createEmptyKrForm()],
                      });
                    }}
                  >
                  Remove KR
                </button>
                </div>
              ))}
              <button
                type="button"
                className="btn-secondary"
                onClick={() =>
                  setNewOkr({
                    ...newOkr,
                    keyResults: [
                      ...newOkr.keyResults,
                      { ...createEmptyKrForm() },
                    ],
                  })
                }
              >
                + Add Key Result
              </button>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => setShowCreateOkrModal(false)}
                  className="btn-secondary"
                  disabled={creatingOkr}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={creatingOkr}
                >
                  {creatingOkr ? "Creating…" : "Create OKR"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditOkrModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowEditOkrModal(false)}
        >
          <div
            className="modal large no-scroll okr-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Edit OKR</h2>
            <form onSubmit={handleUpdateOkr} className="modal-form">
              <div className="form-group">
                <label>Objective Title</label>
                <input
                  type="text"
                  value={editOkrForm.title}
                  onChange={(e) =>
                    setEditOkrForm({ ...editOkrForm, title: e.target.value })
                  }
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  rows={3}
                  value={editOkrForm.description}
                  onChange={(e) =>
                    setEditOkrForm({
                      ...editOkrForm,
                      description: e.target.value,
                    })
                  }
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Period Start</label>
                  <input
                    type="date"
                    value={editOkrForm.periodStart}
                    onChange={(e) =>
                      setEditOkrForm({
                        ...editOkrForm,
                        periodStart: e.target.value,
                      })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Period End</label>
                  <input
                    type="date"
                    value={editOkrForm.periodEnd}
                    onChange={(e) =>
                      setEditOkrForm({
                        ...editOkrForm,
                        periodEnd: e.target.value,
                      })
                    }
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Status</label>
                <CustomSelect
                  value={editOkrForm.status}
                  onChange={(val) =>
                    setEditOkrForm({ ...editOkrForm, status: val })
                  }
                  options={[
                    { value: "NOT_YET_OPEN", label: "Not yet Open" },
                    { value: "OPEN", label: "Open" },
                    { value: "COMPLETED", label: "Completed" },
                  ]}
                />
              </div>

              <div className="form-group">
                <label>Assigned To (Primary Team)</label>
                <CustomSelect
                  value={editOkrForm.assignedToTeamId}
                  placeholder="Select a team"
                  onChange={(assignedToTeamId) => {
                    setEditOkrForm((prev) => ({
                      ...prev,
                      assignedToTeamId,
                      supportedByTeamIds: prev.supportedByTeamIds.filter(
                        (teamId) => teamId !== assignedToTeamId,
                      ),
                    }));
                  }}
                  options={[
                    { value: "", label: "None (Optional)" },
                    ...teams.map((team) => ({
                      value: team.id,
                      label: team.name,
                    }))
                  ]}
                />
              </div>

              <div className="form-group">
                <label>Supported By (Contributing Teams)</label>
                {teams.length > 0 ? (
                  <TeamMultiDropdown
                    teams={teams}
                    value={editOkrForm.supportedByTeamIds}
                    disabledTeamId={editOkrForm.assignedToTeamId}
                    onChange={(supportedByTeamIds) =>
                      setEditOkrForm((prev) => ({
                        ...prev,
                        supportedByTeamIds,
                      }))
                    }
                    emptyMessage="No other teams available."
                  />
                ) : (
                  <p
                    style={{
                      fontSize: "0.85em",
                      color: "var(--text-muted)",
                      margin: "8px 0",
                    }}
                  >
                    No teams available. Create teams first to assign them as
                    supporters.
                  </p>
                )}
              </div>

              <h3 className="modal-subtitle">Key Results</h3>
              {editOkrForm.keyResults.map((kr, index) => (
                <div key={index} className="okr-kr-form-card">
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
                  <div className="form-group">
                    <label>Owners (Members)</label>
                    <MemberMultiSelect
                      options={assignableUsers.map((member) => ({
                        id: member.user.id,
                        name: member.user.name,
                        email: member.user.email,
                      }))}
                      value={kr.ownerUserIds || []}
                      onChange={(ownerUserIds) => {
                        const next = [...editOkrForm.keyResults];
                        next[index].ownerUserIds = ownerUserIds;
                        setEditOkrForm({ ...editOkrForm, keyResults: next });
                      }}
                      maxVisibleChips={3}
                    />
                  </div>

                  <div className="modal-helper-text">
                    Parsed contribution is calculated automatically from the
                    first number in the KR title.
                  </div>
                  <button
                    type="button"
                    className="modal-inline-danger"
                    onClick={() => {
                      const next = editOkrForm.keyResults.filter(
                        (_, i) => i !== index,
                      );
                      setEditOkrForm({
                        ...editOkrForm,
                        keyResults: next.length ? next : [createEmptyKrForm()],
                      });
                    }}
                  >
                    Remove KR
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn-secondary"
                onClick={() =>
                  setEditOkrForm({
                    ...editOkrForm,
                    keyResults: [
                      ...editOkrForm.keyResults,
                      { ...createEmptyKrForm() },
                    ],
                  })
                }
              >
                + Add Key Result
              </button>

              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => setShowEditOkrModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Update OKR
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCreateAppraisalModal && (
        <div
          className="modal-overlay no-scroll"
          onClick={() => setShowCreateAppraisalModal(false)}
        >
          <div
            className="modal large appraisal-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-record-header appraisal-record-header">
              <div>
                <h2>Generate Appraisal Record</h2>
                <p>Choose who is being reviewed, the evidence window, and the report focus.</p>
              </div>
              <span className="stamp-badge stamp-badge-sm">REPORT SETUP</span>
            </div>
            <form onSubmit={handleCreateAppraisal} className="record-dialog-form appraisal-record-form">
              <div className="appraisal-record-grid">
                <section className="dialog-section appraisal-primary-section">
                  <div className="dialog-section-title">Review Scope</div>
                  <div className="form-group">
                    <label>Appraisal Scope</label>
                    <div className="segmented-control">
                      {[
                        ["INDIVIDUALS", "Individuals"],
                        ["TEAMS", "Teams"],
                        ["ORGANIZATION", "Entire Organization"],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          className={
                            newAppraisal.scope === value ? "active" : undefined
                          }
                          onClick={() => {
                            setNewAppraisal((prev) => ({
                              ...prev,
                              scope: value,
                              subjectIds: [],
                            }));
                            setSelectedOkrIds([]);
                            setAppraisalSelectionDirty(false);
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {newAppraisal.scope !== "ORGANIZATION" && (
                    <div className="form-group">
                      <div className="appraisal-field-header">
                        <label>
                          {newAppraisal.scope === "TEAMS" ? "Teams" : "Individuals"}
                        </label>
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => {
                            const allIds = appraisalSubjects.map(
                              (subject) => subject.id,
                            );
                            const allSelected =
                              newAppraisal.subjectIds.length === allIds.length;
                            setNewAppraisal((prev) => ({
                              ...prev,
                              subjectIds: allSelected ? [] : allIds,
                            }));
                            setSelectedOkrIds([]);
                            setAppraisalSelectionDirty(false);
                          }}
                        >
                          {newAppraisal.subjectIds.length ===
                          appraisalSubjects.length
                            ? "Clear All"
                            : "Select All"}
                        </button>
                      </div>
                      <div className="appraisal-picker">
                        {appraisalSubjects.map((subject) => (
                          <label key={subject.id} className="appraisal-check-row">
                            <input
                              type="checkbox"
                              checked={newAppraisal.subjectIds.includes(subject.id)}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setNewAppraisal((prev) => ({
                                  ...prev,
                                  subjectIds: checked
                                    ? [...prev.subjectIds, subject.id]
                                    : prev.subjectIds.filter(
                                        (id) => id !== subject.id,
                                      ),
                                }));
                                setSelectedOkrIds([]);
                                setAppraisalSelectionDirty(false);
                              }}
                            />
                            <span>
                              <strong>{subject.label}</strong>
                              {subject.meta && <small>{subject.meta}</small>}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                <section className="dialog-section">
                  <div className="dialog-section-title">Report Settings</div>
                  <div className="form-group">
                    <label>Output Format</label>
                    <div className="segmented-control">
                      {[
                        ["SINGLE_PDF", "Single File"],
                        ["SEPARATE_PDFS", "Separate Files"],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          className={
                            newAppraisal.outputFormat === value
                              ? "active"
                              : undefined
                          }
                          onClick={() =>
                            setNewAppraisal((prev) => ({
                              ...prev,
                              outputFormat: value,
                            }))
                          }
                          title="Single file combines all appraisals into one document. Separate files generate individual reports per selected entity."
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="modal-helper-text">
                      Single file combines all appraisals into one document.
                      Separate files generate individual reports per selected
                      entity.
                    </p>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Start Date</label>
                      <input
                        type="date"
                        value={newAppraisal.periodStart}
                        onChange={(e) => {
                          setNewAppraisal((prev) => ({
                            ...prev,
                            periodStart: e.target.value,
                          }));
                          setSelectedOkrIds([]);
                          setAppraisalSelectionDirty(false);
                        }}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>End Date</label>
                      <input
                        type="date"
                        value={newAppraisal.periodEnd}
                        onChange={(e) => {
                          setNewAppraisal((prev) => ({
                            ...prev,
                            periodEnd: e.target.value,
                          }));
                          setSelectedOkrIds([]);
                          setAppraisalSelectionDirty(false);
                        }}
                        required
                      />
                    </div>
                  </div>
                </section>

                <section className="dialog-section">
                  <div className="dialog-section-title">Focus</div>
                  <div className="form-group">
                    <label>Purpose of Appraisal</label>
                    <div className="appraisal-purpose-grid">
                      {appraisalPurposeOptions.map((purpose) => (
                        <label key={purpose} className="appraisal-check-row">
                          <input
                            type="checkbox"
                            checked={newAppraisal.purposes.includes(purpose)}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setNewAppraisal((prev) => ({
                                ...prev,
                                purposes: checked
                                  ? [...prev.purposes, purpose]
                                  : prev.purposes.filter(
                                      (item) => item !== purpose,
                                    ),
                              }));
                            }}
                          />
                          <span>{purpose}</span>
                        </label>
                      ))}
                    </div>
                    {newAppraisal.purposes.includes("Other") && (
                      <input
                        type="text"
                        value={newAppraisal.otherPurpose}
                        onChange={(e) =>
                          setNewAppraisal((prev) => ({
                            ...prev,
                            otherPurpose: e.target.value,
                          }))
                        }
                        placeholder="Specify appraisal purpose"
                      />
                    )}
                  </div>

                  <div className="form-group">
                    <label>Custom Focus</label>
                    <textarea
                      rows={3}
                      value={newAppraisal.customFocus}
                      onChange={(e) =>
                        setNewAppraisal((prev) => ({
                          ...prev,
                          customFocus: e.target.value,
                        }))
                      }
                      placeholder="What would you like this appraisal to focus on?"
                    />
                  </div>
                </section>

                <section className="dialog-section appraisal-evidence-section">
                  <div className="dialog-section-title">Evidence & Summary</div>
                  <div className="form-group">
                    <div className="appraisal-field-header">
                      <label>Relevant OKRs</label>
                      {appraisalPreviewLoading && (
                        <small className="modal-helper-text">
                          Fetching OKRs...
                        </small>
                      )}
                    </div>
                    <div className="appraisal-picker okr-picker">
                      {(appraisalPreview?.okrs || []).length > 0 ? (
                        appraisalPreview?.okrs.map((okr) => (
                          <label key={okr.id} className="appraisal-check-row">
                            <input
                              type="checkbox"
                              checked={selectedOkrIds.includes(okr.id)}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setAppraisalSelectionDirty(true);
                                setSelectedOkrIds((prev) =>
                                  checked
                                    ? [...prev, okr.id]
                                    : prev.filter((id) => id !== okr.id),
                                );
                              }}
                            />
                            <span>
                              <strong>{okr.title}</strong>
                              <small>
                                {new Date(okr.periodStart).toLocaleDateString()} -{" "}
                                {new Date(okr.periodEnd).toLocaleDateString()} ·{" "}
                                {okr.keyResultCount} KR
                                {okr.keyResultCount === 1 ? "" : "s"}
                              </small>
                            </span>
                          </label>
                        ))
                      ) : (
                        <p className="modal-helper-text">
                          Select scope, subjects, and date range to fetch matching
                          OKRs.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Auto Summary</label>
                    <div className="appraisal-summary-preview">
                      {appraisalPreview?.setupSummary ||
                        "The setup summary will appear once scope, subjects, and date range are selected."}
                    </div>
                  </div>

                  {appraisalPreview?.subjects &&
                    appraisalPreview.subjects.length > 0 && (
                      <div className="appraisal-ready-note">
                        {appraisalPreview.subjects.length} appraisal subject
                        {appraisalPreview.subjects.length === 1 ? "" : "s"} ready
                        for generation.
                      </div>
                    )}
                </section>
              </div>
              <div className="modal-actions appraisal-actions">
                <button
                  type="button"
                  onClick={() => setShowCreateAppraisalModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={generatingAppraisal}
                >
                  {generatingAppraisal
                    ? "Generating..."
                    : "Confirm & Generate Appraisal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddLinkModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowAddLinkModal(false)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Attach Link</h2>
            <form onSubmit={handleAddLink}>
              <div className="form-group">
                <label>URL</label>
                <input
                  type="url"
                  value={newLink.url}
                  onChange={(e) =>
                    setNewLink({ ...newLink, url: e.target.value })
                  }
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Label (optional)</label>
                <input
                  type="text"
                  value={newLink.fileName}
                  onChange={(e) =>
                    setNewLink({ ...newLink, fileName: e.target.value })
                  }
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => setShowAddLinkModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Attach
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSubmissionModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowSubmissionModal(false)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Submit Work</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmitWork();
              }}
            >
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
                <button
                  type="button"
                  onClick={() => setShowSubmissionModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Submit Work
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showBulkInviteModal && (
        <div className="modal-overlay" onClick={handleCloseBulkInviteModal}>
          <div
            className="modal bulk-invite-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>Bulk Invite Members</h2>
              <button
                className="btn-icon-close"
                onClick={handleCloseBulkInviteModal}
              >
                &times;
              </button>
            </div>

            <div className="modal-body">
              {!bulkInviteResult ? (
                <>
                  <div className="invite-instructions">
                    <p>
                      Upload a spreadsheet (.xlsx or .csv) to invite multiple
                      members at once. The file must contain{" "}
                      <strong>Email</strong>, <strong>Team</strong>, and{" "}
                      <strong>Role</strong> (Team Lead or Member) columns. Teams
                      will be created automatically.
                    </p>
                    <button
                      onClick={handleDownloadSampleSheet}
                      className="btn-text"
                    >
                      Download Sample Template
                    </button>
                  </div>

                  <div className="upload-section">
                    <input
                      type="file"
                      accept=".xlsx, .xls, .csv"
                      onChange={handleBulkInviteFileChange}
                      id="bulk-invite-upload"
                      className="hidden-input"
                    />
                    <label
                      htmlFor="bulk-invite-upload"
                      className="upload-dropzone"
                    >
                      <div className="upload-icon">
                        <svg
                          width="32"
                          height="32"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                        </svg>
                      </div>
                      <span>
                        {bulkInviteFile
                          ? bulkInviteFile.name
                          : "Select file or drag & drop"}
                      </span>
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
                              <th>Team</th>
                              <th>Role</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bulkInvitePreview.map((row, i) => (
                              <tr key={i}>
                                <td>{row.Email}</td>
                                <td>{row.Team || "-"}</td>
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
                    <svg
                      width="48"
                      height="48"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    <h3>Processing Complete</h3>
                  </div>
                  <div className="result-stats">
                    <div className="stat">
                      <div className="stat-label">Successful</div>
                      <div className="stat-num success">
                        {bulkInviteResult.successCount}
                      </div>
                    </div>
                    <div className="stat">
                      <div className="stat-label">Skipped (Already in Org)</div>
                      <div className="stat-num">
                        {bulkInviteResult.skippedCount}
                      </div>
                    </div>
                    {bulkInviteResult.errors &&
                      bulkInviteResult.errors.length > 0 && (
                        <div className="stat">
                          <div className="stat-label">Failed</div>
                          <div className="stat-num error">
                            {bulkInviteResult.errors.length}
                          </div>
                        </div>
                      )}
                  </div>
                  {bulkInviteResult.errors &&
                    bulkInviteResult.errors.length > 0 && (
                      <div className="result-errors">
                        <h4>Failed Invites</h4>
                        <ul>
                          {bulkInviteResult.errors.map(
                            (err: any, i: number) => (
                              <li key={i}>
                                {err.email}: {err.error}
                              </li>
                            ),
                          )}
                        </ul>
                      </div>
                    )}
                </div>
              )}
            </div>

            <div className="modal-footer">
              {!bulkInviteResult ? (
                <>
                  <button
                    onClick={handleCloseBulkInviteModal}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleBulkInviteSubmit}
                    className="btn-primary"
                    disabled={
                      !bulkInviteFile ||
                      bulkInviteSubmitting ||
                      bulkInviteErrors.length > 0
                    }
                  >
                    {bulkInviteSubmitting ? "Inviting..." : "Send Bulk Invites"}
                  </button>
                </>
              ) : (
                <button
                  onClick={handleCloseBulkInviteModal}
                  className="btn-primary"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {taskDeleteTargetId && (
        <div className="modal-overlay" onClick={closeTaskDeleteDialog}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Move Task</h2>
            <p>Move this task to Recently Deleted?</p>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "12px",
                marginTop: "20px",
              }}
            >
              <button className="btn-secondary" onClick={closeTaskDeleteDialog}>
                Cancel
              </button>
              <button className="btn-logout" onClick={confirmTaskDelete}>
                Move
              </button>
            </div>
          </div>
        </div>
      )}

      {taskReviewDialog && (
        <div
          className="modal-overlay"
          onClick={() => {
            setTaskReviewDialog(null);
            setTaskReviewNotes("");
          }}
        >
          <div
            className="modal task-review-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Reject Task?</h2>
            <p className="review-dialog-copy">
              Add a short note for <strong>{taskReviewDialog.taskTitle}</strong>{" "}
              so the assignee knows what to fix.
            </p>
            <div className="form-group">
              <label>Rejection Notes</label>
              <textarea
                value={taskReviewNotes}
                onChange={(e) => setTaskReviewNotes(e.target.value)}
                rows={4}
                placeholder="Explain what needs to change before approval."
                autoFocus
              />
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setTaskReviewDialog(null);
                  setTaskReviewNotes("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-action danger"
                onClick={() =>
                  handleApprovalAction(
                    taskReviewDialog.taskId,
                    taskReviewDialog.action,
                    taskReviewNotes.trim(),
                  )
                }
              >
                Reject Task
              </button>
            </div>
          </div>
        </div>
      )}

      {currentSection !== "tracker" && (
        <>
          <div
            className={`task-detail-backdrop ${selectedTaskId ? "active" : ""} drawer-backdrop ${isExpandedFullScreen ? "full-screen-backdrop" : ""}`}
            onClick={() => {
              setSelectedTaskId(null);
              setIsExpandedFullScreen(false);
            }}
          />
          <aside
            className={`task-detail-panel drawer ${selectedTask ? "open" : ""} ${isExpandedFullScreen ? "full-screen" : ""}`}
          >
            {renderTaskDetailPanelInner()}
          </aside>
        </>
      )}

      {/* Error Dialog */}
      <ErrorDialog
        isOpen={errorDialog.isOpen}
        title={errorDialog.title}
        message={errorDialog.message}
        onClose={() => setErrorDialog({ ...errorDialog, isOpen: false })}
      />
    </div>
  );
};

export default DashboardPage;
