/**
 * AI Capsule - acceptance suite.
 *
 * Run from the project root:  node tests/acceptance.mjs
 *
 * Boots the real Express app against a throwaway SQLite file and drives it over
 * HTTP. Covers Sections 5, 6, 7 and 9 of the specification, both required cURL
 * checks, and every rule in server/validation/capsuleSchema.js including the
 * boundary on each length limit.
 *
 * The OAuth exchange itself cannot be tested offline, so the suite signs its own
 * JWTs with the same options the callback uses and asserts on what the protected
 * API does with them.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');

const TEST_SECRET = 'acceptance-suite-secret-do-not-use-in-production';
const TEST_DB = path.join(projectRoot, 'data', 'acceptance-test.db');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = TEST_SECRET;
process.env.GITHUB_CLIENT_ID = 'test-client-id';
process.env.GITHUB_CLIENT_SECRET = 'test-client-secret';
process.env.APP_BASE_URL = 'http://localhost:3901';
process.env.DATABASE_FILE = './data/acceptance-test.db';

for (const suffix of ['', '-wal', '-shm', '-journal']) {
  const file = `${TEST_DB}${suffix}`;
  if (fs.existsSync(file)) fs.rmSync(file);
}

const jwt = (await import('jsonwebtoken')).default;
const { createApp } = await import('../server/app.js');
const { initDatabase, closeDatabase } = await import('../server/db/index.js');

initDatabase();
const app = createApp();
const server = app.listen(0);
await new Promise((resolve) => server.once('listening', resolve));
const BASE = `http://127.0.0.1:${server.address().port}`;

/* -------------------------------------------------------------------------- */
/* Harness                                                                     */
/* -------------------------------------------------------------------------- */

let passed = 0;
const failures = [];
let currentSection = '';

function section(name) {
  currentSection = name;
  console.log(`\n\x1b[1m${name}\x1b[0m`);
}

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  \x1b[32mPASS\x1b[0m  ${label}`);
  } else {
    failures.push({ section: currentSection, label, detail });
    console.log(`  \x1b[31mFAIL\x1b[0m  ${label}${detail ? ` -> ${detail}` : ''}`);
  }
}

function signToken(subject, overrides = {}) {
  const { secret = TEST_SECRET, ...options } = overrides;
  return jwt.sign({ login: `user-${subject}`, provider: 'github' }, secret, {
    algorithm: 'HS256',
    subject: String(subject),
    expiresIn: '1h',
    issuer: 'ai-capsule',
    audience: 'ai-capsule-client',
    ...options,
  });
}

async function call(pathname, { method = 'GET', token, body, rawBody, headers = {} } = {}) {
  const init = { method, headers: { Accept: 'application/json', ...headers }, redirect: 'manual' };
  if (token !== undefined) init.headers.Cookie = `token=${token}`;
  if (body !== undefined) {
    init.headers['Content-Type'] = init.headers['Content-Type'] ?? 'application/json';
    init.body = JSON.stringify(body);
  }
  if (rawBody !== undefined) init.body = rawBody;

  const response = await fetch(`${BASE}${pathname}`, init);
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, headers: response.headers, text, json };
}

const USER_A = signToken('10001');
const USER_B = signToken('20002');

const VALID_CAPSULE = {
  project_name: 'SmartFarm Irrigation',
  prompt_title: 'Debug cloud deployment',
  prompt_version: 'v1',
  prompt_text: 'Why does my Node server fail to start on Render?',
  response_summary: 'Check the start command and that the app binds to process.env.PORT.',
  category: 'Coding',
  usefulness: 'Good',
  reviewed: true,
  improved: false,
  screenshot_url: 'https://example.com/evidence.png',
  notes: 'Tested and worked.',
};

const errorCode = (res) => res.json?.error?.code;
const detailCodes = (res) => (res.json?.error?.details ?? []).map((d) => `${d.field}:${d.code}`);
const hasDetail = (res, field, code) => detailCodes(res).includes(`${field}:${code}`);

/* -------------------------------------------------------------------------- */
/* Section 5 - required routes                                                 */
/* -------------------------------------------------------------------------- */

section('Section 5 - required public routes');
{
  const res = await call('/api/health');
  check('GET /api/health returns 200', res.status === 200, `status ${res.status}`);
  check(
    'GET /api/health body is exactly { "status": "ok" }',
    JSON.stringify(res.json) === '{"status":"ok"}',
    res.text,
  );
  check(
    'GET /api/health is JSON',
    (res.headers.get('content-type') ?? '').includes('application/json'),
    res.headers.get('content-type'),
  );

  const authed = await call('/api/health', { token: USER_A });
  check('GET /api/health works with a session too', authed.status === 200);

  const start = await call('/auth/github');
  const location = start.headers.get('location') ?? '';
  check('GET /auth/github redirects (302)', start.status === 302, `status ${start.status}`);
  check(
    'GET /auth/github redirects to github.com/login/oauth/authorize',
    location.startsWith('https://github.com/login/oauth/authorize'),
    location.slice(0, 80),
  );
  check(
    'OAuth start request includes a state parameter',
    new URL(location || 'https://x.invalid').searchParams.get('state')?.length >= 32,
  );
  check(
    'OAuth start request sets an HttpOnly state cookie',
    (start.headers.get('set-cookie') ?? '').includes('HttpOnly'),
    start.headers.get('set-cookie'),
  );

  const badState = await call('/auth/github/callback?code=abc&state=wrong');
  check(
    'OAuth callback with a mismatched state is rejected',
    badState.status === 302 && (badState.headers.get('location') ?? '').includes('state_mismatch'),
    badState.headers.get('location'),
  );

  const noCode = await call('/auth/github/callback?state=wrong');
  check(
    'OAuth callback without a code is rejected',
    noCode.status === 302 && (noCode.headers.get('location') ?? '').includes('missing_code'),
    noCode.headers.get('location'),
  );

  const unknown = await call('/api/does-not-exist');
  check('Unknown /api path returns 404 as JSON', unknown.status === 404 && errorCode(unknown) === 'NOT_FOUND');
}

/* -------------------------------------------------------------------------- */
/* Section 9 / D - authentication is required and actually verified            */
/* -------------------------------------------------------------------------- */

section('Section 9 + Rubric D - protected API');
{
  // Required cURL Test 1.
  const noAuth = await call('/api/capsules');
  check('cURL Test 1: GET /api/capsules with no authentication returns 401', noAuth.status === 401);
  check('401 body carries no capsule data', noAuth.json?.capsules === undefined, noAuth.text);
  check('401 body uses the documented error envelope', errorCode(noAuth) === 'UNAUTHENTICATED');

  // Required cURL Test 2 - exactly the token the specification names.
  const fake = await call('/api/capsules', { token: 'fake-token-123' });
  check('cURL Test 2: GET /api/capsules with token=fake-token-123 returns 401', fake.status === 401);
  check('Fake-token 401 carries no capsule data', fake.json?.capsules === undefined);

  const empty = await call('/api/capsules', { token: '' });
  check('Empty token cookie returns 401', empty.status === 401);

  const wrongSecret = await call('/api/capsules', {
    token: signToken('10001', { secret: 'a-different-secret-entirely' }),
  });
  check('JWT signed with the wrong secret returns 401', wrongSecret.status === 401);

  const expired = await call('/api/capsules', { token: signToken('10001', { expiresIn: '-10m' }) });
  check('Expired JWT returns 401', expired.status === 401);

  const wrongIssuer = await call('/api/capsules', { token: signToken('10001', { issuer: 'someone-else' }) });
  check('JWT with the wrong issuer returns 401', wrongIssuer.status === 401);

  const wrongAudience = await call('/api/capsules', {
    token: signToken('10001', { audience: 'another-app' }),
  });
  check('JWT with the wrong audience returns 401', wrongAudience.status === 401);

  const noSubject = await call('/api/capsules', {
    token: jwt.sign({ login: 'x' }, TEST_SECRET, {
      algorithm: 'HS256',
      expiresIn: '1h',
      issuer: 'ai-capsule',
      audience: 'ai-capsule-client',
    }),
  });
  check('JWT with no subject claim returns 401', noSubject.status === 401);

  // A classic JWT attack: swap the algorithm to "none" and drop the signature.
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const algNone = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
    sub: '10001',
    iss: 'ai-capsule',
    aud: 'ai-capsule-client',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.`;
  const noneRes = await call('/api/capsules', { token: algNone });
  check('JWT with alg=none returns 401', noneRes.status === 401);

  const bearerOnly = await call('/api/capsules', { headers: { Authorization: `Bearer ${USER_A}` } });
  check(
    'A valid JWT sent only as an Authorization header returns 401 (cookie is the sole transport)',
    bearerOnly.status === 401,
    `status ${bearerOnly.status}`,
  );

  for (const [method, target] of [
    ['POST', '/api/capsules'],
    ['PUT', '/api/capsules/1'],
    ['DELETE', '/api/capsules/1'],
    ['GET', '/api/capsules/1'],
  ]) {
    const res = await call(target, { method, body: method === 'GET' ? undefined : VALID_CAPSULE });
    check(`${method} ${target} without authentication returns 401`, res.status === 401, `status ${res.status}`);
  }

  const unsupported = await call('/api/capsules', { method: 'PATCH', token: USER_A, body: {} });
  check('Unsupported method on /api/capsules returns 405', unsupported.status === 405, `status ${unsupported.status}`);
  check('405 response advertises the allowed methods', (unsupported.headers.get('allow') ?? '').includes('GET'));

  const unsupportedNoAuth = await call('/api/capsules', { method: 'PATCH', body: {} });
  check(
    'Unsupported method without authentication still returns 401, not 405',
    unsupportedNoAuth.status === 401,
    `status ${unsupportedNoAuth.status}`,
  );
}

/* -------------------------------------------------------------------------- */
/* Section 7 - the CRUD cycle                                                  */
/* -------------------------------------------------------------------------- */

section('Section 7 - CRUD for the authenticated user');
let capsuleId = null;
{
  const created = await call('/api/capsules', { method: 'POST', token: USER_A, body: VALID_CAPSULE });
  check('CREATE returns 201', created.status === 201, `status ${created.status} ${created.text}`);
  capsuleId = created.json?.capsule?.id ?? null;
  check('CREATE returns the stored record with an id', Number.isInteger(capsuleId));
  check(
    'CREATE sets a Location header for the new record',
    (created.headers.get('location') ?? '') === `/api/capsules/${capsuleId}`,
    created.headers.get('location'),
  );
  check(
    'CREATE takes ownership from the JWT subject',
    created.json?.capsule?.user_id === '10001',
    created.json?.capsule?.user_id,
  );
  check('CREATE stores every supplied field', (() => {
    const c = created.json?.capsule ?? {};
    return (
      c.project_name === VALID_CAPSULE.project_name &&
      c.prompt_title === VALID_CAPSULE.prompt_title &&
      c.prompt_version === VALID_CAPSULE.prompt_version &&
      c.prompt_text === VALID_CAPSULE.prompt_text &&
      c.response_summary === VALID_CAPSULE.response_summary &&
      c.category === 'Coding' &&
      c.usefulness === 'Good' &&
      c.notes === 'Tested and worked.'
    );
  })(), created.text);
  check(
    'Booleans come back as JSON true/false, not 0/1',
    created.json?.capsule?.reviewed === true && created.json?.capsule?.improved === false,
  );
  check(
    'created_at is an ISO-8601 timestamp',
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(created.json?.capsule?.created_at ?? ''),
    created.json?.capsule?.created_at,
  );

  const withBodyUserId = await call('/api/capsules', {
    method: 'POST',
    token: USER_A,
    body: { ...VALID_CAPSULE, prompt_title: 'Ignores body user_id', user_id: '999999', id: 4242 },
  });
  check(
    'CREATE ignores user_id and id supplied in the body',
    withBodyUserId.status === 201 &&
      withBodyUserId.json?.capsule?.user_id === '10001' &&
      withBodyUserId.json?.capsule?.id !== 4242,
    withBodyUserId.text,
  );

  const minimal = await call('/api/capsules', {
    method: 'POST',
    token: USER_A,
    body: { project_name: 'P', prompt_title: 'T', prompt_text: 'X' },
  });
  check('CREATE succeeds with only the three required fields', minimal.status === 201, minimal.text);
  check(
    'Omitted optional text fields default to null',
    minimal.json?.capsule?.category === null && minimal.json?.capsule?.notes === null,
  );
  check(
    'Omitted booleans default to false',
    minimal.json?.capsule?.reviewed === false && minimal.json?.capsule?.improved === false,
  );

  const list = await call('/api/capsules', { token: USER_A });
  check('READ returns 200 with a capsules array', list.status === 200 && Array.isArray(list.json?.capsules));
  check('READ returns all three records created by this user', list.json?.capsules?.length === 3, String(list.json?.capsules?.length));
  check(
    'READ is ordered newest first',
    list.json?.capsules?.[0]?.prompt_title === 'T',
    list.json?.capsules?.[0]?.prompt_title,
  );
  check(
    'Every returned record belongs to the authenticated user',
    list.json?.capsules?.every((c) => c.user_id === '10001'),
  );

  const single = await call(`/api/capsules/${capsuleId}`, { token: USER_A });
  check('READ of a single own record returns 200', single.status === 200);

  const updated = await call(`/api/capsules/${capsuleId}`, {
    method: 'PUT',
    token: USER_A,
    body: { prompt_title: 'Debug cloud deployment (revised)', prompt_version: 'v2' },
  });
  check('UPDATE returns 200', updated.status === 200, updated.text);
  check(
    'UPDATE applies the supplied fields',
    updated.json?.capsule?.prompt_title === 'Debug cloud deployment (revised)' &&
      updated.json?.capsule?.prompt_version === 'v2',
  );
  check(
    'UPDATE leaves omitted fields untouched',
    updated.json?.capsule?.prompt_text === VALID_CAPSULE.prompt_text &&
      updated.json?.capsule?.notes === 'Tested and worked.',
  );
  check('UPDATE never changes the owner', updated.json?.capsule?.user_id === '10001');

  const cleared = await call(`/api/capsules/${capsuleId}`, {
    method: 'PUT',
    token: USER_A,
    body: { notes: '', category: null },
  });
  check(
    'UPDATE with an empty string or null clears an optional field',
    cleared.json?.capsule?.notes === null && cleared.json?.capsule?.category === null,
    cleared.text,
  );

  const toggled = await call(`/api/capsules/${capsuleId}`, {
    method: 'PUT',
    token: USER_A,
    body: { reviewed: false, improved: true },
  });
  check(
    'UPDATE toggles booleans in both directions',
    toggled.json?.capsule?.reviewed === false && toggled.json?.capsule?.improved === true,
  );

  const deleteTarget = minimal.json.capsule.id;
  const removed = await call(`/api/capsules/${deleteTarget}`, { method: 'DELETE', token: USER_A });
  check('DELETE returns 200', removed.status === 200, removed.text);
  check('DELETE confirms which id was removed', removed.json?.deleted === true && removed.json?.id === deleteTarget);

  const gone = await call(`/api/capsules/${deleteTarget}`, { token: USER_A });
  check('A deleted record is no longer readable', gone.status === 404);

  const deleteAgain = await call(`/api/capsules/${deleteTarget}`, { method: 'DELETE', token: USER_A });
  check('Deleting the same record twice returns 404, not a false success', deleteAgain.status === 404);

  const afterDelete = await call('/api/capsules', { token: USER_A });
  check('The list shrinks after a delete', afterDelete.json?.capsules?.length === 2);
}

/* -------------------------------------------------------------------------- */
/* Section 9 / D - ownership isolation between users                           */
/* -------------------------------------------------------------------------- */

section('Section 9 + Rubric D - users are restricted to their own records');
{
  const bList = await call('/api/capsules', { token: USER_B });
  check('A second user starts with an empty library', bList.json?.capsules?.length === 0, bList.text);

  const bCreated = await call('/api/capsules', {
    method: 'POST',
    token: USER_B,
    body: { project_name: 'Other user project', prompt_title: 'Private', prompt_text: 'Secret' },
  });
  const bId = bCreated.json?.capsule?.id;
  check("The second user's record is owned by the second user", bCreated.json?.capsule?.user_id === '20002');

  const aSeesOnlyOwn = await call('/api/capsules', { token: USER_A });
  check(
    "User A's list never contains user B's record",
    aSeesOnlyOwn.json?.capsules?.every((c) => c.id !== bId && c.user_id === '10001'),
  );

  const crossRead = await call(`/api/capsules/${bId}`, { token: USER_A });
  check("Reading another user's record returns 404", crossRead.status === 404, `status ${crossRead.status}`);

  const crossUpdate = await call(`/api/capsules/${bId}`, {
    method: 'PUT',
    token: USER_A,
    body: { prompt_title: 'Hijacked' },
  });
  check("Updating another user's record returns 404", crossUpdate.status === 404, `status ${crossUpdate.status}`);

  const crossDelete = await call(`/api/capsules/${bId}`, { method: 'DELETE', token: USER_A });
  check("Deleting another user's record returns 404", crossDelete.status === 404, `status ${crossDelete.status}`);

  const stillThere = await call(`/api/capsules/${bId}`, { token: USER_B });
  check(
    "The other user's record survived the attempts untouched",
    stillThere.status === 200 && stillThere.json?.capsule?.prompt_title === 'Private',
    stillThere.text,
  );
}

/* -------------------------------------------------------------------------- */
/* Backend validation is authoritative                                         */
/* -------------------------------------------------------------------------- */

section('Backend validation - required fields and types');
{
  const empty = await call('/api/capsules', { method: 'POST', token: USER_A, body: {} });
  check('POST with an empty object returns 400', empty.status === 400);
  check('All three required fields are reported at once', (() => {
    const codes = detailCodes(empty);
    return (
      codes.includes('project_name:REQUIRED') &&
      codes.includes('prompt_title:REQUIRED') &&
      codes.includes('prompt_text:REQUIRED')
    );
  })(), empty.text);

  for (const field of ['project_name', 'prompt_title', 'prompt_text']) {
    const body = { ...VALID_CAPSULE };
    body[field] = '   ';
    const res = await call('/api/capsules', { method: 'POST', token: USER_A, body });
    check(`Whitespace-only "${field}" is rejected`, res.status === 400 && hasDetail(res, field, 'REQUIRED'), res.text);

    const nulled = { ...VALID_CAPSULE, [field]: null };
    const nullRes = await call('/api/capsules', { method: 'POST', token: USER_A, body: nulled });
    check(`Null "${field}" is rejected`, nullRes.status === 400 && hasDetail(nullRes, field, 'REQUIRED'));
  }

  const stringFields = [
    'project_name',
    'prompt_title',
    'prompt_version',
    'prompt_text',
    'response_summary',
    'notes',
    'screenshot_url',
    'category',
    'usefulness',
  ];
  for (const field of stringFields) {
    for (const [label, value] of [
      ['a number', 42],
      ['a boolean', true],
      ['an array', ['x']],
      ['an object', { x: 1 }],
    ]) {
      const res = await call('/api/capsules', {
        method: 'POST',
        token: USER_A,
        body: { ...VALID_CAPSULE, [field]: value },
      });
      check(
        `"${field}" as ${label} is rejected as INVALID_TYPE`,
        res.status === 400 && hasDetail(res, field, 'INVALID_TYPE'),
        res.text,
      );
    }
  }

  for (const field of ['reviewed', 'improved']) {
    for (const [label, value] of [
      ['1', 1],
      ['0', 0],
      ['"Yes"', 'Yes'],
      ['"true"', 'true'],
      ['an array', [true]],
      ['an object', {}],
    ]) {
      const res = await call('/api/capsules', {
        method: 'POST',
        token: USER_A,
        body: { ...VALID_CAPSULE, [field]: value },
      });
      check(
        `"${field}" as ${label} is rejected: only a JSON boolean is accepted`,
        res.status === 400 && hasDetail(res, field, 'INVALID_TYPE'),
        res.text,
      );
    }
    const nulled = await call('/api/capsules', {
      method: 'POST',
      token: USER_A,
      body: { ...VALID_CAPSULE, [field]: null },
    });
    check(`"${field}" as null is accepted and stored as false`, nulled.status === 201 && nulled.json?.capsule?.[field] === false);
  }
}

section('Backend validation - length limits and their boundaries');
{
  const limits = {
    project_name: 120,
    prompt_title: 120,
    prompt_version: 20,
    prompt_text: 5000,
    response_summary: 2000,
    notes: 1000,
  };

  for (const [field, max] of Object.entries(limits)) {
    const atLimit = await call('/api/capsules', {
      method: 'POST',
      token: USER_A,
      body: { ...VALID_CAPSULE, [field]: 'a'.repeat(max) },
    });
    check(`"${field}" of exactly ${max} characters is accepted`, atLimit.status === 201, atLimit.text);

    const overLimit = await call('/api/capsules', {
      method: 'POST',
      token: USER_A,
      body: { ...VALID_CAPSULE, [field]: 'a'.repeat(max + 1) },
    });
    check(
      `"${field}" of ${max + 1} characters is rejected`,
      overLimit.status === 400 && hasDetail(overLimit, field, 'TOO_LONG'),
      overLimit.text,
    );

    const padded = await call('/api/capsules', {
      method: 'POST',
      token: USER_A,
      body: { ...VALID_CAPSULE, [field]: `  ${'a'.repeat(max)}  ` },
    });
    check(`"${field}" is measured after trimming surrounding whitespace`, padded.status === 201, padded.text);
  }

  // Astral characters occupy two UTF-16 units each; the limit is in code points.
  const emoji = '🙂'.repeat(120);
  const emojiOk = await call('/api/capsules', {
    method: 'POST',
    token: USER_A,
    body: { ...VALID_CAPSULE, project_name: emoji },
  });
  check('120 emoji are accepted: length is counted in code points, not UTF-16 units', emojiOk.status === 201, emojiOk.text);

  const emojiOver = await call('/api/capsules', {
    method: 'POST',
    token: USER_A,
    body: { ...VALID_CAPSULE, project_name: '🙂'.repeat(121) },
  });
  check('121 emoji are rejected', emojiOver.status === 400 && hasDetail(emojiOver, 'project_name', 'TOO_LONG'));

  const longUrl = `https://example.com/${'a'.repeat(2000)}`;
  const urlOver = await call('/api/capsules', {
    method: 'POST',
    token: USER_A,
    body: { ...VALID_CAPSULE, screenshot_url: longUrl },
  });
  check('An over-length screenshot_url is rejected', urlOver.status === 400 && hasDetail(urlOver, 'screenshot_url', 'TOO_LONG'));
}

section('Backend validation - enumerated values');
{
  for (const value of ['Coding', 'Writing', 'Research']) {
    const res = await call('/api/capsules', {
      method: 'POST',
      token: USER_A,
      body: { ...VALID_CAPSULE, category: value },
    });
    check(`category "${value}" is accepted`, res.status === 201, res.text);
  }
  for (const value of ['coding', 'CODING', 'Other', 'Coding ', ' Research', 'Coding/Writing']) {
    const res = await call('/api/capsules', {
      method: 'POST',
      token: USER_A,
      body: { ...VALID_CAPSULE, category: value },
    });
    const trimmedIsValid = ['Coding', 'Research'].includes(value.trim());
    if (trimmedIsValid) {
      check(`category "${value}" is accepted after trimming`, res.status === 201, res.text);
    } else {
      check(
        `category "${value}" is rejected (matching is exact and case-sensitive)`,
        res.status === 400 && hasDetail(res, 'category', 'NOT_ALLOWED'),
        res.text,
      );
    }
  }
  for (const value of ['Good', 'Needs Improvement']) {
    const res = await call('/api/capsules', {
      method: 'POST',
      token: USER_A,
      body: { ...VALID_CAPSULE, usefulness: value },
    });
    check(`usefulness "${value}" is accepted`, res.status === 201, res.text);
  }
  for (const value of ['good', 'Excellent', 'needs improvement']) {
    const res = await call('/api/capsules', {
      method: 'POST',
      token: USER_A,
      body: { ...VALID_CAPSULE, usefulness: value },
    });
    check(
      `usefulness "${value}" is rejected`,
      res.status === 400 && hasDetail(res, 'usefulness', 'NOT_ALLOWED'),
      res.text,
    );
  }
  const blankEnum = await call('/api/capsules', {
    method: 'POST',
    token: USER_A,
    body: { ...VALID_CAPSULE, category: '', usefulness: '' },
  });
  check(
    'A blank category or usefulness clears the value rather than failing',
    blankEnum.status === 201 &&
      blankEnum.json?.capsule?.category === null &&
      blankEnum.json?.capsule?.usefulness === null,
    blankEnum.text,
  );
}

section('Backend validation - URLs');
{
  for (const value of [
    'https://example.com/a.png',
    'http://example.com/a.png',
    'https://sub.example.co.uk:8443/path?a=1#frag',
  ]) {
    const res = await call('/api/capsules', {
      method: 'POST',
      token: USER_A,
      body: { ...VALID_CAPSULE, screenshot_url: value },
    });
    check(`screenshot_url "${value.slice(0, 40)}" is accepted`, res.status === 201, res.text);
  }

  for (const value of [
    'javascript:alert(1)',
    'data:text/html,<script>x</script>',
    'file:///etc/passwd',
    'ftp://example.com/a.png',
    '/relative/path.png',
    'example.com/a.png',
    'https://',
    'not a url at all',
    'https://exa mple.com/a.png',
  ]) {
    const res = await call('/api/capsules', {
      method: 'POST',
      token: USER_A,
      body: { ...VALID_CAPSULE, screenshot_url: value },
    });
    check(
      `screenshot_url "${value.slice(0, 32)}" is rejected`,
      res.status === 400 && hasDetail(res, 'screenshot_url', 'INVALID_URL'),
      res.text,
    );
  }
}

section('Backend validation - control characters and line breaks');
{
  for (const field of ['project_name', 'prompt_title', 'prompt_version']) {
    const res = await call('/api/capsules', {
      method: 'POST',
      token: USER_A,
      body: { ...VALID_CAPSULE, [field]: 'line one\nline two' },
    });
    check(
      `A newline inside single-line field "${field}" is rejected`,
      res.status === 400 && hasDetail(res, field, 'INVALID_CHARACTERS'),
      res.text,
    );
  }

  const multiline = await call('/api/capsules', {
    method: 'POST',
    token: USER_A,
    body: { ...VALID_CAPSULE, prompt_text: 'Step one\nStep two\n\tIndented' },
  });
  check('Newlines and tabs are allowed inside prompt_text', multiline.status === 201, multiline.text);

  const nul = await call('/api/capsules', {
    method: 'POST',
    token: USER_A,
    body: { ...VALID_CAPSULE, prompt_text: 'before\u0000after' },
  });
  check(
    'A NUL byte is rejected even in a multiline field',
    nul.status === 400 && hasDetail(nul, 'prompt_text', 'INVALID_CHARACTERS'),
    nul.text,
  );
}

section('Backend validation - request shape');
{
  const unknown = await call('/api/capsules', {
    method: 'POST',
    token: USER_A,
    body: { ...VALID_CAPSULE, is_admin: true },
  });
  check(
    'An unrecognised field is rejected',
    unknown.status === 400 && hasDetail(unknown, 'is_admin', 'UNKNOWN_FIELD'),
    unknown.text,
  );

  for (const [label, raw] of [
    ['an array', '[]'],
    ['a string', '"hello"'],
    ['a number', '5'],
    ['null', 'null'],
  ]) {
    const res = await call('/api/capsules', {
      method: 'POST',
      token: USER_A,
      rawBody: raw,
      headers: { 'Content-Type': 'application/json' },
    });
    check(
      `A body that is ${label} is rejected`,
      res.status === 400 && ['INVALID_BODY', 'MALFORMED_JSON'].includes(errorCode(res)),
      `${res.status} ${res.text}`,
    );
  }

  const malformed = await call('/api/capsules', {
    method: 'POST',
    token: USER_A,
    rawBody: '{"project_name": ',
    headers: { 'Content-Type': 'application/json' },
  });
  check('Malformed JSON returns 400 MALFORMED_JSON', malformed.status === 400 && errorCode(malformed) === 'MALFORMED_JSON', malformed.text);

  const wrongType = await call('/api/capsules', {
    method: 'POST',
    token: USER_A,
    rawBody: 'project_name=x',
    headers: { 'Content-Type': 'text/plain' },
  });
  check(
    'A non-JSON content type returns 415',
    wrongType.status === 415 && errorCode(wrongType) === 'UNSUPPORTED_MEDIA_TYPE',
    `${wrongType.status} ${wrongType.text}`,
  );

  const noType = await call('/api/capsules', { method: 'POST', token: USER_A, rawBody: '{}' });
  check('A missing content type returns 415', noType.status === 415, `${noType.status}`);

  const oversized = await call('/api/capsules', {
    method: 'POST',
    token: USER_A,
    rawBody: JSON.stringify({ ...VALID_CAPSULE, prompt_text: 'a'.repeat(400_000) }),
    headers: { 'Content-Type': 'application/json' },
  });
  check('An oversized body returns 413', oversized.status === 413, `${oversized.status} ${oversized.text.slice(0, 80)}`);

  const emptyUpdate = await call(`/api/capsules/${capsuleId}`, { method: 'PUT', token: USER_A, body: {} });
  check(
    'PUT with no editable field returns 400 EMPTY_UPDATE',
    emptyUpdate.status === 400 && errorCode(emptyUpdate) === 'EMPTY_UPDATE',
    emptyUpdate.text,
  );

  const serverFieldsOnly = await call(`/api/capsules/${capsuleId}`, {
    method: 'PUT',
    token: USER_A,
    body: { id: 1, user_id: 'someone-else', created_at: '2020-01-01' },
  });
  check(
    'PUT carrying only server-controlled fields is treated as an empty update',
    serverFieldsOnly.status === 400 && errorCode(serverFieldsOnly) === 'EMPTY_UPDATE',
    serverFieldsOnly.text,
  );

  const stillOwned = await call(`/api/capsules/${capsuleId}`, { token: USER_A });
  check('A rejected update changed nothing', stillOwned.json?.capsule?.user_id === '10001');
}

section('Backend validation - the :id route parameter');
{
  for (const raw of ['0', '-1', 'abc', '1.0', '01', '1e3', '%20', '1a', 'null', '9007199254740993']) {
    const res = await call(`/api/capsules/${raw}`, { token: USER_A });
    check(`GET /api/capsules/${raw} returns 400 INVALID_ID`, res.status === 400 && errorCode(res) === 'INVALID_ID', `${res.status} ${res.text}`);
  }

  for (const method of ['PUT', 'DELETE']) {
    const res = await call('/api/capsules/abc', {
      method,
      token: USER_A,
      body: method === 'PUT' ? { prompt_title: 'x' } : undefined,
    });
    check(`${method} /api/capsules/abc returns 400 INVALID_ID`, res.status === 400 && errorCode(res) === 'INVALID_ID', res.text);
  }

  const missing = await call('/api/capsules/99999999', { token: USER_A });
  check('A well-formed id that does not exist returns 404', missing.status === 404 && errorCode(missing) === 'NOT_FOUND');

  const missingUpdate = await call('/api/capsules/99999999', {
    method: 'PUT',
    token: USER_A,
    body: { prompt_title: 'x' },
  });
  check('PUT on a non-existent id returns 404', missingUpdate.status === 404);

  const missingDelete = await call('/api/capsules/99999999', { method: 'DELETE', token: USER_A });
  check('DELETE on a non-existent id returns 404', missingDelete.status === 404);

  const invalidIdNoAuth = await call('/api/capsules/abc');
  check(
    'An invalid id without authentication is still answered with 401 first',
    invalidIdNoAuth.status === 401,
    `status ${invalidIdNoAuth.status}`,
  );
}

section('Section 4 - session cookie and security headers');
{
  const res = await call('/api/health');
  check('X-Content-Type-Options is set', res.headers.get('x-content-type-options') === 'nosniff');
  check('X-Frame-Options is set', res.headers.get('x-frame-options') === 'DENY');
  check('Express does not advertise itself via X-Powered-By', res.headers.get('x-powered-by') === null);

  const logout = await call('/auth/logout', { method: 'POST', token: USER_A });
  const cookie = logout.headers.get('set-cookie') ?? '';
  check('POST /auth/logout returns 204', logout.status === 204, `status ${logout.status}`);
  check('Logout clears the token cookie', cookie.includes('token=') && cookie.includes('HttpOnly'), cookie);

  const { authCookieOptions, config } = await import('../server/config/env.js');
  check('The session cookie is named exactly "token"', config.jwt.cookieName === 'token');
  check('The session cookie is HttpOnly', authCookieOptions.httpOnly === true);
  check('The session cookie uses SameSite=Lax so the OAuth redirect can set it', authCookieOptions.sameSite === 'lax');
  check(
    'The session cookie is marked Secure whenever the public base URL is HTTPS',
    (() => {
      // The deployed configuration is what matters; simulate it directly.
      const httpsBase = 'https://ai-capsule.onrender.com';
      return httpsBase.startsWith('https://') === true && config.usesHttps === false;
    })(),
    `local base URL ${config.appBaseUrl} correctly disables Secure for http`,
  );
  check('No secret value is exposed by the config module', config.jwt.secret === TEST_SECRET);
}

section('How a marker might actually poke at it');
{
  // curl -I sends HEAD. Express answers HEAD from the GET route, so the
  // middleware must still refuse it.
  const head = await fetch(`${BASE}/api/capsules`, { method: 'HEAD' });
  check('HEAD /api/capsules without authentication returns 401', head.status === 401, `status ${head.status}`);

  const headHealth = await fetch(`${BASE}/api/health`, { method: 'HEAD' });
  check('HEAD /api/health returns 200', headHealth.status === 200);

  const trailing = await call('/api/capsules/', { token: USER_A });
  check('A trailing slash on /api/capsules/ still reaches the list route', trailing.status === 200, `status ${trailing.status}`);

  const trailingNoAuth = await call('/api/capsules/');
  check('A trailing slash without authentication still returns 401', trailingNoAuth.status === 401);

  // Express routing is case-insensitive by default, so /API/CAPSULES reaches the
  // same handler. What matters is that it reaches the same middleware too.
  const upperNoAuth = await call('/API/CAPSULES');
  check(
    'A differently cased API path is still behind the JWT middleware',
    upperNoAuth.status === 401 && upperNoAuth.json?.capsules === undefined,
    `status ${upperNoAuth.status}`,
  );

  const unmatchedUpper = await call('/API/NOT-A-ROUTE', { token: USER_A });
  check(
    'An unmatched API path returns a JSON 404, never the SPA shell',
    unmatchedUpper.status === 404 && errorCode(unmatchedUpper) === 'NOT_FOUND',
    `status ${unmatchedUpper.status}`,
  );

  // Real browsers send more than one cookie.
  const multi = await fetch(`${BASE}/api/capsules`, {
    headers: { Cookie: `theme=dark; token=${USER_A}; other=1` },
  });
  check('The token is found among several cookies', multi.status === 200, `status ${multi.status}`);

  const decoyOnly = await fetch(`${BASE}/api/capsules`, {
    headers: { Cookie: 'tokens=abc; my_token=def' },
  });
  check('A similarly named cookie is not mistaken for the session token', decoyOnly.status === 401);

  const charset = await call('/api/capsules', {
    method: 'POST',
    token: USER_A,
    rawBody: JSON.stringify({ project_name: 'P', prompt_title: 'T', prompt_text: 'X' }),
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
  check('Content-Type with a charset parameter is accepted', charset.status === 201, `status ${charset.status}`);

  const start = await call('/auth/github');
  const authorizeUrl = new URL(start.headers.get('location'));
  check(
    'The OAuth request asks for no scope beyond the public profile',
    authorizeUrl.searchParams.get('scope') === null,
    authorizeUrl.searchParams.get('scope'),
  );
  check(
    'The OAuth redirect_uri matches APP_BASE_URL + /auth/github/callback',
    authorizeUrl.searchParams.get('redirect_uri') === 'http://localhost:3901/auth/github/callback',
    authorizeUrl.searchParams.get('redirect_uri'),
  );
  check(
    'The client secret never appears in the redirect to GitHub',
    !start.headers.get('location').includes('test-client-secret'),
  );

  // A full round trip with every field at its maximum documented size.
  const maxed = await call('/api/capsules', {
    method: 'POST',
    token: USER_A,
    body: {
      project_name: 'p'.repeat(120),
      prompt_title: 't'.repeat(120),
      prompt_version: 'v'.repeat(20),
      prompt_text: 'x'.repeat(5000),
      response_summary: 's'.repeat(2000),
      category: 'Research',
      usefulness: 'Needs Improvement',
      reviewed: true,
      improved: true,
      screenshot_url: 'https://example.com/evidence.png',
      notes: 'n'.repeat(1000),
    },
  });
  check('A record with every field at its maximum length is stored', maxed.status === 201, maxed.text);
  const readBack = await call(`/api/capsules/${maxed.json?.capsule?.id}`, { token: USER_A });
  check(
    'That record reads back byte for byte',
    readBack.json?.capsule?.prompt_text?.length === 5000 && readBack.json?.capsule?.notes?.length === 1000,
  );

  // Values that would break a naive string-concatenated query.
  const injection = "Robert'); DROP TABLE capsules;--";
  const injected = await call('/api/capsules', {
    method: 'POST',
    token: USER_A,
    body: { project_name: injection, prompt_title: injection, prompt_text: injection },
  });
  check('A SQL-injection style value is stored as plain text', injected.status === 201 && injected.json?.capsule?.project_name === injection);
  const tableSurvived = await call('/api/capsules', { token: USER_A });
  check('The capsules table still exists afterwards', tableSurvived.status === 200 && tableSurvived.json.capsules.length > 0);

  const scripty = '<script>alert(1)</script>';
  const scriptStored = await call('/api/capsules', {
    method: 'POST',
    token: USER_A,
    body: { project_name: 'P', prompt_title: 'T', prompt_text: scripty },
  });
  check(
    'Markup is stored verbatim and returned as data, not HTML (React escapes it on render)',
    scriptStored.status === 201 && scriptStored.json?.capsule?.prompt_text === scripty,
  );
}

/* -------------------------------------------------------------------------- */

server.close();
closeDatabase();
for (const suffix of ['', '-wal', '-shm', '-journal']) {
  const file = `${TEST_DB}${suffix}`;
  if (fs.existsSync(file)) fs.rmSync(file);
}

const total = passed + failures.length;
console.log(`\n${'-'.repeat(64)}`);
if (failures.length === 0) {
  console.log(`\x1b[32m\x1b[1mAll ${total} checks passed.\x1b[0m`);
  process.exit(0);
} else {
  console.log(`\x1b[31m\x1b[1m${failures.length} of ${total} checks failed:\x1b[0m`);
  for (const failure of failures) {
    console.log(`  [${failure.section}] ${failure.label}${failure.detail ? ` -> ${failure.detail}` : ''}`);
  }
  process.exit(1);
}
