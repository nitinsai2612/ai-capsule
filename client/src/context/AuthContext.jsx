import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';

const AuthContext = createContext(null);

/**
 * The app cannot read the HttpOnly cookie, so it asks the server who it is with
 * GET /api/me. `status` separates "still checking" from "checked and not signed
 * in", which stops /dashboard flashing the login page on first load.
 */
export function AuthProvider({ children }) {
  const [status, setStatus] = useState('loading');
  const [user, setUser] = useState(null);
  const checked = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const data = await api.me();
      setUser(data.user);
      setStatus('authenticated');
    } catch {
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  useEffect(() => {
    // Guarded so React StrictMode's double effect does not fire two requests.
    if (checked.current) return;
    checked.current = true;
    refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  // Called when any API request comes back 401 mid-session.
  const markSignedOut = useCallback(() => {
    setUser(null);
    setStatus('anonymous');
  }, []);

  return (
    <AuthContext.Provider value={{ status, user, refresh, signOut, markSignedOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
