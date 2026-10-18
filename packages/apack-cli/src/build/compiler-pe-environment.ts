import fs from 'node:fs';
import { win32 as path } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parsePeApiSets, type PeApiSet } from './compiler-pe-api-sets.ts';
import { readPeSection } from './compiler-pe-libraries.ts';

export interface CompilerPeEnvironment {
  readonly systemDirectory: string;
  readonly windowsDirectory: string;
  readonly safeSearch: boolean;
  readonly devOverride: boolean;
  readonly knownDlls: readonly string[];
  readonly apiSets: readonly PeApiSet[];
  readonly schema: string;
}

// Capture the public report API before user preloads can replace it. Node's excludeEnv option is
// per Environment, so a synchronous try/finally does not change another worker's reporting policy.
const getReport = process.report.getReport.bind(process.report);
const reportOptions = process.report as NodeJS.ProcessReport & { excludeEnv: boolean };

/** Reports and realpath.native can spell the same Windows file with different namespace prefixes. */
export function pePath(file: string): string {
  const normalized = path.normalize(file);
  if (normalized.startsWith('\\\\?\\UNC\\')) return '\\\\' + normalized.slice(8);
  return normalized.startsWith('\\\\?\\') ? normalized.slice(4) : normalized;
}

function readPeReport() {
  const exclude = reportOptions.excludeEnv;
  let report: { sharedObjects?: string[]; environmentVariables?: NodeJS.ProcessEnv };
  try { reportOptions.excludeEnv = false; report = getReport(); }
  finally { reportOptions.excludeEnv = exclude; }
  if (!report.sharedObjects || !report.environmentVariables) throw new Error('Cannot read Windows compiler loader state');
  return { libraries: report.sharedObjects, environment: report.environmentVariables };
}

function peSystemDirectory(libraries: readonly string[]) {
  const ntdll = libraries.find(file => path.basename(file).toLowerCase() === 'ntdll.dll');
  if (!ntdll) throw new Error('Cannot locate the Windows system directory from loaded ntdll');
  return path.dirname(pePath(fs.realpathSync.native(ntdll)));
}

/** Query the OS for full paths; Node 23 reports use a fixed, undersized module filename buffer. */
export function readPeLoaderMetadata(systemDirectory: string, pid = process.pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Windows loader metadata requires a positive process id');
  const script = `$ErrorActionPreference = 'Stop'
$target = [System.Diagnostics.Process]::GetProcessById(${pid})
try { $libraries = @($target.Modules | ForEach-Object { $_.FileName }) }
finally { $target.Dispose() }
$session = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey('SYSTEM\\CurrentControlSet\\Control\\Session Manager')
try {
  $known = $session.OpenSubKey('KnownDLLs')
  try {
    $dlls = @($known.GetValueNames() | ForEach-Object { $known.GetValue($_) } | Where-Object { $_ -is [string] -and $_ -match '\\.dll$' })
    $options = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey('SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options')
    try { $devOverride = $null -ne $options -and $options.GetValue('DevOverrideEnable', 0) -eq 1 }
    finally { if ($null -ne $options) { $options.Dispose() } }
    $json = @{ libraries = $libraries; safeSearch = ($session.GetValue('SafeDllSearchMode', 1) -ne 0); devOverride = $devOverride; knownDlls = $dlls } | ConvertTo-Json -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $output = [Console]::OpenStandardOutput()
    $output.Write($bytes, 0, $bytes.Length)
  } finally { $known.Dispose() }
} finally { $session.Dispose() }`;
  let metadata: { libraries: string[]; safeSearch: boolean; devOverride: boolean; knownDlls: string[] };
  try {
    const text = execFileSync(path.join(systemDirectory, 'WindowsPowerShell/v1.0/powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { encoding: 'utf8', timeout: 5_000, maxBuffer: 1024 * 1024, windowsHide: true });
    metadata = JSON.parse(text.replace(/^\ufeff/, ''));
    if (typeof metadata.safeSearch !== 'boolean' || typeof metadata.devOverride !== 'boolean' || !Array.isArray(metadata.knownDlls)
      || metadata.knownDlls.some(name => typeof name !== 'string' || path.basename(name) !== name)
      || !Array.isArray(metadata.libraries) || !metadata.libraries.length
      || metadata.libraries.some(file => typeof file !== 'string' || !path.isAbsolute(file)
        || !fs.statSync(file, { throwIfNoEntry: false })?.isFile())) throw new Error('Invalid metadata');
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { signal?: string };
    throw new Error(`Cannot read Windows compiler loader policy: ${failure.code ?? failure.signal ?? 'invalid OS metadata'}`);
  }
  return metadata;
}

export function readPeProcessState() {
  const report = readPeReport();
  const metadata = readPeLoaderMetadata(peSystemDirectory(report.libraries));
  return { libraries: metadata.libraries, environment: report.environment };
}

/** Only OS metadata is queried; no pack image is passed to a loader or helper. */
export function capturePeLibraryEnvironment(): CompilerPeEnvironment {
  const systemDirectory = peSystemDirectory(readPeReport().libraries);
  const { safeSearch, devOverride, knownDlls } = readPeLoaderMetadata(systemDirectory);
  const schema = path.join(systemDirectory, 'apisetschema.dll');
  const section = readPeSection(fs.readFileSync(schema), '.apiset');
  if (!section) throw new Error('Windows API-set schema has no .apiset section');
  return Object.freeze({ systemDirectory, windowsDirectory: path.dirname(systemDirectory), safeSearch, devOverride,
    knownDlls: Object.freeze(knownDlls.map(name => name.toLowerCase())), schema, apiSets: parsePeApiSets(section) });
}

export function peLibraryPaths(env: NodeJS.ProcessEnv): string[] {
  const key = Object.keys(env).sort().find(key => key.toUpperCase() === 'PATH');
  return key && env[key] ? env[key]!.split(';').filter(Boolean).map(directory => directory.replace(/^"(.*)"$/, '$1')) : [];
}
