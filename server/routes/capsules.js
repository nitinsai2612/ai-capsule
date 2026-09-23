import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { ApiError, notFound, validationFailed } from '../lib/apiError.js';
import { parseId, validateCreate, validateUpdate } from '../validation/capsuleSchema.js';
import {
  createCapsule,
  deleteCapsule,
  findCapsuleForUser,
  listCapsulesForUser,
  updateCapsule,
} from '../db/index.js';

const router = Router();

// Guards the whole subtree, so a route added later cannot be public by accident.
// Each route below also names requireAuth so the protection is visible on the
// route itself. The middleware returns early when it has already run.
router.use('/api/capsules', requireAuth);

function requireJsonBody(req, next) {
  const type = req.get('content-type');
  if (!type || !type.toLowerCase().includes('application/json')) {
    next(
      new ApiError(
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        'Request body must be sent with Content-Type: application/json.',
      ),
    );
    return false;
  }
  return true;
}

function resolveId(req, next) {
  const id = parseId(req.params.id);
  if (id === null) {
    next(
      new ApiError(
        400,
        'INVALID_ID',
        `"${req.params.id}" is not a valid capsule id. The id must be a positive whole number.`,
      ),
    );
    return null;
  }
  return id;
}

// READ: the authenticated user's own records, newest first.
router.get('/api/capsules', requireAuth, (req, res, next) => {
  try {
    res.status(200).json({ capsules: listCapsulesForUser(req.user.id) });
  } catch (err) {
    next(err);
  }
});

// READ one own record.
router.get('/api/capsules/:id', requireAuth, (req, res, next) => {
  const id = resolveId(req, next);
  if (id === null) return;
  try {
    const capsule = findCapsuleForUser(id, req.user.id);
    // Another user's record is reported as not found, so the response cannot be
    // used to probe which ids exist.
    if (!capsule) return next(notFound());
    res.status(200).json({ capsule });
  } catch (err) {
    next(err);
  }
});

// CREATE: owned by the authenticated user.
router.post('/api/capsules', requireAuth, (req, res, next) => {
  if (!requireJsonBody(req, next)) return;

  const result = validateCreate(req.body);
  if (!result.ok) return next(validationFailed(result.errors));

  try {
    // Ownership comes from the verified JWT. Any user_id in the body was
    // discarded by the validator and is not consulted here.
    const capsule = createCapsule(req.user.id, result.values);
    res.status(201).location(`/api/capsules/${capsule.id}`).json({ capsule });
  } catch (err) {
    next(err);
  }
});

// UPDATE: partial update of an own record.
router.put('/api/capsules/:id', requireAuth, (req, res, next) => {
  const id = resolveId(req, next);
  if (id === null) return;
  if (!requireJsonBody(req, next)) return;

  const result = validateUpdate(req.body);
  if (!result.ok) return next(validationFailed(result.errors));

  try {
    // The ownership check and the write are one statement scoped by user_id.
    const capsule = updateCapsule(id, req.user.id, result.values);
    if (!capsule) return next(notFound());
    res.status(200).json({ capsule });
  } catch (err) {
    next(err);
  }
});

// DELETE an own record.
router.delete('/api/capsules/:id', requireAuth, (req, res, next) => {
  const id = resolveId(req, next);
  if (id === null) return;

  try {
    if (!deleteCapsule(id, req.user.id)) return next(notFound());
    res.status(200).json({ deleted: true, id });
  } catch (err) {
    next(err);
  }
});

function methodNotAllowed(allowed) {
  return (req, res, next) => {
    res.set('Allow', allowed.join(', '));
    next(
      new ApiError(
        405,
        'METHOD_NOT_ALLOWED',
        `${req.method} is not supported on this path. Allowed: ${allowed.join(', ')}.`,
      ),
    );
  };
}

router.all('/api/capsules', requireAuth, methodNotAllowed(['GET', 'POST']));
router.all('/api/capsules/:id', requireAuth, methodNotAllowed(['GET', 'PUT', 'DELETE']));

export default router;
