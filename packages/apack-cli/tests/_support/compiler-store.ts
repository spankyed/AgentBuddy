// Each test worker captures compiler installations into its own store under this run's directory, so a spec that
// damages an entry can reach neither the developer's shared store nor a sibling worker's — the store lock is per
// process, and worker threads share one.
import os from 'node:os';
import path from 'node:path';
import { threadId } from 'node:worker_threads';

process.env.APACK_COMPILER_STORE = path.join(process.env.APACK_TEST_COMPILER_STORES ?? os.tmpdir(), `${process.pid}-${threadId}`);
