import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function Header() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const isActive = (path: string) => location.pathname.startsWith(path) ? 'active' : '';

  return (
    <header className="app-header">
      <h1>UMS E-Sign Portal</h1>
      <nav>
        <Link to="/dashboard" className={isActive('/dashboard')}>Dashboard</Link>
        <Link to="/forms/new" className={isActive('/forms/new')}>New Form</Link>
        <Link to="/physicians" className={isActive('/physicians')}>Physicians</Link>
        <span style={{ color: 'var(--color-gray-500)', fontSize: '0.875rem' }}>
          {user?.first_name} {user?.last_name}
        </span>
        <button onClick={logout} className="btn btn-outline" style={{ padding: '0.375rem 0.75rem' }}>
          Logout
        </button>
      </nav>
    </header>
  );
}
