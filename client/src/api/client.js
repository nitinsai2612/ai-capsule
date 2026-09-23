/**
 * Wrapper over fetch for the AI Capsule API. The session cookie is HttpOnly, so
 * JavaScript never reads or sends the token itself; credentials: 'same-origin'
 * lets the browser attach it.
 */

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details ?? [];
  }

  get isUnauthenticated() {
    return this.status === 401;
  }

  // { fieldName: message } for inline form errors.
  get fieldErrors() {
    const map = {};
    for (const detail of this.details) {
      if (detail?.field && !map[detail.field]) map[detail.field] = detail.message;
    }
    return map;
  }
}

async function request(path, { method = 'GET', body } = {}) {
  const init = {
    method,
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  };

  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Check your connection.');
  }

  if (response.status === 204) return null;

  // A 200 whose body is not JSON means something other than the API answered,
  // such as a proxy or the SPA shell. Treat it as a failure.
  const contentType = response.headers.get('content-type') ?? '';
  let payload = null;
  if (contentType.includes('application/json')) {
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const err = payload?.error;
    throw new ApiError(
      response.status,
      err?.code ?? 'HTTP_ERROR',
      err?.message ?? `Request failed with status ${response.status}.`,
      err?.details,
    );
  }

  if (payload === null) {
    throw new ApiError(
      response.status,
      'UNEXPECTED_RESPONSE',
      'The server returned an unexpected response format.',
    );
  }

  return payload;
}

export const api = {
  me: () => request('/api/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),
  listCapsules: () => request('/api/capsules'),
  createCapsule: (body) => request('/api/capsules', { method: 'POST', body }),
  updateCapsule: (id, body) => request(`/api/capsules/${id}`, { method: 'PUT', body }),
  deleteCapsule: (id) => request(`/api/capsules/${id}`, { method: 'DELETE' }),
};
