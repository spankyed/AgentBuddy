# Native compiler input boundary

Status: Proposed — support boundary not yet approved.
Date: 2026-10-17.

## Context and evidence

Pack builds capture compiler and dependency inputs, associate completed observations with sealed
output, and replay those observations for freshness checks. This supports input/output coherence;
it does not establish hermetic execution or security isolation of arbitrary native code.

A real addon linked to an absolute external library executes the original library outside the
captured input tree. Replacing that library does not invalidate the recorded build. Package-relative
native library capture (`6710e3026`) fixes a different case and does not close this defect. See the
[reproducer and acceptance evidence](../../evidence/build-input-snapshot-proof.md#package-relative-native-library-ownership).

Platform packaging and release configuration are not proof of native compiler correctness. The
[goal's B1/B3 closure register](../../goals/goal-settings-and-pack-contracts.md#b1b3-closure-register-and-decisions)
records configured targets, missing evidence and required decisions. Unverified behavior is not a
reproduced defect.

## Proposed direction

Keep captured compiler/dependency inputs and the existing publication owner. Audit the native
dependencies actually executed by supported compiler paths before selecting additional machinery.
Preserve package-contained loading and normal platform-library resolution.

Prefer a bounded, explicit native dependency contract. A candidate boundary supports captured
package-contained dependencies and rejects identifiable unsupported external dependencies with
an attributed diagnostic. This remains a proposal: it narrows the current requirement and requires
explicit approval. Until then, external-library support remains open in the goal.

Static inspection alone cannot establish complete capture: dynamic library loading and native file
reads may bypass JavaScript observation. Neither an input declaration nor a scanner establishes
that execution used captured bytes. Do not claim complete capture from those mechanisms alone.

## Alternatives and tradeoffs

- Capture external libraries while preserving loader semantics: retains broader support, but requires
  a successful prototype against the existing reproducer before committing to a design.
- Restrict external native dependencies: reduces implementation scope, but detection has limits and
  affected authors need useful diagnostics. No claim of universal detection is justified.
- OS-level execution isolation: could enforce a stronger boundary, but adds platform-specific work;
  stronger isolation remains deferred and is not authorized by this record.
- Binary relocation or broader interception: no solution is selected; justify either against an
  observed requirement rather than introducing a general framework speculatively.

## Rejected shortcut

A real macOS ARM64 / Node 23.11.1 prototype shows that `DYLD_LIBRARY_PATH` can redirect one absolute
library to captured bytes, but collapses two distinct absolute libraries sharing a basename: expected
`[11, 22]` becomes `[11, 11]`. A search-path override alone therefore fails the resolution-preservation
criterion. See [prototype evidence](../../evidence/build-input-snapshot-proof.md#external-native-library-search-path-prototype-2026-10-17).
This rules out that shortcut, not every possible exact-identity capture design. No support exclusion
or implementation is approved by the result.

## Acceptance and decision process

Before accepting this ADR, record the chosen boundary, approval, guarantees and limitations. Prove it
against the existing external-library reproducer and relevant transitive/dynamic loading behavior.
Preserve loading semantics, changed-input detection for supported inputs, incumbent retention on
refusal, and cancellation/watch cleanup. Define exact platform/runtime cases and reuse existing proof.
An unsupported case needs an explicit decision; a missing test does not make it unsupported.

The goal owns implementation order and completion; the evidence record owns results. This ADR owns
reasoning and the eventual decision, not another task backlog. Independent API work continues.

Revisit the boundary when a required dependency exceeds it, a new supported environment changes
loader behavior, or stronger build isolation becomes an explicit product requirement.

## External references

[Bazel sandboxing](https://bazel.build/versions/8.3.0/docs/sandboxing) distinguishes dependency
isolation and platform-specific enforcement. [Node's permission documentation](https://github.com/nodejs/node/blob/main/doc/api/permissions.md)
explains limitations relevant to native code; it is not evidence that apack has such enforcement.
