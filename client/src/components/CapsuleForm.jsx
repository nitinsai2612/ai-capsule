import { useMemo, useState } from 'react';
import {
  CATEGORY_VALUES,
  EMPTY_CAPSULE,
  LIMITS,
  REQUIRED_FIELDS,
  USEFULNESS_VALUES,
} from '../constants/capsuleFields.js';

function countCodePoints(value) {
  return Array.from(value ?? '').length;
}

function toFormState(capsule) {
  if (!capsule) return { ...EMPTY_CAPSULE };
  return {
    project_name: capsule.project_name ?? '',
    prompt_title: capsule.prompt_title ?? '',
    prompt_version: capsule.prompt_version ?? '',
    prompt_text: capsule.prompt_text ?? '',
    response_summary: capsule.response_summary ?? '',
    category: capsule.category ?? '',
    usefulness: capsule.usefulness ?? '',
    reviewed: Boolean(capsule.reviewed),
    improved: Boolean(capsule.improved),
    screenshot_url: capsule.screenshot_url ?? '',
    notes: capsule.notes ?? '',
  };
}

// Mirrors the server's rules so a problem shows before a round trip. The server
// repeats all of them and its errors win.
function validateLocally(values) {
  const errors = {};

  for (const field of REQUIRED_FIELDS) {
    if (values[field].trim().length === 0) {
      errors[field] = 'This field is required.';
    }
  }

  for (const [field, max] of Object.entries(LIMITS)) {
    const length = countCodePoints(values[field].trim());
    if (length > max) {
      errors[field] = `Must be ${max} characters or fewer (currently ${length}).`;
    }
  }

  const url = values.screenshot_url.trim();
  if (url.length > 0) {
    let parsed = null;
    try {
      parsed = new URL(url);
    } catch {
      parsed = null;
    }
    if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
      errors.screenshot_url = 'Enter an absolute http:// or https:// URL.';
    }
  }

  return errors;
}

function Counter({ value, max }) {
  const length = countCodePoints(value.trim());
  return (
    <span className={`counter${length > max ? ' over' : ''}`}>
      {length}/{max}
    </span>
  );
}

export default function CapsuleForm({ formId, capsule, serverErrors, onSubmit }) {
  const [values, setValues] = useState(() => toFormState(capsule));
  const [localErrors, setLocalErrors] = useState({});
  const [touched, setTouched] = useState(false);

  const errors = useMemo(
    () => ({ ...localErrors, ...(serverErrors ?? {}) }),
    [localErrors, serverErrors],
  );

  const setField = (field) => (event) => {
    const next = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setValues((current) => {
      const updated = { ...current, [field]: next };
      if (touched) setLocalErrors(validateLocally(updated));
      return updated;
    });
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setTouched(true);
    const found = validateLocally(values);
    setLocalErrors(found);
    if (Object.keys(found).length > 0) {
      const firstField = Object.keys(found)[0];
      document.getElementById(`${formId}-${firstField}`)?.focus();
      return;
    }

    // Blank strings are turned into null by the server, so clearing a field works.
    onSubmit({
      project_name: values.project_name.trim(),
      prompt_title: values.prompt_title.trim(),
      prompt_version: values.prompt_version.trim(),
      prompt_text: values.prompt_text.trim(),
      response_summary: values.response_summary.trim(),
      category: values.category,
      usefulness: values.usefulness,
      reviewed: values.reviewed,
      improved: values.improved,
      screenshot_url: values.screenshot_url.trim(),
      notes: values.notes.trim(),
    });
  };

  const field = (name) => ({
    'data-invalid': errors[name] ? 'true' : 'false',
    className: 'field',
  });
  const control = (name) => ({
    id: `${formId}-${name}`,
    name,
    value: values[name],
    onChange: setField(name),
    'aria-invalid': errors[name] ? 'true' : undefined,
    'aria-describedby': errors[name] ? `${formId}-${name}-error` : undefined,
  });
  const errorFor = (name) =>
    errors[name] ? (
      <span className="field-error" id={`${formId}-${name}-error`} role="alert">
        {errors[name]}
      </span>
    ) : null;

  return (
    <form id={formId} onSubmit={handleSubmit} noValidate>
      <div className="form-grid">
        <div {...field('project_name')}>
          <label htmlFor={`${formId}-project_name`}>
            <span>
              Project name<span className="req">*</span>
            </span>
            <Counter value={values.project_name} max={LIMITS.project_name} />
          </label>
          <input type="text" autoComplete="off" placeholder="SmartFarm Irrigation" {...control('project_name')} />
          {errorFor('project_name')}
        </div>

        <div {...field('prompt_title')}>
          <label htmlFor={`${formId}-prompt_title`}>
            <span>
              Prompt title<span className="req">*</span>
            </span>
            <Counter value={values.prompt_title} max={LIMITS.prompt_title} />
          </label>
          <input type="text" autoComplete="off" placeholder="Debug cloud deployment" {...control('prompt_title')} />
          {errorFor('prompt_title')}
        </div>

        <div {...field('prompt_version')}>
          <label htmlFor={`${formId}-prompt_version`}>
            <span>Version</span>
            <Counter value={values.prompt_version} max={LIMITS.prompt_version} />
          </label>
          <input type="text" autoComplete="off" placeholder="v1" {...control('prompt_version')} />
          {errorFor('prompt_version')}
        </div>

        <div {...field('category')}>
          <label htmlFor={`${formId}-category`}>
            <span>Category</span>
          </label>
          <select {...control('category')}>
            <option value="">Not set</option>
            {CATEGORY_VALUES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          {errorFor('category')}
        </div>

        <div {...field('prompt_text')} className="field span-2" data-invalid={errors.prompt_text ? 'true' : 'false'}>
          <label htmlFor={`${formId}-prompt_text`}>
            <span>
              Prompt text<span className="req">*</span>
            </span>
            <Counter value={values.prompt_text} max={LIMITS.prompt_text} />
          </label>
          <textarea rows={6} placeholder="Why does my Node server fail to start on Render?" {...control('prompt_text')} />
          {errorFor('prompt_text')}
        </div>

        <div {...field('response_summary')} className="field span-2" data-invalid={errors.response_summary ? 'true' : 'false'}>
          <label htmlFor={`${formId}-response_summary`}>
            <span>Response summary</span>
            <Counter value={values.response_summary} max={LIMITS.response_summary} />
          </label>
          <textarea rows={3} placeholder="Check the start command and the PORT binding." {...control('response_summary')} />
          {errorFor('response_summary')}
        </div>

        <div {...field('usefulness')}>
          <label htmlFor={`${formId}-usefulness`}>
            <span>Usefulness</span>
          </label>
          <select {...control('usefulness')}>
            <option value="">Not rated</option>
            {USEFULNESS_VALUES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          {errorFor('usefulness')}
        </div>

        <div {...field('screenshot_url')}>
          <label htmlFor={`${formId}-screenshot_url`}>
            <span>Screenshot evidence URL</span>
          </label>
          <input type="url" inputMode="url" placeholder="https://..." {...control('screenshot_url')} />
          {errorFor('screenshot_url') ?? (
            <span className="field-hint">Optional. Paste a link to an image or a shared screenshot.</span>
          )}
        </div>

        <div {...field('notes')} className="field span-2" data-invalid={errors.notes ? 'true' : 'false'}>
          <label htmlFor={`${formId}-notes`}>
            <span>Notes</span>
            <Counter value={values.notes} max={LIMITS.notes} />
          </label>
          <textarea rows={2} placeholder="Tested and worked." {...control('notes')} />
          {errorFor('notes')}
        </div>

        <div className="field span-2">
          <div className="switch-row">
            <label className="switch" htmlFor={`${formId}-reviewed`}>
              <input
                type="checkbox"
                id={`${formId}-reviewed`}
                name="reviewed"
                checked={values.reviewed}
                onChange={setField('reviewed')}
              />
              Response checked
            </label>
            <label className="switch" htmlFor={`${formId}-improved`}>
              <input
                type="checkbox"
                id={`${formId}-improved`}
                name="improved"
                checked={values.improved}
                onChange={setField('improved')}
              />
              Output improved
            </label>
          </div>
        </div>
      </div>
    </form>
  );
}
