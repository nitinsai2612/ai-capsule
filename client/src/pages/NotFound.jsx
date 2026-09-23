import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <main id="main" className="shell auth-wrap">
      <div className="auth-card">
        <div className="auth-card-head">
          <span className="label">Error 404</span>
        </div>
        <div className="auth-card-body">
          <h1>Page not found</h1>
          <p>That address does not match any page in AI Capsule.</p>
          <div className="auth-actions">
            <Link to="/" className="btn btn-primary">
              Back to the home page
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
