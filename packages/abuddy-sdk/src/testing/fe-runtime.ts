// The frontend host a pack's unit tests run against. bindFeHost is the renderer's, bound once at boot
// and never taken back; a test binds and unbinds per file, so that lifecycle lives here, next to
// startTestRuntime, rather than a pack reaching for the host's own unbind.
import { bindFeHost, unbindFeHost, type FeHostRuntime, type FePackRegistryView } from '../runtime/fe-host.ts';

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

/** What a test overrides of the frontend host; everything else stands in as unusable, since a test that reaches it means the test is wrong */
export interface FeTestRuntimeOptions extends Partial<FeHostRuntime> {}

/**
 * Binds a frontend host for this test file, and returns the function that forgets it again:
 *
 *     const stopFeTestRuntime = startFeTestRuntime();
 *     afterAll(stopFeTestRuntime);
 *
 * Nothing is registered unless the test passes it, so a contribution that registers itself on import
 * shows up as one this returned.
 */
export function startFeTestRuntime(options: FeTestRuntimeOptions = {}): () => void {
  bindFeHost({
    application: options.application ?? ({} as never),
    secrets: options.secrets ?? ({} as never),
    transport: options.transport ?? ({} as never),
    packs: options.packs ?? noFrontends,
  });
  return stopFeTestRuntime;
}

/** Forgets the frontend host `startFeTestRuntime` bound, so the next test file binds its own */
export function stopFeTestRuntime(): void {
  unbindFeHost();
}
