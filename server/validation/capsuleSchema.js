/**
 * Request validation for capsule records.
 *
 * Every rule is enforced here, before any value reaches SQLite. Nothing is left
 * to a database CHECK constraint: the API contract has to hold whatever storage
 * engine is behind it, and a constraint violation gives an opaque error instead
 * of a message naming the field.
 */

export const CATEGORY_VALUES = Object.freeze(['Coding', 'Writing', 'Research']);
export const USEFULNESS_VALUES = Object.freeze(['Good', 'Needs Improvement']);

// maxLength is counted in Unicode code points, not UTF-16 units.
export const FIELD_RULES = Object.freeze({
  project_name: { type: 'string', required: true, minLength: 1, maxLength: 120, multiline: false },
  prompt_title: { type: 'string', required: true, minLength: 1, maxLength: 120, multiline: false },
  prompt_version: { type: 'string', required: false, maxLength: 20, multiline: false },
  prompt_text: { type: 'string', required: true, minLength: 1, maxLength: 5000, multiline: true },
  response_summary: { type: 'string', required: false, maxLength: 2000, multiline: true },
  category: { type: 'enum', required: false, values: CATEGORY_VALUES },
  usefulness: { type: 'enum', required: false, values: USEFULNESS_VALUES },
  reviewed: { type: 'boolean', required: false, default: false },
  improved: { type: 'boolean', required: false, default: false },
  screenshot_url: { type: 'url', required: false, maxLength: 2000 },
  notes: { type: 'string', required: false, maxLength: 1000, multiline: true },
});

export const EDITABLE_FIELDS = Object.freeze(Object.keys(FIELD_RULES));

// Server-owned fields. If a client sends them they are ignored rather than
// rejected, so a request that echoes a record back still succeeds while
// ownership continues to come from the verified JWT.
export const SERVER_CONTROLLED_FIELDS = Object.freeze([
  'id',
  'user_id',
  'created_at',
  'updated_at',
]);

// Tab, newline and carriage return are allowed in multiline fields only.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;
const CONTROL_CHARS_STRICT = /[\u0000-\u001F\u007F-\u009F]/;

const codePointLength = (value) => Array.from(value).length;

const error = (field, code, message) => ({ field, code, message });

function describe(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  const type = typeof value;
  if (type === 'undefined') return 'nothing';
  if (type === 'object') return 'an object';
  if (type === 'number') return Number.isFinite(value) ? 'a number' : 'a non-finite number';
  return `a ${type}`;
}

function validateStringLike(field, rule, rawValue, errors) {
  if (typeof rawValue !== 'string') {
    errors.push(error(field, 'INVALID_TYPE', `"${field}" must be a JSON string, received ${describe(rawValue)}.`));
    return undefined;
  }

  const pattern = rule.multiline ? CONTROL_CHARS : CONTROL_CHARS_STRICT;
  if (pattern.test(rawValue)) {
    errors.push(
      error(
        field,
        'INVALID_CHARACTERS',
        rule.multiline
          ? `"${field}" must not contain control characters other than line breaks and tabs.`
          : `"${field}" must be a single line and must not contain control characters.`,
      ),
    );
    return undefined;
  }

  const trimmed = rawValue.trim();

  if (rule.required && trimmed.length === 0) {
    errors.push(error(field, 'REQUIRED', `"${field}" is required and must not be blank.`));
    return undefined;
  }
  // A blank optional field clears the stored value.
  if (!rule.required && trimmed.length === 0) return null;

  const length = codePointLength(trimmed);
  if (rule.minLength && length < rule.minLength) {
    errors.push(error(field, 'TOO_SHORT', `"${field}" must be at least ${rule.minLength} character(s).`));
    return undefined;
  }
  if (rule.maxLength && length > rule.maxLength) {
    errors.push(
      error(field, 'TOO_LONG', `"${field}" must be ${rule.maxLength} characters or fewer (received ${length}).`),
    );
    return undefined;
  }

  return trimmed;
}

function validateEnum(field, rule, rawValue, errors) {
  if (typeof rawValue !== 'string') {
    errors.push(error(field, 'INVALID_TYPE', `"${field}" must be a JSON string, received ${describe(rawValue)}.`));
    return undefined;
  }
  const trimmed = rawValue.trim();
  if (trimmed.length === 0) return null;

  // Exact and case-sensitive, so stored values stay canonical.
  if (!rule.values.includes(trimmed)) {
    errors.push(
      error(field, 'NOT_ALLOWED', `"${field}" must be exactly one of: ${rule.values.map((v) => `"${v}"`).join(', ')}.`),
    );
    return undefined;
  }
  return trimmed;
}

function validateBoolean(field, rawValue, errors) {
  if (typeof rawValue !== 'boolean') {
    errors.push(
      error(field, 'INVALID_TYPE', `"${field}" must be a JSON boolean (true or false), received ${describe(rawValue)}.`),
    );
    return undefined;
  }
  return rawValue;
}

function validateUrl(field, rule, rawValue, errors) {
  if (typeof rawValue !== 'string') {
    errors.push(error(field, 'INVALID_TYPE', `"${field}" must be a JSON string, received ${describe(rawValue)}.`));
    return undefined;
  }
  const trimmed = rawValue.trim();
  if (trimmed.length === 0) return null;

  if (CONTROL_CHARS_STRICT.test(rawValue) || /\s/.test(trimmed)) {
    errors.push(error(field, 'INVALID_URL', `"${field}" must not contain whitespace.`));
    return undefined;
  }
  if (codePointLength(trimmed) > rule.maxLength) {
    errors.push(error(field, 'TOO_LONG', `"${field}" must be ${rule.maxLength} characters or fewer.`));
    return undefined;
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    errors.push(error(field, 'INVALID_URL', `"${field}" must be an absolute http:// or https:// URL.`));
    return undefined;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    errors.push(
      error(
        field,
        'INVALID_URL',
        `"${field}" must use the http or https scheme (received "${parsed.protocol.replace(':', '')}").`,
      ),
    );
    return undefined;
  }
  if (!parsed.hostname) {
    errors.push(error(field, 'INVALID_URL', `"${field}" must include a host name.`));
    return undefined;
  }
  return parsed.toString();
}

function validateField(field, rawValue, errors) {
  const rule = FIELD_RULES[field];

  // Explicit null clears an optional field and is never valid for a required one.
  if (rawValue === null) {
    if (rule.required) {
      errors.push(error(field, 'REQUIRED', `"${field}" is required and must not be null.`));
      return undefined;
    }
    return rule.type === 'boolean' ? false : null;
  }

  switch (rule.type) {
    case 'string':
      return validateStringLike(field, rule, rawValue, errors);
    case 'enum':
      return validateEnum(field, rule, rawValue, errors);
    case 'boolean':
      return validateBoolean(field, rawValue, errors);
    case 'url':
      return validateUrl(field, rule, rawValue, errors);
    default:
      return undefined;
  }
}

function assertPlainObject(body, errors) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    errors.push(error(null, 'INVALID_BODY', `Request body must be a JSON object, received ${describe(body)}.`));
    return false;
  }
  return true;
}

function collectUnknownFields(body, errors) {
  for (const key of Object.keys(body)) {
    if (Object.prototype.hasOwnProperty.call(FIELD_RULES, key)) continue;
    if (SERVER_CONTROLLED_FIELDS.includes(key)) continue;
    errors.push(error(key, 'UNKNOWN_FIELD', `"${key}" is not a recognised capsule field.`));
  }
}

// POST: required fields must be supplied, optional fields fall back to their
// documented default.
export function validateCreate(body) {
  const errors = [];
  if (!assertPlainObject(body, errors)) return { ok: false, errors };

  collectUnknownFields(body, errors);

  const values = {};
  for (const field of EDITABLE_FIELDS) {
    const rule = FIELD_RULES[field];

    if (!Object.prototype.hasOwnProperty.call(body, field)) {
      if (rule.required) {
        errors.push(error(field, 'REQUIRED', `"${field}" is required.`));
        continue;
      }
      values[field] = rule.type === 'boolean' ? rule.default : null;
      continue;
    }

    const resolved = validateField(field, body[field], errors);
    if (resolved !== undefined) values[field] = resolved;
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, values };
}

// PUT is a partial update: omitted fields keep their stored value, and a body
// carrying no editable field is rejected so a no-op never reports success.
export function validateUpdate(body) {
  const errors = [];
  if (!assertPlainObject(body, errors)) return { ok: false, errors };

  collectUnknownFields(body, errors);

  const values = {};
  let editableFieldCount = 0;

  for (const field of EDITABLE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
    editableFieldCount += 1;
    const resolved = validateField(field, body[field], errors);
    if (resolved !== undefined) values[field] = resolved;
  }

  if (editableFieldCount === 0 && errors.length === 0) {
    return {
      ok: false,
      errors: [
        error(
          null,
          'EMPTY_UPDATE',
          `Provide at least one field to update. Editable fields: ${EDITABLE_FIELDS.join(', ')}.`,
        ),
      ],
    };
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, values };
}

// Only a canonical positive integer is accepted, so "0", "-1", "1.0", "01",
// "1e3" and "abc" are rejected before any database lookup.
export function parseId(raw) {
  if (typeof raw !== 'string' || !/^[1-9][0-9]*$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}
