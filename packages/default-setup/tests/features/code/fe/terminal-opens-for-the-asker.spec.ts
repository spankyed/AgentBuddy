// A terminal opens in the window that asked for it, and appears in every window's list.
//
// Those are two jobs and they used to be one event. `terminal.CREATED` is a broadcast — `broadcastToPlugin`
// reaches every window — and its handler both grew the list *and* routed the terminal into this window's
// panel and ran the pending command. So opening a terminal in one window opened it in all of them, and ran
// there a command nobody had typed there.
//
// The id is minted when the terminal is created, so nothing the asker sent could identify it; a keyed slot
// cannot settle this one. What settles it is addressing: the news stays a broadcast and the answer is
// replied to the asker (`code/be/features/terminal.ts`), which is the same split the database system makes
// between `TRANSACTION_RESULT` and `DATABASE_REFRESH`.
import { beforeEach, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';

const sendToSystem = vi.hoisted(() => vi.fn());
vi.mock('#generated/events.ts', () => ({ sendToSystem }));

const parent = vi.hoisted(() => ({ updateParentState: vi.fn(), addTabToParent: vi.fn(), getParentContext: vi.fn(() => null), sendEventToParent: vi.fn() }));
vi.mock('#features/code/fe/utils/parent-communication.ts', () => parent);

// The pool renders a terminal with xterm, which reaches `self` as it loads; nothing here draws anything
vi.mock('#features/code/fe/utils/terminal-pool.ts', () => ({ terminalPool: { dispose: vi.fn(), syncProcesses: vi.fn() } }));
vi.mock('#features/code/fe/utils/terminal-events.ts', () => ({
  terminalEventBus: { emit: vi.fn(), clearOutput: vi.fn(), prunePersistedOutputs: vi.fn() },
}));

const { terminalState } = await import('#features/code/fe/features/terminal/state.ts');

const aTerminal = (id: string) => ({ id, title: id, cwd: '/tmp' }) as never;

const terminals = (actor: ReturnType<typeof createActor>) =>
  (actor.getSnapshot().context as { terminals: Array<{ id: string }> }).terminals.map((t) => t.id);

beforeEach(() => {
  sendToSystem.mockReset();
  parent.updateParentState.mockReset();
  parent.addTabToParent.mockReset();
});

/** A window that has asked for a terminal, so its `pendingTarget`/`pendingCommand` are set */
function asked() {
  const actor = createActor(terminalState).start();
  actor.send({ type: 'terminal.CREATE', command: 'echo hi' });
  return actor;
}

it('grows every window\'s list on the news, and opens nothing', () => {
  // This window never asked — it is any other window, which the broadcast also reaches
  const other = createActor(terminalState).start();

  other.send({ type: 'terminal.CREATED', data: aTerminal('t-1') });

  expect(terminals(other), 'the list is what every window takes from it').toEqual(['t-1']);
  expect(parent.updateParentState, 'and nothing is routed into a panel nobody asked about').not.toHaveBeenCalled();
  expect(parent.addTabToParent).not.toHaveBeenCalled();
});

it('opens the terminal for the window that asked', () => {
  const actor = asked();

  actor.send({ type: 'terminal.OPENED', data: aTerminal('t-1') });

  expect(parent.updateParentState).toHaveBeenCalledWith(expect.anything(), { panelTerminalId: 't-1' });
  // The command this window typed is run in the terminal this window asked for, and nowhere else
  expect(sendToSystem).toHaveBeenCalledWith('code', expect.objectContaining({ type: 'terminal.TERMINAL_INPUT', terminalId: 't-1', data: 'echo hi\n' }));
});

it('opens it as a tab when that is what was asked for', () => {
  const actor = createActor(terminalState).start();
  actor.send({ type: 'terminal.CREATE', target: 'tab' });

  actor.send({ type: 'terminal.OPENED', data: aTerminal('t-2') });

  expect(parent.addTabToParent).toHaveBeenCalled();
  expect(parent.updateParentState, 'a tab, so not also the panel').not.toHaveBeenCalled();
});

/**
 * The pair, stated as one case: the window that asked does both jobs, and it does the opening *once*.
 *
 * Both events reach the asker — it is a window like any other, so the broadcast lands there too — and the
 * danger of splitting one handler in two is that the asker now adds the terminal twice or opens it twice.
 */
it('leaves the asker with one entry and one open', () => {
  const actor = asked();

  actor.send({ type: 'terminal.CREATED', data: aTerminal('t-3') });
  actor.send({ type: 'terminal.OPENED', data: aTerminal('t-3') });

  expect(terminals(actor)).toEqual(['t-3']);
  expect(parent.updateParentState).toHaveBeenCalledTimes(1);
});
