// What `@abuddy/testing/harness` resolves to in an AgentBuddy checkout when the process lacks the
// @abuddy/source condition: the harness would load the checkout's @abuddy/sdk dist, a different (and
// stale) instance from the source the pack's code runs on.
export const setupPackTests: never = undefined as never;
export const seedPack: never = undefined as never;
export const resetTestData: never = undefined as never;
export const takeSystemErrors: never = undefined as never;
export const startApp: never = undefined as never;
export const mockService: never = undefined as never;
export const mockInference: never = undefined as never;

throw new Error(
  "@abuddy/testing/harness resolves to an AgentBuddy checkout's source, which needs the @abuddy/source condition. " +
  "Add it to the pack's vitest.config.ts: resolve: { conditions: ['@abuddy/source', ...defaultServerConditions] } (and ssr.resolve).",
);
