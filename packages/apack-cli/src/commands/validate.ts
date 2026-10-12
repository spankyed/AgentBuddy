import * as path from 'node:path';
import {
  generatePackFiles, packValidation, validateManifest, validateFeatures,
  type PackDiagnostic, type PackValidation, type SkippedPackCheck,
} from '@apackdev/sdk/build';
import { resolveDeps } from './generate';
import { findPackRoot, readManifest } from '../utils';
import { packRuleProblems, PACK_RULES } from '../build/pack-rules.ts';
import { errorMessage } from '@apackdev/sdk/utils/pure';

/** Authoring checks are read-only; unresolved dependencies leave a useful but incomplete report. */
export async function validatePack(root: string): Promise<PackValidation> {
  const manifestResult = validateManifest(path.join(root, 'apack.json'));
  const diagnostics: PackDiagnostic[] = [...manifestResult.diagnostics];
  const skippedChecks: SkippedPackCheck[] = [];
  let packId: string | undefined;

  if (manifestResult.status === 'valid') {
    const manifest = readManifest(root);
    packId = manifest.id;
    const features = validateFeatures(root, manifest);
    diagnostics.push(...features.diagnostics);
    let resolved: Awaited<ReturnType<typeof resolveDeps>> | undefined;
    try {
      resolved = await resolveDeps(root, manifest.dependencies, { readOnly: true });
    } catch (err) {
      const reason = errorMessage(err);
      diagnostics.push({
        code: 'dependency.unresolved', severity: 'warning', packId, path: ['dependencies'],
        message: reason, suggestion: 'Run "apack pack fetch-deps"; build linked dependencies first.',
      });
      skippedChecks.push({ check: 'dependencies', reason });
    }

    if (features.status !== 'valid' || !resolved) {
      skippedChecks.push({ check: 'codegen', reason: 'Requires valid feature files and resolved dependencies.' });
    } else {
      try {
        // Generates in memory: checks exports, contracts and content without writing generated files.
        generatePackFiles(manifest, { packRoot: root, ...resolved });
      } catch (err) {
        diagnostics.push({ code: 'codegen.failed', severity: 'error', packId, path: [], message: errorMessage(err) });
        skippedChecks.push({ check: 'remaining-codegen', reason: 'Code generation stopped at its first error.' });
      }
    }
  } else {
    for (const check of ['feature-files', 'dependencies', 'codegen', 'source-rules']) {
      skippedChecks.push({ check, reason: 'Requires a valid manifest.' });
    }
    return packValidation(diagnostics, skippedChecks);
  }

  // Independent source rules still run when other checks fail.
  for (const [key, found] of packRuleProblems(root)) {
    const rule = PACK_RULES.find(candidate => candidate.key === key);
    for (const problem of found) {
      diagnostics.push({
        code: `rule.${key}`, severity: 'error', packId, path: [],
        message: `${problem}  (${key}: ${rule?.rule ?? ''})`,
      });
    }
  }
  return packValidation(diagnostics, skippedChecks);
}

export async function validate(args: string[]) {
  const unknown = args.filter(arg => arg !== '--json');
  if (unknown.length) throw new Error(`Unknown option(s): ${unknown.join(', ')}`);
  const root = findPackRoot(process.cwd());
  const report = await validatePack(root);
  if (args.includes('--json')) {
    console.log(JSON.stringify(report));
  } else {
    console.log(`Validating pack at: ${root}`);
    for (const [severity, heading, symbol] of [['warning', 'Warnings', '!'], ['error', 'Errors', 'x']] as const) {
      const issues = report.diagnostics.filter(issue => issue.severity === severity);
      if (!issues.length) continue;
      console.log(`\n${heading}:`);
      for (const issue of issues) {
        console.log(`  ${symbol} ${issue.message}`);
        if (issue.suggestion) console.log(`    ${issue.suggestion}`);
      }
    }
    if (report.skippedChecks.length) {
      console.log('\nSkipped checks:');
      for (const { check, reason } of report.skippedChecks) console.log(`  - ${check}: ${reason}`);
    }
    console.log(report.status === 'valid' ? '\n+ Pack is valid' : `\nValidation ${report.status}.`);
  }
  if (report.status !== 'valid') process.exit(report.status === 'invalid' ? 1 : 2);
}
