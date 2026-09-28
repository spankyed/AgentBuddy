import { seedRuntime } from '#generated/seed-runtime.ts';
import { registration } from '#generated/pack-entry.ts';
import { setupPackTests } from '@abuddy/testing/harness';

await setupPackTests({ seedRuntime, registration });
