import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMMANDS, runCommand } from '../../src/command-tree';

afterEach(() => { vi.restoreAllMocks(); });

describe('explicit app and pack command routing', () => {
  it('bare pack and pack --help display help without loading an archive command', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const archive = vi.spyOn(COMMANDS.pack!.children!.archive!, 'load');
    await runCommand(['pack']);
    await runCommand(['pack', '--help']);
    expect(archive).not.toHaveBeenCalled();
  });

  it.each(['dev', 'drive', 'test', 'build', 'init', 'clean'])('rejects removed root %s', async name => {
    await expect(runCommand([name])).rejects.toThrow('Unknown command');
  });

  it('routes app and pack doctor to separate handlers with their own arguments', async () => {
    const app = vi.fn(async () => {});
    const pack = vi.fn(async () => {});
    vi.spyOn(COMMANDS.doctor!, 'load').mockResolvedValue(app);
    vi.spyOn(COMMANDS.pack!.children!.doctor!, 'load').mockResolvedValue(pack);
    await runCommand(['doctor', '--channel', 'beta']);
    await runCommand(['pack', 'doctor']);
    expect(app).toHaveBeenCalledWith(['--channel', 'beta']);
    expect(pack).toHaveBeenCalledWith([]);
  });

  it.each(['init-tests', 'build', 'facade-report', 'init'])('does not execute %s when --help is requested', async name => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const scaffold = vi.spyOn((COMMANDS.pack.children as Record<string, { load: () => Promise<(args: string[]) => Promise<void>> }>)[name]!, 'load');
    await runCommand(['pack', name, '--help']);
    expect(scaffold).not.toHaveBeenCalled();
  });

  it('rejects unknown namespace operations rather than archiving', async () => {
    await expect(runCommand(['pack', 'typo'])).rejects.toThrow('apack pack typo');
    await expect(runCommand(['cache', 'typo'])).rejects.toThrow('apack cache typo');
  });
});
