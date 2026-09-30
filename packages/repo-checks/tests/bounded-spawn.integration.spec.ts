import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { boundedSpawn } from '../../../scripts/lib/bounded-spawn.ts';

/**
 * One case, for the one thing that bites a person hours later: `npm run measure --busy` starts processes
 * that burn a core each, and stopping it has to stop them.
 *
 * It spawns a grandchild that outlives its parent shell, because that is the shape the kill has to reach —
 * `npm run x` is a shell that spawns node that spawns vitest, and killing the child orphans the rest. An
 * earlier version of the burners registered its own signal handlers, which could never run, and three of
 * three survived an interrupt.
 */
describe('stopping a bounded spawn', () => {
  it('kills the whole group, not the process it started', async () => {
    const pidFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bounded-spawn-')), 'grandchild.pid');
    const stop = new AbortController();
    const running = boundedSpawn('sh',
      ['-c', `${process.execPath} -e 'require("fs").writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(()=>{},1000)' & wait`],
      30_000, { signal: stop.signal });

    for (let waited = 0; waited < 5000 && !fs.existsSync(pidFile); waited += 50) {
      await new Promise((resolve) => { setTimeout(resolve, 50); });
    }
    const grandchild = Number(fs.readFileSync(pidFile, 'utf-8'));
    expect(grandchild, 'nothing is proven if the grandchild never started').toBeGreaterThan(0);

    stop.abort();
    await running;
    expect(() => process.kill(grandchild, 0), 'it would be orphaned otherwise').toThrow();
  });
});
