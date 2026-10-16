import { describe, expect, it, vi } from 'vitest';
import { mockService } from '@apackdev/testing/harness';
import { services, type Services } from '#generated/services.ts';
import { action } from '../../../../src/content/actions/claude-code/cc-command.ts';

describe('metadata lifecycle boundaries', () => {
  it.each(['memory', 'skills', 'permissions'])('does not implicitly start %s discovery without a matching process', async name => {
    const fresh = vi.fn(), write = vi.fn();
    mockService<Services, 'cli'>('cli', { claudeCode: { getHandle: vi.fn(), getMemoryDialog: fresh, listSkills: fresh, getPermissionRules: fresh, setAutoMemory: write, editSkill: write, editPermissionRules: write } as never });
    const result = await action({ command: `cc-${name}` }, services, {} as never, 'metadata-flow');
    expect(result.text).toContain(`cc-${name} start`); expect(result.text).toContain('session hooks'); expect(fresh).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
  });
  it.each([['memory', 'auto off'], ['skills', 'set fixture off'], ['permissions', 'add deny userSettings Bash']])('does not implicitly start %s edit preflight/readback', async (name, text) => {
    const native = vi.fn();
    mockService<Services, 'cli'>('cli', { claudeCode: { getMemoryDialog: native, listSkills: native, getPermissionRules: native, setAutoMemory: native, editSkill: native, editPermissionRules: native } as never });
    const result = await action({ command: `cc-${name}`, text }, services, {} as never, 'metadata-flow');
    expect(result.text).toContain(`cc-${name} start`); expect(native).not.toHaveBeenCalled();
  });
  it.each(['memory', 'skills', 'permissions'])('does not silently replace a different-project %s process', async name => {
    const native = vi.fn();
    mockService<Services, 'cli'>('cli', { claudeCode: { getHandle: vi.fn(() => ({})), getConversation: vi.fn(() => ({ owner: { sessionCwd: '/other' } })), getWorkingDir: vi.fn(() => '/selected'), getMemoryDialog: native, listSkills: native, getPermissionRules: native } as never });
    mockService<Services, 'chat'>('chat', { sendBlockMessage: vi.fn() });
    expect((await action({ command: `cc-${name}`, threadId: 'fixture' }, services, {} as never, 'metadata-flow')).text).toContain(`cc-${name} start`);
    expect(native).not.toHaveBeenCalled();
  });
});
