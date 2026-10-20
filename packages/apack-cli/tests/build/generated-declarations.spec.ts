import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { generatedDeclarationProblems } from '../../src/build/generated-declarations.ts';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));

function entries(backend: string, frontend?: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-declaration-entries-'));
  roots.push(root);
  const dir = path.join(root, 'src', '__generated__');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'pack-entry.ts'), backend);
  if (frontend !== undefined) fs.writeFileSync(path.join(dir, 'pack-entry-fe.ts'), frontend);
  return root;
}

describe('generated declaration publication', () => {
  it('checks both generated registrations without executing either entry', () => {
    const root = entries(
      "throw new Error('no activation'); export const registration = { declarationRevision: 'current' } satisfies PackRegistration;",
      "throw new Error('no activation'); export default { declarationRevision: 'current' } satisfies PackFERegistration;",
    );
    expect(generatedDeclarationProblems(root, 'current', true)).toEqual([]);
  });

  it('refuses stale frontend data even when the backend is current', () => {
    const root = entries("export const registration = { declarationRevision: 'current' };", "export default { declarationRevision: 'old' };");
    expect(generatedDeclarationProblems(root, 'current', true)).toEqual([expect.stringContaining('pack-entry-fe.ts')]);
  });

  it('requires a binding identity rather than a comment or unrelated string', () => {
    const root = entries("// declarationRevision: 'current'\nconst other = 'current'; export const registration = {};");
    expect(generatedDeclarationProblems(root, 'current', false)).toEqual([expect.stringContaining('--skip-generate')]);
  });

  it('requires frontend generation only when publishing frontend code', () => {
    const root = entries("export const registration = { declarationRevision: 'current' };");
    expect(generatedDeclarationProblems(root, 'current', false)).toEqual([]);
    expect(generatedDeclarationProblems(root, 'current', true)).toEqual([expect.stringContaining('missing')]);
  });
});
