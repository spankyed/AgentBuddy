import { createRequire } from 'node:module';
import { assertSourceResolution } from '@abuddy/host/build/source-resolution';

// Imported before anything that loads @abuddy/sdk: a runner started without the @abuddy/source
// condition would run a checkout's stale dist. Installed packages pass.
assertSourceResolution(createRequire(import.meta.url).resolve, 'The Playwright runner');
