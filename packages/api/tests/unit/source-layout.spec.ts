// The API holds transport, process boot and composition only; app runtime lives in @abuddy/host
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '..', '..', 'src');

/** Every file allowed under src/ */
const ALLOWED = [
  // Process entry and the types entry
  'server.ts',
  'types.ts',
  // The declaration of the bundle's built-in pack loaders, which setup/backend.ts passes to the pack loader
  'env.d.ts',
  // Boot and composition
  'setup/backend.ts',
  'setup/config.ts',
  'setup/websocket.ts',
  // tRPC, and the root event bus the app binds as its transport
  'core/router/bus-emitter.ts',
  'core/router/bus-router.ts',
  'core/router/context.ts',
  'core/router/events.ts',
  'core/router/index.ts',
  'core/router/packs-router.ts',
  'core/router/secrets-router.ts',
  'core/router/trpc.ts',
  // Log output to the console and the client
  'core/shared/debug/log-capture.ts',
];

/** Code and docs; anything else under src is left alone */
const SOURCE_FILE = /\.(ts|tsx|mts|cts|js|mjs|cjs|vue|json|md)$/;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return SOURCE_FILE.test(entry.name) ? [path.relative(SRC, full).split(path.sep).join('/')] : [];
  });
}

describe('packages/api/src', () => {
  it('holds only transport, boot and composition', () => {
    expect(sourceFiles(SRC).sort(), 'App runtime belongs in @abuddy/host (a module named by its concern), not the API').toEqual([...ALLOWED].sort());
  });
});
