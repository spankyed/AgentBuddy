// Unit tests run the pack's content, repositories and systems against an in-memory EARS (@apackdev/testing/harness)
import { contentRuntime } from '#generated/content-runtime.ts';
import { registration } from '#generated/pack-entry.ts';
import { setupPackTests } from '@apackdev/testing/harness';

await setupPackTests({ contentRuntime, registration });
