'use strict';
// NODE ZERO CTF backend -- entry point.
// Stack: Node.js + Express + node:sqlite (built-in, synchronous) + Server-Sent Events.
// See ../BACKEND_NOTES.md (or the final report) for the tradeoffs vs. the CTFd docker-compose path.

const path = require('node:path');
const express = require('express');
const { openDb } = require('./src/db');
const { createHub } = require('./src/sse');
const { buildParticipantRouter } = require('./src/routes/participant');
const { buildOrganizerRouter } = require('./src/routes/organizer');

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

const { db, stageDefs, stageContent, newTeams, organizerKey, paths } = openDb();
const hub = createHub();
const ctx = { db, hub, organizerKey, stageContent };

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/healthz', (req, res) => res.json({ ok: true, sse_clients: hub.counts() }));

app.use('/api', buildParticipantRouter(ctx));
app.use('/api/organizer', buildOrganizerRouter(ctx));

// On Railway (and similar hosts) the public HTTPS domain is exposed via env.
// Locally it's undefined, so we fall back to http://localhost:PORT.
const publicDomain = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.PUBLIC_DOMAIN;
const baseUrl = publicDomain ? `https://${publicDomain}` : `http://localhost:${PORT}`;

app.listen(PORT, () => {
  console.log('='.repeat(70));
  console.log(' NODE ZERO CTF backend');
  console.log('='.repeat(70));
  console.log(` Listening on   ${baseUrl}${publicDomain ? ` (port ${PORT})` : ''}`);
  console.log(` Participant UI ${baseUrl}/participant-live.html`);
  console.log(` Organizer UI   ${baseUrl}/organizer.html?key=${organizerKey}`);
  console.log(` Eval Monitor   ${baseUrl}/eval.html?key=${organizerKey}`);
  console.log(` Database       ${paths.DB_PATH}`);

  console.log(` Stages seeded  ${stageDefs.length} (from challenges/*/challenge.yml)`);
  const placeholderStages = stageDefs.filter((s) => s.isPlaceholder).map((s) => s.stageNumber);
  if (placeholderStages.length) {
    console.log(` NOTE: stages [${placeholderStages.join(', ')}] still have REPLACE placeholder flags in challenge.yml.`);
  }
  console.log(` Organizer API key: ${organizerKey}`);
  console.log(` (also saved to ${paths.ORGANIZER_KEY_PATH})`);
  if (newTeams) {
    console.log(` Seeded ${newTeams.length} demo teams -- credentials written to ${paths.CREDENTIALS_PATH}`);
  } else {
    console.log(' Teams already seeded (credentials file untouched).');
  }
  console.log('='.repeat(70));
});
