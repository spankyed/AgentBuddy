// Unit tests run the pack's seeds and repositories against an in-memory EARS (@abuddy/testing/harness)
import '#generated/seeders';
import { seedRuntime } from '#generated/seed-runtime';
import { setupPackTests } from '@abuddy/testing/harness';

await setupPackTests({ seedRuntime });
