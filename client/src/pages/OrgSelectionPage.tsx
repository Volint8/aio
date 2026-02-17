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

const OrgSelectionPage = () => {
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newOrgName, setNewOrgName] = useState('');
    const [creating, setCreating] = useState(false);
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
            alert(error.response?.data?.error || 'Failed to create organization');
        } finally {
            setCreating(false);
        }
    };

    const selectOrganization = (orgId: string) => {
        localStorage.setItem('selectedOrgId', orgId);
        navigate('/dashboard');
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
        </div>
    );
};

export default OrgSelectionPage;
