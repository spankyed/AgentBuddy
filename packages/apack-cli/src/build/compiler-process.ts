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
  const systemRoot = process.env.SystemRoot;
  if (!systemRoot) throw new Error('Windows compiler launch requires SystemRoot');
  const temporary = path.join(workspace, 'job');
  fs.mkdirSync(temporary, { recursive: true });
  // Quote argv for CreateProcessW; PowerShell never interprets the worker's command line.
  const quote = (value: string) => '"' + value.replace(/(\\*)"/g, (_, slashes: string) => slashes.repeat(2) + '\\"').replace(/(\\+)$/, '$1$1') + '"';
  const configuration = path.join(temporary, 'launch.json');
  fs.writeFileSync(configuration, JSON.stringify({ executable: compiler.executable,
    commandLine: [compiler.executable, ...args].map(quote).join(' '), cwd: options.cwd, parentPid: process.pid }));
  return spawn(path.join(systemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
    path.join(path.dirname(compiler.bin), 'compiler-windows.ps1'), '-Configuration', configuration,
  ], { ...options, windowsHide: true, env: { ...options.env, TMP: temporary, TEMP: temporary } });
}
