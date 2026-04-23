/* eslint-disable @typescript-eslint/no-unused-expressions */
import React from "react";
import { useAuth } from "../context/AuthContext";
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
}

interface TaskTrackerViewProps {
  tasks: Task[];
  filter:
    | "all"
    | "my"
    | "supporting"
    | "pending"
    | "ongoing"
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
      | "completed"
      | "pending_approval"
      | "overdue",
  ) => void;
  onTaskClick: (task: Task) => void;
  onCreateTask: () => void;
  onSendAlert: () => void;
  onEdit?: (task: Task) => void;
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
}

const TaskTrackerView: React.FC<TaskTrackerViewProps> = ({
  tasks,
  filter,
  onFilterChange,
  onTaskClick,
  onCreateTask,
  onSendAlert,
  onEdit,
  onDelete,
  onChangeStatus,
  onApprovalAction,
  assignableUsers = [],
  hideOwnerFilter = false,
  userRole = "MEMBER",
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

  // Use useMemo to optimize filtering performance
  const filteredTasks = React.useMemo(() => {
    return tasks.filter((task) => {
      // Status filter - handle both UI filter keys and backend status values
      if (filter === "pending" || filter === "created") {
        if (task.status !== "CREATED") return false;
      } else if (filter === "ongoing" || filter === "in_progress") {
        if (task.status !== "IN_PROGRESS") return false;
      } else if (filter === "completed") {
        if (task.status !== "COMPLETED") return false;
      } else if (filter === "pending_approval") {
        if (task.status !== "COMPLETED" || task.approvalStatus !== "PENDING") {
          return false;
        }
      } else if (filter === "overdue") {
        if (task.status === "COMPLETED" || !isDueDateOverdue(task.dueDate)) {
          return false;
        }
      } else if (filter === "my") {
        if (task.assignee?.id !== userId) return false;
      } else if (filter === "supporting") {
        if (task.supporter?.id !== userId) return false;
      }
      // 'all' filter shows everything

      // Priority filter
      if (priorityFilter !== "all" && task.priority !== priorityFilter)
        return false;

      // Assignee filter
      if (assigneeFilter !== "all" && task.assignee?.id !== assigneeFilter)
        return false;

      return true;
    });
  }, [tasks, filter, priorityFilter, assigneeFilter, userId]);

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
    if (status !== "COMPLETED" && isDueDateOverdue(dueDate)) {
      return "Overdue";
    }
    // Map status to user-friendly labels
    if (status === "CREATED") return "Not Started";
    if (status === "IN_PROGRESS") return "In Progress";
    if (status === "COMPLETED") return "Completed";
    return status.replace("_", " ").toLowerCase();
  };

  const [openMenuTaskId, setOpenMenuTaskId] = React.useState<string | null>(
    null,
  );

  const closeMenu = () => setOpenMenuTaskId(null);

  return (
    <div className="tracker-view">
      <div className="tracker-view-header">
        <h1>Task Tracker</h1>
        <div className="tracker-view-actions">
          <DebouncedButton
            className="btn-outline-blue"
            onClick={onSendAlert}
            debounceMs={800}
          >
            Send Alert
          </DebouncedButton>
          <DebouncedButton
            className="btn-primary-green"
            onClick={onCreateTask}
            debounceMs={800}
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

      <div
        className="tracker-filters"
        style={{
          display: "flex",
          gap: "12px",
          marginBottom: "16px",
          flexWrap: "wrap",
        }}
      >
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="tracker-filter-select"
          style={{
            padding: "8px 12px",
            borderRadius: "8px",
            border: "1px solid var(--border-color)",
            background: "#fff",
            fontSize: "0.9em",
            minWidth: "140px",
          }}
        >
          <option value="all">All Priorities</option>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
        </select>

        {!hideOwnerFilter && (
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="tracker-filter-select"
            style={{
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1px solid var(--border-color)",
              background: "#fff",
              fontSize: "0.9em",
              minWidth: "160px",
            }}
          >
            <option value="all">All Owners</option>
            {assignableUsers.map((u) => (
              <option key={u.userId} value={u.userId}>
                {u.name || u.email}
              </option>
            ))}
          </select>
        )}

        {(priorityFilter !== "all" ||
          (!hideOwnerFilter && assigneeFilter !== "all")) && (
          <button
            onClick={() => {
              setPriorityFilter("all");
              setAssigneeFilter("all");
            }}
            className="btn-secondary"
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid var(--border-color)",
              background: "#fff",
              fontSize: "0.9em",
              cursor: "pointer",
            }}
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
            {filteredTasks.length > 0 ? (
              filteredTasks.map((task) => (
                <tr
                  key={task.id}
                  className="task-row"
                  onClick={() => onTaskClick(task)}
                >
                  <td className="task-title-cell">{task.title}</td>
                  <td>-</td>
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
                    <span
                      className={`status-pill ${task.status === "CREATED" ? "not-started" : task.status === "IN_PROGRESS" ? "in_progress" : task.status === "COMPLETED" ? "completed" : task.status.toLowerCase()}`}
                    >
                      {getStatusLabel(task.status, task.dueDate)}
                    </span>
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
                  <td>
                    <div
                      className="task-actions"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuTaskId(
                          openMenuTaskId === task.id ? null : task.id,
                        );
                      }}
                      style={{ position: "relative" }}
                    >
                      <button
                        aria-label="Actions"
                        className="btn-icon"
                        style={{ padding: 6, borderRadius: 6 }}
                      >
                        ⋯
                      </button>
                      {openMenuTaskId === task.id && (
                        <div
                          className="task-actions-menu"
                          style={{
                            position: "absolute",
                            right: 0,
                            top: 28,
                            background: "#fff",
                            border: "1px solid var(--border-color)",
                            borderRadius: 6,
                            boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
                            zIndex: 40,
                            minWidth: 160,
                          }}
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
                          <div
                            style={{
                              borderTop: "1px solid var(--border-color)",
                              marginTop: 6,
                            }}
                          />
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
                          {task.status === "COMPLETED" &&
                            task.approvalStatus === "PENDING" &&
                            userRole &&
                            (userRole === "ADMIN" ||
                              userRole === "TEAM_LEAD") && (
                              <>
                                <div
                                  style={{
                                    borderTop: "1px solid var(--border-color)",
                                    marginTop: 6,
                                  }}
                                />
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
                <td colSpan={6} className="tracker-empty">
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
