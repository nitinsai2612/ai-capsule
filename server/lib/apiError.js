/**
 * Every failing response uses one envelope:
 *   { "error": { "code": "...", "message": "...", "details": [ ... ] } }
 * `details` appears only for validation failures, one entry per rejected field.
 */
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    if (details && details.length > 0) this.details = details;
  }
}

export const unauthenticated = (message = 'Authentication required.') =>
  new ApiError(401, 'UNAUTHENTICATED', message);

export const notFound = (message = 'Capsule not found.') =>
  new ApiError(404, 'NOT_FOUND', message);

export const validationFailed = (details, message = 'The request body failed validation.') => {
  // A problem with the request as a whole carries no field name, so its own
  // code is promoted instead of being buried under VALIDATION_ERROR.
  if (details.length === 1 && details[0].field === null) {
    return new ApiError(400, details[0].code, details[0].message);
  }
  return new ApiError(400, 'VALIDATION_ERROR', message, details);
};

export function sendApiError(res, err) {
  const isApi = err instanceof ApiError;
  const body = {
    error: {
      code: isApi ? err.code : 'INTERNAL_ERROR',
      message: isApi ? err.message : 'An unexpected error occurred on the server.',
    },
  };
  if (isApi && err.details) body.error.details = err.details;
  res.status(isApi ? err.status : 500).json(body);
}
