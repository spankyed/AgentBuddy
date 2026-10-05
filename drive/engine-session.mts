// The session `npm run drive:serve` runs: one Playwright test that holds the app open and answers HTTP.
//
// `.mts`, and that extension is the mechanism — `playwright.config.ts` here collects `**/*.ts`, which does
// not match this file, so a plain `npm run drive` never picks the session up and hangs on it. The same
// trick `abuddy drive --serve` uses inside a pack.
import { drive, driveEngineBody } from '@abuddy/testing';

// The wiring is `driveEngineBody` in @abuddy/testing, where the compiler sees it. The `drive` call stays
// here so Playwright reports the session at this file rather than inside that bundle.
drive('drive engine', driveEngineBody);
