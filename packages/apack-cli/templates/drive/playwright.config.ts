import { defineDriveConfig } from '@apackdev/testing/playwright';

// Driving, not testing. Playwright is only the thing that can hold a page open and talk to Electron;
// nothing here asserts, and `apack pack test` never sees this directory.
//
// Every setting is the helper's, so this config follows @apackdev/testing instead of going stale here. Pass
// anything Playwright takes to add to it; the one thing it will not let you undo is ignoring the engine's
// session, which a driving run must never collect.
export default defineDriveConfig();
