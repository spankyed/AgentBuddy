import { contentRuntime } from '#generated/content-runtime.ts';
import { registration } from '#generated/pack-entry.ts';
import { setupPackTests } from '@abuddy/testing/harness';

await setupPackTests({ contentRuntime, registration });
