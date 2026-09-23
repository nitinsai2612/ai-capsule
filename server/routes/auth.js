import crypto from 'node:crypto';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { authCookieOptions, config, missingSecrets } from '../config/env.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

const STATE_COOKIE = 'oauth_state';
const STATE_COOKIE_OPTIONS = { ...authCookieOptions, maxAge: 10 * 60 * 1000 };

function redirectToLoginWithError(res, code) {
  res.clearCookie(STATE_COOKIE, authCookieOptions);
  res.redirect(302, `/login?error=${encodeURIComponent(code)}`);
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Starts the GitHub OAuth flow. The random `state` is stored in a short-lived
 * cookie and echoed back by GitHub, which stops a forged callback.
 */
router.get('/auth/github', (req, res) => {
  const missing = missingSecrets();
  if (missing.includes('GITHUB_CLIENT_ID') || missing.includes('GITHUB_CLIENT_SECRET')) {
    return redirectToLoginWithError(res, 'oauth_not_configured');
  }

  const state = crypto.randomBytes(32).toString('hex');
  res.cookie(STATE_COOKIE, state, STATE_COOKIE_OPTIONS);

  const url = new URL(config.github.authorizeUrl);
  url.searchParams.set('client_id', config.github.clientId);
  url.searchParams.set('redirect_uri', config.github.callbackUrl);
  if (config.github.scope) url.searchParams.set('scope', config.github.scope);
  url.searchParams.set('state', state);

  return res.redirect(302, url.toString());
});

/**
 * Completes OAuth and issues the application JWT. The GitHub access token is
 * used once on the server to read the account id, then discarded. What the
 * browser receives is this application's own JWT.
 */
router.get('/auth/github/callback', async (req, res) => {
  const expectedState = req.cookies?.[STATE_COOKIE];
  const { code, state, error: providerError } = req.query;

  if (providerError) return redirectToLoginWithError(res, 'access_denied');
  if (typeof code !== 'string' || code.length === 0) {
    return redirectToLoginWithError(res, 'missing_code');
  }
  if (typeof state !== 'string' || !safeEqual(state, expectedState)) {
    return redirectToLoginWithError(res, 'state_mismatch');
  }
  if (!config.jwt.secret) return redirectToLoginWithError(res, 'jwt_not_configured');

  res.clearCookie(STATE_COOKIE, authCookieOptions);

  try {
    const tokenResponse = await fetch(config.github.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'ai-capsule',
      },
      body: JSON.stringify({
        client_id: config.github.clientId,
        client_secret: config.github.clientSecret,
        code,
        redirect_uri: config.github.callbackUrl,
      }),
    });

    if (!tokenResponse.ok) return redirectToLoginWithError(res, 'token_exchange_failed');

    const tokenPayload = await tokenResponse.json();
    const accessToken = tokenPayload?.access_token;
    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      return redirectToLoginWithError(res, 'token_exchange_failed');
    }

    const userResponse = await fetch(config.github.userUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'ai-capsule',
      },
    });

    if (!userResponse.ok) return redirectToLoginWithError(res, 'profile_fetch_failed');

    const profile = await userResponse.json();
    if (profile?.id === undefined || profile?.id === null) {
      return redirectToLoginWithError(res, 'profile_fetch_failed');
    }

    // The numeric id is the stable identifier. A login name can be changed by
    // its owner, so it is carried for display only.
    const appToken = jwt.sign(
      {
        login: typeof profile.login === 'string' ? profile.login : null,
        name: typeof profile.name === 'string' ? profile.name : null,
        avatar_url: typeof profile.avatar_url === 'string' ? profile.avatar_url : null,
        provider: 'github',
      },
      config.jwt.secret,
      {
        algorithm: 'HS256',
        subject: String(profile.id),
        expiresIn: config.jwt.expiresIn,
        issuer: config.jwt.issuer,
        audience: config.jwt.audience,
      },
    );

    res.cookie(config.jwt.cookieName, appToken, authCookieOptions);
    return res.redirect(302, '/dashboard');
  } catch (err) {
    console.error('[auth] OAuth callback failed:', err.message);
    return redirectToLoginWithError(res, 'oauth_failed');
  }
});

router.post('/auth/logout', (req, res) => {
  res.clearCookie(config.jwt.cookieName, authCookieOptions);
  res.status(204).end();
});

// Lets the React app discover the signed-in identity without reading the
// HttpOnly cookie, which JavaScript cannot do.
router.get('/api/me', requireAuth, (req, res) => {
  res.status(200).json({ user: req.user });
});

export default router;
