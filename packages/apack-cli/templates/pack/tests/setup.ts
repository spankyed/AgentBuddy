import { contentRuntime } from '#generated/content-runtime.ts';
import { registration } from '#generated/pack-entry.ts';
import { setupPackTests } from '@apack/testing/harness';

await setupPackTests({ contentRuntime, registration });
