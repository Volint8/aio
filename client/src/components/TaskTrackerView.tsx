/* eslint-disable @typescript-eslint/no-unused-expressions */
import React from "react";
import { useAuth } from "../context/useAuth";
import "../styles/TrackerView.css";
import DebouncedButton from "./common/DebouncedButton";

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

type SelectOption = {
  value: string;
  label: string;
};

interface TrackerSelectProps {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}

const TrackerSelect: React.FC<TrackerSelectProps> = ({
  label,
  value,
  options,
  onChange,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const selectRef = React.useRef<HTMLDivElement | null>(null);
  const selectedOption = options.find((option) => option.value === value);

  React.useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!selectRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  return (
    <div className="tracker-select" ref={selectRef}>
      <button
        type="button"
        className={`tracker-select-trigger ${isOpen ? "open" : ""}`}
        onClick={() => setIsOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="tracker-select-label">{label}</span>
        <span className="tracker-select-value">
          {selectedOption?.label || "Select"}
        </span>
        <span className="tracker-select-caret" aria-hidden="true">
          v
        </span>
      </button>
      {isOpen && (
        <div className="tracker-select-menu" role="listbox">
          {options.map((option) => (
            <button
              type="button"
              key={option.value}
              className={`tracker-select-option ${option.value === value ? "selected" : ""}`}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              role="option"
              aria-selected={option.value === value}
            >
              <span>{option.label}</span>
              {option.value === value && (
                <span className="tracker-select-check" aria-hidden="true">
                  ✓
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  approvalStatus?: string | null;
  priority: string;
  dueDate: string | null;
  createdByUserId?: string | null;
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
  createdAt: string;
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

interface TaskTrackerViewProps {
  tasks: Task[];
  filter:
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
  onFilterChange: (
    filter:
      | "all"
      | "my"
      | "supporting"
      | "pending"
      | "ongoing"
      | "in_review"
      | "completed"
      | "pending_approval"
      | "overdue",
  ) => void;
  onTaskClick: (task: Task) => void;
  onCreateTask: () => void;
  onSendAlert: () => void;
  onEdit?: (task: Task) => void;
  onDuplicate?: (task: Task) => void;
  onDelete?: (taskId: string) => void;
  onChangeStatus?: (taskId: string, status: string) => void;
  onApprovalAction?: (
    taskId: string,
    action: "APPROVE" | "REJECT",
    notes?: string,
  ) => void;
  assignableUsers?: Array<{
    userId: string;
    name: string | null;
    email: string;
  }>;
  hideOwnerFilter?: boolean;
  userRole?: "ADMIN" | "TEAM_LEAD" | "MEMBER";
  loading?: boolean;
}

const TaskTrackerView: React.FC<TaskTrackerViewProps> = ({
  tasks,
  filter,
  onFilterChange,
  onTaskClick,
  onCreateTask,
  onSendAlert,
  onEdit,
  onDuplicate,
  onDelete,
  onChangeStatus,
  onApprovalAction,
  assignableUsers = [],
  hideOwnerFilter = false,
  userRole = "MEMBER",
  loading = false,
}) => {
  const { user } = useAuth();
  const userId = user?.id || "";
  const [priorityFilter, setPriorityFilter] = React.useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = React.useState<string>("all");

  const filters: Array<{
    key:
      | "all"
      | "my"
      | "supporting"
      | "pending"
      | "ongoing"
      | "in_review"
      | "completed"
      | "pending_approval"
      | "overdue";
    label: string;
  }> =
    userRole === "ADMIN"
      ? [
          { key: "all", label: "All Tasks" },
          { key: "pending", label: "Pending" },
          { key: "ongoing", label: "In Progress" },
          { key: "in_review", label: "In Review" },
          { key: "completed", label: "Completed" },
          { key: "pending_approval", label: "Pending Approval" },
          { key: "overdue", label: "Overdue" },
        ]
      : [
          { key: "all", label: "All Tasks" },
          { key: "my", label: "My Tasks" },
          { key: "supporting", label: "Supporting" },
          { key: "pending", label: "Pending" },
          { key: "ongoing", label: "In Progress" },
          { key: "in_review", label: "In Review" },
          { key: "completed", label: "Completed" },
          ...(userRole === "TEAM_LEAD"
            ? [{ key: "pending_approval" as const, label: "Pending Approval" }]
            : []),
          { key: "overdue", label: "Overdue" },
        ];

  const isFilterActive = (key: (typeof filters)[number]["key"]) => {
    if (filter === "created" && key === "pending") return true;
    if (filter === "in_progress" && key === "ongoing") return true;
    return filter === key;
  };

  const [searchTerm, setSearchTerm] = React.useState("");

  // Use useMemo to optimize filtering performance
  const filteredTasks = React.useMemo(() => {
    return tasks.filter((task) => {
      // Search term filter
      if (searchTerm.trim() !== "") {
        const query = searchTerm.toLowerCase();
        const titleMatch = task.title.toLowerCase().includes(query);
        const ownerMatch = (task.assignee?.name || task.assignee?.email || "").toLowerCase().includes(query);
        if (!titleMatch && !ownerMatch) return false;
      }

      // Completed/Done tasks should only show up under the "completed" filter
      if (filter === "completed") {
        if (task.status !== "COMPLETED" && task.status !== "DONE") return false;
      } else if (filter !== "pending_approval") {
        // Exclude fully completed/done tasks from all other views
        if (task.status === "COMPLETED" || task.status === "DONE") return false;
      }

      // Status filter - handle both UI filter keys and backend status values
      if (filter === "pending" || filter === "created") {
        if (task.status !== "CREATED") return false;
      } else if (filter === "ongoing" || filter === "in_progress") {
        if (task.status !== "IN_PROGRESS") return false;
      } else if (filter === "in_review") {
        if (task.status !== "IN_REVIEW") return false;
      } else if (filter === "pending_approval") {
        if (task.approvalStatus !== "PENDING") {
          return false;
        }
      } else if (filter === "overdue") {
        if (!isDueDateOverdue(task.dueDate)) {
          return false;
        }
      } else if (filter === "my") {
        if (task.assignee?.id !== userId) return false;
      } else if (filter === "supporting") {
        if (task.supporter?.id !== userId) return false;
      }

      // Priority filter
      if (priorityFilter !== "all" && task.priority !== priorityFilter)
        return false;

      // Assignee filter
      if (assigneeFilter !== "all" && task.assignee?.id !== assigneeFilter)
        return false;

      return true;
    });
  }, [tasks, filter, priorityFilter, assigneeFilter, userId, searchTerm]);

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  const getStatusLabel = (status: string, dueDate: string | null) => {
    // Check if overdue first (automatic status)
    if (
      status !== "COMPLETED" &&
      status !== "DONE" &&
      status !== "ON_HOLD" &&
      isDueDateOverdue(dueDate)
    ) {
      return "Overdue";
    }
    // Map status to user-friendly labels
    if (status === "CREATED" || status === "TODO") return "To Do";
    if (status === "IN_PROGRESS") return "In Progress";
    if (status === "IN_REVIEW") return "In Review";
    if (status === "ON_HOLD") return "On Hold";
    if (status === "COMPLETED" || status === "DONE") return "Done";
    if (status === "CANCELLED") return "Cancelled";
    return status;
  };

  const [openMenuTaskId, setOpenMenuTaskId] = React.useState<string | null>(
    null,
  );

  const closeMenu = () => setOpenMenuTaskId(null);

  // Compute instrument summary stats
  const totalCount = tasks.length;
  const completedCount = tasks.filter((t) => isTaskCompleted(t.status)).length;
  const inProgressCount = tasks.filter((t) => t.status === "IN_PROGRESS" || t.status === "IN_REVIEW").length;
  const overdueCount = tasks.filter((t) => !isTaskCompleted(t.status) && isDueDateOverdue(t.dueDate)).length;
  const summaryStats = [
    { label: "Total Tasks", value: totalCount, tone: "ink" },
    { label: "In Progress", value: inProgressCount, tone: "vermilion" },
    { label: "Verified Completed", value: completedCount, tone: "ledger" },
    {
      label: "Overdue Items",
      value: overdueCount,
      tone: overdueCount > 0 ? "danger" : "muted",
    },
  ];
  const priorityOptions = [
    { value: "all", label: "All Priorities" },
    { value: "LOW", label: "Low Priority" },
    { value: "MEDIUM", label: "Medium Priority" },
    { value: "HIGH", label: "High Priority" },
  ];
  const assigneeOptions = [
    { value: "all", label: "All Owners" },
    ...assignableUsers.map((u) => ({
      value: u.userId,
      label: u.name || u.email,
    })),
  ];

  return (
    <div className="tracker-view">
      <div className="tracker-stats-summary">
        {summaryStats.map((stat) => (
          <div className="tracker-stat-card" key={stat.label}>
            <div className="tracker-stat-label">{stat.label}</div>
            <div className={`tracker-stat-value ${stat.tone}`}>{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="tracker-view-header">
        <h1>Task Tracker</h1>
        <div className="tracker-view-actions">
          <DebouncedButton
            className="btn-secondary"
            onClick={onSendAlert}
            debounceMs={800}
          >
            Send Alert
          </DebouncedButton>
          <DebouncedButton
            className="btn-vermilion"
            onClick={onCreateTask}
            debounceMs={800}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            New Task
          </DebouncedButton>
        </div>
      </div>

      <div className="tracker-tabs">
        {filters.map((f) => (
          <button
            key={f.key}
            className={`tracker-tab ${isFilterActive(f.key) ? "active" : ""}`}
            onClick={() => onFilterChange(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="tracker-filters">
        <div className="tracker-search">
          <input
            type="text"
            placeholder="Search task title or owner..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <TrackerSelect
          label="Priority"
          value={priorityFilter}
          options={priorityOptions}
          onChange={setPriorityFilter}
        />

        {!hideOwnerFilter && (
          <TrackerSelect
            label="Owner"
            value={assigneeFilter}
            options={assigneeOptions}
            onChange={setAssigneeFilter}
          />
        )}

        {(priorityFilter !== "all" ||
          (!hideOwnerFilter && assigneeFilter !== "all") ||
          searchTerm.trim() !== "") && (
          <button
            onClick={() => {
              setPriorityFilter("all");
              setAssigneeFilter("all");
              setSearchTerm("");
            }}
            className="btn-secondary"
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
              <th style={{ width: 80 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, idx) => (
                <tr key={`skeleton-${idx}`} className="skeleton-row">
                  <td>
                    <div className="skeleton-text skeleton-title"></div>
                  </td>
                  <td>
                    <div className="skeleton-text skeleton-okr"></div>
                  </td>
                  <td>
                    <div className="skeleton-avatar-group">
                      <div className="skeleton-avatar"></div>
                      <div className="skeleton-text skeleton-owner"></div>
                    </div>
                  </td>
                  <td>
                    <div className="skeleton-pill"></div>
                  </td>
                  <td>
                    <div className="skeleton-pill"></div>
                  </td>
                  <td>
                    <div className="skeleton-text skeleton-timeline"></div>
                  </td>
                  <td>
                    <div className="skeleton-action"></div>
                  </td>
                </tr>
              ))
            ) : filteredTasks.length > 0 ? (
              filteredTasks.map((task) => (
                <tr
                  key={task.id}
                  className="task-row"
                  onClick={() => onTaskClick(task)}
                  title={task.description || undefined}
                >
                  <td className="task-title-cell">{task.title}</td>
                  <td>
                    {task.krImpacts && task.krImpacts.length > 0 ? (
                      <div
                        className="task-linked-okr"
                        style={{ fontSize: "0.85em" }}
                      >
                        {task.krImpacts.map((impact) => (
                          <div
                            key={impact.id}
                            title={`${impact.okrKeyResult.okr.title} - ${impact.okrKeyResult.isGeneral ? "General" : impact.okrKeyResult.title}`}
                          >
                            <strong
                              style={{
                                display: "block",
                                color: "var(--text-main)",
                                fontWeight: 600,
                              }}
                            >
                              {impact.okrKeyResult.okr.title}
                            </strong>
                            <div
                              style={{
                                fontSize: "0.85em",
                                color: "var(--text-muted)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                maxWidth: 180,
                              }}
                            >
                              {impact.okrKeyResult.isGeneral
                                ? "General"
                                : impact.okrKeyResult.title}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span
                        className="text-muted"
                        style={{ fontSize: "0.85em" }}
                      >
                        General
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="owner-cell">
                      <div className="owner-avatar">
                        {getInitials(
                          task.assignee?.name || task.assignee?.email || "U",
                        )}
                      </div>
                      <span>
                        {task.assignee?.name ||
                          task.assignee?.email.split("@")[0]}
                      </span>
                    </div>
                  </td>
                  <td>
                    {isTaskCompleted(task.status) ? (
                      <span className="stamp-badge stamp-badge-sm stamp-badge-ledger">
                        ✓ VERIFIED
                      </span>
                    ) : (
                      <span
                        className={`status-pill ${task.status === "CREATED" ? "not-started" : task.status === "IN_PROGRESS" ? "in_progress" : task.status === "IN_REVIEW" ? "in_review" : task.status === "ON_HOLD" ? "on_hold" : task.status.toLowerCase()}`}
                      >
                        {getStatusLabel(task.status, task.dueDate)}
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="priority-indicator">
                      <span
                        className={`priority-dot ${task.priority.toLowerCase()}`}
                      ></span>
                      <span>{task.priority}</span>
                    </div>
                  </td>
                  <td className="timeline-cell">
                    {task.dueDate
                      ? new Date(task.dueDate).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })
                      : "-"}
                  </td>
                  <td className="task-actions-cell">
                    <div
                      className="task-actions"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuTaskId(
                          openMenuTaskId === task.id ? null : task.id,
                        );
                      }}
                    >
                      <button
                        aria-label="Actions"
                        className="btn-icon"
                      >
                        ⋯
                      </button>
                      {openMenuTaskId === task.id && (
                        <div
                          className="task-actions-menu"
                          onMouseLeave={closeMenu}
                        >
                          <button
                            className="task-action-item"
                            onClick={(e) => {
                              e.stopPropagation();
                              closeMenu();
                              onEdit && onEdit(task);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            className="task-action-item"
                            onClick={(e) => {
                              e.stopPropagation();
                              closeMenu();
                              onDuplicate && onDuplicate(task);
                            }}
                          >
                            Duplicate
                          </button>
                          {onDelete &&
                            (userRole === "ADMIN" ||
                              task.createdByUserId === userId) && (
                              <button
                                className="task-action-item"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  closeMenu();
                                  onDelete(task.id);
                                }}
                              >
                                Delete
                              </button>
                            )}
                          <div className="task-actions-divider" />
                          <button
                            className="task-action-item"
                            onClick={(e) => {
                              e.stopPropagation();
                              closeMenu();
                              onChangeStatus &&
                                onChangeStatus(task.id, "CREATED");
                            }}
                          >
                            Mark Not Started
                          </button>
                          <button
                            className="task-action-item"
                            onClick={(e) => {
                              e.stopPropagation();
                              closeMenu();
                              onChangeStatus &&
                                onChangeStatus(task.id, "IN_PROGRESS");
                            }}
                          >
                            Mark In Progress
                          </button>
                          <button
                            className="task-action-item"
                            onClick={(e) => {
                              e.stopPropagation();
                              closeMenu();
                              onChangeStatus &&
                                onChangeStatus(task.id, "COMPLETED");
                            }}
                          >
                            Mark Completed
                          </button>
                          {isTaskCompleted(task.status) &&
                            task.approvalStatus === "PENDING" &&
                            userRole &&
                            (userRole === "ADMIN" ||
                              userRole === "TEAM_LEAD") && (
                              <>
                                <div className="task-actions-divider" />
                                <button
                                  className="task-action-item"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    closeMenu();
                                    onApprovalAction &&
                                      onApprovalAction(task.id, "APPROVE");
                                  }}
                                >
                                  Approve
                                </button>
                                <button
                                  className="task-action-item"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    closeMenu();
                                    onApprovalAction &&
                                      onApprovalAction(task.id, "REJECT");
                                  }}
                                >
                                  Reject
                                </button>
                              </>
                            )}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="tracker-empty">
                  No tasks found in this category.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TaskTrackerView;
