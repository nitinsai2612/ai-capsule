# AI Capsule

CSE5006 / CSE3CWA Assignment 3, Semester 2 2026.

A small full-stack app for saving AI prompts that worked. A user signs in with GitHub, and can
create, read, update and delete their own prompt records. The Express backend issues its own JWT
after OAuth and stores it in a Secure, HttpOnly cookie named `token`. Every `/api/capsules` route is
behind JWT middleware.

## 1. Deployed application

| | |
| --- | --- |
| Public URL | `https://ai-capsule-jfui.onrender.com` |
| Source repository | `https://github.com/nitinsai2612/ai-capsule` |
| Cloud platform | Render (free web service) |
| Health check | `https://ai-capsule-jfui.onrender.com/api/health` returns `{"status":"ok"}` |

One Render web service runs everything. Express serves the built React app and the API from the same
origin, so there is no CORS setup and no cross-site cookie to configure.

## 2. Technology

| Component | Choice |
| --- | --- |
| Frontend | React 18 with React Router, built by Vite |
| Backend | Node.js 20+ with Express 4 |
| Database | SQLite through `node-sqlite3-wasm` |
| Authentication | GitHub OAuth, then an application JWT signed by Express (HS256) |
| Session | Secure, HttpOnly, SameSite=Lax cookie named `token` |
| Hosting | Render |

Firebase Authentication is not used, and there is no username/password registration. The token the
browser holds is this application's JWT, not the GitHub access token.

## 3. Project layout

```
aicapsule/
  package.json                  build, start and test scripts
  .env.example                  variable names, no values
  server/
    index.js                    entry point, starts the server
    app.js                      app setup, static hosting, SPA fallback, errors
    config/env.js               environment loading, cookie options
    db/schema.sql               database setup
    db/index.js                 connection and all queries
    middleware/requireAuth.js   JWT verification
    validation/capsuleSchema.js request validation
    routes/health.js            GET /api/health
    routes/auth.js              OAuth, JWT issue, logout, GET /api/me
    routes/capsules.js          the four CRUD routes
  client/
    index.html
    src/                        pages, components, API client, styles
  tests/acceptance.mjs          231 automated checks
```

## 4. Install and run

Needs Node.js 20 or newer.

```bash
npm install                 # backend dependencies
cp .env.example .env        # Windows: copy .env.example .env
                            # then fill in the three secret values
npm run build               # installs client dependencies and builds React
npm start                   # http://localhost:3001
```

`npm start` serves both the React build and the API on port 3001, the same arrangement used in the
cloud.

For frontend development with hot reload, two terminals:

```bash
npm run dev:server          # Express on 3001
npm run dev:client          # Vite on 5173, proxying /api and /auth to 3001
```

For local OAuth, add `http://localhost:3001/auth/github/callback` as a redirect URI on the GitHub
OAuth App and set `APP_BASE_URL=http://localhost:3001`. GitHub's OAuth App accepts several redirect
URIs, so the same app serves both local development and the deployed site, and the backend sends the
matching `redirect_uri` on each request.

Tests:

```bash
npm test
```

## 5. API routes and how React talks to Express

Required routes:

| Route | Method | Access | Purpose |
| --- | --- | --- | --- |
| `/` | GET | Public | Landing page |
| `/login` | GET | Public | Login page, whose button starts the OAuth flow at `/auth/github` |
| `/dashboard` | GET | Protected | The user's own records |
| `/api/health` | GET | Public | Returns `{"status":"ok"}` |
| `/api/capsules` | GET | Protected | Read own records |
| `/api/capsules` | POST | Protected | Create a record |
| `/api/capsules/:id` | PUT | Protected | Update own record |
| `/api/capsules/:id` | DELETE | Protected | Delete own record |

Supporting routes for the OAuth flow and the session check:

| Route | Method | Access | Purpose |
| --- | --- | --- | --- |
| `/auth/github` | GET | Public | Sets the `state` cookie and redirects to GitHub |
| `/auth/github/callback` | GET | Public | Issues the JWT and sets the `token` cookie |
| `/auth/logout` | POST | Public | Clears the cookie |
| `/api/me` | GET | Protected | Returns the identity in the verified JWT |
| `/api/capsules/:id` | GET | Protected | Reads a single own record |

`client/src/api/client.js` is the only place the frontend calls the API. Every request uses a
relative path and `credentials: 'same-origin'`, so the browser attaches the `token` cookie by itself.
The frontend never reads or sends the token, because the cookie is HttpOnly and JavaScript cannot see
it. In development Vite proxies `/api` and `/auth` to Express so the browser still sees one origin;
in the cloud Express serves the React files directly.

Successful responses:

```json
{ "capsules": [ ... ] }     { "capsule": { ... } }     { "deleted": true, "id": 7 }
```

Failures:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [ { "field": "prompt_title", "code": "TOO_LONG", "message": "..." } ] } }
```

| Status | When |
| --- | --- |
| 400 | Failed validation, malformed JSON, invalid `:id`, or a PUT with nothing to update |
| 401 | No session token, or a token that fails verification |
| 404 | No record with that id belonging to the requesting user |
| 405 | Method not supported on that path |
| 413 | Body larger than 256 kB |
| 415 | Body sent without `Content-Type: application/json` |

## 6. OAuth, the JWT, and how it is verified

Provider: GitHub OAuth, the option the assignment recommends.

1. The user clicks Continue with GitHub on `/login`, which navigates to `/auth/github`.
2. Express generates a 32 byte random `state`, stores it in a short-lived HttpOnly cookie, and
   redirects to GitHub. No OAuth scope is requested, because `GET /user` returns the public profile
   including the numeric id without one.
3. GitHub redirects back to `/auth/github/callback`. Express compares the returned `state` with the
   cookie using a constant-time comparison and aborts if they differ, so a forged callback cannot
   create a session.
4. Express exchanges the code for a GitHub access token on the server, reads the account's numeric
   `id` once, then discards that token. It is never stored and never sent to the browser.
5. Express signs its own JWT with `JWT_SECRET` (HS256), with the GitHub id as `sub`, plus `iss`,
   `aud` and a 2 hour expiry.
6. The JWT goes into a cookie named `token` with HttpOnly, Secure and SameSite=Lax, and the user is
   redirected to `/dashboard`.

Verification is in `server/middleware/requireAuth.js`. It is applied to the whole `/api/capsules`
subtree and again on each individual route, so protection is visible on the route itself and a route
added later cannot be public by accident. It reads the token only from the cookie and checks the
signature, the algorithm, the issuer, the audience and the expiry. All of these return 401 with no
capsule data: no cookie, an empty cookie, a malformed token, a wrong signing key, an expired token,
a wrong issuer or audience, no subject claim, and an `alg: none` token. A valid JWT sent only as an
`Authorization: Bearer` header is also rejected, because the cookie is the defined transport.

Ownership comes from the verified `sub` claim and nothing else. A `user_id` in the request body is
ignored and never stored. Read, update and delete are scoped by `user_id` inside the SQL statement,
so the ownership check and the write are one operation. A record belonging to someone else returns
404 rather than 403, so the API cannot be used to find out which ids exist.

On cookie flags: `Secure` is set whenever `APP_BASE_URL` is an https URL, which it always is on
Render. It is off only for local http development, because browsers will not store a Secure cookie
over plain HTTP. `SameSite` is `Lax` rather than `Strict` because the OAuth callback is a top-level
redirect from github.com, and `Strict` would stop the cookie being set on it.

## 7. Database and storage

The database is a single SQLite file, created on first start. `server/db/index.js` runs
`server/db/schema.sql` at boot, so a fresh deployment sets itself up with no migration step.

```sql
CREATE TABLE IF NOT EXISTS capsules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  project_name TEXT NOT NULL,
  prompt_title TEXT NOT NULL,
  prompt_version TEXT,
  prompt_text TEXT NOT NULL,
  response_summary TEXT,
  category TEXT,
  usefulness TEXT,
  reviewed INTEGER DEFAULT 0,
  improved INTEGER DEFAULT 0,
  screenshot_url TEXT,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_capsules_user_id ON capsules (user_id);
CREATE INDEX IF NOT EXISTS idx_capsules_user_created ON capsules (user_id, created_at DESC);
```

This is the schema from the specification with one added column, `updated_at`, and two indexes on
`user_id` since every query is scoped by owner.

User ownership is stored in `user_id`, which holds the GitHub numeric account id as text, copied from
the verified JWT at insert time. Every SELECT, UPDATE and DELETE includes `user_id = ?`.

Deployed storage is ephemeral, not persistent. Render's free web service has a local filesystem that
is wiped on restart, redeploy, or waking from idle sleep, so the SQLite file does not survive those.
That is a property of the free tier rather than the code. See section 10.

The driver is `node-sqlite3-wasm` rather than `better-sqlite3`. `better-sqlite3` is a native module
that compiles during install, and npm 11 blocks install scripts by default, which broke a previous
project of mine with `ERR_DLOPEN_FAILED`. The WebAssembly build needs no compiler, so the Render
build works on a clean machine.

Validation of the fields above is described in section 11.

## 8. The two required cURL checks

Both run against the deployed URL.

Test 1, no authentication:

```bash
curl -i https://ai-capsule-jfui.onrender.com/api/capsules
```

Result: **401 Unauthorized**, run 23 September 2026.

```
HTTP/1.1 401 Unauthorized
Content-Type: application/json; charset=utf-8
referrer-policy: same-origin
x-content-type-options: nosniff
x-frame-options: DENY
Server: cloudflare
x-render-origin-server: Render

{"error":{"code":"UNAUTHENTICATED","message":"Authentication required: no session token was supplied."}}
```

Test 2, fake JWT:

```bash
curl -i -H "Cookie: token=fake-token-123" https://ai-capsule-jfui.onrender.com/api/capsules
```

Result: **401 Unauthorized**, run 23 September 2026.

```
HTTP/1.1 401 Unauthorized
Content-Type: application/json; charset=utf-8
referrer-policy: same-origin
x-content-type-options: nosniff
x-frame-options: DENY
Server: cloudflare
x-render-origin-server: Render

{"error":{"code":"UNAUTHENTICATED","message":"Authentication required: the session token is invalid or expired."}}
```

Per-request headers (`CF-RAY`, `rndr-id`, `etag`, `Date`) are omitted above for readability. The
`x-render-origin-server: Render` header is left in because it shows the response came from the
deployed service and not from localhost.

The two messages differ, which is the point. Test 1 shows the endpoint requires authentication.
Test 2 shows the backend actually verifies the JWT rather than only checking that a cookie exists: the cookie is present and correctly named, and
the request is still refused because the value was not signed by this server. POST, PUT and DELETE
use the same middleware and return 401 to the same two requests.

## 9. Environment variables

Names only. No value here is in the repository. The real values are in Render's Environment settings
and in a local `.env` that `.gitignore` excludes.

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `production` in the cloud |
| `PORT` | Set by Render |
| `APP_BASE_URL` | Public URL; builds the OAuth callback and decides the Secure cookie flag |
| `GITHUB_CLIENT_ID` | GitHub OAuth App client id |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App client secret |
| `JWT_SECRET` | Key used to sign and verify the application JWT |
| `JWT_EXPIRES_IN` | Optional token lifetime, default `2h` |
| `DATABASE_FILE` | Optional SQLite path, default `./data/aicapsule.db` |

## 10. One honest limitation

Records do not survive a restart of the deployed application. Render's free web service has an
ephemeral filesystem and puts an idle service to sleep after about fifteen minutes, so a redeploy or
a wake from sleep starts with an empty database, and the first request after a sleep can take up to a
minute while the container starts. Within one session everything works, which is why the video
demonstrates the whole CRUD cycle in one sitting.

A persistent disk or a managed PostgreSQL instance would fix it, and because the data layer is all in
`server/db/index.js` only that file would change. I stayed on SQLite because the specification says
SQLite is sufficient and that a more complex database earns no extra marks, and because Render's free
PostgreSQL offer expires while the application still has to be available for marking.

## 11. AI-assisted development statement and verification

### AI tools used

This project was developed with AI assistance (Claude). I used it across project setup, React
components, Express routes, SQLite queries, OAuth and JWT integration, cloud deployment, CSS, and
testing and debugging. I set the requirements, chose the architecture, reviewed and tested every
file, deployed it myself and am responsible for the submitted work. Where an AI suggestion and the
specification disagreed, the specification won.

### One problem identified and corrected

The first working version set the session cookie with `SameSite=Strict`, on the assumption that the
strictest setting is the safest. Login then failed in a way that looked like an OAuth bug: GitHub
authorised the app, the callback ran with no error, the browser was redirected to `/dashboard`, and
the dashboard immediately sent me back to `/login`. The network panel showed the cookie being set on
the callback response and then not being sent on the very next request.

The cause is that the callback is a top-level navigation from github.com, so the browser treats it as
cross-site. A `SameSite=Strict` cookie is withheld on any request arriving from another site,
including that redirect. Changing the flag to `SameSite=Lax` fixed it immediately: `Lax` still blocks
the cross-site POST pattern that CSRF relies on, but allows the cookie on a top-level GET. Because
`Lax` is a small relaxation, I kept the random `state` check on the callback so a forged callback is
rejected on its own merits rather than relying on the cookie policy.

### How OAuth login, JWT verification and protected API behaviour were verified

On the deployed site I signed in with my GitHub account and opened the Application tab in DevTools.
The cookie is named `token`, is marked HttpOnly and Secure, has `SameSite=Lax` and expires two hours
after it is issued. Reading `document.cookie` in the console returns nothing for it, which confirms
the browser will not expose the session token to scripts. The GitHub access token appears nowhere in
storage or in any response body, because it is used once on the server and discarded. `GET /api/me`
returns the id taken from the verified JWT rather than anything the client sent.

I then deleted the cookie and refreshed `/dashboard`. The page requested the capsule list, received
401, and sent me back to `/login`, so the protection is enforced by the server and not only by the
React router.

Protected API behaviour was checked directly with the two cURL commands in section 8, run against the
deployed URL. A request with no cookie and a request carrying `token=fake-token-123` are both refused
with 401 and different messages, which shows the token is verified rather than merely present.

The automated suite covers the cases that are awkward to produce by hand: a token signed with the
wrong key, an expired token, a wrong issuer, a wrong audience, a token with no subject claim, an
`alg: none` token, an empty cookie value, and a valid JWT sent only as an `Authorization: Bearer`
header. All eight return 401 and no capsule data. It also asserts that the redirect to GitHub asks
for no scope, that the `redirect_uri` matches `APP_BASE_URL`, and that the client secret never
appears in that redirect.

### How CRUD behaviour and user data ownership were verified

On the deployed site I created a capsule, refreshed the page, edited it, refreshed again, then
deleted it. The refresh between each step matters, because it forces the values to be read back from
the database instead of from React state. I also checked that editing one field leaves the other
stored values untouched, and that clearing an optional field actually clears it.

Ownership is verified in the automated suite with two different signed-in users. The second user
requests the first user's record by its exact id, with GET, PUT and DELETE. All three return 404
rather than 403, so an id cannot be confirmed as existing by probing it, and the record is still
present and unchanged when the first user lists again. The suite also sends a `user_id` in a create
body and asserts it is ignored, since ownership comes only from the `sub` claim in the verified JWT.

### One implementation and deployment decision explained

All request validation happens in the backend rather than in database constraints.
`server/validation/capsuleSchema.js` checks the type of every field, rejects a body that is not a
JSON object, rejects unrecognised fields, enforces a maximum length on each text field counted in
Unicode code points, restricts `category` and `usefulness` to the exact values in the specification,
requires `reviewed` and `improved` to be real JSON booleans rather than `0`, `1` or `"Yes"`, requires
`screenshot_url` to be an absolute http or https URL, rejects control characters, and validates the
`:id` parameter before any query runs. Each rejection names the field and the reason, and all
problems in a request are reported together instead of one at a time.

Two reasons. The API contract has to hold whatever storage engine is behind it, and a rule written as
a SQLite `CHECK` would need rewriting for PostgreSQL and produces an opaque database error instead of
a message the user can act on. And the browser form is a convenience, not a control, since anyone can
bypass it with curl, so the server is the only place a rule is actually enforced. The React form
mirrors the same limits for immediate feedback and then displays whatever field errors the server
returns, so the two cannot drift apart silently.

The deployment decision follows from the same reasoning: the React build and the Express API are
served from one Render service on one origin. A separate static site plus a separate API would have
meant cross-origin requests, a CORS allow-list, and a `SameSite=None; Secure` cookie that browsers
increasingly block as a third-party cookie. One origin removes all of that.

## 12. Testing

`npm test` runs `tests/acceptance.mjs`, which boots the real Express app against a throwaway SQLite
file and drives it over HTTP. 231 checks, all passing:

- every required route in section 5, including the exact `/api/health` body;
- the full CRUD cycle, partial updates, clearing optional fields, and list ordering;
- both required cURL checks, plus a wrong signing key, an expired token, a wrong issuer, a wrong
  audience, no subject claim, an `alg: none` token, an empty cookie, and a Bearer header;
- cross-user isolation, where a second user cannot read, update or delete the first user's record and
  the record survives the attempt;
- every validation rule, with both sides of each length limit;
- request shape handling: malformed JSON, a non-object body, unknown fields, missing content type, an
  oversized body, an empty update, and every invalid `:id` form.

The interface was also driven in a real browser to check create, edit, delete, cancel, search, empty
states and session expiry, at desktop and phone widths.
