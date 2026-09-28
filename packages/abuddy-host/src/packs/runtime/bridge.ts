import { APP_ONLY_EXPORTS, SHARED_INSTANCE_PACKAGES, getSharedBeDeps } from '../../build/shared-deps.ts';
import { withModuleBridge } from '../module-bridge.ts';
import { SHARED_INSTANCE_MODULES } from './sdk-modules.ts';

// The SDK bridge: pack runtime code shares the loader's shared-instance packages (@abuddy/sdk,
// @abuddy/ears); it never requires @abuddy/host (check:specifiers and abuddy build reject it).
// The API bundle inlines them (tsup bundles them). Any CJS code loaded at runtime (external packs,
// built-in dev entry) that does require('@abuddy/ears') would otherwise get a SEPARATE module
// instance, with no bound app and no installed engine.
// sdk-modules.ts imports every export statically, so they resolve to the BUNDLED instances, the
// ones with hydrated data; withHostResolution injects them into the require cache so dynamically
// loaded pack code shares them.
const SDK_BRIDGE: Record<string, unknown> = SHARED_INSTANCE_MODULES;

/**
 * The shared-instance package specifiers bridged to host singletons.
 *
 * Exported for the drift guard in tests/packs/runtime/sdk-bridge-drift.spec.ts. A pack
 * importing a shared-instance subpath that is missing here fails loudly, and
 * says what to do: `withModuleBridge` throws "isn't provided by this
 * AgentBuddy: rebuild the pack with the current @abuddy/cli" for any specifier
 * under a bridged package it has no entry for. That was not always so — before
 * `755385f15` the require fell through to real Node resolution and died on the
 * SDK's extensionless relative imports, which `loadBuiltInPacks` caught and
 * answered by falling back to the prebuilt bundle, booting the app with dev
 * hot-reload quietly broken. The built-in loader still has that fallback for
 * every other failure, so the throw is what keeps this one visible.
 */
export function getBridgedSdkSpecifiers(): readonly string[] {
  return Object.keys(SDK_BRIDGE);
}

const HOST_PROVIDED_PACKAGES = getSharedBeDeps();

/** Runs `fn` (a require of pack runtime code) with the shared-instance packages bridged to the loader's instances and host-provided packages resolved from the loader (the API bundle, in the app) */
export function withHostResolution<T>(fn: () => T): T {
  return withModuleBridge({
    modules: SDK_BRIDGE,
    hostPackages: HOST_PROVIDED_PACKAGES,
    resolveFrom: import.meta.url,
    // A runtime built against a shared-instance module this app no longer has fails, saying to rebuild it
    bridgedPackages: SHARED_INSTANCE_PACKAGES,
    appOnly: APP_ONLY_EXPORTS,
  }, fn);
}
