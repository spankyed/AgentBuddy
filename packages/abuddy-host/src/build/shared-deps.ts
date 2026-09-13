import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';

export interface SharedDep {
  globalKey?: string;
  target: 'fe' | 'be' | 'both';
}

export const SHARED_DEPS: Record<string, SharedDep> = {
  'vue':                  { globalKey: 'vue',              target: 'fe' },
  'xstate':               { globalKey: 'xstate',           target: 'both' },
  '@xstate/vue':          { globalKey: 'xstateVue',        target: 'fe' },
  'zod':                  {                                target: 'be' },

  '@tiptap/core':         { globalKey: 'tiptapCore',       target: 'fe' },
  '@tiptap/vue-3':        { globalKey: 'tiptapVue3',       target: 'fe' },
  '@tiptap/starter-kit':  { globalKey: 'tiptapStarterKit', target: 'fe' },
  'reka-ui':              { globalKey: 'rekaUi',           target: 'fe' },
  'lucide-vue-next':      { globalKey: 'lucideVueNext',    target: 'fe' },
  '@vue-flow/core':       { globalKey: 'vueFlowCore',      target: 'fe' },
};

export function getSharedFeDeps(): Record<string, SharedDep & { globalKey: string }> {
  return Object.fromEntries(
    Object.entries(SHARED_DEPS).filter(([, d]) => d.target !== 'be' && d.globalKey),
  ) as Record<string, SharedDep & { globalKey: string }>;
}

export interface SdkFeModule {
  globalKey: string;
}

export const SDK_FE_MODULES: Record<string, SdkFeModule> = {
  '@abuddy/sdk/fe':           { globalKey: 'sdkFe' },
  '@abuddy/sdk/rpc':          { globalKey: 'sdkRpc' },
  '@abuddy/sdk/runtime':      { globalKey: 'sdkRuntime' },
  '@abuddy/sdk/steps':        { globalKey: 'sdkSteps' },
  '@abuddy/sdk/artifacts':    { globalKey: 'sdkArtifacts' },
  '@abuddy/sdk/blocks':       { globalKey: 'sdkBlocks' },
  '@abuddy/sdk/designations': { globalKey: 'sdkDesignations' },
  '@abuddy/sdk/helpers':      { globalKey: 'sdkHelpers' },
};

export function getSdkFeModules(): Record<string, SdkFeModule> {
  return SDK_FE_MODULES;
}

/**
 * Every @abuddy/ui export, shared with pack FE code like the SDK modules: the host exposes each
 * module on window.__abuddy under its specifier. Read from the exports map of the @abuddy/ui that
 * `fromDir` resolves (the host's own, or a pack's).
 */
export function getUiFeModules(fromDir: string): Record<string, SdkFeModule> {
  let manifestPath: string;
  try {
    manifestPath = createRequire(path.join(fromDir, 'package.json')).resolve('@abuddy/ui/package.json');
  } catch {
    return {};
  }
  const { exports } = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as { exports: Record<string, unknown> };
  return Object.fromEntries(
    Object.keys(exports)
      .filter((key) => key !== './package.json')
      .map((key) => {
        const specifier = `@abuddy/ui${key.slice(1)}`;
        return [specifier, { globalKey: specifier }];
      }),
  );
}

export function getSharedBeDeps(): string[] {
  return Object.keys(SHARED_DEPS).filter(k => SHARED_DEPS[k].target !== 'fe');
}

export function findSdkVersion(startDir: string): string | undefined {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.name === '@abuddy/sdk') return pkg.version;
      } catch {}
    }
    dir = path.dirname(dir);
  }
  return undefined;
}
