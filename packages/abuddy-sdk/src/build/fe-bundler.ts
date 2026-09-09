import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import type { Plugin, BuildOptions } from 'esbuild';
import { SHARED_DEPS } from '../fe/shared-deps';

function hostDepsPlugin(packDir: string): Plugin {
  const escaped = Object.keys(SHARED_DEPS)
    .map(k => k.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&'))
    .join('|');
  const filter = new RegExp(`^(${escaped})$`);

  return {
    name: 'host-deps',
    setup(build) {
      build.onResolve({ filter }, (args) => ({
        path: args.path,
        namespace: 'host-dep',
      }));

      build.onLoad({ filter: /.*/, namespace: 'host-dep' }, (args) => {
        const dep = SHARED_DEPS[args.path];
        if (!dep) return undefined;
        const globalKey = dep.globalKey;

        // Discover named exports from the actual installed module so that
        // `import { ref } from 'vue'` works in the bundled output.
        // Try pack-local first, then fall back to the CLI's own resolution.
        let namedExports: string[] = [];
        for (const base of [path.join(packDir, 'package.json'), import.meta.url]) {
          try {
            const req = createRequire(base);
            const mod = req(args.path);
            namedExports = Object.keys(mod).filter(
              k => k !== 'default' && k !== '__esModule' && /^[a-zA-Z_$]/.test(k),
            );
            if (namedExports.length > 0) break;
          } catch {}
        }

        const lines = [`const __m = window.__abuddy.${globalKey};`];
        if (namedExports.length > 0) {
          lines.push(`const { ${namedExports.join(', ')} } = __m;`);
          lines.push(`export { ${namedExports.join(', ')} };`);
        }
        lines.push(`export default __m;`);

        return { contents: lines.join('\n'), loader: 'js' };
      });
    },
  };
}

// Resolves @abuddy/sdk/* imports to the actual SDK source in the workspace,
// so pack FE code can import composables, design components, etc.
function sdkResolvePlugin(packDir: string): Plugin {
  return {
    name: 'sdk-resolve',
    setup(build) {
      build.onResolve({ filter: /^@abuddy\/sdk/ }, (args) => {
        try {
          const req = createRequire(path.join(packDir, 'package.json'));
          const resolved = req.resolve(args.path);
          return { path: resolved };
        } catch {
          return undefined;
        }
      });
    },
  };
}

interface BundleFEOptions {
  packDir: string;
  outputDir: string;
  entryPoint: string;
}

export function findFEEntry(packDir: string): string | null {
  const srcEntry = path.join(packDir, 'src', 'pack-entry-fe.ts');
  if (fs.existsSync(srcEntry)) return srcEntry;

  const srcEntryJs = path.join(packDir, 'src', 'pack-entry-fe.js');
  if (fs.existsSync(srcEntryJs)) return srcEntryJs;

  return null;
}

export async function bundlePackFE(options: BundleFEOptions): Promise<{ success: boolean; error?: string }> {
  const { packDir, outputDir, entryPoint } = options;

  // Dynamic import so pack-cli doesn't hard-depend on esbuild at module level
  const esbuild = await import('esbuild');

  const buildOptions: BuildOptions = {
    entryPoints: [entryPoint],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    outdir: outputDir,
    entryNames: 'fe',
    minify: false,
    sourcemap: true,
    plugins: [
      hostDepsPlugin(packDir),
      sdkResolvePlugin(packDir),
    ],
    // .vue SFC files require a separate build tool (Vite);
    // pack-cli bundles .ts/.tsx out of the box
    loader: {
      '.ts': 'ts',
      '.tsx': 'tsx',
      '.css': 'css',
    },
    logLevel: 'warning',
  };

  try {
    await esbuild.build(buildOptions);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
