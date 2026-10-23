// services.runHistory: one implementation over two record stores — the app's on disk, a test's in memory — so every
// case runs against both, and the test double can't drift from what the app runs
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import type { RecordStore } from '@apackdev/ears/lmdb';
import type { RunHistory, TNodeId, TNodeInput } from '@apackdev/sdk/services';
import { _memoryRecords } from '@apackdev/sdk/testing';
import { openRunHistoryStore } from '../../src/database/open.ts';
import { createRunHistory } from '../../src/services/run-history.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'run-history-'));
const open: RecordStore[] = [];
afterEach(() => { for (const store of open.splice(0)) store.close(); });
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const STORES: Record<string, () => RunHistory> = {
  'on disk': () => {
    const store = openRunHistoryStore(path.join(fs.mkdtempSync(path.join(root, 'case-')), 'run-history'));
    open.push(store);
    return createRunHistory(store);
  },
  'in memory': () => createRunHistory(_memoryRecords()),
};

/** Adds a node under `parentId` and returns its id */
function node(history: RunHistory, fields: Partial<TNodeInput> & Pick<TNodeInput, 'tNodeType'>): TNodeId {
  const id = history.newId();
  history.add({ id, label: id, status: 'active', startedAt: Date.now(), ...fields });
  return id;
}

describe.each(Object.keys(STORES))('the run history %s', (where) => {
  const fresh = STORES[where];

  it('builds a tree with each node once, under its own parent', () => {
    const history = fresh();
    const session = node(history, { tNodeType: 'flow' });
    const event = node(history, { tNodeType: 'event', parentId: session });
    const s1 = node(history, { tNodeType: 'step', parentId: event });
    const s2 = node(history, { tNodeType: 'step', parentId: s1 });
    const s3 = node(history, { tNodeType: 'step', parentId: s2 });
    const shape = (tree: { id: string; children: unknown[] }): unknown => [tree.id, (tree.children as typeof tree[]).map(shape)];
    // A chain, not a fan: each node appears once, under the node it ran under
    expect(shape(history.tree(event)!)).toEqual([event, [[s1, [[s2, [[s3, []]]]]]]]);
    expect(history.get(s3)?.rootId).toBe(session);
  });

  it('lists a node\'s children in the order they began, and pages them', () => {
    const history = fresh();
    const parent = node(history, { tNodeType: 'flow' });
    const children = Array.from({ length: 4 }, () => node(history, { tNodeType: 'event', parentId: parent }));
    expect(history.findChildren(parent).map((child) => child.id)).toEqual(children);
    expect(history.findChildren(parent, { limit: 2, cursor: children[1] }).map((child) => child.id)).toEqual(children.slice(2));
    expect(history.findChildren(parent, { reverse: true, limit: 1 }).map((child) => child.id)).toEqual([children[3]]);
  });

  it('finds flow runs newest first, of one flow or of every flow', () => {
    const history = fresh();
    const session = node(history, { tNodeType: 'flow', flowId: 'Flow-root' });
    const first = node(history, { tNodeType: 'flow', flowId: 'Flow-a', parentId: session });
    node(history, { tNodeType: 'step', flowId: 'Flow-a', parentId: first });
    const second = node(history, { tNodeType: 'flow', flowId: 'Flow-b', parentId: session });
    expect(history.findRuns({ flowId: 'Flow-a' }).map((run) => run.id)).toEqual([first]);
    expect(history.findRuns().map((run) => run.id)).toEqual([second, first, session]);
    // What a record carries only to be found by is not part of the node
    expect(Object.keys(history.get(first)!)).not.toContain('runOf');
  });

  it('marks every node still active as stopped', () => {
    const history = fresh();
    const session = node(history, { tNodeType: 'flow' });
    const done = node(history, { tNodeType: 'step', parentId: session, status: 'completed' });
    history.stopActive();
    expect(history.get(session)).toMatchObject({ status: 'stopped', completedAt: expect.any(Number) });
    expect(history.get(done)?.status).toBe('completed');
  });

  it('drops a node whose parent it does not hold, and ignores an update to one it does not hold', () => {
    const history = fresh();
    const orphan = node(history, { tNodeType: 'step', parentId: 'TNode-missing' });
    expect(history.get(orphan)).toBeUndefined();
    history.update('TNode-missing', { status: 'completed' });
    expect(history.get('TNode-missing')).toBeUndefined();
  });

  it('bounds a long result once, however often the node is written after', () => {
    const history = fresh();
    const step = node(history, { tNodeType: 'flow' });
    history.update(step, { result: { text: 'x'.repeat(20_000) } });
    history.update(step, { status: 'completed' });
    history.stopActive();
    const text = (history.get(step)!.result as { text: { value: unknown; _truncated?: boolean } }).text;
    expect(text._truncated).toBe(true);
    expect(typeof text.value).toBe('string');
  });

  it('stores what a step returned in a form the store can hold', () => {
    const history = fresh();
    const step = node(history, { tNodeType: 'flow' });
    history.update(step, { status: 'completed', result: { count: 10n } });
    expect(history.get(step)).toMatchObject({ status: 'completed', result: { count: '10' } });
  });
});

describe('the app\'s run history', () => {
  it('stops what the last session left active as it opens', () => {
    const dir = path.join(fs.mkdtempSync(path.join(root, 'case-')), 'run-history');
    const store = openRunHistoryStore(dir);
    const before = createRunHistory(store);
    const left = node(before, { tNodeType: 'flow' });
    store.close();

    const reopened = openRunHistoryStore(dir);
    open.push(reopened);
    expect(createRunHistory(reopened).get(left)?.status).toBe('stopped');
  });
});
