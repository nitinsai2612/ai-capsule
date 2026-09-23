import { useEffect } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { GitHubIcon } from '../components/Icons.jsx';

const ERROR_MESSAGES = {
  access_denied: 'You cancelled the GitHub authorisation, so no session was created.',
  missing_code: 'GitHub did not return an authorisation code. Please try signing in again.',
  state_mismatch:
    'The login attempt could not be verified and was stopped. This protects you from a forged sign-in link. Please start again.',
  token_exchange_failed: 'GitHub rejected the authorisation code. Please try signing in again.',
  profile_fetch_failed: 'Your GitHub profile could not be read. Please try signing in again.',
  oauth_not_configured:
    'GitHub sign-in is not configured on this deployment. The GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables are missing.',
  jwt_not_configured:
    'The server cannot issue a session token because JWT_SECRET is not configured on this deployment.',
  oauth_failed: 'Sign-in could not be completed. Please try again in a moment.',
};

export default function Login() {
  const { status } = useAuth();
  const [params] = useSearchParams();
  const errorCode = params.get('error');
  const message = errorCode ? (ERROR_MESSAGES[errorCode] ?? ERROR_MESSAGES.oauth_failed) : null;

  // Clear the error from the address bar once read, so a refresh does not show
  // a failure that already happened.
  useEffect(() => {
    if (errorCode) window.history.replaceState({}, '', '/login');
  }, [errorCode]);

  if (status === 'authenticated') return <Navigate to="/dashboard" replace />;

  return (
    <main id="main" className="shell auth-wrap">
      <div className="auth-card">
        <div className="auth-card-head">
          <span className="label">Sign in</span>
        </div>

        <div className="auth-card-body">
          <h1>Your prompt library</h1>
          <p>
            AI Capsule is private to your GitHub account. There is no separate password to create.
          </p>

          {message ? (
            <div className="alert alert-error" role="alert" style={{ marginTop: '1.5rem' }}>
              <div>
                <strong>Sign-in was not completed</strong>
                {message}
              </div>
            </div>
          ) : null}

          <div className="auth-actions">
            {/*
              A full page navigation, not a fetch. The OAuth flow leaves this
              origin for github.com and returns to /auth/github/callback, which
              is what lets the server set the session cookie.
            */}
            <a className="btn btn-github" href="/auth/github">
              <GitHubIcon width={17} height={17} />
              Continue with GitHub
            </a>
          </div>

          <p className="auth-note">
            GitHub asks you to authorise AI Capsule and sends you back here. The Express backend then
            issues its own signed session token and stores it in a Secure, HttpOnly cookie, so the
            token is never readable by JavaScript in this page.
          </p>

          <p className="auth-foot">
            <Link to="/" className="link-action">
              Back to the home page
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
