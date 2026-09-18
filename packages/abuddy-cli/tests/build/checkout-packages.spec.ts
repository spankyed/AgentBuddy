// A pack compiles and runs against the @abuddy packages' dist. When that dist belongs to a checkout it is
// built on demand, so the commands that load it (abuddy test, abuddy dev) ask the checkout to refresh it.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkoutFor } from '../../src/build/checkout-packages';
import { REPO_ROOT } from '../helpers/published-packages';

const tmpDirs: string[] = [];
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function pack(link: 'checkout' | 'installed' | 'none'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-checkout-for-'));
  tmpDirs.push(dir);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'link-pack', type: 'module' }));
  const modules = path.join(dir, 'node_modules', '@abuddy');
  if (link === 'checkout') {
    fs.mkdirSync(modules, { recursive: true });
    fs.symlinkSync(path.join(REPO_ROOT, 'packages', 'abuddy-sdk'), path.join(modules, 'sdk'), 'dir');
  } else if (link === 'installed') {
    // What npm delivers: a real directory under node_modules, with no checkout above it
    fs.mkdirSync(path.join(modules, 'sdk'), { recursive: true });
    fs.writeFileSync(path.join(modules, 'sdk', 'package.json'), JSON.stringify({
      name: '@abuddy/sdk', version: '0.1.0', exports: { './package.json': './package.json' },
    }));
  }
  return dir;
}

describe('the checkout a pack\'s @abuddy packages come from', () => {
  it('is the AgentBuddy checkout when the packages are linked to one', () => {
    expect(checkoutFor(pack('checkout'))).toBe(REPO_ROOT);
  });

  it('is nothing when the packages are installed, so a command has nothing to build', () => {
    expect(checkoutFor(pack('installed'))).toBeUndefined();
  });

  it('is nothing when the pack has no @abuddy/sdk at all', () => {
    expect(checkoutFor(pack('none'))).toBeUndefined();
  });

  // Asking only the SDK would miss this: the linked package's dist is built on demand and would be used
  // stale, with nothing saying so
  it('is the checkout when any one package is linked to it, not only @abuddy/sdk', () => {
    const dir = pack('installed');
    const modules = path.join(dir, 'node_modules', '@abuddy');
    fs.symlinkSync(path.join(REPO_ROOT, 'packages', 'abuddy-ui'), path.join(modules, 'ui'), 'dir');
    expect(checkoutFor(dir)).toBe(REPO_ROOT);
  });
});
