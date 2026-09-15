// db:clearSettings (scripts/db/destroy-settings.ts): a dry run unless --force
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

// The script's database module opens the app's stores: point them at a throwaway data dir
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-destroy-settings-'));
process.env.ABUDDY_ENV = 'test';
process.env.ABUDDY_USER_DATA_DIR = dataDir;
const { clearSettings } = await import('../../scripts/db/destroy-settings');
const { tx, getEntitiesOfType } = await import('@abuddy/sdk/ears');
const { clearMemory } = await import('@abuddy/host/ears');

afterAll(() => fs.rmSync(dataDir, { recursive: true, force: true }));

const settingsIds = () => getEntitiesOfType('Settings').sort();

describe('clearSettings', () => {
  beforeEach(() => {
    clearMemory();
    tx('Settings-app' as never, true).put('entityType', 'Settings').put('data', { general: {}, plugins: {} });
    tx('Settings-other' as never, true).put('label', 'secrets').put('data', {});
    tx('Note-keep' as never, true).put('title', 'not a setting');
  });

  it('lists the rows and destroys nothing by default', () => {
    const lines: string[] = [];
    const result = clearSettings({ force: false }, (line) => lines.push(line));

    expect(result.destroyed).toBe(false);
    expect(result.rows.map((r) => r.id).sort()).toEqual(['Settings-app', 'Settings-other']);
    expect(result.rows.find((r) => r.id === 'Settings-app')?.dataKeys).toEqual(['general', 'plugins']);
    expect(result.rows.find((r) => r.id === 'Settings-other')?.label).toBe('secrets');
    expect(settingsIds()).toEqual(['Settings-app', 'Settings-other']);

    const output = lines.join('\n');
    expect(output).toContain('Would destroy 2 Settings row(s)');
    expect(output).toContain('Settings-app');
    expect(output).toContain('label: secrets');
    expect(output).toContain('--force');
  });

  it('destroys every Settings row with force, and nothing else', () => {
    const lines: string[] = [];
    const result = clearSettings({ force: true }, (line) => lines.push(line));

    expect(result.destroyed).toBe(true);
    expect(result.rows).toHaveLength(2);
    expect(settingsIds()).toEqual([]);
    expect(getEntitiesOfType('Note')).toEqual(['Note-keep']);
    expect(lines.join('\n')).toContain('Destroyed 2 Settings row(s)');
  });

  it('reports when there is nothing to destroy', () => {
    clearMemory();
    const lines: string[] = [];
    expect(clearSettings({ force: true }, (line) => lines.push(line))).toEqual({ rows: [], destroyed: false });
    expect(lines.join('\n')).toContain('No Settings rows found');
  });
});
