// The app-only exports (the LMDB store) stay out of what pack code shares: the app's bridge and the harness's
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { APP_ONLY_EXPORTS, SHARED_DEPS, getSharedBeDeps, getSharedFeDeps, unresolvedSubpathPackages, sharedInstanceExports, sharedInstanceSpecifiers } from '../../src/build/shared-deps.ts';
import { appBridgedSpecifiers } from '../../src/build/render-sdk-modules.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..');

describe('APP_ONLY_EXPORTS', () => {
  it('names exports @abuddy/ears has', () => {
    const exported = sharedInstanceExports('@abuddy/ears', import.meta.filename);
    expect(Object.keys(APP_ONLY_EXPORTS)).toEqual(['@abuddy/ears/lmdb']);
    expect(Object.keys(exported)).toContain('./lmdb');
  });

  it('leaves them out of the shared specifiers the harness bridges and the app bridge', () => {
    const specifiers = sharedInstanceSpecifiers('@abuddy/ears', sharedInstanceExports('@abuddy/ears', import.meta.filename));
    expect(specifiers).toContain('@abuddy/ears');
    expect(specifiers).not.toContain('@abuddy/ears/lmdb');
    expect(appBridgedSpecifiers(import.meta.filename)).not.toContain('@abuddy/ears/lmdb');
  });
});

describe('getSharedBeDeps', () => {
  it('names the packages a pack backend gets from the host, and no frontend-only one', () => {
    const be = getSharedBeDeps();
    // `both` and `be` entries: the app's xstate (one interpreter) and zod (one set of schema classes)
    expect(be.sort()).toEqual(['xstate', 'zod']);
    for (const name of be) expect(SHARED_DEPS[name].target, name).not.toBe('fe');
    for (const [name, dep] of Object.entries(SHARED_DEPS)) {
      if (dep.target === 'fe') expect(be, name).not.toContain(name);
    }
  });

  it("doesn't list subpaths: the bridge resolves them from the host as they come", () => {
    // A pack bundle leaves `zod` external, and a dependency inside it may require `zod/v4`
    expect(getSharedBeDeps().some((name) => name.includes('/'))).toBe(false);
  });

  it('shares nothing with the frontend list that the frontend gets under another key', () => {
    const fe = getSharedFeDeps(REPO_ROOT);
    for (const name of getSharedBeDeps()) {
      if (fe[name]) expect(SHARED_DEPS[name].target, name).toBe('both');
    }
  });
});

describe('the shared tiptap and ProseMirror subpaths', () => {
  // They used to resolve from this module's own location, which is inside the CLI bundle: under a
  // global CLI, npx or pnpm that found nothing, returned no subpaths, and a fe.bundleUi pack inlined
  // its own ProseMirror — the duplicate instance the sharing exists to prevent, with no error.
  it('resolves from the directory it is given, not from this module', () => {
    expect(Object.keys(getSharedFeDeps(REPO_ROOT))).toEqual(expect.arrayContaining(['@tiptap/pm/state', 'prosemirror-state']));
  });

  it('reports what it could not resolve instead of silently sharing nothing', () => {
    const nowhere = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-deps-'));
    try {
      expect(unresolvedSubpathPackages(nowhere)).toEqual(['@tiptap/pm', '@tiptap/vue-3']);
      expect(Object.keys(getSharedFeDeps(nowhere))).not.toContain('@tiptap/pm/state');
      expect(unresolvedSubpathPackages(REPO_ROOT)).toEqual([]);
    } finally {
      fs.rmSync(nowhere, { recursive: true, force: true });
    }
  });

  it('finds them through any of the directories it is given', () => {
    const nowhere = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-deps-'));
    try {
      expect(unresolvedSubpathPackages(nowhere, REPO_ROOT)).toEqual([]);
    } finally {
      fs.rmSync(nowhere, { recursive: true, force: true });
    }
  });
});
