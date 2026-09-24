// The envelope's fields are named in four places, three of them outside this package: `senderSuffix` here, the
// `bus.send` input schema (`packages/api/src/transport/bus.ts`), which strips what it isn't told about, the drop
// dedupe in the bus, and the `Required<Message>` sample in the schema's spec.
//
// Two of those have been missed already, both silently, because adding a field to `Message` made nothing
// anywhere fail: `from` never reached the schema, so every renderer send arrived with no sender (9333f87f2), and
// `via` never reached the dedupe key, so two actions of one pack collapsed into one report naming the wrong one.
// This file is the thing that fails. It is here rather than beside the schema it guards because nothing
// typechecks `packages/api/tests` — 29 pre-existing errors there as of 2026-09-24 — while this package's tests
// are in its `tsconfig.json`, so the assertion below is checked by `npm run typecheck`.
import { describe, expect, it } from 'vitest';
import { senderSuffix, type Message } from '../../src/events/index.ts';

/** Every field of the envelope, as of now */
type NamedField = 'to' | 'event' | 'from' | 'via';

/** Whichever fields `Message` has that `NamedField` doesn't — `never` while the two agree */
type UnnamedField = Exclude<keyof Message, NamedField>;

/**
 * Fails to compile when `Message` gains a field, and the error names it.
 *
 * When it does: carry the field wherever a message is passed on, then work through the four places above — add it
 * to `senderSuffix` if it says who sent the message, to the `bus.send` input schema so it survives the boundary,
 * to the `Required<Message>` sample in `packages/api/tests/unit/bus-send-sender.spec.ts`, and last to
 * `NamedField`. The dedupe key needs nothing: it is `senderSuffix`'s output.
 */
const _everyFieldIsNamed: [UnnamedField] extends [never] ? true : ['Message gained a field nothing names:', UnnamedField] = true;

describe('the envelope', () => {
  // The compile-time assertion above is the test; this keeps it honest about being reached, and states the
  // property in a form a reader who skips types still sees.
  it('has no field that nothing names', () => {
    expect(_everyFieldIsNamed).toBe(true);
  });

  // The fields that say who sent a message all reach the one renderer. A new one that doesn't would leave the
  // diagnostics naming less than the envelope carries, which is how `via` sat unrendered in the dedupe key.
  it('renders every sender field it carries', () => {
    const sender: Required<Pick<Message, 'from' | 'via'>> = { from: 'memo-pack', via: 'action:Add Memo' };
    const rendered = senderSuffix(sender);
    for (const value of Object.values(sender)) expect(rendered).toContain(value);
  });
});
