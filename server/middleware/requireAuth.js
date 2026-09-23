import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { unauthenticated } from '../lib/apiError.js';

/**
 * Verifies the application JWT that Express issued after OAuth.
 *
 * The token is read only from the HttpOnly cookie named `token`. An
 * Authorization: Bearer header is deliberately not accepted.
 *
 * Every failure returns 401 and no capsule data: missing cookie, empty cookie,
 * bad signature, wrong algorithm, expired, wrong issuer or audience, and a
 * payload with no subject.
 */
export function requireAuth(req, res, next) {
  // Applied both to the /api/capsules subtree and to each route, so run once.
  if (req.user) return next();

  const raw = req.cookies?.[config.jwt.cookieName];
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return next(unauthenticated('Authentication required: no session token was supplied.'));
  }

  if (!config.jwt.secret) {
    console.error('[auth] JWT_SECRET is not configured; rejecting authenticated request.');
    return next(unauthenticated('Authentication required: the session token could not be verified.'));
  }

  let payload;
  try {
    payload = jwt.verify(raw, config.jwt.secret, {
      algorithms: ['HS256'],
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
      clockTolerance: 5,
    });
  } catch {
    return next(unauthenticated('Authentication required: the session token is invalid or expired.'));
  }

  const userId = typeof payload.sub === 'string' ? payload.sub.trim() : '';
  if (userId.length === 0) {
    return next(unauthenticated('Authentication required: the session token has no subject.'));
  }

  // Identity comes from the verified token only, never from the request body.
  req.user = {
    id: userId,
    login: typeof payload.login === 'string' ? payload.login : null,
    name: typeof payload.name === 'string' ? payload.name : null,
    avatarUrl: typeof payload.avatar_url === 'string' ? payload.avatar_url : null,
    provider: typeof payload.provider === 'string' ? payload.provider : 'github',
  };
  return next();
}
