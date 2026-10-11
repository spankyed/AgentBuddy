// An install asked for from outside the app (`apack://install?pack=…&source=…`): the window passes the platform's
// parameters on, and the app reads them and asks the Packs system.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '@apackdev/sdk/events';
import { startFeTestRuntime } from '@apackdev/sdk/testing';
import { installFromProtocol, packInstallRequest } from '../../../../src/features/packs/fe/install-url.ts';

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
    installFromProtocol({ pack: 'fixture/pack@v1.0.0', sha256: 'A'.repeat(64) });

    expect(sent).toHaveBeenCalledWith({ to: 'host/packs', from: 'host', call: expect.any(String), event: { type: 'INSTALL_PACK', packSlug: 'fixture/pack@v1.0.0', source: undefined, sha256: 'a'.repeat(64) } });
  });

  it.each(['', 'invalid', 'a'.repeat(63)])('refuses an invalid checksum rather than installing without its pin: %s', sha256 => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    installFromProtocol({ pack: 'fixture/pack@v1.0.0', sha256 });
    expect(sent).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('asks for nothing when the link names no pack', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    installFromProtocol({ source: 'github' });

    expect(sent).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
