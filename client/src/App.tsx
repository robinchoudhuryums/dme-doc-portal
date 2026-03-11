import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';

// Staff pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import NewForm from './pages/NewForm';
import FormDetail from './pages/FormDetail';
import Physicians from './pages/Physicians';

// Physician signing pages
import SigningEntry from './pages/signing/SigningEntry';
import SigningForm from './pages/signing/SigningForm';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAuth();
  if (loading) return <div className="loading">Loading...</div>;
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Staff routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/forms/new" element={<ProtectedRoute><NewForm /></ProtectedRoute>} />
        <Route path="/forms/:id" element={<ProtectedRoute><FormDetail /></ProtectedRoute>} />
        <Route path="/physicians" element={<ProtectedRoute><Physicians /></ProtectedRoute>} />

        {/* Physician signing routes (public, PIN-protected) */}
        <Route path="/sign/:token" element={<SigningEntry />} />
        <Route path="/sign/:token/form" element={<SigningForm />} />

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<div className="page-center"><h1>404 — Page Not Found</h1></div>} />
      </Routes>
    </AuthProvider>
  );
}
