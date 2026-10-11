// Unit tests run the pack's content, repositories and systems against an in-memory EARS (@apack/testing/harness)
import { contentRuntime } from '#generated/content-runtime.ts';
import { registration } from '#generated/pack-entry.ts';
import { setupPackTests } from '@apack/testing/harness';

await setupPackTests({ contentRuntime, registration });
