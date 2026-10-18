import fs from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { assertElfLaunchEnvironment, parseElfLoaderDiagnostics } from '../../src/build/compiler-elf-environment.ts';

const diagnostic = `dl_dst_lib="lib/x86_64-linux-gnu"
dl_platform="haswell"
dl_hwcaps_subdirs="x86-64-v4:x86-64-v3:x86-64-v2"
dl_hwcaps_subdirs_active=0x3
x86.cpu_features.isa_1=0x7
path.system_dirs[0x0]="/lib/x86_64-linux-gnu/"
path.system_dirs[0x1]="/usr/lib/x86_64-linux-gnu/"
env[0x0]="PRIVATE_TOKEN=not-a-diagnostic"`;

afterEach(() => vi.restoreAllMocks());

it('reads actual loader tokens, active hardware priorities and configured default paths', () => {
  expect(parseElfLoaderDiagnostics(diagnostic)).toEqual({ libraryToken: 'lib/x86_64-linux-gnu', platformToken: 'haswell',
    hardwareCapabilities: ['x86-64-v3', 'x86-64-v2'], isaLevels: 7,
    systemDirectories: ['/lib/x86_64-linux-gnu/', '/usr/lib/x86_64-linux-gnu/'] });
});

it('decodes the loader string grammar and preserves the absence of a platform token', () => {
  expect(parseElfLoaderDiagnostics(diagnostic.replace('dl_platform="haswell"', 'dl_platform=0x0')
    .replace('lib/x86_64-linux-gnu"', 'lib\\057x86_64-linux-gnu"'))).toMatchObject({
    platformToken: '', libraryToken: 'lib/x86_64-linux-gnu',
  });
});

it('refuses missing required metadata instead of guessing distro paths or exposing environment values', () => {
  expect(() => parseElfLoaderDiagnostics('env[0x0]="PRIVATE_TOKEN=secret"')).toThrow('Cannot read ELF loader diagnostic');
});

it.each(['LD_PRELOAD', 'LD_AUDIT'])('refuses outside %s without probing the requested library', variable => {
  vi.spyOn(fs, 'readFileSync').mockImplementation(() => { throw Object.assign(new Error('absent'), { code: 'ENOENT' }); });
  const physical = vi.spyOn(fs, 'realpathSync');
  expect(() => assertElfLaunchEnvironment({ [variable]: '/outside/init.so' })).toThrow(`${variable} references "/outside/init.so"`);
  expect(physical).not.toHaveBeenCalled();
});

it('checks system-wide preload declarations before worker launch', () => {
  vi.spyOn(fs, 'readFileSync').mockReturnValue('# explanation\n/outside/init.so\n');
  expect(() => assertElfLaunchEnvironment({})).toThrow('/etc/ld.so.preload references "/outside/init.so"');
});
