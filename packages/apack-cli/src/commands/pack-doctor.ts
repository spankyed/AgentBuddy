import * as fs from 'node:fs';
import * as path from 'node:path';
import { findPackRoot } from '../utils';
import { validatePack } from './validate.ts';

/** Read-only source health, using the same declarations and static export checks as pack validate. */
export async function doctor(args: string[]) {
  if (args.length) throw new Error('Usage: apack pack doctor');
  const root = findPackRoot(process.cwd());
  const report = await validatePack(root);
  console.log(`\nPack health check: ${root}`);
  for (const issue of report.diagnostics) {
    console.log(`  ${issue.severity === 'error' ? 'x' : '!'} ${issue.message}`);
    if (issue.suggestion) console.log(`    ${issue.suggestion}`);
  }
  if (!fs.existsSync(path.join(root, 'src', '__generated__'))) {
    console.log('  ! Generated files are absent. Run "apack pack generate-entries" before compiling.');
  }
  for (const { check, reason } of report.skippedChecks) console.log(`  ! ${check} not checked: ${reason}`);
  console.log(`\nPack health ${report.status}.`);
  if (report.status === 'invalid') throw new Error('Pack health check failed.');
  if (report.status === 'incomplete') process.exitCode = 2;
}
