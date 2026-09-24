// The one format for "who sent this" in a diagnostic. Four places report an undeliverable message — the bus's two
// drops, `receiveClientEvent`, and the shell's two — and they read the same because they all append this. The cases
// below are the four shapes an envelope can be in, so a rendering site is never the place a combination is first
// thought about.
import { describe, expect, it } from 'vitest';
import { senderSuffix } from '../../src/events/index.ts';

describe('senderSuffix', () => {
  // An action: the pack that ran it, and which action it was
  it('names the pack and what within it made the send', () => {
    expect(senderSuffix({ from: 'default-setup', via: 'action:Summarise Thread' }))
      .toBe(' by "default-setup" (action:Summarise Thread)');
  });

  // A pack's own code, sending through its `#generated/events`
  it('names the pack alone when that is all there is', () => {
    expect(senderSuffix({ from: 'memo-pack' })).toBe(' by "memo-pack"');
  });

  // Nothing stamps `via` without `from` today, and the format still has to read as a sentence if something does
  it('names the source alone, unquoted, when there is no pack', () => {
    expect(senderSuffix({ via: 'action:Summarise Thread' })).toBe(' by action:Summarise Thread');
  });

  // `reportError` sends for a caller that is neither. A drop then reads the same minus the clue — it does not say
  // a sender is missing, because no sender is the ordinary case rather than a fault.
  it('is empty when the message says neither', () => {
    expect(senderSuffix({})).toBe('');
    expect(senderSuffix({ from: '', via: '' })).toBe('');
  });
});
