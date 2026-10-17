import fs from 'node:fs';
import path from 'node:path';
import { spawn, type SpawnOptions } from 'node:child_process';
import type { CompilerInstallation } from './compiler-installation.ts';

/** Each Windows worker owns a kernel job; POSIX workers retain their existing process group. */
export function spawnCompilerWorker(
  compiler: Pick<CompilerInstallation, 'bin' | 'executable'>,
  args: readonly string[],
  options: SpawnOptions & { cwd: string; env: NodeJS.ProcessEnv },
  workspace: string,
) {
  if (process.platform !== 'win32') return spawn(compiler.executable, [...args], options);
  if (!Array.isArray(options.stdio) || options.stdio.length !== 4 || options.stdio[3] !== 'ipc') {
    throw new Error('Windows compiler launch requires stdio and one IPC channel');
  }
  if ([compiler.executable, ...args].some(value => value.includes('\0'))) throw new TypeError('Compiler arguments cannot contain NUL');
  const systemRoot = process.env.SystemRoot;
  if (!systemRoot) throw new Error('Windows compiler launch requires SystemRoot');
  const temporary = path.join(workspace, 'job');
  fs.mkdirSync(temporary, { recursive: true });
  // Quote argv for CreateProcessW; PowerShell never interprets the worker's command line.
  const quote = (value: string) => '"' + value.replace(/(\\*)"/g, (_, slashes: string) => slashes.repeat(2) + '\\"').replace(/(\\+)$/, '$1$1') + '"';
  const configuration = path.join(temporary, 'launch.json');
  fs.writeFileSync(configuration, JSON.stringify({ executable: compiler.executable,
    commandLine: [compiler.executable, ...args].map(quote).join(' '), cwd: options.cwd, parentPid: process.pid }));
  // The requested environment travels separately from PowerShell's own modified environment.
  // Match Node's case-insensitive Windows key selection and private IPC variables.
  const environment: NodeJS.ProcessEnv = { ...options.env, NODE_CHANNEL_FD: '3', NODE_CHANNEL_SERIALIZATION_MODE: options.serialization ?? 'json' };
  const seen = new Set<string>();
  const entries = Object.keys(environment).sort().filter(key => {
    if (environment[key] === undefined || seen.has(key.toUpperCase())) return false;
    seen.add(key.toUpperCase());
    return true;
  }).map(key => `${key}=${environment[key]}`);
  const bytes = Buffer.from(entries.join('\0') + '\0\0', 'utf16le');
  const size = Buffer.alloc(4);
  size.writeUInt32LE(bytes.length);
  const child = spawn(path.join(systemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
    path.join(path.dirname(compiler.bin), 'compiler-windows.ps1'), '-Configuration', configuration,
  ], { ...options, stdio: [...options.stdio, 'pipe'], windowsHide: true,
    env: { ...options.env, TMP: temporary, TEMP: temporary } });
  const channel = child.stdio[4];
  if (channel && 'end' in channel) {
    // A broken transfer also closes the launcher with failure; don't leave an unhandled pipe error.
    channel.on('error', () => {});
    channel.end(Buffer.concat([size, bytes]));
  }
  return child;
}
