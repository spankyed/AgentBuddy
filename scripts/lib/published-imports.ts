// Shared by the package builds of @abuddy/sdk and @abuddy/ui: the guard that every package a
// shipped module imports is declared in the manifest, and that the exports map was built.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { builtinModules } from 'node:module';
import { build } from 'esbuild';
import ts from 'typescript';

/** The package a bare specifier names: `@scope/name` or `name` */
export const packageName = (specifier: string) =>
  specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];

/** Package name → files importing it, across a package's shipped modules. */
export class BareImports {
  private readonly imports = new Map<string, Set<string>>();
  private readonly srcDir: string;

  constructor(srcDir: string) {
    this.srcDir = srcDir;
  }

  /** Records a module's bare imports without bundling it (relative imports stay external). */
  async fromModule(contents: string, loader: 'js' | 'ts', resolveDir: string, importer: string): Promise<void> {
    await build({
      stdin: { contents, loader, resolveDir, sourcefile: importer },
      bundle: true,
      write: false,
      logLevel: 'silent',
      tsconfigRaw: { compilerOptions: { verbatimModuleSyntax: true } },
      plugins: [{
        name: 'collect-bare-imports',
        setup: (b) => {
          b.onResolve({ filter: /^[^./]/ }, (args) => {
            const name = packageName(args.path);
            if (!this.imports.has(name)) this.imports.set(name, new Set());
            this.imports.get(name)!.add(path.relative(this.srcDir, importer));
            return { path: args.path, external: true };
          });
          b.onResolve({ filter: /^\./ }, (args) => ({ path: args.path, external: true }));
        },
      }],
    });
  }

  /**
   * Records a declaration file's bare imports.
   *
   * Declarations can't go through esbuild like the JavaScript does: esbuild erases `import type`
   * before anything resolves, and in a `.d.ts` that is most of the file — so the imports this is
   * here to catch are exactly the ones it would drop. `ts.preProcessFile` is the scanner for this
   * job: it reports every specifier, type-only ones included, and knows what a comment is (a regex
   * over the text does not, and reads the examples in doc comments as imports).
   */
  fromDeclaration(contents: string, importer: string): void {
    for (const { fileName } of ts.preProcessFile(contents, true, true).importedFiles) {
      if (fileName.startsWith('.') || fileName.startsWith('#')) continue;
      const name = packageName(fileName);
      if (!this.imports.has(name)) this.imports.set(name, new Set());
      this.imports.get(name)!.add(path.relative(this.srcDir, importer));
    }
  }

  /** Throws when a shipped module imports a package the manifest doesn't declare. */
  assertDeclared(manifest: { name: string; dependencies?: Record<string, string>; peerDependencies?: Record<string, string> }, workspaceManifest: string): void {
    const declared = new Set([manifest.name, ...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.peerDependencies ?? {})]);
    const builtins = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);
    const undeclared = [...this.imports].filter(([name]) => !declared.has(name) && !builtins.has(name));
    if (undeclared.length === 0) return;
    throw new Error(
      `Shipped ${manifest.name} modules import packages the published manifest does not declare:\n` +
      undeclared.map(([name, importers]) => `  ${name} <- ${[...importers].slice(0, 3).join(', ')}`).join('\n') +
      `\nAdd them to ${workspaceManifest} dependencies (or peerDependencies for host-shared libraries).`,
    );
  }
}

/** The condition monorepo tooling resolves workspace packages' source through. */
export const SOURCE_CONDITION = '@abuddy/source';

/** Throws when an exports target outside the source condition wasn't built. */
export function assertExportTargetsBuilt(pkgDir: string, exportsMap: Record<string, unknown>): void {
  const targets = (entry: unknown): string[] =>
    typeof entry === 'string' ? [entry]
      : Object.entries(entry as Record<string, unknown>).flatMap(([condition, t]) => (condition === SOURCE_CONDITION ? [] : targets(t)));
  const missing = Object.values(exportsMap).flatMap(targets).filter((t) => !fs.existsSync(path.join(pkgDir, t)));
  if (missing.length > 0) throw new Error(`Export targets were not built:\n  ${missing.join('\n  ')}`);
}

/** Files whose contents are declarations: tsc's `.d.ts`, and vue-tsc's `.d.vue.ts` for an SFC */
export const isDeclaration = (file: string): boolean => file.endsWith('.d.ts') || file.endsWith('.d.vue.ts');

/**
 * Rewrites relative `./x.ts` specifiers to `./x.js` in emitted declarations.
 *
 * Source names the `.ts` file, and `rewriteRelativeImportExtensions` rewrites that to `.js` — but
 * only in emitted JavaScript, never in the `.d.ts` beside it. A published declaration was therefore
 * left saying `from './framework/index.ts'`, for a file that does not exist in `dist`.
 *
 * It resolved anyway, because TypeScript substitutes `.ts` → `.d.ts` when it resolves a specifier,
 * which is why the published-types specs passed. But it relies on that substitution, and every other
 * published package on npm ships `.js` here, so anything that resolves declarations by a plainer rule
 * — a bundler, an editor plugin, a doc generator — is entitled to fail. `.js` resolves through the
 * ordinary JavaScript-to-declaration mapping instead, which needs no special case.
 *
 * Only relative specifiers ending in `.ts` change. `.vue` is left alone: @abuddy/ui's declarations
 * import `./button.vue`, which resolves to the `button.d.vue.ts` beside it.
 */
export function rewriteDeclarationExtensions(outDir: string): number {
  let changed = 0;
  for (const file of walk(outDir).filter(isDeclaration)) {
    const before = fs.readFileSync(file, 'utf-8');
    const after = before.replace(
      /(\bfrom\s*|\bimport\s*\(\s*)(['"])(\.\.?\/[^'"]*)\.ts\2/g,
      (_m, lead: string, quote: string, spec: string) => `${lead}${quote}${spec}.js${quote}`,
    );
    if (after !== before) {
      fs.writeFileSync(file, after);
      changed++;
    }
  }
  return changed;
}

export function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}
