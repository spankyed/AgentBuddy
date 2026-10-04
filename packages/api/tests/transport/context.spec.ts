// The context is one connection's identity, and the only thing it has to get right is being different per
// connection. The tRPC WebSocket adapter calls `createContext` once per socket and every operation on that
// socket awaits the same result, so "once per call here" is "once per connection" out there — which means this
// file is where the per-connection property is actually checked, and the stamping onto a message
// (`bus-send-sender.spec.ts`) is a separate question that passes a context in by hand.
import { describe, expect, it } from 'vitest';
import { createContext } from '@/transport/context';

describe('createContext', () => {
  it('names the connection', () => {
    expect(createContext().client).toMatch(/^c-/);
  });

  /**
   * The case that matters, and the one a constant minter fails. Two connections sharing an id would make every
   * reply go to whichever of them asked last, which is the bug this whole mechanism exists to prevent — and it
   * would look like it worked for as long as only one window was open.
   */
  it('gives every connection a different name', () => {
    const ids = Array.from({ length: 50 }, () => createContext().client);
    expect(new Set(ids).size, 'no two connections share an id').toBe(ids.length);
  });
});
