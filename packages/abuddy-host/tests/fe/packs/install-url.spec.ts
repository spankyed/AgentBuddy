// An install asked for from outside the app (`abuddy://install?pack=…&source=…`): the window passes the platform's
// parameters on, and the app reads them and asks the Packs system.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '@abuddy/sdk/events';
import { startFeTestRuntime } from '@abuddy/sdk/testing';
import { installFromProtocol, packInstallRequest } from '../../../src/fe/packs/install-url.ts';

const sent = vi.fn<(message: Message) => void>();
afterAll(startFeTestRuntime({ client: { send: sent } }));
beforeEach(() => sent.mockClear());

describe('packInstallRequest', () => {
  it('takes the pack a deep link names, with the source it gives', () => {
    expect(packInstallRequest({ pack: 'awesome-pack' })).toEqual({ packSlug: 'awesome-pack', source: undefined });
    expect(packInstallRequest({ pack: 'my-pack', source: 'github' })).toEqual({ packSlug: 'my-pack', source: 'github' });
  });

  it('is null for parameters that name no pack, saying so', () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(packInstallRequest({})).toBeNull();

    expect(warned).toHaveBeenCalledWith(expect.stringContaining('Missing pack parameter'));
    warned.mockRestore();
  });
});

describe('installFromProtocol', () => {
  it('asks the Packs system to install what the link names', () => {
    installFromProtocol({ pack: 'my-pack', source: 'github' });

    expect(sent).toHaveBeenCalledWith({ to: 'host/packs', event: { type: 'INSTALL_PACK', packSlug: 'my-pack', source: 'github' } });
  });

  it('asks for nothing when the link names no pack', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    installFromProtocol({ source: 'github' });

    expect(sent).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
