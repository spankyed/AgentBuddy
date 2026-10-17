import * as fs from 'node:fs';
import * as path from 'node:path';
import { findPackRoot } from '../utils';
import { validatePack } from './validate.ts';
import { describeDependency } from '../build/dependency-inspection.ts';

/** Read-only source health, using the same declarations and static export checks as pack validate. */
export async function doctor(args: string[]) {
  if (args.some(arg => arg !== '--json')) throw new Error('Usage: apack pack doctor [--json]');
  const root = findPackRoot(process.cwd());
  const report = await validatePack(root);
  if (args.includes('--json')) {
    console.log(JSON.stringify(report));
    if (report.status !== 'valid') process.exitCode = report.status === 'invalid' ? 1 : 2;
    return;
  }
  console.log(`\nPack health check: ${root}`);
  for (const issue of report.diagnostics) {
    console.log(`  ${issue.severity === 'error' ? 'x' : '!'} ${issue.message}`);
    if (issue.suggestion) console.log(`    ${issue.suggestion}`);
  }
  if (!fs.existsSync(path.join(root, 'src', '__generated__'))) {
    console.log('  ! Generated files are absent. Run "apack pack generate-entries" before compiling.');
  }
  for (const { check, reason } of report.skippedChecks) console.log(`  ! ${check} not checked: ${reason}`);
  for (const dependency of report.dependencies) console.log(`  ${describeDependency(dependency)}`);
  console.log(`\nPack health ${report.status}.`);
  if (report.status === 'invalid') throw new Error('Pack health check failed.');
  if (report.status === 'incomplete') process.exitCode = 2;
}
