# Build-input snapshot evaluation

2026-10-16, source baseline `74890676d`. This evaluates a candidate for the remaining input-coherence
work in the [discovery evidence](discovery-without-activation.md#execution-ownership-audit-after-phase-cache-publication).
It is experimental evidence, not a completed source-input contract or a production implementation.

## Recommendation

Continue with a snapshot-led hybrid prototype: retain the captured compiler installation, own source
and dependency bytes for build execution, and use compiler observations to account for external
inputs and their namespaces. Keep guards for changes during capture and before publication. Guards
complement owned reads; they cannot establish which bytes a compiler consumed by themselves.

The positive proof shows that the real compiler paths can work with owned files while preserving
ordinary resolution and emitted bytes. The negative proofs show why copying directories and changing
`cwd` is insufficient. Settle the adapters, external-input closure and dev lifetime before switching
production builds or freshness readers. Do not convert these boundaries into exclusions.

Production follow-through is tracked in the goal: `2e68b3ca7` makes native module bundles consume
owned bytes; `5e3530cad` gives declaration bundles a verified owned filesystem and parent-owned worker
workspace. These are partial execution consumers, not proof of complete namespace, content/frontend,
launch/dev or publication ownership. The disposable adapters below remain experiments.

## Disposable proof

Scripts retained locally:

- `/private/tmp/apack-snapshot-proof.mts`
- `/private/tmp/apack-snapshot-edges.mts`

Commands, from the main checkout:

```sh
node --conditions=@apackdev/source --import ./node_modules/tsx/dist/loader.mjs /private/tmp/apack-snapshot-proof.mts
node --conditions=@apackdev/source --import ./node_modules/tsx/dist/loader.mjs /private/tmp/apack-snapshot-edges.mts /private/tmp/apack-snapshot-proof-aEvuiT/source
```

The fixture has typed entities, an external `tsconfig.paths` target, lifecycle runtime code, an
executable content compiler, a linked npm dependency, Vue, external CSS/image files, an external glob
and a worker. The existing package-input copier supplies private source/dependency trees as a
disposable experiment; that does not establish that its compiler-specific interface is the correct
production source-snapshot abstraction. Real CLI workers run the actual build pipeline with the
captured compiler and combined source-origin mappings. No compiler phases are mocked.

The prototype deliberately copies a known fixture parent containing its external inputs. This is a
controlled test boundary, **not** a proposed common-ancestor scanning algorithm or proof of complete
external discovery. Writable codegen/output locations are explicitly opened in the disposable tree;
production needs a proper separation between owned inputs and writable outputs.

The first two fixture attempts stopped before compilation on an obsolete lifecycle key and an
extensionless Vue import. Corrected fixtures pass current manifest and pack-rule validation. These
were experiment errors, not snapshot implementation failures. Each build child has a 60-second bound;
no broad chain or production-data operation was run for these probes. Captures and Vite servers are
closed after the experiments; scripts, fixture inputs and reports are retained.

## Observed results

| Probe | Actual evidence | Meaning |
|---|---|---|
| Owned bytes across compiler paths | Live source/dependency files change after two captures. Both private builds keep the old typed facade, runtime constants, executable-content result and Vite output. Vue/CSS, glob, image and worker compilation succeed. | Normal relative paths and a linked package work across TypeScript, esbuild, Node content execution and Vite. |
| Independent captures | Both snapshots produce identical file inventories and build revisions, `04096035473c…`. | Temporary capture locations need not make emitted output nondeterministic for this fixture. |
| Live versus owned build | All file digests match except `phase-cache.json`; live revision is `91e729753260…`. | Runtime, facade and other emitted bytes are preserved in this case. Input/cache identity still differs and needs diagnosis; do not waive it because the shipped output agrees. |
| Conflicting origin bytes | Relative and absolute references expose differing bytes for the same source. The existing view refuses `Compiler input differs between captured and live sources`. | Retain the existing conflict guard; it catches one class of mixed reads. |
| Absolute aliases without a duplicate read | A separate absolute shape/backend target changes after capture. The build succeeds using the live number shape/backend value, while relative content imports keep captured values. | Conflict detection alone is insufficient. An absolute reference must consume the owned file even when no second read exposes the discrepancy. |
| Absolute content file reads | The executable content compiler reads an absolute file with `fs.readFileSync`. Its captured copy contains `JSON_CAPTURED`; the successful build consumes `JSON_LIVE`. | Module-reference remapping alone is insufficient. Account for supported executable file reads too. |
| Frontend observations | Actual worker messages name the original external value file and contain no private compiler-capture paths. | Existing origin mapping is useful for original-source subscriptions; it is not proof of complete watch coverage. |
| Real dev server on the copy | HTTP entry and Vue requests return 200 and serve captured data. The server watches the owned external directory, not the original. A confirmed original edit leaves it serving the captured value. | Pointing Vite at an immutable copy loses ordinary live updates. Dev/watch ownership needs an explicit design. |

Positive proof: `/private/tmp/apack-snapshot-proof-aEvuiT/report.json` and its three build logs.
First conflicting-origin refusal: `/private/tmp/apack-snapshot-edges-Z4U6nY/report.json` and `build.log`.
Isolated absolute-alias/dev proof: `/private/tmp/apack-snapshot-edges-zNatom/report.json`.
Final alias/direct-file/dev proof: `/private/tmp/apack-snapshot-edges-pD6RU1/report.json` and `build.log`.

These results do not explain the chain's default-pack output-change warning, close ambient preload
ownership, or prove full snapshots, publication, watch refresh, external authoring or passive freshness.

### Read-adapter follow-up

A focused follow-up removes the original external directory before the real worker starts. With a
Node read adapter and an owned esbuild configuration projection, the actual build succeeds using the
captured string shape, backend value, relative content import and absolute content-file data. Frontend
observations still name original source files and contain no private capture paths. Evidence:
`/private/tmp/apack-snapshot-adapters-JAVsmo/report.json`, `build.log` and
`/private/tmp/apack-adapter-full.trace`.

The disposable scripts are `/private/tmp/apack-snapshot-adapters.mts`,
`/private/tmp/apack-snapshot-adapter.cjs`, `/private/tmp/apack-esbuild-hook.mjs` and
`/private/tmp/apack-esbuild-adapter.mjs`. A first fixture attempt removed files before finishing setup,
so no compiler ran. The subsequent run reached the actual native resolver and refused the absolute
alias: changing CommonJS cache exports had not changed the esbuild named ESM imports. A minimal native
build isolates that handoff; a supported ESM hook then applies the configuration projection correctly.
That evidence informs an explicit compiler adapter, not a production CommonJS-cache patch.

This is still a bounded prototype. It covers simple config data, not inheritance; its explicit
prototype refusal of `extends` is not a proposed product restriction. It intercepts selected Node read
APIs and does not establish every callback/promise/stream/native-addon or loader read path. The source
scope remains the controlled fixture parent. Preserve existing inherited configuration, supported
launches and source semantics when replacing this scaffolding with owned production interfaces.

### Captured-root identity prerequisite

An independent small probe isolates one identity defect: paths are mapped to source origins but the
relative base is the physical captured root. Identical file-view and module inputs at different
depths therefore hash differently. `/private/tmp/apack-snapshot-root-before.log` records both
inequalities; `/private/tmp/apack-snapshot-root-after.log` records equality after normalizing the root
through the same projection. This explains a concrete component of the identity problem; it does
not prove that every live/snapshot whole-build cache-key difference has been resolved.

Source `de5adeb66` normalizes the fingerprint base and discovered-package ordering, retaining
physical reads and validation. Three regressions cover equal hashes, owned reads with original files
removed, refusal after owned bytes change, and pack-local/parent-installed dependency order. The first
two fail before the change. Restoring the physical sort base fails the ordering assertion; the exact
source is restored afterward. The ordering fixture needs explicit package boundaries so TypeScript
does not legitimately search unrelated ancestors outside the copied context; its full hash equality
assertion remains intact. Forty-seven focused checks, CLI typechecking and lint pass. Strict run
`2026-10-16T07-01-20Z-71395` fails one existing 60s watcher case; 752 other integration cases and all
other steps pass. Its unchanged isolated timing run passes in 42.64s (ready 14.08s, first publication
25.04s, refusal 30.97s, recovery 41.69s, cleanup complete 42.63s). The four-file peer workload passes
15/15 at four workers in 69.55s; the watcher takes 58.244s. This does not establish the timeout cause
or a green strict gate. The exact instrumented spec is restored and all seven EARS/content baselines
match. Source is checkpointed with this validation limitation explicit; full strict acceptance remains
required. Do not use repeated broad runs to diagnose the recurring timing boundary.
Additional logs: `/private/tmp/apack-snapshot-root-{strict,watch-timing,watch-peers}.log`. Focused logs: `/private/tmp/apack-snapshot-root-{regressions-before,focused,mutation-order,typecheck,lint}.log`.

## Inherited configuration and Node reads follow-up

The inheritance probe extends the earlier simple-config fixture through relative/package `extends`,
array precedence, JSONC and an absolute config path whose original disappears. It exercises actual
TypeScript, native esbuild and Vite config resolution. The reports' copied `scope` string still says
“simple configs only”; the fixture code and results supersede that stale experimental label.

Reports: `/private/tmp/apack-snapshot-inheritance-yQNFRf/report.json` (Node 23.11.1) and
`/private/tmp/apack-snapshot-inheritance-pcec6c/report.json` (Electron 37.2.4 as Node 22.17.1,
without `baseUrl`). Scripts: `/private/tmp/apack-snapshot-inheritance.mts` and
`/private/tmp/apack-snapshot-inheritance-adapter.cjs`. Both preserve native class-field/JSX behavior,
package lookup and captured external values after originals disappear. Callback Buffer reads, promise
URL reads, file handles, streams and named ESM callback reads consume captured data. Frontend
observations retain original paths and contain no private capture paths. A poisoned configuration
package entry is never activated. This is selected API coverage, not a complete loader/I/O boundary.

The first inherited-config attempt fails in Vite's `createRequire(from).resolve(extended)`, outside the
selected filesystem export mapping. A prototype wrapper around the public `createRequire` export,
with `syncBuiltinESMExports`, resolves this fixture. It does not establish coverage of implicit CommonJS
loading or native addons. Combining synchronous module hooks with the existing asynchronous tsx hooks
fails on both runtimes (`resolveSync` not implemented); that approach is rejected. No engine-floor
change or private Node loader patch is needed for the successful probe.

Native esbuild receives effective supported options from parsed configuration. Inherited path targets
are resolved against their declaring directory without adding `baseUrl`, which would shadow unrelated
package imports. The no-base case deliberately includes such a shadow file and still selects the
package. The source checkpoint below adopts this explicit configuration projection only; filesystem
and loader adapters remain disposable experiments.

## Captured native compiler configuration checkpoint

Source `26f73956b` retains its resolved configuration in `CompilationInputs` and hands it to all four
native backend bundle paths: runtime, content runtime, step build and content compilers. The projection
accounts for every option in esbuild's declared `TsconfigRaw` contract, including inherited paths,
JSX, strict flags, target defaults and class-field semantics. It leaves authored JSON untouched.
Standalone bundler calls resolve their own configuration; absent explicit pack configuration retains
native ancestor discovery. That implicit input is still part of the unfinished whole-build closure.

Eight focused integration cases pass: native parity with/without `baseUrl`, inherited targets/defaults,
owned alias paths after originals disappear, captured config without reparsing, native ancestor
fallback, and a real build/stage/load that changes then restores an inherited config during bundling.
Removing the build's captured-config handoff fails that last case with `calls: []` instead of `[7]`,
even though final input bytes match; exact source is restored. Seventy-four affected unit cases,
CLI typechecking and lint pass. Logs: `/private/tmp/apack-owned-configuration-{integration-final,
unit-final,typecheck-final,lint-final,mutation}.log`.

The one converged strict gate passes in 825.8s: run `2026-10-16T08-15-59Z-20777`, 29 executed
steps/one cached, 761 integration tests in 59 files. The earlier watcher case passes, as do real
packaged-authoring halves, external-pack contract/app and smoke. All seven EARS/content baselines
match byte for byte; source remains fixed. Log: `/private/tmp/apack-owned-configuration-strict.log`.
No follow-up broad run is needed for this checkpoint. This does not establish the original timeout's
cause or replace the final committed-source `--all` gate for the whole goal.

This checkpoint does not own native source reads, frontend/dev lifetime, launch/preload code, external
namespace closure or the complete input/output receipt. These remain required, as do all later phases.

## Alternatives and boundaries

| Approach | Benefit | Remaining problem |
|---|---|---|
| Live reads plus final content hashes | Fits current producers and catches lasting edits. | An edit/read/exact restoration can evade final equality. Hashes do not bind actual consumed bytes. Metadata guards are useful diagnostics, not a portable immutable view. |
| Per-compiler virtual file systems only | The existing TypeScript view already owns queries and bytes with useful source identities. | esbuild's native process, Vite plugins/resources/workers and executable Node content have different read paths. A TypeScript adapter alone cannot own them. |
| Directory copy and new working directory | The positive proof preserves ordinary relative resolution and emitted output. | Absolute aliases and direct file reads escape it; external discovery, output roots, input identities and live updates remain unresolved. |
| Snapshot-led hybrid | Reuses real filesystem resolution and current compiler capture, with compiler observations and purpose-specific adapters at the remaining boundaries. | Requires the explicit work below; it must not become a second guessed inventory or an unbounded whole-machine copy. |

One origin projection must distinguish logical source identity from owned read locations. Preserve
`package.json` imports/exports, conditions, physical links, lookup ordering, missing candidates and
directory/glob membership. Do not merge dependency instances just because names/versions match.
Use useful original paths for diagnostics, source maps, input identity and subscriptions; use owned
locations for execution. Do not rewrite arbitrary source text to change embedded path strings.

Whole-build input ownership and live authoring are different lifetimes. A candidate worth testing is
immutable inputs per initial/watched build, watchers on original inputs, and a live HMR server using
an owned compiler generation. Refresh that server coherently when the compiler changes. Keeping its
authoring view live must not authorize any published build or bypass binding admission. Alternatively,
a server over owned generations needs an explicit update bridge; the proof shows that it does not
inherit HMR automatically. Neither choice is settled by the initial server probe.

## Next bounded prototype and implementation acceptance

1. Define the shared origin/read-location projection and input/output ownership, extending existing
   package graphs, compiler views and path mappings. Explain the live/snapshot cache-key difference.
2. Prove that absolute aliases/imports and direct executable file reads consume owned bytes through
   the real paths above, including when the original disappears. Preserve reference resolution and
   source bytes. Do not replace an escape with an ignored input or blanket unsupported-option refusal.
3. Prove external inputs can be included through the actual compiler observations/resolution boundaries
   without the fixture's broad parent copy. Include first-build resources, missing targets becoming
   available, additions/removals, globs, links and transitive dependencies. Avoid speculative repeated
   execution of content code merely to discover inputs.
4. Exercise generated bindings and declarations alongside the owned source root. Source-side editor
   codegen, dev-server imports and accepted output must not silently acquire different authorities.
5. Prove actual initial/watch builds use the owned view while original-source changes request the next
   generation. Preserve HMR behavior, reload/install ordering, source paths, cancellation and cleanup.
   Refresh the retained frontend compiler when the selected compiler changes.
6. Account for launch options, preload/loader code and their resolution before execution. Preserve the
   original parser work in stash `c42116fb46a385b5f6065a4fb9cd9e68e2625b80`; it was not validated or
   committed as source, and is not the preload-ownership fix.
7. Integrate the successful whole-build input/output association and its passive consumers only after
   the execution contract is proven. Keep failed-build retention, deterministic output, source/archive/
   prebuilt/drive consumers and installed discovery without authored files or compiler activation.

Start with focused process/filesystem proofs, then implement coherent source checkpoints with required
validation. All remaining discovery, navigation, frontend boundaries and three Phase 6 workstreams
remain required by the active goal. Stronger security isolation and lazy activation remain deferred.
