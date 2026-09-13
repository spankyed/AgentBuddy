// What `@abuddy/testing` resolves to in a checkout when the process lacks the @abuddy/source
// condition (package.json exports). Loading the fixture's source that way would import the
// checkout's @abuddy/sdk dist, which is stale or missing; this names the fix instead. It declares
// the fixture's runtime exports so importers link, and throws as it's evaluated, before them.
export const test: never = undefined as never;
export const expect: never = undefined as never;
export const createTest: never = undefined as never;

throw new Error(
  '@abuddy/testing resolves to an AgentBuddy checkout\'s source, which needs the @abuddy/source condition. ' +
  'In the checkout run Playwright through `npm test -- <args>` (or `node scripts/with-source.mjs playwright test`); ' +
  'in a pack linked to the checkout, run `abuddy test`.',
);
