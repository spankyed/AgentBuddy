// A send the API rejects is reported (log and toast) instead of becoming an unhandled rejection, which
// the window would turn into the error page. The report names the event, never its payload.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mutate = vi.hoisted(() => vi.fn<(event: unknown) => Promise<void>>());
const toastError = vi.hoisted(() => vi.fn<(message: string, description?: string) => void>());

vi.mock('@/core/trpc', () => ({ trpc: { bus: { send: { mutate } } } }));
vi.mock('@/core/toast', () => ({ globalToast: { error: toastError, success: vi.fn(), info: vi.fn() } }));

const { eventTransport } = await import('@/core/event-transport');

/** Lets the rejected mutate's handlers run */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

const unhandled = vi.fn();
const logWrite = vi.fn<(entry: Record<string, unknown>) => Promise<void>>();
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mutate.mockReset();
  toastError.mockReset();
  unhandled.mockReset();
  logWrite.mockReset().mockResolvedValue(undefined);
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  process.on('unhandledRejection', unhandled);
  (window as unknown as { electronAPI: unknown }).electronAPI = { rendererLog: { write: logWrite } };
});

afterEach(() => {
  process.off('unhandledRejection', unhandled);
  consoleError.mockRestore();
  delete (window as unknown as { electronAPI?: unknown }).electronAPI;
});

describe('eventTransport.sendIncoming', () => {
  it('sends the event over the API client', async () => {
    mutate.mockResolvedValue(undefined);
    const event = { type: 'EXPORT_DATABASE', systemId: 'database' };

    eventTransport.sendIncoming(event);
    await settle();

    expect(mutate).toHaveBeenCalledWith(event);
    expect(toastError).not.toHaveBeenCalled();
    expect(logWrite).not.toHaveBeenCalled();
  });

  it('reports a rejected send without an unhandled rejection or the payload', async () => {
    mutate.mockRejectedValue(new Error('socket closed'));

    eventTransport.sendIncoming({ type: 'SAVE_NOTE', systemId: 'notes', body: 'secret text' });
    await settle();

    expect(unhandled).not.toHaveBeenCalled();
    expect(logWrite).toHaveBeenCalledTimes(1);
    const entry = logWrite.mock.calls[0][0];
    expect(entry).toMatchObject({ level: 'error', source: 'event-transport' });
    expect(entry.fatal).toBeUndefined();
    expect(entry.message).toBe("Couldn't send SAVE_NOTE to notes: socket closed");
    expect(toastError).toHaveBeenCalledWith('Something went wrong', "Couldn't send SAVE_NOTE to notes: socket closed");
    const reported = JSON.stringify([logWrite.mock.calls, toastError.mock.calls, consoleError.mock.calls]);
    expect(reported).not.toContain('secret text');
  });
});
