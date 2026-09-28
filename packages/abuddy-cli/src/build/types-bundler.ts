import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import { errorMessage } from '@abuddy/sdk/utils/pure';

/**
 * A declaration bundle with every all-literal union's members sorted (`"b" | "a"` → `"a" | "b"`).
 *
 * TypeScript prints an inferred union in the order it created the member types, and that order changes
 * between builds — so the same sources emit different bytes. Measured 2026-09-28: `action-defs.d.ts` took
 * five distinct hashes in six builds, and `pack-types.d.ts` flipped with it. Every step caching on
 * `packages/default-setup/dist` then goes stale for a file whose meaning never changed, which is the waste
 * `docs/archive/plans/pack-runtime-nondeterminism.md` recorded and blamed on esbuild.
 *
 * A union's order does not change the type, so sorting is safe. `scripts/facade-report.ts` has the same
 * function and keeps it: it normalises the bundle again before recording `etc/pack-types.api.md`, which is
 * what kept that report stable while the bundle was not, and is still the report's own defence against a
 * bundle built by a CLI without this. If the two ever disagree, `facade:check` is what notices.
 */
export function sortLiteralUnions(bundle: string, fileName = 'bundle.d.ts'): string {
  const file = ts.createSourceFile(fileName, bundle, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const edits: Array<{ start: number; end: number; text: string }> = [];
  const visit = (node: ts.Node): void => {
    if (ts.isUnionTypeNode(node) && node.types.every((member) => ts.isLiteralTypeNode(member))) {
      edits.push({ start: node.getStart(file), end: node.end, text: node.types.map((member) => member.getText(file)).sort().join(' | ') });
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return edits.reverse().reduce((text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end), bundle);
}

/** A package specifier (`vue`, `@abuddy/ears`), not a relative path or a pack's own `#` subpath */
export function isPackageSpecifier(id: string): boolean {
  return !id.startsWith('.') && !path.isAbsolute(id) && !id.startsWith('#') && !id.startsWith('\0');
}

/**
 * Bundles a pack's facade types (src/__generated__/pack-types.ts: entity shapes, plugin events,
 * services, repositories) into one declaration file that dependents import. The pack's own
 * modules and its dependencies' facade types are inlined; packages stay imports.
 */
export async function bundlePackTypes(packDir: string, outFile: string): Promise<{ success: true; content: string } | { success: false; error: string }> {
  return bundleDeclarations(packDir, path.join(packDir, 'src', '__generated__', 'pack-types.ts'), outFile);
}

export interface BundleDeclarationsOptions {
  /** Which ids stay imports. Default: every package specifier, so only the pack's own modules are inlined */
  isExternal?: (id: string) => boolean;
  /** Text placed before and after the declarations, to wrap them in a module */
  intro?: string;
  outro?: string;
  /** Applied to the bundled declarations before they're written */
  renderChunk?: (code: string) => string;
  /**
   * Compile with these options instead of the pack's tsconfig.json. The tsconfig's `include` becomes the
   * program's files, so a bundle that needs only the entry's imports passes the options it needs instead.
   */
  compilerOptions?: Record<string, unknown>;
}

/**
 * Bundles the declarations of a pack module (`input`) into one declaration file: the pack's own
 * modules are inlined, packages stay imports.
 */
export async function bundleDeclarations(
  packDir: string,
  input: string,
  outFile: string,
  options: BundleDeclarationsOptions = {},
): Promise<{ success: true; content: string } | { success: false; error: string }> {
  const { rollup } = await import('rollup');
  const { dts } = await import('rollup-plugin-dts');
  const tsconfig = path.join(packDir, 'tsconfig.json');
  try {
    const bundle = await rollup({
      input,
      external: options.isExternal ?? isPackageSpecifier,
      plugins: [dts({
        respectExternal: true,
        tsconfig: options.compilerOptions || !fs.existsSync(tsconfig) ? undefined : tsconfig,
        compilerOptions: {
          // A pack linked to a checkout reads @abuddy/* declarations from source
          allowImportingTsExtensions: true,
          skipLibCheck: true,
          ...options.compilerOptions,
        },
      })],
      onwarn(warning, warn) {
        if (warning.code !== 'UNRESOLVED_IMPORT') warn(warning);
      },
    });
    const { output } = await bundle.generate({ format: 'es', intro: options.intro, outro: options.outro });
    await bundle.close();
    const rendered = options.renderChunk ? options.renderChunk(output[0].code) : output[0].code;
    // Here rather than in each caller, so every declaration bundle this function writes is reproducible and a
    // fourth caller cannot forget: the facade, the DSL defs and the flow helpers all come through here
    const content = sortLiteralUnions(rendered, outFile);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, content);
    return { success: true, content };
  } catch (err) {
    return { success: false, error: errorMessage(err) };
  }
}
