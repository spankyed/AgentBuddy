// What the envelope carries, and how a diagnostic names who sent it.
//
// `senderSuffix` is the one format, so every place that reports an undeliverable message reads the same and a
// field added to the sender reaches all of them at once. The cases below are the four shapes an envelope can be
// in, so a rendering site is never where a combination is first thought about.
import { describe, expect, it } from 'vitest';
import { senderSuffix, type Message } from '../../src/events/index.ts';

/** Every field of the envelope */
type NamedField = 'to' | 'event' | 'from' | 'via';

/**
 * Fails to compile when `Message` gains a field, and the error names it: the envelope is read by hand in places
 * a type cannot reach — `bus.send`'s input schema strips what it isn't told about — so growing it has to be loud
 * somewhere. When this fires, carry the field wherever a message is passed on, add it to `senderSuffix` if it
 * says who sent the message and to the `bus.send` schema and its spec's `Required<Message>` sample, then name it
 * here. This lives in the SDK because `npm run typecheck` covers these tests and covers no test of the API's.
 */
const _everyFieldIsNamed: [Exclude<keyof Message, NamedField>] extends [never] ? true
  : ['Message gained a field nothing names:', Exclude<keyof Message, NamedField>] = true;

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
