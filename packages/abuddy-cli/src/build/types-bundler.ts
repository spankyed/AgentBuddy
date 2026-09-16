import * as fs from 'node:fs';
import * as path from 'node:path';
import { sourceConditions } from '@abuddy/sdk/build';

/** A package specifier (`vue`, `@abuddy/sdk/ears`), not a relative path or a tsconfig/imports alias */
export function isPackageSpecifier(id: string): boolean {
  return !id.startsWith('.') && !path.isAbsolute(id) && !id.startsWith('#') && !id.startsWith('@/') && !id.startsWith('\0');
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
          customConditions: sourceConditions(packDir),
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
    const content = options.renderChunk ? options.renderChunk(output[0].code) : output[0].code;
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, content);
    return { success: true, content };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
