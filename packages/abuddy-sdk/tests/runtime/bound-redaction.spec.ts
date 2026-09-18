// The app says what counts as one of its key values, and binding is what hands redaction that check: a pack has no
// way to install one, and an unbound process (tooling, a pack's own tests) masks only the prefixed shapes.
import { afterEach, describe, expect, it } from 'vitest';
import { bindHost, type HostRuntime } from '../../src/runtime/host-runtime.ts';
import { unbindHost } from '../../src/runtime/internals.ts';
import { redactSecretText } from '../../src/utils/redact.ts';
import { testRootEvents } from '../../src/testing/host.ts';

// A Mistral-shaped key: no prefix text can recognise, so it is masked only when the app says it is one of its own
const KEY = 'mF7qWzR2xLpN4vB8cT1yH6kJ0sQ3dG9a';

function bindWithRedaction(known: Set<string>): void {
  bindHost({
    transport: { rootEvents: testRootEvents },
    ears: {} as never,
    packs: {} as never,
    appVersion: '0.0.0-test',
    services: {} as never,
    redaction: { matchesSecret: (text, from, to) => known.has(text.slice(from, to)) },
  } as HostRuntime);
}

afterEach(() => {
  unbindHost();
});

describe('what the bound app says is a secret', () => {
  it('is masked in text once the app is bound, and only then', () => {
    expect(redactSecretText(`key ${KEY}`)).toContain(KEY);

    bindWithRedaction(new Set([KEY]));
    expect(redactSecretText(`key ${KEY}`)).not.toContain(KEY);
    expect(redactSecretText(`key ${KEY}`)).toContain('[redacted]');

    unbindHost();
    expect(redactSecretText(`key ${KEY}`)).toContain(KEY);
  });

  it('is what that app said, not what another value looks like', () => {
    bindWithRedaction(new Set([KEY]));
    const other = 'zZ9yX8wV7uT6sR5qP4oN3mL2kJ1hG0fE';
    expect(redactSecretText(`keys ${KEY} ${other}`)).toContain(other);
  });

  it('leaves an app that declares none masking only the shapes it recognises', () => {
    bindHost({
      transport: { rootEvents: testRootEvents }, ears: {} as never, packs: {} as never,
      appVersion: '0.0.0-test', services: {} as never,
    } as HostRuntime);
    expect(redactSecretText(`key ${KEY}`)).toContain(KEY);
    expect(redactSecretText('key sk-ant-api03-abcdefghij1234567890')).toContain('[redacted]');
  });
});
