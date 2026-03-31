import React from 'react';
import '../styles/OkrView.css';

interface Okr {
    id: string;
    title: string;
    description?: string | null;
    periodStart: string;
    periodEnd: string;
    status: string;
    keyResults?: Array<{
        id: string;
        title: string;
        tag: {
            id: string;
            name: string;
            color: string;
        };
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
    userRole: 'ADMIN' | 'TEAM_LEAD' | 'MEMBER';
    onCreateTask: () => void;
    onCreateOkr?: () => void;
    onEditOkr?: (okr: Okr) => void;
    onDeleteOkr?: (okrId: string) => void;
    onNavigate?: (path: string) => void;
}

const OkrView: React.FC<OkrViewProps> = ({
    okrs,
    userRole,
    onCreateTask,
    onCreateOkr,
    onEditOkr,
    onDeleteOkr,
    onNavigate
}) => {
    const currentYear = new Date().getFullYear();

    return (
        <div className="okr-view">
            <div className="okr-view-header">
                <h1>Objectives {currentYear}</h1>
                <div className="okr-view-actions">
                    {userRole === 'ADMIN' && onCreateOkr && (
                        <button className="btn-primary-green" onClick={onCreateOkr}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                            New OKR
                        </button>
                    )}
                    {userRole !== 'ADMIN' && (
                        <button className="btn-primary-green" onClick={onCreateTask}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                            New Task
                        </button>
                    )}
                </div>
            </div>

            <div className="okr-grid">
                {okrs.map(okr => (
                    <div key={okr.id} className="okr-card">
                        <div className="okr-card-header">
                            <h3 className="okr-card-title">{okr.title}</h3>
                            <span className={`okr-status-pill ${okr.status?.toLowerCase() || ''}`}>
                                {okr.status}
                            </span>
                        </div>
                        
                        {okr.description && (
                            <p className="okr-card-description">{okr.description}</p>
                        )}

                        <div className="okr-card-meta">
                            <span className="okr-meta-item" style={{ whiteSpace: 'nowrap' }}>
                                <strong>{okr.status}</strong>
                                <span>({new Date(okr.periodStart).toLocaleDateString(undefined, { day: 'numeric', month: 'numeric', year: 'numeric' })} - {new Date(okr.periodEnd).toLocaleDateString(undefined, { day: 'numeric', month: 'numeric', year: 'numeric' })})</span>
                            </span>
                        </div>

                        {okr.keyResults && okr.keyResults.length > 0 && (
                            <div className="okr-key-results">
                                <h4>Key Results</h4>
                                <div className="okr-kr-list">
                                    {okr.keyResults.map(kr => (
                                        <div key={kr.id} className="okr-kr-item">
                                            <span>{kr.title}</span>
                                            <span
                                                className="okr-kr-tag"
                                                style={{ backgroundColor: `${kr.tag.color}15`, color: kr.tag.color, borderColor: `${kr.tag.color}30`, cursor: 'pointer' }}
                                                onClick={() => onNavigate?.('/dashboard?section=okr')}
                                                title="Click to view all OKRs"
                                            >
                                                {kr.tag.name}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                            {okr.assignments && okr.assignments.some(a => a.targetType === 'TEAM' && a.team) ? (
                                <div className="okr-assignments">
                                    Assigned to: {okr.assignments
                                        .filter(a => a.targetType === 'TEAM' && a.team)
                                        .map(a => a.team!.name)
                                        .join(', ')}
                                </div>
                            ) : (
                                <div className="okr-no-team" style={{ fontSize: '0.85em', color: '#DC2626', fontWeight: 600 }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }}>
                                        <circle cx="12" cy="12" r="10"></circle>
                                        <line x1="12" y1="8" x2="12" y2="12"></line>
                                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                                    </svg>
                                    No team assigned
                                </div>
                            )}

                            {userRole === 'ADMIN' && (
                                <div className="okr-card-footer">
                                    <button
                                        className="btn-okr-action btn-okr-edit"
                                        onClick={() => onEditOkr?.(okr)}
                                    >
                                        Edit
                                    </button>
                                    <button
                                        className="btn-okr-action btn-okr-delete"
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
