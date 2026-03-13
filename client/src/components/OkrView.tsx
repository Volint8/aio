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
    onSendAlert: () => void;
    onEditOkr?: (okr: Okr) => void;
    onDeleteOkr?: (okrId: string) => void;
}

const OkrView: React.FC<OkrViewProps> = ({
    okrs,
    userRole,
    onCreateTask,
    onSendAlert,
    onEditOkr,
    onDeleteOkr
}) => {
    const currentYear = new Date().getFullYear();

    return (
        <div className="okr-view">
            <div className="okr-header">
                <h1 className="okr-title">OKR {currentYear}</h1>
                <div className="okr-actions">
                    <button className="btn-create-task" onClick={onCreateTask}>
                        Create Task +
                    </button>
                    <button className="btn-send-alert" onClick={onSendAlert}>
                        Send Alert
                    </button>
                </div>
            </div>

            <div className="okr-grid">
                {okrs.map(okr => (
                    <div key={okr.id} className="okr-card">
                        <div className="okr-card-header">
                            <h3 className="okr-card-title">{okr.title}</h3>
                            <span className={`okr-status ${okr.status.toLowerCase()}`}>
                                {okr.status}
                            </span>
                        </div>
                        {okr.description && (
                            <p className="okr-card-description">{okr.description}</p>
                        )}
                        <div className="okr-card-meta">
                            <span className="meta-item">
                                <strong>Start:</strong> {new Date(okr.periodStart).toLocaleDateString()}
                            </span>
                            <span className="meta-item">
                                <strong>End:</strong> {new Date(okr.periodEnd).toLocaleDateString()}
                            </span>
                        </div>
                        {okr.keyResults && okr.keyResults.length > 0 && (
                            <div className="okr-key-results">
                                <strong>Key Results</strong>
                                <ul>
                                    {okr.keyResults.map(kr => (
                                        <li key={kr.id}>
                                            {kr.title}
                                            <span
                                                className="kr-tag"
                                                style={{ borderColor: kr.tag.color, color: kr.tag.color }}
                                            >
                                                {kr.tag.name}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {okr.assignments && okr.assignments.some(a => a.targetType === 'TEAM' && a.team) && (
                            <div className="okr-assignments">
                                <strong>Assigned To:</strong>{' '}
                                {okr.assignments
                                    .filter(a => a.targetType === 'TEAM' && a.team)
                                    .map(a => a.team!.name)
                                    .join(', ')}
                            </div>
                        )}
                        {userRole === 'ADMIN' && (
                            <div className="okr-card-actions">
                                <button
                                    className="btn-edit"
                                    onClick={() => onEditOkr?.(okr)}
                                >
                                    Edit
                                </button>
                                <button
                                    className="btn-delete"
                                    onClick={() => onDeleteOkr?.(okr.id)}
                                >
                                    Delete
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {okrs.length === 0 && (
                <div className="empty-state">
                    <p>No OKRs found</p>
                </div>
            )}
        </div>
    );
};

export default OkrView;
