// How a diagnostic names who sent a message.
//
// `senderSuffix` is the one format, so every place that reports an undeliverable message reads the same and a
// field added to the sender reaches all of them at once. The cases below are the four shapes an envelope can be
// in, so a rendering site is never where a combination is first thought about.
//
// That a field added to `Message` is noticed at all is guarded where it can be lost — the `Required<Message>`
// sample in `api/tests/transport/bus-send-sender.spec.ts`, which stops compiling until the new field is named.
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

  // `reportError` sends for a caller that is a source rather than a pack, so this shape is reachable
  it('names the source alone, unquoted, when there is no pack', () => {
    expect(senderSuffix({ via: 'action:Summarise Thread' })).toBe(' by action:Summarise Thread');
  });

  // A drop then reads the same minus the clue: it does not say a sender is missing, because no sender is
  // ordinary rather than a fault
  it('is empty when the message says neither', () => {
    expect(senderSuffix({})).toBe('');
    expect(senderSuffix({ from: '', via: '' })).toBe('');
  });
});
