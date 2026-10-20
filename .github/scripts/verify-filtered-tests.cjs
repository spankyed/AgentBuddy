// Checks the vitest JSON reports that name-filtered steps wrote to $RUNNER_TEMP. A filter that selects nothing
// exits 0 with every case skipped, so each step's report must show passing cases of its own: a sum across
// reports would let one step's cases hide another step that ran nothing.
// The exception is one filter applied in several steps, as a focused `test_name` dispatch does: a name usually
// matches cases in only one of the files it runs against, so `a+b` requires each report to exist with no
// failures and the group, not each member, to have passing cases.
// Usage: node verify-filtered-tests.cjs <report>|<report>+<report>...   (each read from $RUNNER_TEMP/<report>.json)
const fs = require('node:fs');
const path = require('node:path');

const read = name => {
  const file = path.join(process.env.RUNNER_TEMP, `${name}.json`);
  if (!fs.existsSync(file)) throw new Error(`${name}: no report at ${file}; its step did not run`);
  const report = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (report.numFailedTests !== 0) throw new Error(`${name}: ${report.numFailedTests} failed`);
  return report.numPassedTests;
};

const groups = process.argv.slice(2);
if (groups.length === 0) throw new Error('Name at least one report to verify');
for (const group of groups) {
  const passed = group.split('+').reduce((sum, name) => sum + read(name), 0);
  if (!(passed > 0)) throw new Error(`${group}: the test-name filter selected no passing cases`);
  console.log(`${group}: ${passed} passed`);
}
