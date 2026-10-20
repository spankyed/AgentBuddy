import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { liveInGroup, linuxGroupRunning } from '../../src/build/compiler-process-group.ts';

// Fields after the name: state, ppid, pgrp, then the rest of /proc/<pid>/stat
const stat = (pid: number, name: string, state: string, pgrp: number) => `${pid} (${name}) ${state} 1 ${pgrp} ${pgrp} 0 -1 4194560 0 0`;

it('reads state and group after the last parenthesis, whatever the process name holds', () => {
  expect(liveInGroup(stat(10, 'esbuild', 'S', 42), 42)).toBe(true);
  expect(liveInGroup(stat(11, 'node worker (1) x', 'R', 42), 42)).toBe(true);
  expect(liveInGroup(stat(12, ') 42 R', 'S', 7), 42)).toBe(false);
  expect(liveInGroup(stat(13, 'esbuild', 'S', 7), 42)).toBe(false);
});

it('does not count a zombie or a dead task as running', () => {
  expect(liveInGroup(stat(10, 'esbuild', 'Z', 42), 42)).toBe(false);
  expect(liveInGroup(stat(10, 'esbuild', 'X', 42), 42)).toBe(false);
  expect(liveInGroup('', 42)).toBe(false);
});

it('scans /proc for live members, skipping entries that are not processes or that vanish mid-scan', () => {
  const proc = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-proc-'));
  try {
    const write = (entry: string, content: string) => { fs.mkdirSync(path.join(proc, entry)); fs.writeFileSync(path.join(proc, entry, 'stat'), content); };
    write('100', stat(100, 'node', 'S', 7));
    write('101', stat(101, 'esbuild', 'Z', 42));
    fs.mkdirSync(path.join(proc, '102'));
    write('self', stat(103, 'shell', 'R', 42));
    expect(linuxGroupRunning(42, proc)).toBe(false);
    write('104', stat(104, 'esbuild', 'S', 42));
    expect(linuxGroupRunning(42, proc)).toBe(true);
  } finally { fs.rmSync(proc, { recursive: true, force: true }); }
});
