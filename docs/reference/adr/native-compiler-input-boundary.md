# Native compiler input boundary

Status: Accepted — bounded native support approved by the user on 2026-10-17; implementation and acceptance remain open.
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

## Decision

Keep captured compiler/dependency inputs and the existing publication owner. Audit the native
dependencies actually executed by supported compiler paths before selecting additional machinery.
Preserve package-contained loading and normal platform-library resolution.

Support captured package-contained libraries and normal operating-system libraries. Refuse
identifiable outside-library dependencies with a diagnostic naming the native image and dependency.
The user explicitly approved this boundary on 2026-10-17. Universal capture of arbitrary external
native libraries and native file I/O is outside this contract; do not claim universal detection.
An absolute reference back to a live original package is not captured loading, even if that original
library sits beside its addon. Supported package-relative loading must actually use the owned copy.

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
This rules out that shortcut, not every possible exact-identity capture design. The separate user
approval above selects bounded support; the prototype itself does not authorize implementation changes.

## Acceptance and decision process

Implement in bounded checkpoints:

1. Inspect native image dependency declarations without executing the image. Cover macOS load commands,
   distinguishing dependency commands from image IDs; identify package-relative, OS and outside paths.
   Check transitive package libraries while preserving actual resolution. Refuse the existing absolute
   outside-library reproducer before native initialization; retain actual package-relative acceptance.
2. Route the check through the existing captured module owner, then audit early preloads, worker threads,
   compiler dependencies and Vite so a later load path cannot silently bypass the bounded contract.
   Extend inspection to supported ELF/PE paths without introducing executable inspection tools as end-user
   requirements. Native I/O and computed runtime loading remain explicit detection limits.
3. Prove attributed refusal and incumbent retention through the public build path, changed-input tracking
   for supported copies, transitive loading, cancellation and watch recovery. Reuse existing fixtures.
   Record native platform acceptance separately; synthetic headers are parser checks, not OS acceptance.

Windows CI is the selected native verification target following the user's request to decide the runner
approach. Prepare implementation and targeted CI coverage locally; the prohibition on pushing or triggering
release workflows remains. Windows execution is unverified until that runner executes the committed source.
Do not replace the missing descendant-lifetime owner with a PID-only tree-kill command.

The contract approval does not close these implementation or validation checkpoints. Linux support and
all required final gates remain owned by the goal.

The goal owns implementation order and completion; the evidence record owns results. This ADR owns
reasoning and the eventual decision, not another task backlog. Independent API work continues.

Revisit the boundary when a required dependency exceeds it, a new supported environment changes
loader behavior, or stronger build isolation becomes an explicit product requirement.

## External references

[Bazel sandboxing](https://bazel.build/versions/8.3.0/docs/sandboxing) distinguishes dependency
isolation and platform-specific enforcement. [Node's permission documentation](https://github.com/nodejs/node/blob/main/doc/api/permissions.md)
explains limitations relevant to native code; it is not evidence that apack has such enforcement.
