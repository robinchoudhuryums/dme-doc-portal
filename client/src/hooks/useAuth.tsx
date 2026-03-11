import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import api from '../services/api';

interface StaffUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: 'admin' | 'intake';
}

interface AuthContextType {
  token: string | null;
  user: StaffUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem('staff_token'));
  const [user, setUser] = useState<StaffUser | null>(null);
  const [loading, setLoading] = useState(true);

  // HIPAA: session timeout
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout>;
    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        localStorage.removeItem('staff_token');
        setToken(null);
        setUser(null);
        window.location.href = '/login';
      }, 15 * 60 * 1000); // 15 min
    };

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, resetTimer));
    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      events.forEach((e) => window.removeEventListener(e, resetTimer));
    };
  }, [token]);

  // Load user on mount
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    api.get('/auth/me')
      .then((res) => setUser(res.data))
      .catch(() => {
        localStorage.removeItem('staff_token');
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    localStorage.setItem('staff_token', res.data.token);
    setToken(res.data.token);
    setUser(res.data.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('staff_token');
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
