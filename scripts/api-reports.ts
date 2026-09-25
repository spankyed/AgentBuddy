// API reports for every code export of a published package (etc/<entry>.api.md), from
// declarations emitted into .temp/api-types. A component's declaration is only its default export,
// so each component entry also gets a contract report (etc/<entry>.component.md): the props,
// emits, slots and exposed members TypeScript resolves for it. Without --local, fails when a
// report is out of date or API Extractor reports a problem.
//
//   tsx scripts/api-reports.ts packages/abuddy-sdk [--local]
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Extractor, ExtractorConfig, ExtractorLogLevel } from '@microsoft/api-extractor';
import { componentContracts, type ComponentEntry } from './component-contracts.ts';
import { reportEntries, reportName } from './lib/api-entries.ts';

const pkgDir = path.resolve(process.argv[2] ?? '');
const local = process.argv.includes('--local');
const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf-8'));
const typesDir = path.join(pkgDir, '.temp', 'api-types');
const reportFolder = path.join(pkgDir, 'etc');

/** Exports with declarations: [subpath, declaration file in .temp/api-types] */
function entries(): [string, string][] {
  return reportEntries(pkg as { exports?: Record<string, unknown> }).map((key) => {
    const source = ((pkg.exports as Record<string, Record<string, unknown>>)[key])['@abuddy/source'] as string;
    const rel = source.replace(/^\.\/src\//, '');
    const declaration = rel.endsWith('.vue') ? `${rel}.d.ts` : rel.replace(/\.ts$/, '.d.ts');
    return [key, path.join(typesDir, declaration)];
  });
}

fs.mkdirSync(reportFolder, { recursive: true });
let failed = 0;
/** Reports this run changed: written in --local, or found stale otherwise */
let changed = 0;
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
      // Only ExtractorConfig.loadFile() applies API Extractor's own api-extractor-defaults.json;
      // prepare() takes this object as given, and MessageRouter's built-in fallback is "none" for
      // every category. Without these, nothing is ever reported: not a TypeScript error, not a type
      // a public export names but doesn't export, not a bad release tag. They mirror the defaults,
      // apart from the two turned off on purpose below.
      messages: {
        compilerMessageReporting: { default: { logLevel: ExtractorLogLevel.Warning } },
        extractorMessageReporting: {
          default: { logLevel: ExtractorLogLevel.Warning },
          // A type a public entry names without exporting it. Off: most are exported from another
          // entry of the same package, so a consumer can still name them, and recording all of them
          // buries the messages below in the reports
          'ae-forgotten-export': { logLevel: ExtractorLogLevel.None },
          'ae-incompatible-release-tags': { logLevel: ExtractorLogLevel.Warning, addToApiReportFile: true },
          'ae-internal-missing-underscore': { logLevel: ExtractorLogLevel.Warning, addToApiReportFile: true },
          'ae-internal-mixed-release-tag': { logLevel: ExtractorLogLevel.Warning, addToApiReportFile: true },
          'ae-undocumented': { logLevel: ExtractorLogLevel.None },
          'ae-unresolved-inheritdoc-reference': { logLevel: ExtractorLogLevel.Warning, addToApiReportFile: true },
          'ae-unresolved-inheritdoc-base': { logLevel: ExtractorLogLevel.Warning, addToApiReportFile: true },
          'ae-wrong-input-file-type': { logLevel: ExtractorLogLevel.Error },
          // Every export in these packages is public API; a tag is only how `@internal` is marked
          'ae-missing-release-tag': { logLevel: ExtractorLogLevel.None },
        },
        // TSDoc syntax isn't part of the contract these reports protect
        tsdocMessageReporting: { default: { logLevel: ExtractorLogLevel.None } },
      },
    },
    configObjectFullPath: undefined,
    packageJsonFullPath: path.join(pkgDir, 'package.json'),
  });
  const result = Extractor.invoke(config, { localBuild: local, showVerboseMessages: false });
  if (result.apiReportChanged) changed++;
  if (!result.succeeded) {
    failed++;
    console.error(`${pkg.name}${key.slice(1)}: ${result.errorCount} error(s), ${result.warningCount} warning(s)${result.apiReportChanged ? ', report changed' : ''}`);
  }
}

/** Component entries (a .ts module re-exporting an SFC's default) */
function componentEntries(): ComponentEntry[] {
  return entries().flatMap(([key, declaration]) => {
    const source = (pkg.exports[key] as Record<string, string>)['@abuddy/source'];
    const sfc = /export\s*\{\s*default\s*\}\s*from\s*['"]([^'"]+\.vue)['"]/.exec(fs.readFileSync(path.join(pkgDir, source), 'utf-8'));
    if (!sfc) return [];
    // The entry only re-exports; the SFC's own declaration is where the component is declared
    return [{ key, declaration, componentDeclaration: path.join(path.dirname(declaration), `${path.basename(sfc[1])}.d.ts`) }];
  });
}

// componentContracts builds a TypeScript program, which is the slow part of this script. A package
// with no component entries (@abuddy/ears, @abuddy/sdk) has nothing for it to report, so don't.
const components = componentEntries();
const contracts = components.length === 0 ? [] : componentContracts({
  packageName: pkg.name,
  projectDir: pkgDir,
  typesDir,
  tsconfigPath: path.join(pkgDir, 'tsconfig.api-extractor.json'),
  components,
});

for (const [key, contract] of contracts) {
  const file = reportName(key).replace(/\.api\.md$/, '.component.md');
  expected.add(file);
  const current = fs.existsSync(path.join(reportFolder, file)) ? fs.readFileSync(path.join(reportFolder, file), 'utf-8') : undefined;
  if (current === contract) continue;
  changed++;
  if (local) fs.writeFileSync(path.join(reportFolder, file), contract);
  else { failed++; console.error(`etc/${file} is out of date; run api:update`); }
}

// Reports for exports that no longer exist
for (const file of fs.readdirSync(reportFolder).filter((f) => /\.(api|component)\.md$/.test(f) && !expected.has(f))) {
  changed++;
  if (local) fs.rmSync(path.join(reportFolder, file));
  else { failed++; console.error(`etc/${file} has no matching export; run with --local to remove it`); }
}

if (failed > 0) process.exit(1);
// How many reports the run *changed*, not how many it looked at. `api:update` said "101 API reports
// updated" whether or not any had moved, which is the one question its reader has — a doc edit that
// reaches the declarations but no report is a routine reason to run this, and the old line left no way
// to tell that from a signature having changed.
console.log(local
  ? `${pkg.name}: ${changed} of ${expected.size} API reports updated`
  : `${pkg.name}: ${expected.size} API reports up to date`);
