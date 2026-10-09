// Unit tests run the pack's seeds, repositories and systems against an in-memory EARS (@abuddy/testing/harness)
import { contentRuntime } from '#generated/content-runtime.ts';
import { registration } from '#generated/pack-entry.ts';
import { setupPackTests } from '@abuddy/testing/harness';

await setupPackTests({ contentRuntime, registration });
