// The @apack/testing bundle inlines @apack/host, so a bundle older than the checkout it came from
// loads and silently tests the previous one. setupPackTests and the Playwright fixture call this check
// first, and it is the only thing standing between that and a green run on yesterday's packages.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertCheckoutPackagesFresh } from '../src/checkout-freshness.ts';
import { CHECKOUT_MARKER, REPO_ROOT, type StaleUnit } from '@apack/host/build/packages-built';

const tmpDirs: string[] = [];
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** A directory that either looks like an apack checkout or like anywhere else */
function root(kind: 'checkout' | 'installed'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-freshness-'));
  tmpDirs.push(dir);
  if (kind === 'checkout') {
    const marker = path.join(dir, CHECKOUT_MARKER);
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    fs.writeFileSync(marker, '// the file whose presence marks a checkout\n');
  }
  return dir;
}

const STALE: StaleUnit[] = [{ workspace: '@apack/sdk', reason: 'its inputs changed since the last successful run' }];
const threw = (): StaleUnit[] => { throw new Error('the layout could not be read'); };

describe('the packages a pack test run loads', () => {
  it('passes when the checkout has built every package from its current sources', () => {
    expect(() => assertCheckoutPackagesFresh({ root: root('checkout'), stalePackages: () => [] })).not.toThrow();
  });

  it('fails when the checkout moved past the build this bundle came from, naming each package and the fix', () => {
    expect(() => assertCheckoutPackagesFresh({ root: root('checkout'), stalePackages: () => STALE }))
      .toThrow(/@apack\/sdk: its inputs changed since the last successful run[\s\S]*npm run packages:ensure/);
  });

  it('says what a stale run would be testing, not just that something is stale', () => {
    expect(() => assertCheckoutPackagesFresh({ root: root('checkout'), stalePackages: () => STALE }))
      .toThrow(/this run would test the previous ones/);
  });

  // An installed package has no checkout above it: its dist is what npm delivered, and nothing can refresh it
  it('is a no-op outside a checkout, however stale the packages would look', () => {
    expect(() => assertCheckoutPackagesFresh({ root: root('installed'), stalePackages: () => STALE })).not.toThrow();
  });

  it('never reads the packages outside a checkout, so an installed pack pays nothing for the check', () => {
    expect(() => assertCheckoutPackagesFresh({ root: root('installed'), stalePackages: threw })).not.toThrow();
  });

  /**
   * A build removes each stamp before rewriting it, so a run beside one sees packages that look unbuilt — and
   * this check runs as a spec file loads, whenever the scheduler happened to start it. So it waits first, as
   * door 6 does, rather than failing about the race.
   */
  it('waits for a build in flight and passes once it has finished', () => {
    let waited = 0;
    let built = false;
    expect(() => assertCheckoutPackagesFresh({
      root: root('checkout'),
      // Stale until the build this waits for finishes, which is what makes the wait the thing under test
      stalePackages: () => (built ? [] : STALE),
      runningBuild: () => ({ pid: 4321, label: '@apack/ui' }),
      waitForBuild: () => { waited += 1; built = true; },
    })).not.toThrow();
    expect(waited, 'it judged without waiting for the build it could see').toBe(1);
  });

  /** The wedge, which is the one worth naming: a holder that outlasted the bound rather than a queue */
  it('names a build still running after the wait', () => {
    expect(() => assertCheckoutPackagesFresh({
      root: root('checkout'),
      stalePackages: () => STALE,
      runningBuild: () => ({ pid: 4321, label: '@apack/ui' }),
      waitForBuild: () => undefined,
    })).toThrow(/longer than the wait allows \(pid 4321, @apack\/ui\)[\s\S]*Wait for that build/);
  });

  it('asks for the build when none is running, so a stale checkout still names the fix', () => {
    expect(() => assertCheckoutPackagesFresh({
      root: root('checkout'), stalePackages: () => STALE, runningBuild: () => undefined,
    })).toThrow(/npm run packages:ensure/);
  });

  // The check used to swallow this into a pass, which left no signal when it stopped working
  it('surfaces a failure to read the checkout rather than passing the run', () => {
    expect(() => assertCheckoutPackagesFresh({ root: root('checkout'), stalePackages: threw }))
      .toThrow('the layout could not be read');
  });

  // Whether this checkout is fresh right now is a property of the working tree, not of the check, so
  // this compares the two calls rather than asserting either outcome
  it('reads this checkout by default, so the fixture and the harness need pass nothing', () => {
    const verdict = (options?: Parameters<typeof assertCheckoutPackagesFresh>[0]): string | null => {
      try {
        assertCheckoutPackagesFresh(options);
        return null;
      } catch (err) {
        return (err as Error).message;
      }
    };
    expect(verdict()).toEqual(verdict({ root: REPO_ROOT }));
  });
});
