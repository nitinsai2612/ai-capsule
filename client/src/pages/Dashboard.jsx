import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import CapsuleCard from '../components/CapsuleCard.jsx';
import CapsuleForm from '../components/CapsuleForm.jsx';
import Modal from '../components/Modal.jsx';
import { CATEGORY_VALUES } from '../constants/capsuleFields.js';
import { PlusIcon, SearchIcon } from '../components/Icons.jsx';

export default function Dashboard() {
  const { user, markSignedOut } = useAuth();
  const { push } = useToast();

  const [capsules, setCapsules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');

  // Dialogs hold ids, never object snapshots, so a record edited in one place
  // can never be rendered from stale data somewhere else.
  const [editingId, setEditingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const initialised = useRef(false);
  const inFlight = useRef(false);

  const handleAuthFailure = useCallback(() => {
    markSignedOut();
  }, [markSignedOut]);

  const load = useCallback(async () => {
    // Serialised with a ref rather than a disabled button, so rapid refreshes
    // cannot interleave and land an older response last.
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const data = await api.listCapsules();
      setCapsules(data.capsules);
      setLoadError(null);
    } catch (err) {
      if (err instanceof ApiError && err.isUnauthenticated) {
        handleAuthFailure();
        return;
      }
      setLoadError(err);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [handleAuthFailure]);

  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    load();
  }, [load]);

  const editingCapsule = useMemo(
    () => (typeof editingId === 'number' ? capsules.find((c) => c.id === editingId) ?? null : null),
    [capsules, editingId],
  );
  const deletingCapsule = useMemo(
    () => capsules.find((c) => c.id === deletingId) ?? null,
    [capsules, deletingId],
  );

  const stats = useMemo(
    () => ({
      total: capsules.length,
      reviewed: capsules.filter((c) => c.reviewed).length,
      improved: capsules.filter((c) => c.improved).length,
      projects: new Set(capsules.map((c) => c.project_name)).size,
    }),
    [capsules],
  );

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return capsules.filter((capsule) => {
      if (category !== 'All' && capsule.category !== category) return false;
      if (needle.length === 0) return true;
      return [
        capsule.project_name,
        capsule.prompt_title,
        capsule.prompt_text,
        capsule.response_summary,
        capsule.notes,
        capsule.prompt_version,
      ]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(needle));
    });
  }, [capsules, category, search]);

  const closeForm = () => {
    setEditingId(null);
    setFormError(null);
    setFieldErrors({});
  };

  const handleSubmit = async (values) => {
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});
    const isEdit = typeof editingId === 'number';

    try {
      const response = isEdit
        ? await api.updateCapsule(editingId, values)
        : await api.createCapsule(values);

      // State is updated from the successful response first, so the card is
      // correct even if the background refetch fails.
      const saved = response.capsule;
      setCapsules((current) =>
        isEdit
          ? current.map((c) => (c.id === saved.id ? saved : c))
          : [saved, ...current],
      );
      closeForm();
      push(isEdit ? 'Capsule updated.' : 'Capsule created.');
      load();
    } catch (err) {
      if (err instanceof ApiError && err.isUnauthenticated) {
        handleAuthFailure();
        return;
      }
      if (err instanceof ApiError) {
        setFieldErrors(err.fieldErrors);
        setFormError(err.message);
      } else {
        setFormError('Something went wrong while saving. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (deletingId === null) return;
    setSubmitting(true);
    try {
      await api.deleteCapsule(deletingId);
      setCapsules((current) => current.filter((c) => c.id !== deletingId));
      setDeletingId(null);
      push('Capsule deleted.');
      load();
    } catch (err) {
      if (err instanceof ApiError && err.isUnauthenticated) {
        handleAuthFailure();
        return;
      }
      setDeletingId(null);
      push(
        err instanceof ApiError ? err.message : 'The capsule could not be deleted.',
        'error',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const firstName = user?.name?.split(' ')[0] ?? user?.login ?? 'there';

  return (
    <main id="main" className="shell dash">
      <div className="dash-head">
        <div>
          <span className="label">The library of {user?.login ?? 'your account'}</span>
          <h1>Welcome back, {firstName}</h1>
          <p>
            {loading
              ? 'Loading your prompt library...'
              : `${stats.total} capsule${stats.total === 1 ? '' : 's'} saved to your account.`}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          onClick={() => {
            setFieldErrors({});
            setFormError(null);
            setEditingId('new');
          }}
        >
          <PlusIcon />
          New capsule
        </button>
      </div>

      <div className="stat-row">
        {[
          ['Capsules', stats.total],
          ['Projects', stats.projects],
          ['Reviewed', stats.reviewed],
          ['Improved', stats.improved],
        ].map(([name, value]) => (
          <div className="stat" key={name}>
            <span className="label">{name}</span>
            <span className="value">{value}</span>
          </div>
        ))}
      </div>

      {loadError ? (
        <div className="alert alert-error" role="alert" style={{ marginBottom: '1.5rem' }}>
          <div>
            <strong>Your capsules could not be loaded</strong>
            {loadError.message}
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ marginLeft: 'auto' }}
            onClick={() => {
              setLoading(true);
              load();
            }}
          >
            Retry
          </button>
        </div>
      ) : null}

      {!loading && !loadError && capsules.length > 0 ? (
        <div className="toolbar">
          <div className="search-field">
            <SearchIcon />
            <label className="visually-hidden" htmlFor="capsule-search">
              Search your capsules
            </label>
            <input
              id="capsule-search"
              type="search"
              placeholder="Search prompts, projects and notes"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="chip-group" role="group" aria-label="Filter by category">
            {['All', ...CATEGORY_VALUES].map((value) => (
              <button
                key={value}
                type="button"
                className="chip"
                aria-pressed={category === value}
                onClick={() => setCategory(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="capsule-grid" aria-hidden="true">
          <div className="skeleton-card" />
          <div className="skeleton-card" />
          <div className="skeleton-card" />
        </div>
      ) : null}

      {!loading && !loadError && capsules.length === 0 ? (
        <div className="empty">
          <span className="label">Nothing saved yet</span>
          <h2>Your library is empty</h2>
          <p>
            Save the first prompt that actually worked. You can add the response summary and a
            usefulness rating now or come back and edit it later.
          </p>
          <button type="button" className="btn btn-primary btn-lg" onClick={() => setEditingId('new')}>
            <PlusIcon />
            Create your first capsule
          </button>
        </div>
      ) : null}

      {!loading && !loadError && capsules.length > 0 && visible.length === 0 ? (
        <div className="empty">
          <h2>No capsules match that filter</h2>
          <p>Try a different search term, or clear the category filter to see everything again.</p>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setSearch('');
              setCategory('All');
            }}
          >
            Clear filters
          </button>
        </div>
      ) : null}

      {visible.length > 0 ? (
        <div className="capsule-grid">
          {visible.map((capsule) => (
            <CapsuleCard
              key={capsule.id}
              capsule={capsule}
              busy={submitting}
              onEdit={(id) => {
                setFieldErrors({});
                setFormError(null);
                setEditingId(id);
              }}
              onDelete={(id) => setDeletingId(id)}
            />
          ))}
        </div>
      ) : null}

      {editingId !== null ? (
        <Modal
          kicker={editingCapsule ? 'Editing record' : 'New record'}
          title={editingCapsule ? 'Edit capsule' : 'New capsule'}
          description={
            editingCapsule
              ? 'Change any field. Anything you leave untouched keeps its stored value.'
              : 'Project name, prompt title and prompt text are required. Everything else is optional.'
          }
          onClose={closeForm}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={closeForm} disabled={submitting}>
                Cancel
              </button>
              <button type="submit" form="capsule-form" className="btn btn-primary" disabled={submitting}>
                {submitting ? <span className="spinner" /> : null}
                {editingCapsule ? 'Save changes' : 'Create capsule'}
              </button>
            </>
          }
        >
          {formError ? (
            <div className="alert alert-error" role="alert">
              <div>
                <strong>The server rejected this capsule</strong>
                {formError}
              </div>
            </div>
          ) : null}
          <CapsuleForm
            // Remounting per record guarantees the form never shows another
            // capsule's values after switching which one is being edited.
            key={editingCapsule ? editingCapsule.id : 'new'}
            formId="capsule-form"
            capsule={editingCapsule}
            serverErrors={fieldErrors}
            onSubmit={handleSubmit}
          />
        </Modal>
      ) : null}

      {deletingId !== null ? (
        <Modal
          size="sm"
          kicker="Confirm"
          title="Delete this capsule?"
          onClose={() => setDeletingId(null)}
          footer={
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setDeletingId(null)}
                disabled={submitting}
              >
                Keep it
              </button>
              <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={submitting}>
                {submitting ? <span className="spinner" /> : null}
                Delete
              </button>
            </>
          }
        >
          <p style={{ color: 'var(--ink-muted)' }}>
            {deletingCapsule
              ? `"${deletingCapsule.prompt_title}" from ${deletingCapsule.project_name} will be removed permanently. This cannot be undone.`
              : 'This capsule will be removed permanently. This cannot be undone.'}
          </p>
        </Modal>
      ) : null}
    </main>
  );
}
