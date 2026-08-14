import React from "react";
import "../styles/OkrView.css";
import DebouncedButton from "./common/DebouncedButton";

interface OkrUserSummary {
  id: string;
  name: string | null;
  email: string;
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
  keyResults?: Array<{
    id: string;
    title: string;
    assignedUserId: string | null;
    ownerIds?: string[];
    ownerUsers?: OkrUserSummary[];
    assignedUser?: OkrUserSummary | null;
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
  }>;
  assignments?: Array<{
    id: string;
    targetType: string;
    targetId: string;
    team?: {
      id: string;
      name: string;
    };
  }>;
}

interface OkrViewProps {
  okrs: Okr[];
  userRole: "ADMIN" | "TEAM_LEAD" | "MEMBER";
  onCreateTask: () => void;
  onCreateOkr?: () => void;
  onEditOkr?: (okr: Okr) => void;
  onDuplicateOkr?: (okr: Okr) => void;
  onDeleteOkr?: (okrId: string) => void;
  onCloseOkr?: (okr: Okr) => void;
  onReviewKeyResult?: (
    okrId: string,
    keyResultId: string,
    status: "APPROVED" | "REJECTED" | "PENDING",
  ) => void;
}

const formatOkrStatusLabel = (status: string) => {
  if (status === "NOT_YET_OPEN") return "Not yet Open";
  if (status === "OPEN") return "Open";
  if (status === "COMPLETED" || status === "DONE") return "Done";
  return status.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
};

const OkrView: React.FC<OkrViewProps> = ({
  okrs,
  userRole,
  onCreateTask,
  onCreateOkr,
  onEditOkr,
  onDuplicateOkr,
  onDeleteOkr,
  onCloseOkr,
}) => {
  const currentYear = new Date().getFullYear();
  const getKeyResultOwners = (kr: NonNullable<Okr["keyResults"]>[number]) => {
    const owners =
      kr.ownerUsers && kr.ownerUsers.length > 0
        ? kr.ownerUsers
        : kr.assignedUser
          ? [kr.assignedUser]
          : [];

    return owners.map((owner) => owner.name || owner.email).join(", ");
  };

  return (
    <div className="okr-view">
      <div className="okr-view-header">
        <h1>Objectives {currentYear}</h1>
        <div className="okr-view-actions">
          {userRole === "ADMIN" && onCreateOkr && (
            <DebouncedButton
              className="btn-primary"
              onClick={onCreateOkr}
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
                style={{ marginRight: "6px" }}
              >
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              New OKR Ledger
            </DebouncedButton>
          )}
          {userRole !== "ADMIN" && (
            <DebouncedButton
              className="btn-primary"
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
                style={{ marginRight: "6px" }}
              >
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              New Task
            </DebouncedButton>
          )}
        </div>
      </div>

      <div className="okr-grid">
        {okrs.map((okr) => (
          <div key={okr.id} className="okr-card">
            <div className="okr-card-header">
              <h3 className="okr-card-title">{okr.title}</h3>
              {okr.status === "COMPLETED" ? (
                <span className="stamp-badge stamp-badge-ledger">
                  ✓ VERIFIED OKR
                </span>
              ) : (
                <span
                  className={`okr-status-pill ${okr.status?.toLowerCase() || ""}`}
                >
                  {formatOkrStatusLabel(okr.status)}
                </span>
              )}
            </div>

            {okr.description && (
              <p className="okr-card-description">{okr.description}</p>
            )}

            <div className="okr-card-meta">
              <span className="okr-meta-item" style={{ whiteSpace: "nowrap" }}>
                <strong>
                  {formatOkrStatusLabel(okr.status)}
                </strong>
                <span>
                  (
                  {new Date(okr.periodStart).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}{" "}
                  -{" "}
                  {new Date(okr.periodEnd).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                  )
                </span>
              </span>
              {okr.objectiveTargetValue !== null &&
                okr.objectiveTargetValue !== undefined && (
                  <span className="okr-meta-item">
                    <strong>Target:</strong>
                    <span>
                      {okr.objectiveTargetValue}
                      {okr.objectiveMetricUnit || ""}
                    </span>
                  </span>
                )}
            </div>

            {okr.keyResults && okr.keyResults.length > 0 && (
              <div className="okr-key-results">
                <h4>Key Results</h4>
                <div className="okr-kr-list">
                  {okr.keyResults.map((kr) => (
                    <div key={kr.id} className="okr-kr-item">
                      <div className="kr-content">
                        <strong className="kr-title">{kr.title}</strong>
                        <div className="kr-meta-row">
                          <span className="kr-owner">
                            {kr.ownerUsers && kr.ownerUsers.length > 1
                              ? "Owners"
                              : "Owner"}
                            : {getKeyResultOwners(kr) || "General"}
                          </span>
                          {kr.contributionPct !== null &&
                            kr.contributionPct !== undefined && (
                              <span className="kr-contribution">
                                Contribution: {Math.round(kr.contributionPct)}%
                                {kr.contributionValue !== null &&
                                kr.contributionValue !== undefined
                                  ? ` (${kr.contributionValue})`
                                  : ""}
                              </span>
                            )}
                          {kr.targetValue !== null &&
                            kr.targetValue !== undefined && (
                              <span className="kr-target">
                                Target: {kr.targetValue}
                                {kr.metricUnit || ""}{" "}
                                {kr.metricName ? `(${kr.metricName})` : ""}
                              </span>
                            )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: "auto",
                gap: "12px",
                flexWrap: "wrap"
              }}
            >
              {okr.assignments &&
              okr.assignments.some((a) => a.targetType === "TEAM" && a.team) ? (
                <div className="okr-assignments">
                  Assigned to:{" "}
                  {okr.assignments
                    .filter((a) => a.targetType === "TEAM" && a.team)
                    .map((a) => a.team!.name)
                    .join(", ")}
                </div>
              ) : (
                <div className="okr-no-team">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      display: "inline",
                      marginRight: "4px",
                      verticalAlign: "middle",
                    }}
                  >
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                  No team assigned
                </div>
              )}

              {userRole === "ADMIN" && (
                <div className="okr-card-footer">
                  {okr.status !== "COMPLETED" && (
                    <button
                      className="task-action-btn"
                      onClick={() => onCloseOkr?.(okr)}
                    >
                      Close OKR
                    </button>
                  )}
                  <button
                    className="task-action-btn"
                    onClick={() => onEditOkr?.(okr)}
                  >
                    Edit
                  </button>
                  <button
                    className="task-action-btn"
                    onClick={() => onDuplicateOkr?.(okr)}
                  >
                    Duplicate
                  </button>
                  <button
                    className="task-action-btn task-action-btn-danger"
                    onClick={() => onDeleteOkr?.(okr.id)}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {okrs.length === 0 && (
        <div className="tracker-empty">
          <p>No objectives found for the selected period.</p>
        </div>
      )}
    </div>
  );
};

export default OkrView;
