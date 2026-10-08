// Keep the original PR #2 test command; the combined suite now covers data
// integrity and incomplete-day reporting as well as performance/delivery guards.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const result = spawnSync(process.execPath, ['--test', path.join(__dirname, 'snapshot.test.js')], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status === null ? 1 : result.status);
