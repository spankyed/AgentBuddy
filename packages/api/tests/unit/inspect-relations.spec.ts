// scripts/db/inspect-relations.ts: --incoming / --outgoing pick the directions it prints
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

// The script imports the host's stores: point them at a throwaway data dir
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-inspect-relations-'));
process.env.ABUDDY_ENV = 'test';
process.env.ABUDDY_USER_DATA_DIR = dataDir;
await import('@/setup/sdk-host-init');
const { parseInspectArgs, visualizeGraph } = await import('../../scripts/db/inspect-relations');
const { tx } = await import('@abuddy/sdk/ears');
const { clearMemory } = await import('@abuddy/host/ears');

afterAll(() => fs.rmSync(dataDir, { recursive: true, force: true }));

describe('parseInspectArgs', () => {
  it('shows both directions by default or with both flags', () => {
    expect(parseInspectArgs(['-e', 'Note-a'])).toMatchObject({ entityId: 'Note-a', showIncoming: true, showOutgoing: true });
    expect(parseInspectArgs(['--incoming', '--outgoing'])).toMatchObject({ showIncoming: true, showOutgoing: true });
  });

  it('shows only the direction a flag names', () => {
    expect(parseInspectArgs(['--incoming'])).toMatchObject({ showIncoming: true, showOutgoing: false });
    expect(parseInspectArgs(['--outgoing', '--depth', '2'])).toMatchObject({ showIncoming: false, showOutgoing: true, depth: 2 });
  });
});

describe('visualizeGraph', () => {
  beforeEach(() => {
    clearMemory();
    tx('Note-a' as never, true).put('title', 'A');
    tx('Note-b' as never, true).put('title', 'B');
    tx('Note-c' as never, true).put('title', 'C');
    // a → b → c
    tx('Note-a' as never).link('contains' as never, 'Note-b');
    tx('Note-b' as never).link('contains' as never, 'Note-c');
  });

  const print = (args: string[]) => {
    const options = parseInspectArgs(args);
    const lines: string[] = [];
    visualizeGraph(options.entityId!, options.depth, options, (line) => lines.push(line));
    return lines.join('\n');
  };

  it('prints both directions without a flag', () => {
    const output = print(['--entity', 'Note-b']);
    expect(output).toContain('Outgoing (1)');
    expect(output).toContain('- [Note] Note-c');
    expect(output).toContain('Incoming (1)');
    expect(output).toContain('- [Note] Note-a');
  });

  it('--incoming prints only incoming relations', () => {
    const output = print(['--entity', 'Note-b', '--incoming']);
    expect(output).toContain('Incoming (1)');
    expect(output).not.toContain('Outgoing');
    expect(output).not.toContain('Note-c');
  });

  it('--outgoing prints only outgoing relations, following them to --depth', () => {
    const output = print(['--entity', 'Note-a', '--outgoing', '--depth', '2']);
    expect(output).not.toContain('Incoming');
    expect(output).toContain('📦 [Note] Note-b "B"');
    expect(output).toContain('- [Note] Note-c');
  });
});
