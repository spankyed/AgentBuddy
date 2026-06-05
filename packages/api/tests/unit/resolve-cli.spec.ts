import { describe, expect, it, vi } from 'vitest'

const execFileMock = vi.hoisted(() => vi.fn())

vi.mock('child_process', () => ({
  execFile: execFileMock,
}))

vi.mock('fs', () => ({
  constants: { X_OK: 1 },
  accessSync: vi.fn(() => {
    throw new Error('not executable')
  }),
  existsSync: vi.fn(() => false),
  readdirSync: vi.fn(() => []),
}))

describe('resolveCliPath', () => {
  it.each([
    ['copilot', 'copilot'],
    ['claude-code', 'claude'],
    ['codex', 'codex'],
    ['gh', 'gh'],
  ] as const)('falls back to the %s executable name', async (provider, executable) => {
    vi.resetModules()
    execFileMock.mockImplementation((_cmd, _args, _opts, callback) => {
      callback(Object.assign(new Error('not found'), { code: 'ENOENT' }))
    })

    const { resolveCliPath } = await import('@/core/shared/resolve-cli')

    await expect(resolveCliPath(provider)).resolves.toBe(executable)
  })
})
