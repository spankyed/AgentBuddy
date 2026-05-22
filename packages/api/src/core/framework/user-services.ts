import * as path from 'path';
import * as fs from 'fs';
import { promisify } from 'util';
import { execFile as execFileCb } from 'child_process';
import * as esbuild from 'esbuild';
import * as tar from 'tar';
import { getServicesPath, ensureDirectoryExists } from '@/core/helpers/paths';
import { settingsQueries, settingsCommands } from '@/systems/settings/repository';
import type { ServiceEntry } from '@/systems/settings/types';

const execFile = promisify(execFileCb);

// ── Built-in service names (collision guard) ────────────────────────

const BUILTIN_KEYS = new Set([
  'logger', 'llm', 'emitter', 'database', 'prompt', 'action', 'library',
  'browser', 'repository', 'settings', 'textStream', 'chat', 'artifact',
  'brain', 'media', 'cli', 'filesystem', 'threads', 'codex', 'modelClient', 'openaiAuth',
]);

// ── Registry CRUD ───────────────────────────────────────────────────

export function getServiceRegistry(): Record<string, ServiceEntry> {
  return settingsQueries.getInternalSettings()?.services ?? {};
}

export function updateServiceEntry(key: string, patch: Partial<ServiceEntry>): void {
  const registry = getServiceRegistry();
  const existing = registry[key] ?? {} as ServiceEntry;
  settingsCommands.updateSettings('internal', null, ['services', key], { ...existing, ...patch });
}

export function removeServiceEntry(key: string): void {
  const registry = { ...getServiceRegistry() };
  delete registry[key];
  settingsCommands.updateSettings('internal', null, ['services'], registry);
}

// ── GitHub URL parsing ──────────────────────────────────────────────

function parseGitHubUrl(url: string): { owner: string; repo: string } {
  // Support: github.com/owner/repo, https://github.com/owner/repo, github:owner/repo
  const cleaned = url
    .replace(/^https?:\/\//, '')
    .replace(/^github\.com\//, '')
    .replace(/^github:/, '')
    .replace(/\.git$/, '')
    .replace(/\/$/, '');

  const parts = cleaned.split('/');
  if (parts.length < 2) throw new Error(`Invalid GitHub URL: ${url}`);
  return { owner: parts[0], repo: parts[1] };
}

// ── Config extraction ───────────────────────────────────────────────

interface BuddyConfig {
  key: string;
  displayName: string;
  description?: string;
  main: string;
  config?: Record<string, any>;
}

async function readBuddyConfig(serviceDir: string): Promise<BuddyConfig> {
  // Find config file
  const candidates = ['buddy.config.ts', 'buddy.config.js', 'buddy.config.json'];
  let configPath: string | null = null;
  for (const c of candidates) {
    const p = path.join(serviceDir, c);
    if (fs.existsSync(p)) { configPath = p; break; }
  }
  if (!configPath) throw new Error('Missing buddy.config.ts in service repo');

  if (configPath.endsWith('.json')) {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }

  // Bundle TS/JS config via esbuild to CJS, then eval
  const result = await esbuild.build({
    entryPoints: [configPath],
    bundle: true,
    write: false,
    format: 'cjs',
    target: 'es2022',
    platform: 'neutral',
  });
  const code = result.outputFiles[0].text;
  // CJS output assigns to module.exports — provide a module object and extract
  const mod = { exports: {} as any };
  const fn = new Function('module', 'exports', code);
  fn(mod, mod.exports);
  const config = mod.exports.default || mod.exports;

  if (!config?.key) throw new Error('buddy.config must have a "key" field');
  if (!config?.displayName) throw new Error('buddy.config must have a "displayName" field');
  if (!config?.main) throw new Error('buddy.config must have a "main" field');

  return config;
}

// ── Install ─────────────────────────────────────────────────────────

export async function installService(githubUrl: string): Promise<string> {
  const { owner, repo } = parseGitHubUrl(githubUrl);
  const servicesDir = getServicesPath();
  ensureDirectoryExists(servicesDir);

  const tempDir = path.join(servicesDir, `_installing_${Date.now()}`);
  ensureDirectoryExists(tempDir);

  try {
    // 1. Download tarball
    const tarballUrl = `https://github.com/${owner}/${repo}/archive/refs/heads/main.tar.gz`;
    const response = await fetch(tarballUrl);
    if (!response.ok) throw new Error(`Failed to download: ${response.status} ${response.statusText}`);

    // 2. Extract — GitHub tarballs have a top-level dir like "repo-main/"
    const buffer = Buffer.from(await response.arrayBuffer());
    const tarballPath = path.join(tempDir, 'archive.tar.gz');
    fs.writeFileSync(tarballPath, buffer);
    await tar.extract({ file: tarballPath, cwd: tempDir, strip: 1 });
    fs.unlinkSync(tarballPath);

    // 3. Read config
    const config = await readBuddyConfig(tempDir);

    // 4. Validate
    if (BUILTIN_KEYS.has(config.key)) {
      throw new Error(`Service key "${config.key}" conflicts with a built-in service`);
    }
    const existing = getServiceRegistry();
    if (existing[config.key]) {
      throw new Error(`Service "${config.key}" is already installed`);
    }

    // 5. Move to final location
    const finalDir = path.join(servicesDir, config.key);
    if (fs.existsSync(finalDir)) fs.rmSync(finalDir, { recursive: true });
    fs.renameSync(tempDir, finalDir);

    // 6. npm install (if package.json exists)
    const pkgJson = path.join(finalDir, 'package.json');
    if (fs.existsSync(pkgJson)) {
      await execFile('npm', ['install', '--production', '--no-audit', '--no-fund'], {
        cwd: finalDir,
        timeout: 120_000,
      });
    }

    // 7. esbuild compile entry point
    const distDir = path.join(finalDir, 'dist');
    ensureDirectoryExists(distDir);
    await esbuild.build({
      entryPoints: [path.join(finalDir, config.main)],
      outfile: path.join(distDir, 'index.js'),
      bundle: true,
      format: 'cjs',
      target: 'es2022',
      platform: 'node',
      external: ['esbuild'], // don't bundle esbuild itself
    });

    // 8. Register
    updateServiceEntry(config.key, {
      source: githubUrl,
      displayName: config.displayName,
      description: config.description,
      enabled: true,
      config: config.config,
      configValues: buildDefaultConfigValues(config.config),
      status: 'ok',
      installedAt: Date.now(),
    });

    invalidateServiceCache();
    return config.key;
  } catch (err) {
    // Cleanup temp dir on failure
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true });
    throw err;
  }
}

function buildDefaultConfigValues(schema?: Record<string, any>): Record<string, any> {
  if (!schema) return {};
  const values: Record<string, any> = {};
  for (const [key, field] of Object.entries(schema)) {
    if (field?.default !== undefined) values[key] = field.default;
  }
  return values;
}

// ── Uninstall ───────────────────────────────────────────────────────

export async function uninstallService(key: string): Promise<void> {
  // Clear require cache
  const compiled = path.join(getServicesPath(), key, 'dist', 'index.js');
  try { delete require.cache[require.resolve(compiled)]; } catch { /* not cached */ }

  // Remove directory
  const serviceDir = path.join(getServicesPath(), key);
  if (fs.existsSync(serviceDir)) fs.rmSync(serviceDir, { recursive: true });

  // Remove from registry
  removeServiceEntry(key);
  invalidateServiceCache();
}

// ── Runtime loading ─────────────────────────────────────────────────

export function loadAllUserServices(builtinServices: any): Record<string, any> {
  const registry = getServiceRegistry();
  const loaded: Record<string, any> = {};

  for (const [key, entry] of Object.entries(registry)) {
    if (!entry.enabled || entry.status !== 'ok') continue;
    try {
      const compiled = path.join(getServicesPath(), key, 'dist', 'index.js');
      if (!fs.existsSync(compiled)) continue;

      // Clear cache to pick up changes on reload
      try { delete require.cache[require.resolve(compiled)]; } catch { /* ok */ }

      const mod = require(compiled);
      const factory = mod.default || mod;
      loaded[key] = typeof factory === 'function'
        ? factory(builtinServices, entry.configValues ?? {})
        : factory;
    } catch (err) {
      console.error(`[user-services] Failed to load service "${key}":`, err);
      // Mark as errored in registry (fire-and-forget, don't block other services)
      try {
        updateServiceEntry(key, {
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      } catch { /* ignore nested error */ }
    }
  }

  return loaded;
}

// ── Cache invalidation ──────────────────────────────────────────────

let _cachedMerged: any = null;

export function getServicesWithUser(builtinServices: any): any {
  if (!_cachedMerged) {
    _cachedMerged = { ...builtinServices, ...loadAllUserServices(builtinServices) };
  }
  return _cachedMerged;
}

export function invalidateServiceCache(): void {
  _cachedMerged = null;
}
