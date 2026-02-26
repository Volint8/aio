import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import type { ReactElement } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import OTPPage from './pages/OTPPage';
import InviteAcceptPage from './pages/InviteAcceptPage';
import OrgSelectionPage from './pages/OrgSelectionPage';
import DashboardPage from './pages/DashboardPage';
import LandingPage from './pages/LandingPage';
import Layout from './components/common/Layout';

const ProtectedRoute = ({ children }: { children: ReactElement }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontSize: '1.2em',
        color: '#666'
      }}>
        Loading...
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return children;
};

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={
        user ? <Navigate to="/organizations" replace /> : <LoginPage />
      } />
      <Route path="/confirm-otp" element={<OTPPage />} />
      <Route path="/accept-invite" element={<InviteAcceptPage />} />
      <Route path="/organizations" element={
        <ProtectedRoute>
          <Layout>
            <OrgSelectionPage />
          </Layout>
        </ProtectedRoute>
      } />
      <Route path="/dashboard" element={
        <ProtectedRoute>
          <Layout>
            <DashboardPage />
          </Layout>
        </ProtectedRoute>
      } />
      <Route path="/" element={<LandingPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}

export default App;
