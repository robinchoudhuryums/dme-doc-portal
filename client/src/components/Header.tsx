import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function Header() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const isActive = (path: string) => location.pathname.startsWith(path) ? 'active' : '';

  const initials = user
    ? `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase()
    : '';

  return (
    <header className="app-header">
      <div className="app-header-brand">
        <div className="app-header-logo">UMS</div>
        <h1>E-Sign Portal</h1>
      </div>
      <nav>
        <Link to="/dashboard" className={isActive('/dashboard')}>Dashboard</Link>
        <Link to="/forms/new" className={isActive('/forms/new')}>New Form</Link>
        <Link to="/physicians" className={isActive('/physicians')}>Physicians</Link>
        <div className="header-divider" />
        <div className="header-user">
          <div className="header-user-avatar">{initials}</div>
          <span className="header-user-name">{user?.first_name} {user?.last_name}</span>
        </div>
        <button onClick={logout} className="btn btn-ghost" style={{ fontSize: '0.8125rem' }}>
          Logout
        </button>
      </nav>
    </header>
  );
}
