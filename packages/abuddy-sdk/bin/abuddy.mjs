#!/usr/bin/env node
// The CLI is TypeScript source. Register the SDK's own tsx here instead of relying on a
// `tsx` binary on PATH, which pack projects don't have.
import { register } from 'tsx/esm/api';

register();
await import('../src/cli/index.ts');
