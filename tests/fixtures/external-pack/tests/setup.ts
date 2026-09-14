// Unit tests run the pack's seeds, repositories and systems against an in-memory EARS (@abuddy/testing/harness)
import '#generated/seeders';
import { seedRuntime } from '#generated/seed-runtime';
import { registration } from '#generated/pack-entry';
import { setupPackTests } from '@abuddy/testing/harness';

await setupPackTests({ seedRuntime, registration });
