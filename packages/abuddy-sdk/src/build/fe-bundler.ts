import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import type { Plugin, BuildOptions } from 'esbuild';
import { getSharedFeDeps, getSdkFeModules } from '../shared-deps';

function parseNamedExports(source: string): string[] {
  const exports: string[] = [];
  const cleaned = source.replace(/export\s+type\s*\{[^}]*\}/g, '');

  for (const match of cleaned.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const item of match[1].split(',')) {
      const trimmed = item.trim();
      if (!trimmed || trimmed.startsWith('type ')) continue;
      const asMatch = trimmed.match(/\w+\s+as\s+(\w+)/);
      const name = asMatch ? asMatch[1] : trimmed.split(/\s/)[0];
      if (name !== 'default') exports.push(name);
    }
  }

  for (const match of cleaned.matchAll(/export\s+(?:const|let|var|function|class)\s+(\w+)/g)) {
    exports.push(match[1]);
  }

  return [...new Set(exports)];
}

function hostDepsPlugin(packDir: string): Plugin {
  const feDeps = getSharedFeDeps();
  const escaped = Object.keys(feDeps)
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
        const dep = feDeps[args.path];
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

function sdkExternalPlugin(packDir: string): Plugin {
  const sdkModules = getSdkFeModules();

  return {
    name: 'sdk-external',
    setup(build) {
      build.onResolve({ filter: /^@abuddy\/sdk/ }, (args) => {
        if (sdkModules[args.path]) {
          return { path: args.path, namespace: 'sdk-external' };
        }
        try {
          const req = createRequire(path.join(packDir, 'package.json'));
          return { path: req.resolve(args.path) };
        } catch {
          return undefined;
        }
      });

      build.onLoad({ filter: /.*/, namespace: 'sdk-external' }, (args) => {
        const mod = sdkModules[args.path];
        if (!mod) return undefined;

        let namedExports: string[] = [];
        try {
          const req = createRequire(path.join(packDir, 'package.json'));
          const sourcePath = req.resolve(args.path);
          namedExports = parseNamedExports(fs.readFileSync(sourcePath, 'utf-8'));
        } catch {}

        const lines = [`const __m = window.__abuddy.${mod.globalKey};`];
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

function vueSfcPlugin(): Plugin {
  return {
    name: 'vue-sfc',
    setup(build) {
      build.onLoad({ filter: /\.vue$/ }, async (args) => {
        const { parse, compileScript, compileTemplate, compileStyle } = await import('@vue/compiler-sfc');
        const source = fs.readFileSync(args.path, 'utf-8');
        const filename = path.basename(args.path);
        const { descriptor, errors } = parse(source, { filename });

        if (errors.length) {
          return { errors: errors.map(e => ({ text: e.message })) };
        }

        const scopeId = `data-v-${Buffer.from(args.path).toString('base64url').slice(0, 8)}`;
        const hasScoped = descriptor.styles.some(s => s.scoped);

        const script = descriptor.script || descriptor.scriptSetup
          ? compileScript(descriptor, { id: scopeId })
          : { content: 'export default {}', bindings: {} };

        const template = descriptor.template
          ? compileTemplate({
              source: descriptor.template.content,
              filename,
              id: scopeId,
              scoped: hasScoped,
              compilerOptions: { bindingMetadata: script.bindings },
            })
          : null;

        let code = script.content;
        if (template) {
          code += `\n${template.code}\n`;
        }

        code = code.replace(
          /export\s+default\s+\/\*@__PURE__\*\/\s*_defineComponent/,
          'const __component = /*@__PURE__*/ _defineComponent',
        );
        if (!code.includes('const __component')) {
          code = code.replace(/export\s+default\s*/, 'const __component = ');
        }

        if (template) {
          code += `\n__component.render = render;\n`;
        }
        if (hasScoped) {
          code += `__component.__scopeId = '${scopeId}';\n`;
        }

        if (descriptor.styles.length) {
          const compiledStyles = descriptor.styles.map(s =>
            compileStyle({
              source: s.content,
              filename,
              id: scopeId,
              scoped: s.scoped ?? false,
            }).code
          ).join('\n');
          const escaped = JSON.stringify(compiledStyles);
          code = `(()=>{const s=document.createElement('style');s.textContent=${escaped};document.head.appendChild(s)})();\n` + code;
        }

        code += `\nexport default __component;\n`;

        return { contents: code, loader: 'ts', resolveDir: path.dirname(args.path) };
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

  const generatedEntry = path.join(packDir, 'src', '__generated__', 'pack-entry-fe.ts');
  if (fs.existsSync(generatedEntry)) return generatedEntry;

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
      vueSfcPlugin(),
      hostDepsPlugin(packDir),
      sdkExternalPlugin(packDir),
    ],
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
