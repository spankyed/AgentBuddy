/**
 * Unit test for `isPlanFileWrite` — the auto-approval predicate used
 * by chat.ts to skip the approval dialog for plan-file writes during
 * plan phase.
 *
 * The path matcher is structural (anchored path-segment match, not a
 * substring scan) so crafted paths like `.claude/plans-evil/…` can't
 * bypass the auto-approval gate. These tests pin that contract.
 */

import { isPlanFileWrite } from '../../src/actions/claude-code/_helpers/auto-approve'

describe('isPlanFileWrite', () => {
  // ─── Happy paths ───────────────────────────────────────────────────

  it('relative path directly under .claude/plans/ → true', () => {
    expect(isPlanFileWrite('Write', { file_path: '.claude/plans/001-foo.md' })).toBe(true)
  })

  it('absolute path under a project .claude/plans/ → true', () => {
    expect(isPlanFileWrite('Write', {
      file_path: '/Users/me/proj/.claude/plans/001-foo.md',
    })).toBe(true)
  })

  it('nested subdirectory under .claude/plans/ → true', () => {
    expect(isPlanFileWrite('Write', {
      file_path: '/Users/me/proj/.claude/plans/sub/nested/doc.md',
    })).toBe(true)
  })

  it('uppercase .MD extension → true (case-insensitive)', () => {
    expect(isPlanFileWrite('Write', { file_path: '.claude/plans/001-foo.MD' })).toBe(true)
  })

  // ─── Structural-match regression guards ───────────────────────────

  it('prefix-only match like .claude/plans-evil/ → false', () => {
    expect(isPlanFileWrite('Write', { file_path: '.claude/plans-evil/001-foo.md' })).toBe(false)
  })

  it('path that contains `.claude/plans/` as a substring but not a segment → false', () => {
    expect(isPlanFileWrite('Write', { file_path: 'not-a.claude/plansfile.md' })).toBe(false)
  })

  it('`plans/foo.md` without the .claude prefix → false', () => {
    expect(isPlanFileWrite('Write', { file_path: 'plans/001-foo.md' })).toBe(false)
  })

  // ─── Non-md files ──────────────────────────────────────────────────

  it('.txt extension → false', () => {
    expect(isPlanFileWrite('Write', { file_path: '.claude/plans/001-foo.txt' })).toBe(false)
  })

  it('no extension → false', () => {
    expect(isPlanFileWrite('Write', { file_path: '.claude/plans/001-foo' })).toBe(false)
  })

  it('.md.bak double-extension → false', () => {
    expect(isPlanFileWrite('Write', { file_path: '.claude/plans/001-foo.md.bak' })).toBe(false)
  })

  // ─── Wrong tool ────────────────────────────────────────────────────

  it('Edit tool targeting a plan file → false (explicit modifications still prompt)', () => {
    expect(isPlanFileWrite('Edit', { file_path: '.claude/plans/001-foo.md' })).toBe(false)
  })

  it('Bash tool → false', () => {
    expect(isPlanFileWrite('Bash', { file_path: '.claude/plans/001-foo.md' })).toBe(false)
  })

  it('empty tool name → false', () => {
    expect(isPlanFileWrite('', { file_path: '.claude/plans/001-foo.md' })).toBe(false)
  })

  // ─── Malformed input ───────────────────────────────────────────────

  it.each([
    [null, 'null'],
    [undefined, 'undefined'],
    ['bare string', 'string'],
    [42, 'number'],
    [{}, 'object without file_path'],
    [{ file_path: null }, 'null file_path'],
    [{ file_path: 42 }, 'non-string file_path'],
    [{ file_path: ['arr'] }, 'array file_path'],
  ] as const)('malformed input %p (%s) → false', (input, _description) => {
    expect(isPlanFileWrite('Write', input)).toBe(false)
  })
})
