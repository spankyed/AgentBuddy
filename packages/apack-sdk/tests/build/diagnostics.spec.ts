import { describe, expect, it } from 'vitest';
import { packValidation, type PackDiagnostic } from '../../src/build/diagnostics.ts';
import { parseManifest, validateFeatures } from '../../src/build/validate.ts';

describe('pack validation diagnostics', () => {
  it('never declares skipped checks valid, and keeps errors invalid even when checks were skipped', () => {
    const skipped = [{ check: 'codegen', reason: 'Dependency unavailable' }];
    const warning: PackDiagnostic = { code: 'dependency.unresolved', severity: 'warning', path: ['dependencies'], message: 'Unavailable' };
    expect(packValidation().status).toBe('valid');
    expect(packValidation([warning]).status).toBe('valid');
    expect(packValidation([warning], skipped)).toMatchObject({ status: 'incomplete', skippedChecks: skipped });
    expect(packValidation([{ ...warning, severity: 'error' }], skipped).status).toBe('invalid');
  });

  it('preserves the manifest address, owner and schema error independently of text rendering', () => {
    expect(parseManifest({ id: 'demo', name: 'Demo', version: '1.0.0', nonsense: {} })).toMatchObject({
      status: 'invalid',
      diagnostics: [{
        code: 'manifest.unrecognized_keys', severity: 'error', packId: 'demo', path: [],
        message: expect.stringContaining('nonsense'),
      }],
    });
    expect(parseManifest({ id: 'demo', name: 'Demo', version: '1.0.0', features: { test: { system: { entry: 1 } } } }).diagnostics[0])
      .toMatchObject({ code: 'manifest.invalid_type', path: ['features', 'test', 'system', 'entry'] });
  });

  it('addresses a missing source file as a feature declaration', () => {
    expect(validateFeatures('/no-such-pack', { id: 'demo', features: { test: { system: { entry: 'src/system.ts' } } } }))
      .toMatchObject({ status: 'invalid', diagnostics: [{
        code: 'feature.missing-file', severity: 'error', packId: 'demo',
        path: ['features', 'test', 'system', 'entry'], source: 'src/system.ts',
      }] });
  });
});
