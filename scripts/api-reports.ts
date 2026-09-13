// API reports for every code export of a published package (etc/<entry>.api.md), from
// declarations emitted into .temp/api-types. Without --local, fails when a report is out of
// date or API Extractor reports a problem.
//
//   tsx scripts/api-reports.ts packages/abuddy-sdk [--local]
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Extractor, ExtractorConfig, ExtractorLogLevel } from '@microsoft/api-extractor';

const pkgDir = path.resolve(process.argv[2] ?? '');
const local = process.argv.includes('--local');
const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf-8'));
const typesDir = path.join(pkgDir, '.temp', 'api-types');
const reportFolder = path.join(pkgDir, 'etc');

/** Exports with declarations: [subpath, declaration file in .temp/api-types] */
function entries(): [string, string][] {
  return Object.entries(pkg.exports as Record<string, unknown>).flatMap(([key, target]) => {
    if (typeof target !== 'object' || target === null || !('types' in target)) return [];
    const source = (target as Record<string, unknown>)['@abuddy/source'] as string;
    const rel = source.replace(/^\.\/src\//, '');
    const declaration = rel.endsWith('.vue') ? `${rel}.d.ts` : rel.replace(/\.ts$/, '.d.ts');
    return [[key, path.join(typesDir, declaration)]];
  });
}

const reportName = (key: string) => `${key === '.' ? 'index' : key.slice(2).replaceAll('/', '.')}.api.md`;

fs.mkdirSync(reportFolder, { recursive: true });
let failed = 0;
const expected = new Set<string>();
for (const [key, declaration] of entries()) {
  const reportFileName = reportName(key);
  expected.add(reportFileName);
  const config = ExtractorConfig.prepare({
    configObject: {
      projectFolder: pkgDir,
      mainEntryPointFilePath: declaration,
      compiler: { tsconfigFilePath: path.join(pkgDir, 'tsconfig.api-extractor.json') },
      apiReport: { enabled: true, reportFolder, reportFileName, reportTempFolder: path.join(pkgDir, '.temp') },
      docModel: { enabled: false },
      dtsRollup: { enabled: false },
      tsdocMetadata: { enabled: false },
      messages: {
        extractorMessageReporting: {
          'ae-missing-release-tag': { logLevel: ExtractorLogLevel.None },
        },
        tsdocMessageReporting: { default: { logLevel: ExtractorLogLevel.None } },
      },
    },
    configObjectFullPath: undefined,
    packageJsonFullPath: path.join(pkgDir, 'package.json'),
  });
  const result = Extractor.invoke(config, { localBuild: local, showVerboseMessages: false });
  if (!result.succeeded) {
    failed++;
    console.error(`${pkg.name}${key.slice(1)}: ${result.errorCount} error(s), ${result.warningCount} warning(s)${result.apiReportChanged ? ', report changed' : ''}`);
  }
}

// Reports for exports that no longer exist
for (const file of fs.readdirSync(reportFolder).filter((f) => f.endsWith('.api.md') && !expected.has(f))) {
  if (local) fs.rmSync(path.join(reportFolder, file));
  else { failed++; console.error(`etc/${file} has no matching export; run with --local to remove it`); }
}

if (failed > 0) process.exit(1);
console.log(`${pkg.name}: ${expected.size} API reports ${local ? 'updated' : 'up to date'}`);
