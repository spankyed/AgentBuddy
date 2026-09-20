// A pack's seeds may reference what a pack it depends on seeded, so it has to seed after it. Discovery
// order is readdirSync's, which is alphabetical at best and says nothing about what depends on what.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { packSeedOrder } from '../../src/packs/pack-discovery.ts';

const pack = (id: string, ...deps: string[]) => ({
  id,
  dependencies: deps.length ? Object.fromEntries(deps.map((d) => [d, '^1.0.0'])) : undefined,
});
const ids = (packs: Array<{ id: string }>) => packs.map((p) => p.id);

/** What the warning said: no app is bound in this spec, so the logger writes to the console */
function captureWarnings(): () => string {
  const lines: string[] = [];
  vi.spyOn(console, 'warn').mockImplementation((...args) => void lines.push(args.join(' ')));
  return () => lines.join('\n');
}
afterEach(() => vi.restoreAllMocks());

describe('the order external packs seed in', () => {
  it('puts a pack after the one it depends on, whichever way round they were found', () => {
    expect(ids(packSeedOrder([pack('b', 'a'), pack('a')]))).toEqual(['a', 'b']);
    expect(ids(packSeedOrder([pack('a'), pack('b', 'a')]))).toEqual(['a', 'b']);
  });

  it('follows a chain all the way down', () => {
    expect(ids(packSeedOrder([pack('c', 'b'), pack('b', 'a'), pack('a')]))).toEqual(['a', 'b', 'c']);
  });

  it('seeds a shared dependency once, before both of the packs that name it', () => {
    const order = ids(packSeedOrder([pack('d', 'b', 'c'), pack('b', 'a'), pack('c', 'a'), pack('a')]));

    expect(order).toHaveLength(4);
    expect(order[0]).toBe('a');
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('d'));
    expect(order.indexOf('c')).toBeLessThan(order.indexOf('d'));
  });

  // A built-in pack has already seeded by then, and one that isn't installed was reported at install
  it('ignores a dependency that is not one of the packs given', () => {
    expect(ids(packSeedOrder([pack('b', 'default-setup', 'never-installed'), pack('a')]))).toEqual(['b', 'a']);
  });

  it('leaves packs with nothing between them in the order they were found', () => {
    expect(ids(packSeedOrder([pack('c'), pack('a'), pack('b')]))).toEqual(['c', 'a', 'b']);
  });

  it('still seeds every pack in a cycle, once, and says which packs are in it', () => {
    const warnings = captureWarnings();

    const order = ids(packSeedOrder([pack('a', 'b'), pack('b', 'a'), pack('c')]));

    expect(order.sort()).toEqual(['a', 'b', 'c']);
    expect(warnings()).toContain('a -> b -> a');
  });

  it('is unbothered by a pack that depends on itself', () => {
    captureWarnings();
    expect(ids(packSeedOrder([pack('a', 'a')]))).toEqual(['a']);
  });
});
