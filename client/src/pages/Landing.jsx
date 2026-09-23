import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const FEATURES = [
  {
    num: '01',
    title: 'The prompt itself',
    body: 'The exact wording that worked, with a project name and a version tag, so you can see how a prompt improved across attempts.',
  },
  {
    num: '02',
    title: 'What came back',
    body: 'A short summary of the response, a category, your own usefulness rating, and whether you checked the answer or improved the output.',
  },
  {
    num: '03',
    title: 'Yours alone',
    body: 'Ownership comes from the verified token on every request, so the API only ever reads, changes or deletes records that belong to you.',
  },
];

const STEPS = [
  {
    num: '01',
    title: 'Sign in with GitHub',
    body: 'GitHub confirms who you are. The backend then issues its own session token and stores it in a cookie your browser will not expose to scripts.',
  },
  {
    num: '02',
    title: 'Save a capsule',
    body: 'Paste the prompt, add a summary, and rate how useful the answer was. Only the project, the title and the prompt are required.',
  },
  {
    num: '03',
    title: 'Come back to it',
    body: 'Search the library, edit a capsule as you refine the prompt, and delete the ones that stopped earning their place.',
  },
];

export default function Landing() {
  const { status } = useAuth();
  const signedIn = status === 'authenticated';
  const primaryHref = signedIn ? '/dashboard' : '/login';
  const primaryLabel = signedIn ? 'Open your dashboard' : 'Sign in with GitHub';

  return (
    <main id="main">
      <section className="hero shell">
        <div className="hero-kicker">
          <span className="label">Issue 01 / Prompt management</span>
        </div>

        <div className="hero-inner">
          <div>
            <h1>
              The prompts that worked, <em>kept where you can find them.</em>
            </h1>

            <p className="hero-lede">
              AI Capsule is a private prompt library. Save the prompt, the response summary, and
              whether it was actually any good. Every record is tied to your GitHub identity and
              visible only to you.
            </p>

            <div className="hero-actions">
              <Link to={primaryHref} className="btn btn-primary btn-lg">
                {primaryLabel}
              </Link>
              <a className="btn btn-ghost btn-lg" href="/api/health" target="_blank" rel="noreferrer">
                Check API health
              </a>
            </div>

          </div>

          <div>
            <figure className="figure" style={{ margin: 0 }}>
              <figcaption className="figure-head">
                <span className="label">Fig. 1 / A capsule record</span>
                <span className="label">v2</span>
              </figcaption>
              <div className="figure-body">
                <p className="capsule-project">SmartFarm Irrigation</p>
                <p className="specimen-title">Debug cloud deployment</p>
                <blockquote className="specimen-quote">
                  Why does my Node server build on Render but never become live?
                </blockquote>
                <div className="specimen-meta">
                  <span className="badge badge-cat-Coding">Coding</span>
                  <span className="badge badge-good">Good</span>
                  <span className="badge badge-version">v2</span>
                </div>
              </div>
            </figure>
            <p className="figure-caption">
              One record, as it appears on the dashboard. Every field except the project, the title
              and the prompt is optional.
            </p>

            <dl className="hero-meta">
              <div>
                <dt>Session</dt>
                <dd>JWT in a Secure, HttpOnly cookie</dd>
              </div>
              <div>
                <dt>Architecture</dt>
                <dd>React and Express served from one origin</dd>
              </div>
              <div>
                <dt>Storage</dt>
                <dd>SQLite, scoped to the signed-in user</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <div className="shell">
        <section className="section">
          <div className="section-head">
            <span className="section-num">01</span>
            <div>
              <h2>What a capsule holds</h2>
              <p>
                Enough context that a prompt is still useful weeks later, and nothing you would not
                bother to type.
              </p>
            </div>
          </div>

          <div className="columns">
            {FEATURES.map((feature) => (
              <div className="column" key={feature.num}>
                <span className="column-num">{feature.num}</span>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <span className="section-num">02</span>
            <div>
              <h2>How it works</h2>
              <p>Three steps, with no account to create and no password to remember.</p>
            </div>
          </div>

          <div className="steps">
            {STEPS.map((step) => (
              <div className="step" key={step.num}>
                <span className="step-num">{step.num}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="cta">
          <h2>Stop losing the prompt that finally worked</h2>
          <p>Sign in with GitHub and your library is ready. There is nothing else to configure.</p>
          <Link to={primaryHref} className="btn btn-lg">
            {signedIn ? 'Open your dashboard' : 'Get started'}
          </Link>
        </section>

        <footer className="site-footer">
          <span className="label">AI Capsule / CSE5006 Assignment 3</span>
          <span className="label">React / Express / SQLite / GitHub OAuth</span>
        </footer>
      </div>
    </main>
  );
}
