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
  filter:
    | "all"
    | "my"
    | "supporting"
    | "pending"
    | "ongoing"
    | "completed"
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
  userRole?: "ADMIN" | "TEAM_LEAD" | "MEMBER";
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
  onEdit,
  onDelete,
  onChangeStatus,
  onApprovalAction,
  userRole = "MEMBER",
}) => {
  const { user } = useAuth();
  const userId = user?.id || "";
  const [priorityFilter, setPriorityFilter] = React.useState<string>("all");

  const filters: Array<{
    key:
      | "all"
      | "my"
      | "supporting"
      | "pending"
      | "ongoing"
      | "completed"
      | "overdue";
    label: string;
  }> = (() => {
    const arr: Array<{
      key:
        | "all"
        | "my"
        | "supporting"
        | "pending"
        | "ongoing"
        | "completed"
        | "overdue";
      label: string;
    }> = [{ key: "all", label: "All Tasks" }];

    if (userRole !== "ADMIN") {
      arr.push({ key: "my", label: "My Tasks" });
      arr.push({ key: "supporting", label: "Supporting" });
    }

    arr.push({ key: "pending", label: "Pending" });
    arr.push({ key: "ongoing", label: "In Progress" });
    arr.push({ key: "completed", label: "Completed" });
    arr.push({ key: "overdue", label: "Overdue" });

    return arr;
  })();

  const isFilterActive = (key: (typeof filters)[number]["key"]) => {
    if (filter === "created" && key === "pending") return true;
    if (filter === "in_progress" && key === "ongoing") return true;
    return filter === key;
  };

  // Use useMemo to optimize filtering performance
  const filteredTasks = React.useMemo(() => {
    return tasks.filter((task) => {
      // Member filter - skip for 'my' and 'supporting' filters as they have their own user-based logic
      if (
        selectedMemberId &&
        filter !== "my" &&
        filter !== "supporting" &&
        task.assignee?.id !== selectedMemberId
      )
        return false;

      // Status filter - handle both UI filter keys and backend status values
      if (filter === "pending" || filter === "created") {
        if (task.status !== "CREATED") return false;
      } else if (filter === "ongoing" || filter === "in_progress") {
        if (task.status !== "IN_PROGRESS") return false;
      } else if (filter === "completed") {
        if (task.status !== "COMPLETED") return false;
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

      return true;
    });
  }, [tasks, selectedMemberId, filter, priorityFilter, userId]);

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
        <h1>{teamName ? `${teamName} Team Tracker` : "Team Tracker"}</h1>
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

      <div className="tracker-tabs" style={{ gap: "12px" }}>
        <button
          className={`tracker-tab ${!selectedMemberId ? "active" : ""}`}
          onClick={() => onMemberSelect("")}
        >
          Everyone
        </button>
        {members.map((member) => (
          <button
            key={member.userId}
            className={`tracker-tab ${selectedMemberId === member.userId ? "active" : ""}`}
            onClick={() => onMemberSelect(member.userId)}
          >
            {member.name}
          </button>
        ))}
      </div>

      <div className="tracker-tabs" style={{ marginBottom: "16px" }}>
        {filters.map((f) => (
          <button
            key={f.key}
            className={`tracker-tab ${isFilterActive(f.key) ? "active" : ""}`}
            onClick={() => onFilterChange(f.key)}
            style={{ fontSize: "0.85em", padding: "8px 4px" }}
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

        {priorityFilter !== "all" && (
          <DebouncedButton
            onClick={() => {
              setPriorityFilter("all");
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
            debounceMs={400}
          >
            Clear Filters
          </DebouncedButton>
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
                        type="button"
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
                            type="button"
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
                            <>
                              <button
                                type="button"
                                className="task-action-item"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  closeMenu();
                                  if (
                                    window.confirm(
                                      "Move this task to Recently Deleted?",
                                    )
                                  ) {
                                    onDelete(task.id);
                                  }
                                }}
                              >
                                Delete
                              </button>
                              <div className="task-actions-divider" />
                            </>
                          )}
                          <button
                            type="button"
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
                            type="button"
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
                            (userRole === "ADMIN" ||
                              userRole === "TEAM_LEAD") && (
                              <>
                                <div className="task-actions-divider" />
                                <button
                                  type="button"
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
                                  type="button"
                                  className="task-action-item"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const notes =
                                      window.prompt(
                                        "Rejection notes (optional)",
                                      ) || undefined;
                                    closeMenu();
                                    onApprovalAction &&
                                      onApprovalAction(
                                        task.id,
                                        "REJECT",
                                        notes,
                                      );
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
