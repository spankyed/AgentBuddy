import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseManifest } from '../../src/build/validate';

describe('parseManifest', () => {
  it('accepts default-setup abuddy.json', () => {
    const raw = JSON.parse(
      readFileSync(resolve(__dirname, '../../../default-setup/abuddy.json'), 'utf-8'),
    );
    const result = parseManifest(raw);
    expect(result.errors).toEqual([]);
  });

  it('accepts a minimal valid manifest', () => {
    const result = parseManifest({ id: 'test-pack', name: 'Test', version: '0.1.0' });
    expect(result.errors).toEqual([]);
  });

  it('rejects unknown top-level keys', () => {
    const result = parseManifest({
      id: 'test-pack', name: 'Test', version: '0.1.0',
      bogusField: true,
    });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('bogusField');
  });

  it('rejects unknown keys in feature system entries', () => {
    const result = parseManifest({
      id: 'test-pack', name: 'Test', version: '0.1.0',
      features: [{
        id: 'main',
        system: { entry: 'src/system.ts', exportName: 'mainEntry' },
      }],
    });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('exportName');
  });

  it('rejects missing required fields', () => {
    const result = parseManifest({ name: 'Test' });
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects invalid id format', () => {
    const result = parseManifest({ id: 'BadCase', name: 'Test', version: '0.1.0' });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('id');
  });
});
