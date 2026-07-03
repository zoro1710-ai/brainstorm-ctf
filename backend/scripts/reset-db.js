'use strict';
// Wipe the local demo database + generated credentials so the next `npm start`
// reseeds fresh teams/stages. Never used against a real event DB without a backup.
const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const targets = ['nodezero.db', 'nodezero.db-wal', 'nodezero.db-shm', 'team_credentials.csv', 'organizer_api_key.txt'];

for (const f of targets) {
  const p = path.join(DATA_DIR, f);
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    console.log('removed', p);
  }
}
console.log('Done. Run `npm start` to reseed.');
