import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import '../styles/OrgSelection.css';

interface Organization {
    id: string;
    name: string;
    userRole: string;
    createdAt: string;
}

interface OrganizationMember {
    id: string;
    userId: string;
    role: string;
    user: {
        id: string;
        email: string;
        name: string | null;
    };
}

const OrgSelectionPage = () => {
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newOrgName, setNewOrgName] = useState('');
    const [creating, setCreating] = useState(false);

    const [selectedOrgForTeam, setSelectedOrgForTeam] = useState<Organization | null>(null);
    const [teamMembers, setTeamMembers] = useState<OrganizationMember[]>([]);
    const [loadingMembers, setLoadingMembers] = useState(false);
    const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);
    const [teamError, setTeamError] = useState('');

    const { user, logout } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        fetchOrganizations();
    }, []);

    const fetchOrganizations = async () => {
        try {
            const res = await api.get('/orgs');
            setOrganizations(res.data);
        } catch (error) {
            console.error('Failed to fetch organizations:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateOrg = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newOrgName.trim()) return;

        setCreating(true);
        try {
            await api.post('/orgs', { name: newOrgName });
            setNewOrgName('');
            setShowCreateModal(false);
            fetchOrganizations();
        } catch (error: any) {
            const errorData = error.response?.data?.error;
            const message = typeof errorData === 'object' ? errorData.message : errorData;
            alert(message || 'Failed to create organization');
        } finally {
            setCreating(false);
        }
    };

    const selectOrganization = (orgId: string) => {
        localStorage.setItem('selectedOrgId', orgId);
        navigate('/dashboard');
    };

    const openManageTeam = async (org: Organization) => {
        try {
            setTeamError('');
            setLoadingMembers(true);
            setSelectedOrgForTeam(org);

            const res = await api.get(`/orgs/${org.id}`);
            setTeamMembers(res.data.members || []);
        } catch (error: any) {
            const errorData = error.response?.data?.error;
            const message = typeof errorData === 'object' ? errorData.message : errorData;
            setTeamError(message || 'Failed to load team members');
        } finally {
            setLoadingMembers(false);
        }
    };

    const closeManageTeam = async () => {
        setSelectedOrgForTeam(null);
        setTeamMembers([]);
        setTeamError('');
        await fetchOrganizations();
    };

    const handleRoleChange = async (memberId: string, newRole: string) => {
        if (!selectedOrgForTeam) return;

        try {
            setTeamError('');
            setUpdatingMemberId(memberId);

            const res = await api.patch(`/orgs/${selectedOrgForTeam.id}/members/${memberId}/role`, {
                role: newRole
            });

            setTeamMembers((prev) =>
                prev.map((member) => (member.id === memberId ? { ...member, role: res.data.role } : member))
            );
            await fetchOrganizations();

            const changedMember = teamMembers.find((member) => member.id === memberId);
            if (changedMember?.userId === user?.id && res.data.role !== 'ADMIN') {
                await closeManageTeam();
            }
        } catch (error: any) {
            const errorData = error.response?.data?.error;
            const message = typeof errorData === 'object' ? errorData.message : errorData;
            setTeamError(message || 'Failed to update role');
        } finally {
            setUpdatingMemberId(null);
        }
    };

    if (loading) {
        return (
            <div className="org-selection-page">
                <div className="loading">Loading organizations...</div>
            </div>
        );
    }

    return (
        <div className="org-selection-page">
            <div className="org-selection-container">
                <div className="org-header">
                    <div>
                        <h1>Select Organization</h1>
                        <p className="welcome-text">Welcome, {user?.name || user?.email}</p>
                    </div>
                    <button onClick={logout} className="btn-logout">
                        Logout
                    </button>
                </div>

                <div className="org-grid">
                    {organizations.map((org) => (
                        <div
                            key={org.id}
                            className="org-card"
                            onClick={() => selectOrganization(org.id)}
                        >
                            <div className="org-icon">
                                {org.name.charAt(0).toUpperCase()}
                            </div>
                            <h3>{org.name}</h3>
                            <span className={`role-badge ${org.userRole.toLowerCase()}`}>
                                {org.userRole}
                            </span>

                            {org.userRole === 'ADMIN' && (
                                <button
                                    type="button"
                                    className="btn-manage-team"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        openManageTeam(org);
                                    }}
                                >
                                    Manage Team
                                </button>
                            )}
                        </div>
                    ))}

                    <div
                        className="org-card create-card"
                        onClick={() => setShowCreateModal(true)}
                    >
                        <div className="org-icon create-icon">+</div>
                        <h3>Create New</h3>
                        <p>Start a new organization</p>
                    </div>
                </div>

                {organizations.length === 0 && (
                    <div className="empty-state">
                        <p>You're not part of any organization yet.</p>
                        <p>Create one to get started!</p>
                    </div>
                )}
            </div>

            {showCreateModal && (
                <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h2>Create Organization</h2>
                        <form onSubmit={handleCreateOrg}>
                            <div className="form-group">
                                <label>Organization Name</label>
                                <input
                                    type="text"
                                    value={newOrgName}
                                    onChange={(e) => setNewOrgName(e.target.value)}
                                    placeholder="e.g., Product Team, Client Project"
                                    required
                                    autoFocus
                                />
                            </div>
                            <div className="modal-actions">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    className="btn-secondary"
                                >
                                    Cancel
                                </button>
                                <button type="submit" disabled={creating} className="btn-primary">
                                    {creating ? 'Creating...' : 'Create'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {selectedOrgForTeam && (
                <div className="modal-overlay" onClick={closeManageTeam}>
                    <div className="modal team-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="team-modal-header">
                            <h2>Manage Team</h2>
                            <p>{selectedOrgForTeam.name}</p>
                        </div>

                        {teamError && <p className="team-error">{teamError}</p>}

                        {loadingMembers ? (
                            <div className="team-loading">Loading team members...</div>
                        ) : (
                            <div className="team-members-list">
                                {teamMembers.map((member) => (
                                    <div key={member.id} className="team-member-row">
                                        <div className="team-member-info">
                                            <strong>{member.user.name || member.user.email}</strong>
                                            <span>{member.user.email}</span>
                                        </div>

                                        <div className="team-member-role">
                                            <span className={`role-badge ${member.role.toLowerCase()}`}>{member.role}</span>
                                            <select
                                                value={member.role}
                                                disabled={updatingMemberId === member.id}
                                                onChange={(e) => handleRoleChange(member.id, e.target.value)}
                                            >
                                                <option value="MEMBER">MEMBER</option>
                                                <option value="ADMIN">ADMIN</option>
                                            </select>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="modal-actions">
                            <button type="button" className="btn-secondary" onClick={closeManageTeam}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OrgSelectionPage;
