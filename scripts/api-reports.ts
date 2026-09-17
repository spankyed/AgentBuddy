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
import ts from 'typescript';

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
  if (!result.succeeded) {
    failed++;
    console.error(`${pkg.name}${key.slice(1)}: ${result.errorCount} error(s), ${result.warningCount} warning(s)${result.apiReportChanged ? ', report changed' : ''}`);
  }
}

/** A component entry: the `.ts` module that re-exports an SFC's default, and the two declarations */
interface ComponentEntry {
  key: string;
  /** The entry module's declaration, which the contract file imports the component from */
  declaration: string;
  /** The SFC's own declaration, where the component and the types it names are declared */
  componentDeclaration: string;
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

/**
 * The contract of each component, printed by the TypeScript checker: props (without Vue's own VNode
 * props), emits, slots and exposed instance members. vue-tsc declares a component with slots as an
 * intersection of constructors (__VLS_WithSlots), and vue-component-type-helpers infers from only
 * the last one, so the instance members are read from every construct signature; a functional
 * component uses the helpers.
 */
function componentContracts(components: ComponentEntry[]): Map<string, string> {
  const contractFile = path.join(typesDir, '__component-contracts.ts');
  fs.writeFileSync(contractFile, [
    "import type { ComponentProps, ComponentEmit, ComponentSlots, ComponentExposed } from 'vue-component-type-helpers';",
    ...components.flatMap(({ declaration }, i) => {
      const specifier = `./${path.relative(typesDir, declaration).replace(/\.d\.ts$/, '.js')}`;
      return [
        `import C${i} from '${specifier}';`,
        `export const component${i} = C${i};`,
        `export type FunctionalProps${i} = ComponentProps<typeof C${i}>;`,
        `export type FunctionalEmit${i} = ComponentEmit<typeof C${i}>;`,
        `export type FunctionalSlots${i} = ComponentSlots<typeof C${i}>;`,
        `export type FunctionalExposed${i} = ComponentExposed<typeof C${i}>;`,
      ];
    }),
  ].join('\n'));
  const { config } = ts.readConfigFile(path.join(pkgDir, 'tsconfig.api-extractor.json'), ts.sys.readFile);
  const { options } = ts.parseJsonConfigFileContent(config, ts.sys, pkgDir);
  const program = ts.createProgram([contractFile], { ...options, noEmit: true });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length > 0) {
    throw new Error(ts.formatDiagnostics(diagnostics, { getCanonicalFileName: (f) => f, getCurrentDirectory: () => pkgDir, getNewLine: () => '\n' }));
  }
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(contractFile)!;
  const flags = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.WriteArrowStyleSignature;
  const relativize = (text: string) => text.replaceAll(/import\("([^"]+)"\)/g, (_, file: string) => {
    const nodeModules = file.lastIndexOf('/node_modules/');
    return `import("${nodeModules >= 0 ? file.slice(nodeModules + '/node_modules/'.length) : path.relative(typesDir, file)}")`;
  });
  const scope = (name: string, meaning: ts.SymbolFlags) => checker.getSymbolsInScope(source, meaning).find((s) => s.name === name)!;
  const fromVue = (symbol: ts.Symbol) => (symbol.declarations ?? []).length > 0
    && symbol.declarations!.every((d) => /\/node_modules\/@vue\//.test(d.getSourceFile().fileName));
  // Union members print in type-creation order, which depends on the rest of the program: sort them
  const typeText = (type: ts.Type, location: ts.Node): string => {
    if (!type.isUnion() || type.aliasSymbol) return relativize(checker.typeToString(type, location, flags));
    let members = [...new Set(type.types.map((member) => typeText(member, location)))];
    if (members.includes('true') && members.includes('false')) members = [...members.filter((m) => m !== 'true' && m !== 'false'), 'boolean'];
    // Function and conditional types need parentheses inside a union
    return members.map((m) => (/=>|\bextends\b/.test(m) ? `(${m})` : m)).sort().join(' | ');
  };
  const member = (symbol: ts.Symbol, location: ts.Node) => {
    const optional = symbol.flags & ts.SymbolFlags.Optional ? '?' : '';
    return `  ${symbol.name}${optional}: ${typeText(checker.getTypeOfSymbolAtLocation(symbol, location), location)};`;
  };
  /** A member of the component instance, from any construct signature */
  const instanceMember = (component: ts.Type, name: string, location: ts.Node): ts.Type | undefined => {
    for (const signature of checker.getSignaturesOfType(component, ts.SignatureKind.Construct)) {
      const property = checker.getReturnTypeOfSignature(signature).getProperty(name);
      if (property) return checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(property, location));
    }
    return undefined;
  };

  const contracts = new Map<string, string>();
  components.forEach(({ key, componentDeclaration }, i) => {
    // Print each type as the component's own declaration sees it: a type that file imports prints
    // by name, the way someone reading the component does, instead of as a path into this build's
    // .temp — which would record how the dependency resolved rather than what the contract is
    const location = program.getSourceFile(componentDeclaration) ?? source;
    const component = checker.getTypeOfSymbolAtLocation(scope(`component${i}`, ts.SymbolFlags.Variable), source);
    const constructs = checker.getSignaturesOfType(component, ts.SignatureKind.Construct);
    const alias = (name: string) => checker.getDeclaredTypeOfSymbol(scope(`${name}${i}`, ts.SymbolFlags.TypeAlias));
    const propsType = constructs.length > 0 ? instanceMember(component, '$props', location) : alias('FunctionalProps');
    const emitType = constructs.length > 0 ? instanceMember(component, '$emit', location) : alias('FunctionalEmit');
    const slotsType = constructs.length > 0 ? instanceMember(component, '$slots', location) : alias('FunctionalSlots');
    const exposedType = constructs.length > 0 ? checker.getReturnTypeOfSignature(constructs[0]) : alias('FunctionalExposed');

    const props = propsType ? checker.getPropertiesOfType(propsType).filter((p) => !fromVue(p)) : [];
    const propNames = new Set(props.map((p) => p.name));
    const emits = emitType ? checker.getSignaturesOfType(emitType, ts.SignatureKind.Call) : [];
    const slots = slotsType ? checker.getPropertiesOfType(slotsType).filter((p) => !fromVue(p)) : [];
    const exposed = checker.getPropertiesOfType(exposedType)
      .filter((p) => !p.name.startsWith('$') && !propNames.has(p.name) && !fromVue(p));
    const block = (title: string, lines: string[]) => [`${title} {`, ...lines.sort(), '}'];
    contracts.set(key, [
      `## Component contract for "${pkg.name}${key.slice(1)}"`,
      '',
      '> Generated by scripts/api-reports.ts; api:check fails when it is out of date.',
      '',
      '```ts',
      ...block('props', props.map((p) => member(p, location))),
      ...block('emits', emits.map((sig) => `  ${relativize(checker.signatureToString(sig, location, flags))};`)),
      ...block('slots', slots.map((p) => member(p, location))),
      ...block('exposed', exposed.map((p) => member(p, location))),
      '```',
      '',
    ].join('\n'));
  });
  fs.rmSync(contractFile);
  return contracts;
}

for (const [key, contract] of componentContracts(componentEntries())) {
  const file = reportName(key).replace(/\.api\.md$/, '.component.md');
  expected.add(file);
  const current = fs.existsSync(path.join(reportFolder, file)) ? fs.readFileSync(path.join(reportFolder, file), 'utf-8') : undefined;
  if (current === contract) continue;
  if (local) fs.writeFileSync(path.join(reportFolder, file), contract);
  else { failed++; console.error(`etc/${file} is out of date; run api:update`); }
}

// Reports for exports that no longer exist
for (const file of fs.readdirSync(reportFolder).filter((f) => /\.(api|component)\.md$/.test(f) && !expected.has(f))) {
  if (local) fs.rmSync(path.join(reportFolder, file));
  else { failed++; console.error(`etc/${file} has no matching export; run with --local to remove it`); }
}

if (failed > 0) process.exit(1);
console.log(`${pkg.name}: ${expected.size} API reports ${local ? 'updated' : 'up to date'}`);
