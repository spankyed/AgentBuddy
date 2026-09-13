// Shared by the package builds of @abuddy/sdk and @abuddy/ui: host-shared peer ranges and
// the guard that every package a shipped module imports is declared in the published manifest.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { builtinModules } from 'node:module';
import { build } from 'esbuild';
import { parse as parseSfc } from '@vue/compiler-sfc';

/** Shared with the running app: packs must use the host's copy, so they are peers with host ranges. */
export const HOST_SHARED_PEERS: Record<string, string> = {
  vue: '^3.5.18',
  xstate: '^5.19.2',
  '@xstate/vue': '^4.0.2',
  'lucide-vue-next': '^0.503.0',
  'reka-ui': '^2.2.1',
  zod: '^3.24.0',
  '@tiptap/core': '^3.20.1',
  '@tiptap/pm': '^3.20.1',
  '@tiptap/starter-kit': '^3.20.1',
  '@tiptap/vue-3': '^3.20.1',
  '@vue-flow/core': '^1.44.0',
};

const packageName = (specifier: string) =>
  specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];

/** Package name → files importing it, across a package's shipped modules. */
export class BareImports {
  private readonly imports = new Map<string, Set<string>>();

  constructor(private readonly srcDir: string) {}

  /** Records a module's bare imports without bundling it (relative imports stay external). */
  async fromModule(contents: string, loader: 'js' | 'ts', resolveDir: string, importer: string): Promise<void> {
    await build({
      stdin: { contents, loader, resolveDir, sourcefile: importer },
      bundle: true,
      write: false,
      logLevel: 'silent',
      // verbatimModuleSyntax keeps imports only an SFC template uses; `import type` is still dropped
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

  /** SFC scripts are compiled by the pack's build, so their imports must be installable too. */
  async fromSfc(file: string): Promise<void> {
    const { descriptor } = parseSfc(fs.readFileSync(file, 'utf-8'), { filename: file });
    for (const block of [descriptor.script, descriptor.scriptSetup]) {
      if (block) await this.fromModule(block.content, block.lang === 'ts' ? 'ts' : 'js', path.dirname(file), file);
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

export function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}
