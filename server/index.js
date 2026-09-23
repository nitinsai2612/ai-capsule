// Entry point. `npm start` runs this file and nothing else imports it, so it
// starts the server unconditionally. The app itself lives in app.js, which the
// test suite imports without listening on a port.

import { config, missingSecrets } from './config/env.js';
import { initDatabase } from './db/index.js';
import { createApp } from './app.js';

initDatabase();

const missing = missingSecrets();
if (missing.length > 0) {
  console.warn(
    `[startup] Missing environment variables: ${missing.join(', ')}. ` +
      'Public routes still work; OAuth login will not.',
  );
}

const server = createApp().listen(config.port, () => {
  console.log(`[startup] AI Capsule listening on port ${config.port}`);
  console.log(`[startup] Public base URL: ${config.appBaseUrl}`);
  console.log(`[startup] Secure cookies: ${config.usesHttps ? 'on' : 'off (http base URL)'}`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
