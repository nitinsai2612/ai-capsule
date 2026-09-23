import { CheckIcon, DashIcon, LinkIcon, TrashIcon } from './Icons.jsx';

function formatDate(value) {
  if (!value) return null;
  // Stored timestamps are ISO-8601, but SQLite's own default uses a space, so
  // handle both rather than rendering "Invalid Date".
  const normalised = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const date = new Date(normalised);
  return Number.isNaN(date.getTime()) ? null : date;
}

export default function CapsuleCard({ capsule, onEdit, onDelete, busy }) {
  const created = formatDate(capsule.created_at);

  return (
    <article className="capsule">
      <div className="capsule-top">
        <p className="capsule-project">{capsule.project_name}</p>
        <h3>{capsule.prompt_title}</h3>
        <div className="badge-row">
          {capsule.prompt_version ? (
            <span className="badge badge-version">{capsule.prompt_version}</span>
          ) : null}
          {capsule.category ? (
            <span className={`badge badge-cat-${capsule.category}`}>{capsule.category}</span>
          ) : null}
          {capsule.usefulness ? (
            <span className={`badge ${capsule.usefulness === 'Good' ? 'badge-good' : 'badge-needs'}`}>
              {capsule.usefulness}
            </span>
          ) : null}
        </div>
      </div>

      <div className="capsule-body">
        <div>
          <p className="field-label">Prompt</p>
          <div className="prompt-text">{capsule.prompt_text}</div>
        </div>

        {capsule.response_summary ? (
          <div>
            <p className="field-label">Response summary</p>
            <p className="summary-text">{capsule.response_summary}</p>
          </div>
        ) : null}

        {capsule.notes ? (
          <div>
            <p className="field-label">Notes</p>
            <p className="summary-text">{capsule.notes}</p>
          </div>
        ) : null}

        <div className="flag-row">
          <span className={`flag${capsule.reviewed ? ' on' : ''}`}>
            {capsule.reviewed ? <CheckIcon /> : <DashIcon />}
            Reviewed
          </span>
          <span className={`flag${capsule.improved ? ' on' : ''}`}>
            {capsule.improved ? <CheckIcon /> : <DashIcon />}
            Improved
          </span>
          {capsule.screenshot_url ? (
            <a className="flag" href={capsule.screenshot_url} target="_blank" rel="noreferrer noopener">
              <LinkIcon />
              Evidence
            </a>
          ) : null}
        </div>
      </div>

      <div className="capsule-foot">
        <time dateTime={created ? created.toISOString() : undefined}>
          {created
            ? created.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
            : 'Date unavailable'}
        </time>
        <div className="capsule-actions">
          <button
            type="button"
            className="link-action"
            onClick={() => onEdit(capsule.id)}
            disabled={busy}
          >
            Edit
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => onDelete(capsule.id)}
            disabled={busy}
            aria-label={`Delete ${capsule.prompt_title}`}
            title="Delete"
          >
            <TrashIcon width={14} height={14} />
          </button>
        </div>
      </div>
    </article>
  );
}
