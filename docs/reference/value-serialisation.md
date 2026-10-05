# What each value-serialising pass decided

Five passes in this repo take an arbitrary runtime value and make something storable or sendable out of it.
They are not copies of one another: each answers to a different consumer, and where they differ it is almost
always on purpose. This table is so those decisions can be read in one place rather than reconstructed from
five files — and so that a gap nobody decided shows up as an odd cell.

Every cell below was derived by running the five passes over the same inputs, not read off the code.

| | BigInt | a true loop | the same object twice | Date | a throwing getter | depth | function | `undefined` |
|---|---|---|---|---|---|---|---|---|
| **`jsonSafeEncoder`**<br>`api/src/transport/encoder.ts` | digits | `[circular]` where it closes | kept twice | ISO string | whole frame becomes `[unserialisable]`; **never throws** | no cap — a stack overflow in both passes lands on the placeholder | dropped | dropped |
| **`toJSON`** / `safely`<br>`abuddy-cli/src/commands/db/output.ts` | digits | `[Repeated]` | `[Repeated]` | ISO string | throws | no cap | dropped | dropped |
| **`serializable`**<br>`abuddy-sdk/src/logger/logger.ts` | digits | `[Repeated]`¹ | `[Repeated]`¹ | ISO string | throws | no cap | `[Function]` | `[Undefined]` |
| **`redactSecrets`**<br>`abuddy-sdk/src/utils/redact.ts` | **kept as a BigInt** | `[Circular Reference]` where it closes | kept twice | kept as a Date | throws | 50 → `[Too deep]` | kept | kept |
| **`truncateResult`**<br>`abuddy-sdk/src/steps/result-truncator.ts` | digits | `[Circular]` where it closes | kept twice | ISO string | throws | 10 → `[Max depth exceeded]` | kept | kept |

¹ Unreachable through the logger, which is the only caller: `redactSecrets` runs first, cuts a loop and copies
a repeat into a fresh object, so nothing reaches `serializable` twice. It stays because that function's
contract is standalone.

## Why they differ

**"The same object twice" is the deliberate split, and three specs pin three answers.** A seen-set marks the
second sighting of anything; a path-set marks only a value that reaches itself. Which is right depends on what
the output is for. `abuddy db` prints rows a person reads, where a large entity repeated across twenty rows is
noise, so it collapses — and because a seen-set has no path, one honest marker covers both conditions, which
is why it reads `[Repeated]` and not `[Circular]`. The encoder, `redactSecrets` and `truncateResult` are
building a value something else will read, where dropping a legitimately shared object would be data loss, so
they keep it and mark only a loop.

**`redactSecrets` keeps a BigInt, and that is the boundary rather than an omission.** It redacts; it is not
the pass that makes a value JSON can hold. Whoever stringifies afterwards owns that, and each of them does.
Moving the fix into it would silently change a number's type for every caller, so `redact.spec.ts` pins the
pass-through.

**Only the encoder promises never to throw**, because its throw is the expensive one: it is called from the
loop draining a subscription, so it would end a window's whole event stream rather than failing one send.
That is also why it alone has no depth cap — for a frame on a socket, the honest answer to "too deep to
serialise" is to say so, and the placeholder is that answer.

**The depth caps differ by what the value is for.** `truncateResult` keeps 10 levels because a step result is
read by a later step and bounded on purpose; `redactSecrets` keeps 50 because it is protecting a stack rather
than bounding a payload.

**A throwing getter throws in four of the five.** That is recorded rather than fixed: no value this app
produces has one, and only the encoder has a contract that forbids it. If one ever appears in a step result,
`truncateResult` is where it would bite.

## Adding a sixth

Add a row, and answer every column before writing the walk. The BigInt column is the warning: four of these
five handle a BigInt and two did not, which crashed the logger and discarded step results — and the app's own
database returns BigInts, which is why the encoder exists at all. Nothing was holding those two answers
together, so each was decided separately and two were never decided at all.

Each pass asserts its own row, so a change shows up where it was made:
`api/tests/transport/encoder.spec.ts`, `abuddy-cli/tests/commands/db-output.spec.ts`,
`abuddy-sdk/tests/runtime/bound-transport.spec.ts`, `abuddy-sdk/tests/utils/redact.spec.ts`,
`abuddy-sdk/tests/steps/result-truncator.spec.ts`.
