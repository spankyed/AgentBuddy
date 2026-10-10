// A pack compiles and runs against the @abuddy packages' dist. When that dist belongs to a checkout it is
// built on demand, so the commands that load it (abuddy test, abuddy dev) ask the checkout to refresh it.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkoutFor } from '../../src/build/checkout-packages';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';

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
});

/**
 * Which entry points bring a checkout's packages up to date. `abuddy dev` rebuilds the pack on every
 * file change through `build()`, and the freshness check reads every source of all five packages — so
 * the check belongs to the command a user runs, not to the function the watch loop calls.
 */
describe('the commands that refresh a checkout before loading its packages', () => {
  const source = (file: string) => fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'src', file), 'utf-8');

  it.each(['commands/test.ts', 'commands/dev.ts', 'commands/build.ts'])('%s asks the checkout to build', (file) => {
    expect(source(file)).toContain('ensureCheckoutPackages(');
  });

  it('asks once per abuddy build, not once per rebuild in abuddy dev', () => {
    const build = source('commands/build.ts');
    // buildCommand is what the CLI dispatches; build() is what dev's watch loop calls
    const command = build.indexOf('export async function buildCommand');
    const reusable = build.indexOf('export async function build(');
    expect(command).toBeGreaterThan(-1);
    expect(reusable).toBeGreaterThan(command);
    expect(build.slice(command, reusable)).toContain('ensureCheckoutPackages(');
    expect(build.slice(reusable)).not.toContain('ensureCheckoutPackages(');
  });

  it('dispatches abuddy build to the command that refreshes, not to the bare build', () => {
    expect(source('index.ts')).toContain("'build':      async () => (await import('./commands/build')).buildCommand,");
  });

  // npm start declares no packages:ensure of its own: it reaches the check by building the built-in pack
  // with `abuddy build`. Nothing else holds that link, so a build:dev that stopped being an abuddy build
  // would drop npm start's only door without failing anything.
  it('leaves npm start reaching the check through abuddy build, its only door on that path', () => {
    const script = (pkg: string, name: string): string =>
      JSON.parse(fs.readFileSync(path.join(REPO_ROOT, pkg, 'package.json'), 'utf-8')).scripts[name] ?? '';

    const prebuild = script('.', 'prebuild:be:dev');
    expect(prebuild).toContain('build:dev -w @app/default-setup');
    expect(prebuild, 'npm start needs exactly one door: abuddy build ensures, so this must not also')
      .not.toContain('packages:ensure');
    expect(script('packages/default-setup', 'build:dev')).toMatch(/^abuddy build\b/);
  });
});

describe('the checkout a pack\'s @abuddy packages come from', () => {
  // Asking only the SDK would miss this: the linked package's dist is built on demand and would be used
  // stale, with nothing saying so
  it('is the checkout when any one package is linked to it, not only @abuddy/sdk', () => {
    const dir = pack('installed');
    const modules = path.join(dir, 'node_modules', '@abuddy');
    fs.symlinkSync(path.join(REPO_ROOT, 'packages', 'abuddy-ui'), path.join(modules, 'ui'), 'dir');
    expect(checkoutFor(dir)).toBe(REPO_ROOT);
  });
});
