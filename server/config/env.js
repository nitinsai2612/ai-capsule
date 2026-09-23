import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(here, '..', '..');

dotenv.config({ path: path.join(projectRoot, '.env') });

function optional(name, fallback) {
  const raw = process.env[name];
  return raw === undefined || raw === '' ? fallback : raw;
}

const nodeEnv = optional('NODE_ENV', 'development');
const appBaseUrl = optional('APP_BASE_URL', `http://localhost:${optional('PORT', '3001')}`).replace(
  /\/+$/,
  '',
);

// Browsers refuse a Secure cookie over plain HTTP, so the flag follows the
// scheme of the public base URL rather than NODE_ENV. Render is always https.
const usesHttps = appBaseUrl.startsWith('https://');

export const config = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: Number.parseInt(optional('PORT', '3001'), 10),
  appBaseUrl,
  usesHttps,
  github: {
    clientId: optional('GITHUB_CLIENT_ID', ''),
    clientSecret: optional('GITHUB_CLIENT_SECRET', ''),
    callbackUrl: `${appBaseUrl}/auth/github/callback`,
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userUrl: 'https://api.github.com/user',
    // No scope requested: GET /user returns the public profile, including the
    // numeric id used as user_id, without one.
    scope: '',
  },
  jwt: {
    secret: optional('JWT_SECRET', ''),
    expiresIn: optional('JWT_EXPIRES_IN', '2h'),
    cookieName: 'token',
    issuer: 'ai-capsule',
    audience: 'ai-capsule-client',
  },
  database: {
    file: path.resolve(projectRoot, optional('DATABASE_FILE', './data/aicapsule.db')),
  },
  clientDist: path.join(projectRoot, 'client', 'dist'),
};

// The server still boots without GitHub credentials so /api/health and the
// public pages can be checked; login then reports a clear error.
export function missingSecrets() {
  const missing = [];
  if (!config.jwt.secret) missing.push('JWT_SECRET');
  if (!config.github.clientId) missing.push('GITHUB_CLIENT_ID');
  if (!config.github.clientSecret) missing.push('GITHUB_CLIENT_SECRET');
  return missing;
}

export const authCookieOptions = {
  httpOnly: true,
  secure: config.usesHttps,
  sameSite: 'lax',
  path: '/',
};
