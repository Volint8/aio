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
  onReviewKeyResult?: (
    okrId: string,
    keyResultId: string,
    status: "APPROVED" | "REJECTED" | "PENDING",
  ) => void;
}

const OkrView: React.FC<OkrViewProps> = ({
  okrs,
  userRole,
  onCreateTask,
  onCreateOkr,
  onEditOkr,
  onDuplicateOkr,
  onDeleteOkr,
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
              className="btn-primary-green"
              onClick={onCreateOkr}
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
              New OKR
            </DebouncedButton>
          )}
          {userRole !== "ADMIN" && (
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
          )}
        </div>
      </div>

      <div className="okr-grid">
        {okrs.map((okr) => (
          <div key={okr.id} className="okr-card">
            <div className="okr-card-header">
              <h3 className="okr-card-title">{okr.title}</h3>
              <span
                className={`okr-status-pill ${okr.status?.toLowerCase() || ""}`}
              >
                {okr.status === "NOT_YET_OPEN" ? "Not yet Open" : okr.status}
              </span>
            </div>

            {okr.description && (
              <p className="okr-card-description">{okr.description}</p>
            )}

            <div className="okr-card-meta">
              <span className="okr-meta-item" style={{ whiteSpace: "nowrap" }}>
                <strong>
                  {okr.status === "NOT_YET_OPEN" ? "Not yet Open" : okr.status}
                </strong>
                <span>
                  (
                  {new Date(okr.periodStart).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "numeric",
                    year: "numeric",
                  })}{" "}
                  -{" "}
                  {new Date(okr.periodEnd).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "numeric",
                    year: "numeric",
                  })}
                  )
                </span>
              </span>
              {okr.objectiveTargetValue !== null &&
                okr.objectiveTargetValue !== undefined && (
                  <span className="okr-meta-item">
                    <strong>Objective Target</strong>
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
                      <span>
                        {kr.title}
                        <small
                          style={{
                            display: "block",
                            color: "#475569",
                            fontWeight: 500,
                          }}
                        >
                          {kr.ownerUsers && kr.ownerUsers.length > 1
                            ? "Owners"
                            : "Owner"}
                          : {getKeyResultOwners(kr) || "General"}
                        </small>
                        {kr.contributionPct !== null &&
                          kr.contributionPct !== undefined && (
                            <small
                              style={{
                                display: "block",
                                color: "#475569",
                                fontWeight: 500,
                              }}
                            >
                              Contribution: {Math.round(kr.contributionPct)}%
                              {kr.contributionValue !== null &&
                              kr.contributionValue !== undefined
                                ? ` (${kr.contributionValue})`
                                : ""}
                            </small>
                          )}
                        {kr.targetValue !== null &&
                          kr.targetValue !== undefined && (
                            <small
                              style={{
                                display: "block",
                                color: "#64748b",
                                fontWeight: 500,
                              }}
                            >
                              Target: {kr.targetValue}
                              {kr.metricUnit || ""}{" "}
                              {kr.metricName ? `(${kr.metricName})` : ""}
                            </small>
                          )}
                        {/* approval status removed - approvals handled outside creation flow */}
                      </span>
                      <div />
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
                <div
                  className="okr-no-team"
                  style={{
                    fontSize: "0.85em",
                    color: "#DC2626",
                    fontWeight: 600,
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
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
                  <button
                    className="btn-okr-action btn-okr-edit"
                    onClick={() => onEditOkr?.(okr)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn-okr-action btn-okr-edit"
                    onClick={() => onDuplicateOkr?.(okr)}
                    style={{ marginLeft: 8 }}
                  >
                    Duplicate
                  </button>
                  <button
                    className="btn-okr-action btn-okr-delete"
                    onClick={() => onDeleteOkr?.(okr.id)}
                    style={{ marginLeft: 8 }}
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
