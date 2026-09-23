import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { LogoutIcon } from './Icons.jsx';

function Avatar({ user }) {
  if (user?.avatarUrl) return <img src={user.avatarUrl} alt="" width="24" height="24" />;
  const initial = (user?.login ?? user?.name ?? '?').charAt(0).toUpperCase();
  return (
    <span className="avatar-fallback" aria-hidden="true">
      {initial}
    </span>
  );
}

export default function TopBar() {
  const { status, user, signOut } = useAuth();

  return (
    <header className="topbar">
      <div className="shell topbar-inner">
        <Link to="/" className="brand">
          AI Capsule
          <span className="brand-sub">A private prompt library</span>
        </Link>

        <div className="topbar-actions">
          {status === 'authenticated' ? (
            <>
              <Link to="/dashboard" className="btn btn-quiet hide-sm">
                Dashboard
              </Link>
              <span className="user-chip">
                <Avatar user={user} />
                <span>{user?.login ?? user?.name ?? 'Signed in'}</span>
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={signOut}
                aria-label="Sign out"
                title="Sign out"
              >
                <LogoutIcon />
                <span className="btn-label">Sign out</span>
              </button>
            </>
          ) : null}

          {status === 'anonymous' ? (
            <Link to="/login" className="btn btn-primary">
              Sign in
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
