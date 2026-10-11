// Every specifier a pack's backend bundle leaves external is one the loader resolves.
//
// The two halves are declared in different packages and nothing held them together: the bundler's externals
// (`be-bundler.ts`) and the loader's provisions (`packs/runtime/bridge.ts`). A specifier in the first and not
// the second loads in a checkout, where the workspace node_modules sits above the pack, and fails the moment
// that pack is installed into a data dir, where nothing does — which is what `@vscode/ripgrep` did to the
// first boot that installed the pack the app ships.
import { describe, expect, it } from 'vitest';
import { HOST_RESOLVED_BINARIES, getSharedBeDeps, sharedInstanceExternals } from '@apack/host/build/shared-deps';
import { getBridgedSdkSpecifiers, getHostProvidedPackages } from '@apack/host/packs/runtime';
import { HOST_EXTERNALS } from '../../src/build/be-bundler';

/** What `bundlePackSource` passes esbuild as `external` */
const externals = [...HOST_EXTERNALS, ...HOST_RESOLVED_BINARIES];

/** What the loader answers an external specifier with: a bridged module, or a resolution from the host */
const provided = [...getBridgedSdkSpecifiers(), ...getHostProvidedPackages()];

const providedBy = (specifier: string) =>
  provided.find((name) => specifier === name || specifier.startsWith(`${name}/`));

describe("the packages a pack's backend bundle leaves external", () => {
  // No exceptions: a frontend-only shared dep is external here too, and a pack's backend bundle does require
  // one — a step's `fe.ts` facet is part of the backend registration, so `vue` is required at its top level.
  it('are each provided by the loader', () => {
    expect(externals.length).toBeGreaterThan(0);
    expect(externals).toContain('vue');

    expect(externals.filter((specifier) => providedBy(specifier) === undefined)).toEqual([]);
  });

  // Derived rather than listed, so a package added to either half is covered without touching this file
  it('are the shared instances, the shared backend packages and the ones no bundle can carry', () => {
    expect(externals).toEqual(expect.arrayContaining([
      ...sharedInstanceExternals(),
      ...getSharedBeDeps(),
      ...HOST_RESOLVED_BINARIES,
    ]));
    // The subject is not empty by construction: the three lists are what the case above partitions
    expect(HOST_RESOLVED_BINARIES.every((name) => providedBy(name) !== undefined)).toBe(true);
  });
});
