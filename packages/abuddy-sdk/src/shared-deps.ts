import * as fs from 'node:fs';
import * as path from 'node:path';

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
