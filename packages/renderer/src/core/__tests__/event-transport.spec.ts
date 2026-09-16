import { afterEach, expect, it, vi } from 'vitest';

const mutate = vi.hoisted(() => vi.fn<(event: unknown) => Promise<void>>());
const toastError = vi.hoisted(() => vi.fn());

vi.mock('@/core/trpc', () => ({ trpc: { bus: { send: { mutate } } } }));
vi.mock('@/core/toast', () => ({ globalToast: { error: toastError } }));

const { eventTransport } = await import('@/core/event-transport');

const unhandled = vi.fn();
afterEach(() => { process.off('unhandledRejection', unhandled); });

it('reports a rejected send without an unhandled rejection or the payload', async () => {
  process.on('unhandledRejection', unhandled);
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  mutate.mockRejectedValue(new Error('socket closed'));

  eventTransport.sendIncoming({ type: 'SAVE_NOTE', systemId: 'notes', body: 'secret text' });
  await new Promise(resolve => setTimeout(resolve, 0));

  expect(unhandled).not.toHaveBeenCalled();
  expect(consoleError).toHaveBeenCalledWith("[event-transport] Couldn't send SAVE_NOTE to notes:", expect.any(Error));
  expect(toastError).toHaveBeenCalledWith("Couldn't send SAVE_NOTE to notes");
  expect(JSON.stringify([consoleError.mock.calls, toastError.mock.calls])).not.toContain('secret text');
});
