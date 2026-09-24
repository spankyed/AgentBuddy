// The frontend host a pack's unit tests run against. bindFeHost is the renderer's, bound once at boot
// and never taken back; a test binds and unbinds per file, so that lifecycle lives here, next to
// startTestRuntime, rather than a pack reaching for the host's own unbind.
import { bindFeHost, unbindFeHost, type FeHostRuntime, type FePackRegistryView } from '../runtime/fe-host.ts';
import type { HostShell } from '../fe/shell.ts';
import type { SettingsPort } from '../fe/settings.ts';

/** A frontend with nothing registered: what a test sees before its own pack's frontend is bound */
const noFrontends: FePackRegistryView = {
  designation: () => undefined,
  step: () => undefined,
  steps: () => [],
  artifact: () => undefined,
  artifacts: () => [],
  block: () => undefined,
  blocks: () => [],
  plugins: () => [],
  defaultPlugin: () => undefined,
  tiptapPlugins: () => [],
  appExtension: () => undefined,
  dslTypes: () => new Map(),
};

/**
 * The shell a test gets when it passes none. The shell is the host's, which the SDK doesn't carry, so reaching this
 * one says where the real one is: `startShell()` from `@abuddy/testing/harness` binds it
 */
const noShell = new Proxy({} as HostShell, {
  get: (_target, member) => {
    throw new Error(`This test has no app shell (it reached for its ${String(member)}): start one with startShell() from @abuddy/testing/harness, which binds the frontend host itself`);
  },
});

/**
 * The settings a test gets when it passes none. Reaching them without saying what they are is a test that can't know
 * what it asserts, so this says where the usable one is rather than answering with an empty document.
 */
const noSettings = new Proxy({} as SettingsPort, {
  get: (_target, member) => {
    throw new Error(`This test has no settings (it reached for their ${String(member)}): pass settings: fakeSettings({ … }) from @abuddy/sdk/testing to startFeTestRuntime`);
  },
});

/** What a test overrides of the frontend host; everything else stands in as unusable, since a test that reaches it means the test is wrong */
export interface FeTestRuntimeOptions extends Partial<FeHostRuntime> {}

/**
 * Binds a frontend host for this test file, and returns the function that forgets it again:
 *
 *     const stopFeTestRuntime = startFeTestRuntime();
 *     afterAll(stopFeTestRuntime);
 *
 * Nothing is registered unless the test passes it, so an extension that registers itself on import
 * shows up as one this returned.
 */
export function startFeTestRuntime(options: FeTestRuntimeOptions = {}): () => void {
  bindFeHost({
    application: options.application ?? noShell,
    secrets: options.secrets ?? ({} as never),
    settings: options.settings ?? noSettings,
    client: options.client ?? ({} as never),
    packs: options.packs ?? noFrontends,
  });
  return stopFeTestRuntime;
}

/** Forgets the frontend host `startFeTestRuntime` bound, so the next test file binds its own */
export function stopFeTestRuntime(): void {
  unbindFeHost();
}
