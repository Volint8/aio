import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import "../styles/BoardView.css";

interface QuoteRecord {
  id: string;
  text: string;
  author: string | null;
}

interface BoardViewProps {
  stats?: {
    pending: number;
    ongoing: number;
    completed: number;
    overdue: number;
    total: number;
  } | null;
  memberStats: Array<{
    userId: string;
    name: string;
    stats: {
      pending: number;
      ongoing: number;
      completed: number;
      overdue: number;
      total: number;
    };
  }>;
  teamDistribution: Array<{
    teamId: string;
    teamName: string;
    stats: {
      pending: number;
      ongoing: number;
      completed: number;
      overdue: number;
      total: number;
    };
    people: Array<{
      userId: string;
      name: string;
      stats: {
        pending: number;
        ongoing: number;
        completed: number;
        overdue: number;
        total: number;
      };
    }>;
  }>;
  userRole: "ADMIN" | "TEAM_LEAD" | "MEMBER";
  onCreateTask: () => void;
  onNavigate?: (path: string) => void;
  organizationName?: string;
  teamsCount?: number;
  organizationMembers?: Array<{
    userId: string;
    role: string;
  }>;
  quotes?: QuoteRecord[];
}

const BoardView: React.FC<BoardViewProps> = ({
  stats,
  memberStats,
  teamDistribution,
  userRole,
  onCreateTask,
  onNavigate,
  organizationName,
  teamsCount: teamsCountProp,
  organizationMembers = [],
  quotes = [],
}) => {
  const { user } = useAuth();

  // Quote rotation state
  const quoteCount = quotes.length;
  const [quoteIndex, setQuoteIndex] = useState(0);

  // Reset index when number of quotes changes
  useEffect(() => {
    setQuoteIndex(0);
  }, [quoteCount]);

  // Rotate quotes every 30s when there are multiple quotes
  useEffect(() => {
    if (quoteCount <= 1) return;
    const interval = setInterval(() => {
      setQuoteIndex((i) => (i + 1) % quoteCount);
    }, 30000);
    return () => clearInterval(interval);
  }, [quoteCount]);

  // Use the currently indexed quote or fall back to default text
  const displayQuote = quoteCount > 0 ? quotes[quoteIndex] : null;

  // Calculate team totals (for Team Lead/Admin)
  const teamTotals = memberStats.reduce(
    (acc, member) => ({
      members: acc.members + 1,
      pending: acc.pending + member.stats.pending,
      ongoing: acc.ongoing + member.stats.ongoing,
      completed: acc.completed + member.stats.completed,
      overdue: acc.overdue + member.stats.overdue,
      total: acc.total + member.stats.total,
    }),
    { members: 0, pending: 0, ongoing: 0, completed: 0, overdue: 0, total: 0 },
  );

  // Count team members (for Admin)
  const teamMembersCount = organizationMembers.filter(
    (m) => m.role !== "ADMIN",
  ).length;
  const teamsCount =
    typeof teamsCountProp === "number"
      ? teamsCountProp
      : teamDistribution.length;

  // Calculate individual stats (current user)
  const currentUserStats = memberStats.find((m) => m.userId === user?.id) ||
    (stats
      ? {
          userId: user?.id || "",
          name: user?.name || "User",
          stats,
        }
      : memberStats[0]) || {
      userId: "",
      name: "User",
      stats: { pending: 0, ongoing: 0, completed: 0, overdue: 0, total: 0 },
    };

  const canViewTeam = userRole === "ADMIN" || userRole === "TEAM_LEAD";
  const handleCardKeyDown =
    (action?: () => void) => (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!action) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        action();
      }
    };

  return (
    <div className="board-view">
      {/* Welcome Banner */}
      <div className="welcome-banner">
        <h1>
          Welcome,{" "}
          {userRole === "ADMIN"
            ? organizationName || "Team"
            : user?.name || "User"}
          !
        </h1>
        {displayQuote ? (
          <p
            className="welcome-quote quote-fade"
            key={displayQuote?.id ?? quoteIndex}
            aria-live="polite"
          >
            "{displayQuote.text}"
            {displayQuote.author && (
              <span className="quote-author"> — {displayQuote.author}</span>
            )}
          </p>
        ) : (
          <p>
            {userRole === "ADMIN"
              ? "Track your organisation's progress"
              : userRole === "TEAM_LEAD"
                ? "Track your team's progress and stay on top of your tasks."
                : "Track your progress and stay on top of your tasks."}
          </p>
        )}
      </div>

      {/* Team Stats Section */}
      {canViewTeam && (
        <>
          <div className="board-panel-header">
            <h2>{userRole === "ADMIN" ? "Overview" : "Team Overview"}</h2>
            {userRole === "ADMIN" && (
              <div className="board-panel-actions">
                <button
                  className="board-create-btn secondary"
                  onClick={() => onNavigate?.("/dashboard?section=team")}
                >
                  Invite
                </button>
                <button
                  className="board-create-btn"
                  onClick={() => onNavigate?.("/dashboard?section=team")}
                >
                  <svg
                    width="20"
                    height="20"
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
                  Create Team
                </button>
              </div>
            )}
          </div>
          <div className="board-stats-grid">
            {userRole === "ADMIN" ? (
              <>
                <div
                  className="board-stat-card clickable"
                  role="button"
                  tabIndex={0}
                  onClick={() => onNavigate?.("/dashboard?section=team")}
                  onKeyDown={handleCardKeyDown(() =>
                    onNavigate?.("/dashboard?section=team"),
                  )}
                >
                  <span className="board-stat-label">Teams</span>
                  <span className="board-stat-value">
                    {teamsCount.toString().padStart(2, "0")}
                  </span>
                </div>
                <div
                  className="board-stat-card clickable"
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    onNavigate?.("/dashboard?section=team&focus=members")
                  }
                  onKeyDown={handleCardKeyDown(() =>
                    onNavigate?.("/dashboard?section=team&focus=members"),
                  )}
                >
                  <span className="board-stat-label">Members</span>
                  <span className="board-stat-value">
                    {teamMembersCount.toString().padStart(2, "0")}
                  </span>
                </div>
                <div
                  className="board-stat-card clickable"
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    onNavigate?.(
                      "/dashboard?section=task-tracker&filter=in_progress",
                    )
                  }
                  onKeyDown={handleCardKeyDown(() =>
                    onNavigate?.(
                      "/dashboard?section=task-tracker&filter=in_progress",
                    ),
                  )}
                >
                  <span className="board-stat-label">Ongoing Tasks</span>
                  <span className="board-stat-value">
                    {teamTotals.ongoing.toString().padStart(2, "0")}
                  </span>
                </div>
                <div
                  className="board-stat-card clickable"
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    onNavigate?.(
                      "/dashboard?section=task-tracker&filter=completed",
                    )
                  }
                  onKeyDown={handleCardKeyDown(() =>
                    onNavigate?.(
                      "/dashboard?section=task-tracker&filter=completed",
                    ),
                  )}
                >
                  <span className="board-stat-label">Completed Tasks</span>
                  <span className="board-stat-value">
                    {teamTotals.completed.toString().padStart(2, "0")}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div
                  className="board-stat-card clickable"
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    onNavigate?.("/dashboard?section=team-tracker")
                  }
                  onKeyDown={handleCardKeyDown(() =>
                    onNavigate?.("/dashboard?section=team-tracker"),
                  )}
                >
                  <span className="board-stat-label">Team Members</span>
                  <span className="board-stat-value">
                    {teamTotals.members.toString().padStart(2, "0")}
                  </span>
                </div>
                <div
                  className="board-stat-card clickable"
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    onNavigate?.(
                      "/dashboard?section=task-tracker&filter=in_progress",
                    )
                  }
                  onKeyDown={handleCardKeyDown(() =>
                    onNavigate?.(
                      "/dashboard?section=task-tracker&filter=in_progress",
                    ),
                  )}
                >
                  <span className="board-stat-label">Ongoing Tasks</span>
                  <span className="board-stat-value">
                    {teamTotals.ongoing.toString().padStart(2, "0")}
                  </span>
                </div>
                <div
                  className="board-stat-card clickable"
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    onNavigate?.(
                      "/dashboard?section=task-tracker&filter=pending",
                    )
                  }
                  onKeyDown={handleCardKeyDown(() =>
                    onNavigate?.(
                      "/dashboard?section=task-tracker&filter=pending",
                    ),
                  )}
                >
                  <span className="board-stat-label">Pending</span>
                  <span className="board-stat-value">
                    {teamTotals.pending.toString().padStart(2, "0")}
                  </span>
                </div>
                <div
                  className="board-stat-card clickable"
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    onNavigate?.(
                      "/dashboard?section=task-tracker&filter=overdue",
                    )
                  }
                  onKeyDown={handleCardKeyDown(() =>
                    onNavigate?.(
                      "/dashboard?section=task-tracker&filter=overdue",
                    ),
                  )}
                >
                  <span
                    className="board-stat-label"
                    style={{ color: "#EF4444" }}
                  >
                    Overdue
                  </span>
                  <span
                    className="board-stat-value"
                    style={{ color: "#EF4444" }}
                  >
                    {teamTotals.overdue.toString().padStart(2, "0")}
                  </span>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* My Stats Section */}
      {userRole !== "ADMIN" && (
        <>
          <div className="board-panel-header">
            <h2>My Focus</h2>
            <button className="board-create-btn" onClick={onCreateTask}>
              <svg
                width="20"
                height="20"
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
            </button>
          </div>
          <div className="board-stats-grid">
            <div
              className="board-stat-card clickable"
              role="button"
              tabIndex={0}
              onClick={() =>
                onNavigate?.(
                  "/dashboard?section=task-tracker&filter=in_progress",
                )
              }
              onKeyDown={handleCardKeyDown(() =>
                onNavigate?.(
                  "/dashboard?section=task-tracker&filter=in_progress",
                ),
              )}
            >
              <span className="board-stat-label">Ongoing</span>
              <span className="board-stat-value">
                {currentUserStats.stats.ongoing.toString().padStart(2, "0")}
              </span>
            </div>
            <div
              className="board-stat-card clickable"
              role="button"
              tabIndex={0}
              onClick={() =>
                onNavigate?.("/dashboard?section=task-tracker&filter=created")
              }
              onKeyDown={handleCardKeyDown(() =>
                onNavigate?.("/dashboard?section=task-tracker&filter=created"),
              )}
            >
              <span className="board-stat-label">Pending</span>
              <span className="board-stat-value">
                {currentUserStats.stats.pending.toString().padStart(2, "0")}
              </span>
            </div>
            <div
              className="board-stat-card clickable"
              role="button"
              tabIndex={0}
              onClick={() =>
                onNavigate?.("/dashboard?section=task-tracker&filter=completed")
              }
              onKeyDown={handleCardKeyDown(() =>
                onNavigate?.(
                  "/dashboard?section=task-tracker&filter=completed",
                ),
              )}
            >
              <span className="board-stat-label">Completed</span>
              <span className="board-stat-value">
                {currentUserStats.stats.completed.toString().padStart(2, "0")}
              </span>
            </div>
            <div
              className="board-stat-card clickable"
              role="button"
              tabIndex={0}
              onClick={() =>
                onNavigate?.("/dashboard?section=task-tracker&filter=overdue")
              }
              onKeyDown={handleCardKeyDown(() =>
                onNavigate?.("/dashboard?section=task-tracker&filter=overdue"),
              )}
            >
              <span className="board-stat-label" style={{ color: "#EF4444" }}>
                Overdue
              </span>
              <span className="board-stat-value" style={{ color: "#EF4444" }}>
                {currentUserStats.stats.overdue.toString().padStart(2, "0")}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default BoardView;
