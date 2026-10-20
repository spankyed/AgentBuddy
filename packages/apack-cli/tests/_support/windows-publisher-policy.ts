import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readPeSystemDirectory } from '../../src/build/compiler-pe-environment.ts';

interface PolicyEntry {
  folder: 'v1' | 'v2' | 'policy';
  identity: string;
  manifest: string;
  catalogSha256: string;
}

/** Every global assembly has a fresh identity and one cleanup owner; no trust store is changed. */
export function createWindowsPublisherPolicyFixture(root: string) {
  const assemblies = path.join(root, 'assemblies');
  const powershell = path.join(readPeSystemDirectory(), 'WindowsPowerShell/v1.0/powershell.exe');
  execFileSync(powershell, ['-NoProfile', '-File', fileURLToPath(new URL('./windows-publisher-policy.ps1', import.meta.url)),
    '-Root', assemblies], { cwd: root, timeout: 45_000 });
  const prepared = JSON.parse(fs.readFileSync(path.join(assemblies, 'prepared.json'), 'utf8').replace(/^\ufeff/, '')) as {
    name: string; token: string; entries: PolicyEntry[];
  };
  if (!/^apack\.fixture\.publisher\.a[a-f0-9]{32}$/.test(prepared.name)) throw new Error('Invalid fixture ownership');
  const executable = path.join(root, 'assembly-cache.exe');
  execFileSync('cl.exe', ['/nologo', '/MT', '/EHsc', fileURLToPath(new URL('./windows-publisher-policy.cpp', import.meta.url)),
    '/Fo' + path.join(root, 'assembly-cache.obj'), '/Fe' + executable, '/link', 'ole32.lib'], { cwd: root, timeout: 15_000 });
  const cache = (operation: 'query' | 'install' | 'uninstall', entry: PolicyEntry) => {
    const result = spawnSync(executable, [operation, operation === 'install' ? entry.manifest : entry.identity], {
      cwd: root, encoding: 'utf8', timeout: 10_000,
    });
    if (operation === 'query' && result.status === 1 && result.stdout.includes('query: 80070490')) return false;
    if (result.error || result.status !== 0) throw new Error(`Fixture ${operation} failed: ${result.error?.message ?? result.stdout + result.stderr}`);
    return true;
  };
  for (const entry of prepared.entries) if (cache('query', entry)) throw new Error(`Fixture identity already exists: ${entry.identity}`);
  const attempted: PolicyEntry[] = [];
  return {
    name: prepared.name,
    token: prepared.token,
    install(folder: PolicyEntry['folder']) {
      const entry = prepared.entries.find(entry => entry.folder === folder);
      if (!entry) throw new Error(`Missing fixture assembly: ${folder}`);
      attempted.push(entry);
      cache('install', entry);
    },
    dispose() {
      const errors: unknown[] = [];
      for (const entry of attempted.splice(0).reverse()) {
        try {
          if (cache('query', entry)) cache('uninstall', entry);
          if (cache('query', entry)) throw new Error(`Fixture remains installed: ${entry.identity}`);
        } catch (error) { errors.push(error); }
      }
      if (errors.length) throw new AggregateError(errors, 'Could not remove owned publisher-policy fixtures');
    },
  };
}
