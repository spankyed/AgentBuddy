import * as fs from 'node:fs';
import * as path from 'node:path';
import { sourceConditions } from '@abuddy/sdk/build';

/** A package specifier (`vue`, `@abuddy/sdk/ears`), not a relative path or a tsconfig/imports alias */
function isPackageSpecifier(id: string): boolean {
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

/**
 * Bundles the declarations of a pack module (`input`) into one declaration file: the pack's own
 * modules are inlined, packages stay imports.
 */
export async function bundleDeclarations(packDir: string, input: string, outFile: string): Promise<{ success: true; content: string } | { success: false; error: string }> {
  const { rollup } = await import('rollup');
  const { dts } = await import('rollup-plugin-dts');
  const tsconfig = path.join(packDir, 'tsconfig.json');
  try {
    const bundle = await rollup({
      input,
      external: isPackageSpecifier,
      plugins: [dts({
        respectExternal: true,
        tsconfig: fs.existsSync(tsconfig) ? tsconfig : undefined,
        compilerOptions: {
          // A pack linked to a checkout reads @abuddy/* declarations from source
          customConditions: sourceConditions(packDir),
          allowImportingTsExtensions: true,
          skipLibCheck: true,
        },
      })],
      onwarn(warning, warn) {
        if (warning.code !== 'UNRESOLVED_IMPORT') warn(warning);
      },
    });
    const { output } = await bundle.generate({ format: 'es' });
    await bundle.close();
    const content = output[0].code;
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, content);
    return { success: true, content };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
