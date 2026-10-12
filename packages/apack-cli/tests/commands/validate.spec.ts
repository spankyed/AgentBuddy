import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generatePackFiles } from '@apackdev/sdk/build';
import { resolveDeps } from '../../src/commands/generate';
import { validate, validatePack } from '../../src/commands/validate';

vi.mock('../../src/commands/generate', () => ({ resolveDeps: vi.fn() }));
vi.mock('@apackdev/sdk/build', async importOriginal => ({
  ...await importOriginal<typeof import('@apackdev/sdk/build')>(), generatePackFiles: vi.fn(),
}));

let root: string;
const manifest = { id: 'demo', name: 'Demo', version: '1.0.0' };
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-validation-'));
  fs.writeFileSync(path.join(root, 'apack.json'), JSON.stringify(manifest));
  vi.mocked(resolveDeps).mockResolvedValue({ depTypes: new Map(), depSnapshots: new Map() });
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe('pack authoring validation', () => {
  it('reports failed dependency resolution as incomplete, without running codegen or creating output', async () => {
    vi.mocked(resolveDeps).mockRejectedValue(new Error('Unresolved dependency "base"'));
    const before = fs.readdirSync(root);
    const report = await validatePack(root);
    expect(report).toMatchObject({
      status: 'incomplete', diagnostics: [{ code: 'dependency.unresolved', severity: 'warning', packId: 'demo', path: ['dependencies'] }],
      skippedChecks: [{ check: 'dependencies' }, { check: 'codegen' }],
    });
    expect(generatePackFiles).not.toHaveBeenCalled();
    expect(resolveDeps).toHaveBeenCalledWith(root, undefined, { readOnly: true });
    expect(fs.readdirSync(root)).toEqual(before);
  });

  it('reports a malformed manifest as invalid and skips dependent checks', async () => {
    fs.writeFileSync(path.join(root, 'apack.json'), '{');
    expect(await validatePack(root)).toMatchObject({
      status: 'invalid', diagnostics: [expect.objectContaining({ code: 'manifest.json' })],
      skippedChecks: [{ check: 'feature-files' }, { check: 'dependencies' }, { check: 'codegen' }, { check: 'source-rules' }],
    });
    expect(resolveDeps).not.toHaveBeenCalled();
    expect(generatePackFiles).not.toHaveBeenCalled();
  });

  it('distinguishes complete validation from codegen failure', async () => {
    expect(await validatePack(root)).toMatchObject({ status: 'valid', diagnostics: [], skippedChecks: [] });
    vi.mocked(generatePackFiles).mockImplementation(() => { throw new Error('Missing export'); });
    expect(await validatePack(root)).toMatchObject({
      status: 'invalid', diagnostics: [{ code: 'codegen.failed', severity: 'error', message: 'Missing export' }],
      skippedChecks: [{ check: 'remaining-codegen' }],
    });
  });

  it.each(['text', 'json'])('renders an incomplete %s report and exits 2 without claiming validity', async format => {
    vi.mocked(resolveDeps).mockRejectedValue(new Error('Offline'));
    vi.spyOn(process, 'cwd').mockReturnValue(root);
    const output = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
    await expect(validate(format === 'json' ? ['--json'] : [])).rejects.toThrow('exit');
    expect(exit).toHaveBeenCalledWith(2);
    const text = output.mock.calls.map(args => args.join(' ')).join('\n');
    expect(text).not.toContain('Pack is valid');
    if (format === 'json') {
      expect(output).toHaveBeenCalledTimes(1);
      expect(JSON.parse(text)).toEqual(await validatePack(root));
    } else {
      expect(text).toContain('Validation incomplete');
      expect(text).toContain('codegen');
    }
  });
});
