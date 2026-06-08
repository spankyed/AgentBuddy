#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = join(repoRoot, 'diagnostics', `agentbuddy-prod-${stamp}`);
mkdirSync(outDir, { recursive: true });

function run(command, args) {
  return new Promise((resolve) => {
    try {
      execFile(command, args, { timeout: 10000 }, (error, stdout, stderr) => {
        resolve({ command: [command, ...args].join(' '), error: error?.message, stdout, stderr });
      });
    } catch (error) {
      resolve({
        command: [command, ...args].join(' '),
        error: error instanceof Error ? error.message : String(error),
        stdout: '',
        stderr: '',
      });
    }
  });
}

function copyIfExists(source, targetName) {
  if (!existsSync(source)) return false;
  copyFileSync(source, join(outDir, targetName));
  return true;
}

function sha256(file) {
  if (!existsSync(file)) return null;
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function listRecentDiagnosticReports() {
  const dir = join(homedir(), 'Library', 'Logs', 'DiagnosticReports');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(name => /AgentBuddy|abuddy|Electron|node/i.test(name))
    .map(name => {
      const file = join(dir, name);
      const stat = statSync(file);
      return { name, file, mtimeMs: stat.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, 10);
}

const logsDir = join(homedir(), 'Library', 'Logs', 'abuddy');
copyIfExists(join(logsDir, 'main.log'), 'main.log');
copyIfExists(join(logsDir, 'renderer.log'), 'renderer.log');
copyIfExists(join(logsDir, 'app-events.log'), 'app-events.log');
copyIfExists(join(logsDir, 'main.jsonl'), 'main.jsonl');
copyIfExists(join(logsDir, 'renderer.jsonl'), 'renderer.jsonl');

for (const report of listRecentDiagnosticReports()) {
  copyIfExists(report.file, `diagnostic-${report.name}`);
}

const installedApp = '/Applications/AgentBuddy.app';
const installedServer = join(installedApp, 'Contents', 'Resources', 'app', 'packages', 'api', 'dist', 'server.js');
const localServer = join(repoRoot, 'packages', 'api', 'dist', 'server.js');
const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));

const [processes, plist, gitStatus] = await Promise.all([
  run('ps', ['-axo', 'pid,ppid,stat,lstart,command']),
  run('plutil', ['-p', join(installedApp, 'Contents', 'Info.plist')]),
  run('git', ['status', '--short']),
]);

writeFileSync(join(outDir, 'processes.txt'), processes.stdout || processes.stderr || processes.error || '');
writeFileSync(join(outDir, 'installed-info-plist.txt'), plist.stdout || plist.stderr || plist.error || '');
writeFileSync(join(outDir, 'git-status.txt'), gitStatus.stdout || gitStatus.stderr || gitStatus.error || '');

const manifest = {
  createdAt: new Date().toISOString(),
  repoRoot,
  packageVersion: packageJson.version,
  paths: {
    logsDir,
    installedApp,
    installedServer,
    localServer,
  },
  hashes: {
    installedServer: sha256(installedServer),
    localServer: sha256(localServer),
  },
  copiedFiles: readdirSync(outDir).sort(),
};

writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(outDir);
