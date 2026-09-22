// How loudly the app shows a system error. `fatal` replaces the window, `error` raises a toast, and
// `diagnostic` does neither: it is still logged and still recorded, so a pack test that leaves one
// fails, but it does not interrupt someone who can do nothing about it — a send to a plugin no pack
// declares is for whoever wrote the send, and it is already in the Logs plugin.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor, type Actor } from 'xstate';
import { createShellMachine, type ShellMachine } from '../../../src/fe/index.ts';
import { fakeShell, plugin } from './fakes.ts';

let app: Actor<ShellMachine>;
let toast: ReturnType<typeof fakeShell>['notify'];
// The error page, which replaces the window
let showErrorPage: ReturnType<typeof fakeShell>['notify']['errorPage'];

beforeEach(() => {
  const shell = fakeShell({ plugins: [plugin('notes')] });
  toast = shell.notify;
  showErrorPage = shell.notify.errorPage;
  app = createActor(createShellMachine(shell.options), {
    systemId: 'host/application',
    input: { ownsLastActivePlugin: false },
  }).start();
});
afterEach(() => app.stop());

const systemError = (severity: 'diagnostic' | 'error' | 'fatal') =>
  app.send({ type: 'SYSTEM_ERROR', message: `a ${severity}`, severity } as never);

describe('SYSTEM_ERROR', () => {
  it('raises a toast for an ordinary error', () => {
    systemError('error');
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(showErrorPage).not.toHaveBeenCalled();
  });

  it('replaces the window for a fatal one', () => {
    systemError('fatal');
    expect(showErrorPage).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  // The whole point of the severity: the bus reports a dropped send with it
  it('shows the user nothing for a diagnostic', () => {
    systemError('diagnostic');
    expect(toast.error).not.toHaveBeenCalled();
    expect(showErrorPage).not.toHaveBeenCalled();
  });
});
