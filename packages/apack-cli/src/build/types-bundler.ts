import * as fs from 'node:fs';
import * as path from 'node:path';
import { sortLiteralUnions } from './declaration-text';
import type { RecordReads } from './build-reads';
import { errorMessage } from '@apackdev/sdk/utils/pure';
import ts from 'typescript';
import { readPackCompilerConfiguration } from './compiler-configuration.ts';
import { isBuiltin } from 'node:module';

/** A package specifier (`vue`, `@apackdev/ears`), not a relative path or a pack's own `#` subpath */
export function isPackageSpecifier(id: string): boolean {
  return !id.startsWith('.') && !path.isAbsolute(id) && !id.startsWith('#') && !id.startsWith('\0');
}

/**
 * Bundles a pack's facade types (src/__generated__/pack-types.ts: entity shapes, plugin events,
 * services, repositories) into one declaration file that dependents import. The pack's own
 * modules and its dependencies' facade types are inlined; packages stay imports.
 */
export async function bundlePackTypes(packDir: string, outFile: string, recordReads?: RecordReads): Promise<{ success: true; content: string } | { success: false; error: string }> {
  return bundleDeclarations(packDir, path.join(packDir, 'src', '__generated__', 'pack-types.ts'), outFile, { recordReads });
}

export interface BundleDeclarationsOptions {
  /** Which package ids stay imports. Authored path aliases and baseUrl modules are inlined. */
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
  /**
   * Where this bundle reports the files it read, for the build's record of its inputs. Rollup's
   * `watchFiles` is the declaration program's file list, which is where another package's `.d.ts` is read.
   */
  recordReads?: RecordReads;
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
  const { rollup, VERSION } = await import('rollup');
  const { dts } = await import('rollup-plugin-dts');
  const tsconfig = path.join(packDir, 'tsconfig.json');
  try {
    const compilerOptions = (options.compilerOptions as ts.CompilerOptions | undefined)
      ?? readPackCompilerConfiguration(packDir)?.options ?? {};
    const resolution = ts.createModuleResolutionCache(packDir, file => ts.sys.useCaseSensitiveFileNames ? file : file.toLowerCase(), compilerOptions);
    const isExternal = options.isExternal ?? isPackageSpecifier;
    const aliases = Object.keys(compilerOptions.paths ?? {});
    const bundle = await rollup({
      input,
      external(id, importer) {
        if (!isExternal(id)) return false;
        if (!isPackageSpecifier(id)) return true;
        if (isBuiltin(id)) return true;
        const resolved = ts.resolveModuleName(id, importer ?? input, compilerOptions, ts.sys, resolution).resolvedModule;
        const packageName = id.split('/').slice(0, id.startsWith('@') ? 2 : 1).join('/');
        // Catch-all mappings may resolve genuine packages too; preserve those imports by package identity.
        if (resolved?.isExternalLibraryImport && resolved.packageId?.name === packageName) return true;
        const alias = aliases.some(alias => {
          const star = alias.indexOf('*');
          return star < 0 ? id === alias : id.startsWith(alias.slice(0, star))
            && id.endsWith(alias.slice(star + 1)) && id.length >= alias.length - 1;
        });
        return !alias && (!resolved || resolved.isExternalLibraryImport === true);
      },
      plugins: [dts({
        respectExternal: true,
        tsconfig: options.compilerOptions || !fs.existsSync(tsconfig) ? undefined : tsconfig,
        compilerOptions: {
          // A pack linked to a checkout reads @apackdev/* declarations from source
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
    options.recordReads?.({ bundler: 'rollup', version: VERSION, files: bundle.watchFiles });
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
