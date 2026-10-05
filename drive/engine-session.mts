// The session `npm run drive:serve` runs: one Playwright test that holds the app open and answers HTTP.
//
// `.mts`, and that extension is the mechanism — `playwright.config.ts` here collects `**/*.ts`, which does
// not match this file, so a plain `npm run drive` never picks the session up and hangs on it. The same
// trick `abuddy drive --serve` uses inside a pack, where this file is scaffolded once and then kept.
import { drive, driveEngineBody, optionalText, verb } from '@abuddy/testing';

drive('drive engine', driveEngineBody({
  // The size to open at, applied before anything is served. Left out here on purpose: `npm run drive:serve`
  // shows the window, and a session someone is watching is better off at whatever size they gave it.
  // viewport: { width: 1400, height: 900 },
  // This repo's own verbs, merged over @abuddy/testing's core table — which holds what is true of any
  // AgentBuddy app, where these are built out of default-setup's nouns.
  verbs: (session) => ({
    /**
     * A note in one call.
     *
     * The same `/tx` was written out three times in the session that added this, getting the entity name
     * and the defaults right each time. That is what a verb here is for: the engine cannot ship it,
     * because `Note` is a pack's entity and not every app has one.
     */
    '/note': verb({
      method: 'POST',
      fields: { title: optionalText },
      run: ({ title }) => session.tx(
        `return createEntityWithDefaults(EARS.Entity.Note, { title: ${JSON.stringify(title ?? 'Untitled')}, noteType: 'document', content: '' }).id`,
      ),
    }),
  }),
}));
