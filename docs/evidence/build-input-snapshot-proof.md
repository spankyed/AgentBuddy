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

## Asset producer audit and bounded follow-through (2026-10-17)

Baseline `3119205be`, followed by reader cleanup `e6ce3f1e4`. This finishes classification of the asset
classes raised by the discovery inventory; it does not certify their producer/input completeness.
B1 and B4 below remain required implementation/acceptance in the active goal, not deferred work.
Installed consumers must stay source-free and must not import compilers or pack modules.

| Supported path | Current producer/reader evidence | Remaining requirement and closing check |
|---|---|---|
| Inline facade/helper/help/DSL data | Snapshot validation and generated inline text; facade/helper duplicate files are not discovery authority | Preserve existing source-free declaration checks. Do not add authored-module or duplicate-file prerequisites. |
| Backend/frontend entry files | `layout.ts::assertRequiredEntries`, checkpoint `b916d0e5e` | Required presence is implemented. Preserve backend-only builds and declared frontend membership through final all-kind acceptance. |
| Compiled content index/data files | `layout.ts::readCompiledContent`, checkpoint `3119205be` | Owner, entry membership, written policy and required data file presence are implemented. Keep explicit native imports separate. Media is the distinct copy path below. |
| Frontend CSS, lazy chunks, worker files and maps | `fe-bundler.ts::bundlePackFE` awaits `vite.build` but drops its result. Actual Vite output includes these emitted files | B4: retain expected emitted files/bytes through final validation and bind them to the existing output receipt. Prove omission/change before sealing refuses publication and preserves the incumbent. Do not infer output references by scanning generated JavaScript. Maps remain intentionally excluded when staging. |
| Vite public directory | The current config leaves Vite's `publicDir`/copy behavior enabled. Proof copies `public/static.txt` to output but does not report it in the returned output graph | B1: inspect current authored-scope coverage and own copied input bytes/membership. B4: include copied public files in producer output evidence as well as Rollup emissions. Preserve supported copying; disabling the feature or trusting the returned graph alone does not close this path. |
| Backend/content/helper bundles | `be-bundler.ts::packEsbuild` writes owned `outputFiles` when using a compiler read tree; source maps are rewritten through `sourceMapOrigins`. Other bundle paths use their actual writer results | B4: associate the final emitted bytes after transformations with the existing receipt. Audit non-tree calls and reused phase outputs before claiming complete coverage; do not create another parallel receipt. |
| Compiled media | `content-compiler.ts::compilePack` copies an existing declared media directory with `fs.cpSync`. `format-applier.ts::restoreMedia` rewrites existing linked files and leaves missing links alone | B1: copied bytes/membership must come from the accepted compiler input view. B4: preserve expected copied output through sealing. A format's media-directory name cannot identify all files by itself. Do not invent a stricter link-validity policy or change explicit imports merely to make this check easier. |
| Declaration/helper text writers | Types, Monaco definitions and helpers already have concrete producer outputs; snapshot text remains discovery authority | B4 must cover their written bytes and actual phase reuse alongside runtime output. No additional discovery store or source import is needed. |

Two disposable proofs refine the design:

1. `/private/tmp/apack-vite-output-audit.mjs` runs the installed Vite build with the production library
   output choices (ES module, ES2022, source maps, combined CSS), a module package, CSS, a dynamic import,
   a worker and a public file. The graph reports the main chunk/map, lazy chunk/map, CSS and worker/map.
   The directory additionally contains `static.txt`; the returned graph omits it. Result:
   `/private/tmp/apack-vite-output-audit.log`. This tests Vite's emission boundary, not the full pack
   build's capture or publication contract. It shows why graph-only recording would be incomplete.
2. `/private/tmp/apack-media-read-audit.mts` runs the actual content compiler through the production
   `withCompilerFileReads` adapter with an injected owned file view. The authored Markdown and media
   are changed after creating the captured view. The compiled record contains `CAPTURED body`, while
   its copied file contains `LIVE media`: `/private/tmp/apack-media-read-audit.log`. Ordinary reads use
   the view; `fs.cpSync` bypasses that byte projection. This isolates the copy path, **not** a proven
   publication failure: the proof supplies a controlled view and does not run the complete build's
   final input assertion. An initial fixture omitted a field selector and failed before copying; that
   fixture was corrected before drawing this conclusion.

Next, finish the B1/B3 finite path matrix against current launch, compiler, dependency and resource
owners, incorporating these concrete copy paths. Prove the chosen execution approach across the
actual paths before changing production ownership. Retain captured installation, useful paths,
resolution, deterministic outputs and dev/watch behavior. Then complete B2/B3 and the single B4
input/output association before passive B5 consumers and B6 convergence. These observations do not
justify a general filesystem interceptor expansion, a new asset manifest or a security sandbox.

## B1/B3 current compiler path matrix (2026-10-17)

Inspected source baseline `75ac77a98`. This matrix accounts for the actual supported pipeline before
new ownership work. A current owner is not automatically complete acceptance; the last column names
what must still be proved or changed. It does not restart already-landed capture/cancellation work.

| Supported path / operation | Existing owner and inspected source | Uncovered requirement | Closing check / disposition |
|---|---|---|---|
| Compiler installation and its npm dependency graph | `compiler-installation.ts::captureCompilerInstallation` captures package files/modes, directory/link topology and dependency bindings; verifies the mirrored graph; builder retains and refreshes it | The package graph has an owned copy. Executable/native runtime coverage beyond that graph still needs explicit proof; version-map identity alone is not immutable ownership | Retain installation capture. Inspect actual executable/addon paths, including supported environment overrides, before deciding whether additional ownership is needed. Do not copy an Electron executable blindly or claim external shared libraries were captured. |
| Worker launch options and user preloads/loaders | `compiler-startup-options.ts`, `compiler-startup.ts`, `compiler-startup-inputs.ts`; native capture installed before user initialization; loader coordinator returns startup observations | Implemented ordered effective options and early runtime/launch identity; cross-thread and dependency inputs still need closure below | Preserve `NODE_OPTIONS`, custom export conditions and measured preload order. Supervisor entry modes remain separate. Use existing startup cases instead of another launch layer. |
| Authored bytes and membership before preload execution | `compiler-input-view.ts::createPackCompilerInputView` eagerly captures `packInputFiles`; host `pack-inputs.ts` includes all authored files regardless of extension or source folder, excluding generated/output/dependency trees | Public files and media inside the authored root are already included. Capture alone does not establish that every compiler consumes them | Preserve initial capture and namespace guards; fix execution consumers, not a second authored scanner. External and linked paths retain their original lookup semantics. |
| Configuration, module resolution, source/dependency execution | `compilation-inputs.ts`, `compiler-module-inputs.ts`, `compiler-native-inputs.ts`, `compiler-read-tree.ts`, `compiler-modules.ts`, `compiler-commonjs.ts` | Owned bytes, projected configs, captured packages and per-build module identity exist. Declared dependency initialization, native addons, late namespace membership and cross-thread agreement are not fully accepted | Reconcile existing configuration/module tests against the current paths; add only missing acceptance. Preserve Node/esbuild resolution, source globals and independent CJS caches. No new resolver. |
| Content files, streams, descriptors, directory and metadata operations | `compiler-file-reads.ts`, `compiler-descriptors.ts`, `compiler-directories.ts`, `compiler-file-view.ts`; content compilation is scoped in `commands/build.ts` | Existing adapters own supported ordinary reads. The actual media-copy path bypasses an injected owned byte view; this is concrete, not evidence that all ordinary adapters are wrong | Close media copying against the accepted input view; prove source bytes and membership through actual content compilation. Preserve writable/output handles, useful source paths and explicit import behavior. Do not expand interception speculatively. |
| Backend, content compiler/runtime and helper esbuild bundles | `be-bundler.ts::packEsbuild` uses the read tree and native compiler, writes returned owned output bytes and projects source maps | Current native bundle paths are implemented; non-tree calls and executable/native inputs need acceptance, not automatic replacement | Check actual call sites and existing esbuild/configuration cases. Preserve native resolution and deterministic emitted bytes. Bind final output under B4. |
| Type facade and Monaco definition generation | `types-bundler.ts` uses owned source/configuration/declaration files and closes Rollup; `dsl-defs.ts` delegates to it | Existing owned execution is implemented. Parent/worker disposal and the preserved multi-build timeout remain acceptance items | Keep the current worker workspace and source-map/diagnostic paths; classify exact failures before changing deadlines or architecture. |
| Frontend one-shot Vite resources, CSS, workers and globs | `fe-bundler.ts::bundlePackFE` imports Vite in the captured worker but builds from the live pack root; resource/watch input plugins observe compiler facts | Compiler installation is owned; source/resource execution does not yet use the common captured view across the full Vite path | Prove the chosen source/dependency execution approach across SFC, style/template assets, dynamic imports, workers, globs and initially missing paths. Preserve real resolution and useful paths. The earlier snapshot experiment is evidence, not production completion. |
| Public-directory and media copying | Asset audit above: Vite copies public files outside its returned graph; `compilePack` uses native `fs.cpSync` for media | Both input consumption and expected copied output must be covered; authored-root capture already includes their original files | B1 owns copied inputs; B4 owns expected copied output. Keep current optional-media/link behavior and Vite public support. No separate asset manifest or JS scanner. |
| Retained dev frontend/compiler generation | `createPackBuilder` refreshes retained compiler copies; `packDevServerConfig` creates a separate long-lived Vite server | Successful backend compiler refresh is not yet proven to refresh the actual retained frontend compiler | B2 defines generation handoff, failed-refresh recovery and awaited retirement. Preserve HMR and source paths; do not require simultaneous startup without evidence. |
| Loader/module cleanup and final candidate sealing | `commands/build.ts::finish` awaits module disposal and startup observations before validating/sealing; parent waits for worker close, stops its group and verifies candidate before publication | Existing disposal/cancellation is implemented. Preserved exit-handler and worker failures need exact classification; native/background and platform-specific descendant coverage remains incomplete | B3 retains public cancellation and POSIX ownership. Verify successful one-shot and dev retirement plus relevant Windows behavior; a missing platform proof is not permission to claim completion. |
| Output publication and passive reuse | `build-publication.ts` verifies candidate identity and preserves incumbent; phase caches are private optimization data | No common successful input/output association yet; dropped producer graphs/copy outputs cannot be reconstructed from final checksums alone | B4 associates completed accepted inputs and expected final outputs with one receipt after resource settlement. B5 then migrates archive, prebuilt tests, default-fork and drive. B6 resolves exact retained failures and runs convergence. |

The next source work must close these identified consumers using the shared input owner. The asset
proofs do not justify weakening supported paths, treating live rereads as captured execution, or adding
one more independent cache/receipt. B1/B3 remain open until their outstanding cells have current
implementation and evidence; none of the original goal phases is removed by this matrix.

The preserved exit-handler case passes unchanged on this source (one case, 30.51s):
`/private/tmp/apack-b1-exit-boundary.log`. Its handler observes a sealed candidate, mutates it, and the
parent refuses publication while retaining the incumbent. The prior `UNSEALED` failure is not a
reproduced lifecycle defect; its exact earlier build failure remains unclassified. Keep the existing
parent terminal-state/verification boundary rather than redesigning it from that assertion alone.

First bounded B1 repair: the SDK's media producer will copy ordinary file bytes through its existing
scoped file reads and directory/metadata queries. A small media-specific traversal avoids the native
copy read bypass without adding another global filesystem interceptor or an author-facing filesystem
API. Preserve file/directory modes and native behavior for links/special entries; installed output
still has its existing symlink refusal. Prove this using actual `captureCompilationInputs`,
`withCompilerFileReads` and `compilePack`, alongside the ordinary content compiler media checks.
This closes one identified execution consumer, not Vite or all B1/B3 cells.

## Captured media execution checkpoint (2026-10-17)

Source `129b541de` closes the ordinary media-copy input consumer identified above. The media producer
uses a small private traversal: directory/metadata queries and ordinary file bytes flow through the
existing scoped reads. File and directory permission modes are preserved explicitly after writes,
including modes the process umask would otherwise narrow. Links/special entries keep native copy
behavior; the installed layout's existing regular-file/symlink policy is unchanged. No author-facing
filesystem API, global interceptor or additional receipt is introduced.

The new integration case uses actual `captureCompilationInputs`, `withCompilerFileReads` and
`compilePack`. It captures authored Markdown/media, changes the live media file, and compiles through
that owner. Before repair, the record uses captured text while the copied media contains `LIVE`.
After repair, both use captured bytes, output permissions are preserved, and final input validation
still refuses the changed live source. This proves owned consumption and retained guards, not a
claim that the old implementation was observed publishing an invalid build.

- Failing reproduction: `/private/tmp/apack-media-owned-before.log` (expected `CAPTURED`, got `LIVE`).
- Final integration case passes in 9.54s: `/private/tmp/apack-media-owned-final.log`.
- All 22 ordinary content compiler cases pass in 1.50s, including media copying/indexing, source
  cleanup and media-directory treatment: `/private/tmp/apack-media-copy-content.log`.
- SDK/CLI TypeScript, lint and refreshed SDK/testing/CLI package builds pass:
  `/private/tmp/apack-media-copy-{types,lint,packages}.log`.

The bounded B1/B3 matrix is committed in `5e9d478e3`; its source baseline is historical. This checkpoint
closes its ordinary media-consumption gap, not native/dependency or full frontend execution, retained
Vite generation, platform/resource acceptance or B4 expected output association. The exit-handler
case's isolated pass is recorded above; remaining preserved failures are not assigned a common cause.
Continue the matrix's open paths, B2/B3, B4–B6, all-kind discovery acceptance and all three Phase 6
workstreams. Final committed-source strict `--all` remains required; no broad gate was rerun here.

## Native package execution acceptance (2026-10-17)

Source `4c126846f` proves the package capture owner needs no additional native-file inventory for
ordinary package-contained executables/addons. Two real platform cases copy the installed esbuild executable and Rollup addon
into disposable dependency packages, capture the compiler installation, remove the entire original
fixture package, and execute the captured installation. The copied executable retains executable mode
and reports the expected version; the copied addon loads its native parser. Both pass alongside the
existing nested/linked/global dependency and capture-refusal cases (10 total, 2.45s):
`/private/tmp/apack-native-installation-acceptance.log`. CLI TypeScript and lint pass:
`/private/tmp/apack-native-installation-{types,lint}.log`.

This proves package-contained native execution on the current platform, not every platform, dynamic
shared library, external executable override or the Node/Electron executable itself. Installed esbuild's
`lib/main.js::generateBinPath` explicitly accepts `ESBUILD_BINARY_PATH` outside its package, while
`build-process.ts` inherits ambient environment; that path is not proven captured by the package graph.
Keep it and runtime ownership open in B1 rather than silently claiming the two tests cover them.

Next bounded frontend copy checkpoint: give `bundlePackFE` the same optional `CompilationInputs`
owner its backend sibling already receives. In actual builds, point Vite's `publicDir` at the existing
owned read-tree projection of the pack's authored public directory. Those bytes/membership are already
captured before startup. Keep the ordinary standalone bundler default and do not move Vite's module
root yet: the full SFC/resource/resolution handoff is a separate open B1/B2 boundary. Prove public-byte
consumption with an actual Vite build after live public files change; preserve the final input guard.
B4 still owns expected copied outputs, which Vite's returned graph omits.

## Captured public directory checkpoint (2026-10-17)

Source `d09a7f447` passes the existing build `CompilationInputs` owner into the frontend bundler, as
its backend sibling already does. Vite's public directory uses that owner's read-tree projection of
already-captured authored files. Standalone bundler calls retain their existing Vite defaults. The
module root remains unchanged: this is public-file consumption, not completion of full Vite capture.

Owned input files are read-only. A bounded generation hook restores captured public-file permission
modes after Vite's copy and before emitted bundle writes, preserving both original modes despite umask
and normal replacement of a copied filename by the emitted bundle. Installed Vite's `prepareOutDir`
precedes `bundle.write`/generation; the real compiler test covers this boundary. Errors from the owned
projection are mapped through the existing compiler diagnostics. No new filesystem API, asset receipt
or source scanner is introduced.

The actual Vite regression captures a public file, changes its live bytes, and bundles a real fixture
SFC with the common input owner. Before repair the output contains `LIVE`; afterward it contains
`CAPTURED`. It also verifies copied mode `0666`, replacement of a public `fe.js` placeholder by the
bundle, and continued final refusal of changed live inputs.

- Reproducer: `/private/tmp/apack-public-input-before.log` (expected `CAPTURED`, got `LIVE`).
- Final actual Vite case passes in 10.22s: `/private/tmp/apack-public-input-final.log`.
- All 19 adjacent frontend unit cases pass in 2.67s, preserving standalone bundling, shared externals,
  Tailwind refusal and UI theme checks: `/private/tmp/apack-public-input-unit.log`.
- CLI TypeScript, lint and local CLI package refresh pass:
  `/private/tmp/apack-public-input-{types,lint,packages}.log`.

The focused run emits the existing Tailwind injection sourcemap warning; no unrelated sourcemap change
or broad watch/integration rerun was made. Vite's returned output graph still omits public copies: B4
must account for their expected bytes alongside emitted CSS/lazy/worker output. Full frontend
source/resource ownership, external native overrides/runtime ownership, dependency closure, B2/B3
lifetimes, B4–B6, all-kind and all three Phase 6 workstreams remain required. The final committed-source
strict `--all` gate remains open.

## Frontend scoped-read proof (2026-10-17)

Baseline `e8fb68b7b`. A disposable fresh-process proof runs the actual `bundlePackFE` through the
existing `withCompilerFileReads` owner, keeping Vite's original module root and resolution. It captures
inputs, changes live files before the first Vite build, and checks emitted output rather than source
maps. Vue source, npm dependency code, imported CSS, SVG raw/template/CSS assets, lazy imports,
browser-worker source and glob members all contain captured markers and no live marker. The same
holds with installed Sass and custom Tailwind configuration; the configured color is captured too.
Changed originals still fail final input validation. Logs:
`/private/tmp/apack-vite-owned-read-proof.log`, `/private/tmp/apack-vite-owned-read-sass.log`,
`/private/tmp/apack-vite-owned-read-config-changed.log`.

Unchanged-input controls pass final validation, including Sass/Tailwind:
`/private/tmp/apack-vite-owned-read-unchanged-prepared.log`,
`/private/tmp/apack-vite-owned-read-config-unchanged.log`. The initial unchanged fixture created its
output parent after capture and therefore changed an observed root namespace; the controls prepare
output first, matching the actual build pipeline. This correction is not a production guard change.
Installed Vite's Sass importer loads through the async file-read path; no worker-count change is needed
for the tested path. The scripts use only disposable owned directories and preserve repository inputs.

Next source checkpoint: put the full frontend bundling operation under the same existing read scope
when `CompilationInputs` is supplied. Keep its original root, resolvers, compiler selection and
standalone behavior. This closes ordinary observed frontend file reads without creating another
snapshot, resolver or global interceptor. Add changed/unchanged real frontend regressions that also
exercise configuration source globals. Verify a real pack build before claiming the production
handoff. Continue native/runtime and dependency closure, retained compiler lifetime and B4 output
association; this proof alone is not whole B1/B2 acceptance or universal native-library coverage.

## Frontend read scope checkpoint (2026-10-17)

Source `0e03d4021` runs the complete frontend bundling operation under the existing
`withCompilerFileReads` owner when a build supplies `CompilationInputs`. This includes configuration,
resolution and resource reads, not only the `vite.build` call. Vite keeps its original root, resolvers
and source IDs; standalone calls keep their existing behavior. There is no additional snapshot,
resolver, global interceptor, worker-count setting or public API. Public assets retain the preceding
owned-directory projection and permission/replacement behavior.

Two real integration cases use captured originals before the first frontend build. The edited case
changes authored files and dependency code after capture; all emitted markers remain captured and the
final input guard refuses the changed originals. The unchanged case emits the same captured markers
and passes final validation. Coverage includes Vue script/template, npm dependency JS, separate SFC
style files and CSS imports, SVG template/CSS assets, lazy chunks, browser workers, glob members,
Sass imports, custom TypeScript Tailwind configuration and a configuration helper's original source
directory. Emitted output excludes private input-directory names.

Evidence:

- Both matrix cases pass (20.44s): `/private/tmp/apack-frontend-owned-regression-entry.log`.
- Captured public asset bytes, modes and bundle replacement still pass (10.49s):
  `/private/tmp/apack-frontend-owned-public.log`.
- All 19 adjacent standalone/external-sharing/Tailwind/theme cases pass (2.45s):
  `/private/tmp/apack-frontend-owned-unit.log`.
- CLI TypeScript, lint and refreshed CLI package build pass:
  `/private/tmp/apack-frontend-owned-{types-final,lint-final,packages}.log`.
- The actual external-pack build passes the captured worker, generated declarations, content/backend/
  frontend phases, final validation, sealing and publication:
  `/private/tmp/apack-frontend-owned-external-build.log`. This is build acceptance, not a new app/Electron run.

Initial test setup errors were corrected without weakening guards: Sass exposes its entry, not
`package.json`; source globals use the canonical source path; Tailwind's jiti temporary cache needs
file-wide lifetime in this in-process test file; Tailwind injection requires the JS entry used by real
packs. Its direct-Vue-entry fixture did not inject utilities. No production fallback, cache disabling,
timeout increase or broader run was introduced to address those fixture issues. The earlier disposable
proof's corrected output-directory ordering remains recorded above. Existing Browserslist and Tailwind
sourcemap warnings are outside this source change.

This establishes ordinary frontend file/namespace consumption through the common owner on the tested
paths. It does not certify arbitrary native-library I/O or close remaining executable/runtime,
dependency/namespace acceptance, retained Vite compiler refresh, platform/resource lifetime or the
successful input/output association. Continue those B1–B6 boundaries, all-kind discovery acceptance
and all three Phase 6 workstreams. Final committed-source strict `--all` remains open; no broad gate
was rerun during this checkpoint. Another worktree's test process was observed; no other session's
process or files were changed.

## Early declared dependency capture design (2026-10-17)

Baseline `55c64b68f`. The startup view captures authored files before user initialization, but declared
npm dependency files are first captured later by compiler initialization. Three isolated filesystem
regressions reproduce the gap: first dependency reads observe changed live bytes; added package
members do not invalidate the early view; a missing optional dependency becoming available is not
remembered. Existing authored ownership and generated-output checks pass:
`/private/tmp/apack-early-dependencies-before.log` (three expected failures, two passes, 0.394s).

Extend the existing input view using `readPackageInputs` before preloads. Its file callback supplies the
same captured bytes used by package identity; lookup observations retain missingness and bindings.
Add a directory callback to the same package reader so the view records the exact filtered membership
used during that walk, without a second inventory scan. Share the directory-entry reader/exclusions
between capture, local validation and native thread replay. Serialize a purpose-specific
`package-entries` query through the existing observation protocol; do not create another record store,
resolver or package format. Changes to ignored cache directories must remain irrelevant. Keep derived
package facts with the same owner as authored bytes, and retain the existing final package checks.

Prove byte ownership, membership, missing optional lookups, cache exclusions and cross-thread replay
before running the affected startup path. Native overrides/runtime ownership and transient resolution
acceptance remain separate B1 requirements. Measure actual affected execution rather than adding
whole-graph rehashes to every validation call or treating this as all dependency closure.

## Early declared dependency capture checkpoint (2026-10-17)

Source `9ecf788fb` implements the preceding design. The shared package walk supplies exact consumed
bytes and filtered directory membership; the existing view records package lookup locations, including
missing optional dependencies. Local validation and native-thread replay compare the same filtered
membership. The view's hash includes those added observations. No source modules execute during capture,
and ignored package cache directories remain irrelevant.

Evidence:

- Twelve focused input/observation/worker-admission tests pass (3.30s):
  `/private/tmp/apack-early-dependencies-unit-final.log`. The preceding shared-reader run also passed
  all twenty package-input tests: `/private/tmp/apack-early-dependencies-after.log`.
- Actual native startup captures dependency code before a preload overwrites it, retains the captured
  value and refuses changed originals; restoration passes validation (69ms test, 1.82s process):
  `/private/tmp/apack-early-dependencies-native-final.log`. The existing two-second deadline is unchanged.
- Actual captured-worker publication and repeat build preserve source globals, output revision and
  type-cache identity, and remove both private input workspaces (50.02s):
  `/private/tmp/apack-early-dependencies-build-final.log`.
- CLI/host types, lint and package refresh pass:
  `/private/tmp/apack-early-dependencies-{types-final,lint-final,packages-final}.log`.

This closes the reproduced early declared-dependency gap. It does not establish ownership of external
executable overrides, the Node/Electron runtime, arbitrary native I/O or every transient resolution
path. Continue the existing B1/B3 matrix, then B2–B6 and all other active goal requirements. No broad
gate was repeated; preserved integration failures and final committed-source strict acceptance remain
open. Other sessions' source/processes and saved work were preserved.

## External esbuild executable selection proof (2026-10-17)

Baseline `c2efeab05`. A disposable compiler fixture depends on the real installed esbuild package and
calls its actual `transformSync` API from a captured installation. `ESBUILD_BINARY_PATH` selects a
separate executable wrapper which records its version marker and delegates the service protocol to
the real native binary. After capture, changing only that wrapper leaves
`compilerInstallationHash(originalCompiler) === captured.hash`, but the second captured-API execution
records the changed wrapper. The exact result was:

```json
{"sameIdentity":true,"before":"ORIGINAL","after":"LIVE","first":"let value=1;","second":"let value=1;"}
```

The fresh Node/tsx proof completed in 0.498s and removed its private fixture and captured installation.
It changed no repository source or shared dependency. This proves executable selection escapes the
captured owner, not that the emitted bytes differed (they deliberately agree), nor that every native
path is unowned. Installed esbuild `lib/main.js::generateBinPath` reads this environment-selected path;
the build parent currently forwards the ambient environment unchanged.

Next bounded repair: include the effective external esbuild executable selection in the existing
compiler generation, own its bytes/mode and pass its captured location to the worker. Reuse the current
installation lifetime and source-path projection; do not introduce a general subprocess interceptor or
silently drop the override. Account for relative paths against the actual worker checkout, changes in
selection between retained builds, copy tampering, missing-path/fallback semantics and awaited cleanup.
Acceptance must exercise the real esbuild API after the external original changes or disappears,
unchanged deterministic identity and changed selection/bytes, plus the actual build handoff. Preserve
default package-native selection. Node/Electron executable ownership and platform/background lifetime
remain separate B1/B3 requirements; this proof does not close them.

## Captured external esbuild executable checkpoint (2026-10-17)

Source `5c5f733fb` makes preconfigured `ESBUILD_BINARY_PATH` selection part of the existing captured
compiler installation. Relative selections resolve against the actual worker checkout. The owner
copies selected bytes/mode through its existing copy function and projection, includes selection and
content in compiler identity, and supplies the private executable path in the worker environment.
Default package-native selection remains unchanged. A missing override retains esbuild's package
fallback and configuration warning; later materialization invalidates reuse rather than changing the
already captured worker's selection.

The installation now owns `isCurrent`: it checks original selection/content, the captured executable
(including symlink substitution), and the original/copied package graphs. The builder uses that one
operation instead of keeping another source-directory/hash comparison. Existing awaited disposal owns
the executable too. No new public API, manifest field, interception layer or record format is added.

Evidence:

- All twelve installation tests pass (2.13s): `/private/tmp/apack-external-executable-unit-final.log`.
  Actual esbuild transforms succeed after the external original changes or disappears; independent
  captures agree, changed bytes/selection invalidate identity/reuse, copy damage and symlink substitution
  refuse reuse, and a late invalid override cannot replace a captured missing-path fallback.
- Actual worker builds receive an owned read-only native executable and preserve source globals,
  output revision and type-cache identity across two publications (39.91s):
  `/private/tmp/apack-external-executable-build.log`. That combined run passed the real build case but
  failed a stale cancellation mock, so it is not recorded as an entirely passing run.
- The mock cancellation fixture is migrated to the current manifest/bootstrap layout; no production
  cancellation behavior or deadline changed. Its focused rerun passes (61ms):
  `/private/tmp/apack-external-executable-cancel-final.log`.
- CLI types, lint and the final distributable refresh pass:
  `/private/tmp/apack-external-executable-{types-final,lint-final,packages-final}.log`.

This closes the reproduced configured esbuild override defect. It does not certify arbitrary native
I/O or executable-wrapper dependencies, transient user-code changes to environment selection,
Node/Electron runtime ownership, retained frontend generation or other platforms. Retained generation
handoff is the next bounded implementation audit (B2); the remaining B1/B3 matrix and B4–B6, final
all-kind discovery and all Phase 6 requirements stay open. No broad gate was repeated.

## Retained frontend generation proof and design (2026-10-17)

Baseline `d8f4dd4ea`. `dev.ts` creates Vite in the supervisor after its one-shot initial build;
`startPackBuildWatcher` creates a separate retained builder. Refreshing that builder cannot refresh
the supervisor's already imported Vite/plugin modules. `createDevHold` also starts `server.close()`
without awaiting it, so it does not establish retirement before compiler disposal.

A disposable proof bundles the actual `packDevServerConfig`, captures its compiler packages and runs
real HTTP transforms through Vite. A fixture Vue plugin marks compiler generation A/B. Source changes
continue through the retained server, while changing the original compiler leaves its transforms on A;
a second capture/server uses B with a different compiler identity:

```json
{"firstA":true,"retainedA":true,"retainedSourceUpdated":true,"freshB":true,"identityChanged":true}
```

Script/log: `/private/tmp/apack-retained-frontend-proof.{mts,log}`. All sources, dependencies selected
for modification, server caches and compiler copies were private; both servers were closed and both
installations disposed. Initial fixture corrections concerned directory-symlink removal, bundling host
helpers as the actual CLI does, the unqueried entry redirect and awaiting real watcher invalidation.
They did not require production changes or a larger suite.

B2 implementation: the existing pack builder owns compiler generations and their optional frontend
worker. `pack dev` retains that builder from the initial build through watching; the watcher receives
its build operation, not ownership of the same compiler. Run Vite in a private worker from the selected
captured CLI, using the existing dev configuration and live authored root. Its compiler is captured;
its authored inputs remain live for HMR. A successful refresh hands the marker to the new ready server,
then awaits retirement of the old server before disposing its installation. A failed candidate retains
the incumbent server/compiler; close aborts startup/build work, awaits workers and then removes copies.
No simultaneous backend/frontend startup or atomic cross-process serving swap is required. A new
server may use a new port; the existing marker and successful-build app reload communicate it.

Prove actual A/B transforms and backend builds from matching generations, live source/HMR behavior,
failed-refresh recovery, retained reuse, marker handoff, awaited retirement and cleanup. Preserve source
paths, one-shot builds and existing cancellation. Keep remaining B1/B3 and B4–B6 requirements open.

## Retained frontend compiler ownership checkpoint (2026-10-17)

Source `a595246f2` implements the matching-generation handoff. The pack builder owns its captured
installation and optional Vite worker. `pack dev` retains this builder from initial publication through
watching; the watcher receives its build operation and closes its subscriptions without disposing the
session's compiler. The new private worker loads the existing dev configuration from the captured CLI,
keeps the authored root live and reports checked compiler identity/readiness. Markers name its actual
PID/port. Each server has a private writable cache/temp directory; replacement does not share optimizer
output with the incumbent. Server/process-group retirement is awaited before installation disposal.
The unawaited server slot is removed from `createDevHold`; its existing awaited owner cleanup closes
the builder. No public command, manifest field or SDK API is added.

Evidence:

- Actual pack publication, live Vue source invalidation, failed candidate retention, and backend/Vite
  A→B through the real watcher pass (50.14s including initial-build setup):
  `/private/tmp/apack-frontend-generation-acceptance.log`. The old process and compiler copy disappear
  after handoff; closing the watcher preserves the session-owned frontend; closing the builder removes
  all captured installations and all three server workspaces.
- All 27 initially affected builder/watch/dev-hold/cancellation/host-ownership cases pass (8.04s):
  `/private/tmp/apack-frontend-generation-unit.log`. The final six builder cases include native interrupted
  frontend startup, with its process and workspace terminal before inputs disappear (4.62s):
  `/private/tmp/apack-frontend-generation-startup.log`.
- CLI and scripts types, lint and the final distributable build pass:
  `/private/tmp/apack-frontend-generation-{types-final,scripts-types,lint-final,packages-final}.log`.

Two earlier integration attempts are failures, not acceptance: the first combined initial publication,
refresh and interrupted startup under one test's 60-second limit; the second reached successful A/B
handoff but its startup-ready poll also included full compiler capture. Initial publication is now
fixture setup, and startup cancellation is independently checked using the existing small real-process
fixture. Lifecycle assertions were retained across the two checks; no production deadline or global
test deadline was increased. Fixture compiler transforms intentionally omit maps; the run also reports
existing bare-host-import pre-transform, Browserslist and empty Tailwind warnings. HTTP/source-watch
acceptance is not a browser HMR acceptance claim.

B2 is still partial. Next audit pack-derived dev configuration (`build.bundleUi`, shared module/export
lists and entry changes): the retained server currently refreshes on compiler generation change or
absence, while these configuration inputs are read when the server starts. Settle their actual
invalidation boundary and prove browser/module-graph HMR with a real external dev session before
closing B2. Do not restart the now accepted compiler-generation owner. Remaining B1/B3 native/runtime
cases, B4–B6, all-kind discovery, all three Phase 6 workstreams and final strict `--all` remain open.

## Frontend configuration and browser HMR checkpoint (2026-10-17)

Source `d3833f788` closes the identified B2 configuration boundary. Startup inputs comprise the selected
entry, pack/npm metadata, resolved SDK/UI metadata and the shared-module inventory. A changed key gets
a replacement through the existing generation owner, even when compiler bytes/hash are unchanged.
This deliberately recaptures the same compiler for infrequent configuration changes, keeping ownership
simple; ordinary Vue/source edits retain the current server. Configuration is checked again after
startup and before reusing a live server. A refused `serveFrontend` request cannot replace the working
notification callback.

A disposable link-retargeting proof exposed a real omission in the first reader: Node's cached
`require.resolve` returned the former UI package after its link changed (`same: true`,
`afterHasTwo: false`). The repair promotes the existing package-input graph's fresh directory lookup
as `findPackageDirectory` and reuses it in frontend configuration and UI module discovery. There is no
second resolver or executable metadata import. The regression changes exports, retargets a live UI link
and proves both replacement and the new inventory while a declared module would throw if executed.

Evidence:

- All seven builder cases pass (5.04s), including unchanged reuse, configuration-only replacement,
  incumbent liveness during notification, refused-listener preservation, export changes and UI link
  retargeting: `/private/tmp/apack-frontend-config-link-unit.log`.
- All twenty package-input and twelve shared-dependency cases pass (0.113s test time):
  `/private/tmp/apack-frontend-config-host.log`.
- CLI/host types, lint and distributable refresh pass:
  `/private/tmp/apack-frontend-config-{types-final,lint-final,packages-final}.log`.
- A real headless Chrome session loads an external pack's **generated frontend registration**, mounts
  its declared app extension and connects the captured worker's actual Vite WebSocket. A template edit
  changes `FIRST 1` to `SECOND 1`, preserving component state and the existing document; no page errors
  occur. Script `/private/tmp/apack-browser-hmr-proof.mts`, final log
  `/private/tmp/apack-browser-hmr-proof-final.log`:

  ```json
  {"dom":"SECOND 1","documentPreserved":true,"generatedEntryReached":true,"websocketConnected":true,"errors":[]}
  ```

The browser proof supplies host Vue/SDK modules through an import map, as the pack dev configuration
requires, using the actual Vue runtime and compiled SDK frontend implementation. It uses a private
browser profile, pack, writable caches and compiler copy, then awaits all cleanup. It is browser HMR
acceptance through the generated pack entry, not a new full Electron/API/install acceptance run. The
server's optimistic bare-import pre-transform warnings coexist with the working host import map;
they were not suppressed. The first proof invocation had a wrong schema import and failed before
setup; fixing that proof path required no product fallback. After the pause, missing process handles
and an authoritative process check established termination before further work; no live run was restarted.

B2's generation/configuration implementation and local browser acceptance are now established with
`a595246f2` and this checkpoint. Preserve these results for final whole-goal validation. Remaining B1/B3
runtime/native/namespace and subscription acceptance, B4–B6, all-kind discovery and all Phase 6
requirements stay open. No broad gate or cross-platform runtime acceptance is claimed.


## Generation cleanup and runtime-copy feasibility (2026-10-17)

Source `a67edefc1` centralizes builder operation sequencing and closed-state checks, names frontend
readiness explicitly and separates absent, live and replacement server paths. Existing generation,
configuration, failure retention and shutdown ownership remain intact. All 29 affected builder,
watch/retry, session-hold and dev-cancellation/host-ownership tests pass in 7.49s; CLI typecheck,
focused correctness lint and diff whitespace checks pass. The first sandboxed run could not spawn
`/bin/ps` for two process-group cases; the same six-file run passes with process inspection permitted.
Log: `/private/tmp/apack-generation-cleanup-tests.log`. No broad gate is claimed.

The next B1 runtime audit inspected current `build-process.ts` and `frontend-process.ts`: both launch
`process.execPath`; installation capture owns compiler packages and an explicit esbuild override,
but not that runtime. Startup identity records versions/options, which does not own executable bytes.

A disposable plain-Node copy executes successfully on this darwin/arm64 checkout: 113,936,544 bytes,
matching copied bytes and version map, running from its owned executable path. Its inspected direct
loader dependencies are protected system libraries. This is a local feasibility result, not evidence
for every Node distribution or dynamically loaded dependency.

The Electron launcher has an `@executable_path/../Frameworks` lookup. Its framework also references
Squirrel, ReactiveObjC, Mantle and libffmpeg, so copying just the launcher is insufficient. A private
`Contents/MacOS/Electron` plus `Contents/Frameworks` copy preserves relative links and executes with
`ELECTRON_RUN_AS_NODE=1`. Final proof: 89 ordinary files, 263,592,589 bytes, 210ms copy time on this
machine/filesystem with clone-capable copying; matching version map and canonical owned executable
path; zero escaping symlinks. The executed runtime's diagnostic report lists the launcher and all
five non-system libraries inside the private copy. Protected system libraries remain outside it.
Proof and terminal log: `/private/tmp/apack-runtime-copy-proof.mjs` and
`/private/tmp/apack-runtime-copy-proof.log`; all private copied directories are removed in `finally`.
The proof uses no production profile or app startup. Initial path comparisons were corrected to
canonical paths (`/var` versus `/private/var`); library output is filtered before printing to avoid
Electron's truncated large `-p` output. Neither correction changes product code.

Next implementation must retain the selected runtime under the existing compiler-installation
lifetime, use it for both backend and frontend workers, and bind original/captured runtime inputs into
identity and reuse checks. Preserve compiler source-path mappings, launch options and dev/HMR behavior.
Check actual supported platform layouts and externally linked runtime libraries before claiming
portable closure; this local proof does not authorize ignoring them or a generic native-I/O sandbox.
Remaining namespace/subscription acceptance, B3 lifetimes, B4–B6 and all other goal phases stay open.


## Selected runtime ownership checkpoint (2026-10-17)

Source `e369d3cb9` adds the selected runtime to the existing captured compiler installation. Both
backend and Vite workers launch `compiler.executable`; disposal remains under their generation owner.
Runtime bytes, executable permissions, symlinks and directory membership contribute to compiler
identity. Admission verifies the copied runtime, and reuse checks original and captured identities;
a missing, damaged or externally aliased executable refuses reuse. Runtime copies use clone-capable
exclusive copying and are verified against the initially read byte hashes before admission. No new
receipt, cache authority, runtime fallback or compatibility path was added.

Plain Node captures its executable. Electron on macOS additionally captures the adjacent Frameworks
tree, preserving framework links and resources; other Electron layouts conservatively inventory the
executable's distribution directory. Those other layouts still require platform acceptance and cost
review. This is not proof that every external runtime library or native I/O path is owned: linked
Node distributions and platform-specific native dependencies remain explicit B1/B3 requirements.

Evidence on current darwin/arm64:

- Runtime inventory, installation and builder regressions: 22 cases pass in 26.54s,
  `/private/tmp/apack-owned-runtime-focused.log`. A subsequently added source-replacement case passes
  separately in 5.91s, `/private/tmp/apack-runtime-source-replacement.log`: a disposable selected Node
  executable is replaced; reuse refuses it while its captured executable still runs captured compiler
  code. No developer-installed binary is edited. The Windows running-executable replacement constraint
  and Electron's adjacent-library requirement exclude that particular plain-Node fixture there.
- The integrated capture runs Electron in Node mode with matching versions, its actual executable in
  the owned tree, and all six non-system loaded images inside that tree. Original and copied runtime
  identities agree. `/private/tmp/apack-owned-electron-runtime.log` records the result; copied runtime
  and fixture directories are removed in `finally`. This uses no production profile or GUI startup.
- Both real integration files pass (three cases, 72.93s): actual backend/Vite A/B generation replacement,
  ordinary source update, failed frontend replacement retention, watcher/session cleanup and dev-build
  cancellation. `/private/tmp/apack-owned-runtime-integration.log`. Existing bare-import fixture and
  sourcemap warnings remain; no assertions or deadlines were increased.
- CLI typecheck, eight-file correctness lint, package refresh and whitespace checks pass.
  `/private/tmp/apack-owned-runtime-types-final.log` and `/private/tmp/apack-owned-runtime-packages.log`.

The initial unit run exposed a readiness-fixture assumption rather than a hung compiler. A direct
measurement found 320ms capture, 1,167ms first execution of the copied Node and 33ms subsequent
execution (32ms for the original). Redundant capture-time original rereads were removed, and verified
clone-capable copying avoids a full byte write. Two shutdown tests now prepare and first-launch their
real captured compiler before starting the existing one-second shutdown-readiness observation; they
retain their original lifecycle assertions and deadlines. This does not hide product startup cost:
the first owned runtime launch still pays it. No claim is made about its OS-internal cause.

Next: audit externally linked native/runtime inputs and remaining namespace/subscription cases from
the existing finite matrix; retain implemented runtime ownership. Close B3 resource/platform cases,
then B4's successful input/output association and B5 consumers before B6 convergence. All discovery
and Phase 6 requirements and the final committed-source strict `--all` remain open. No broad gate or
cross-platform completion is claimed.


## Idle tooling-input subscription audit (2026-10-17)

After `e369d3cb9`, `compilerWatchPaths` still inventories only pack/module dependencies. The builder
checks changed compiler/runtime inputs when invoked, but idle watches do not subscribe to those inputs.
Two private regression cases fail before implementation: selected compiler/runtime/override paths are
absent, including during broken pack configuration. `/private/tmp/apack-tooling-watch-repro.log`.
The bounded correction is to include the selected distributable compiler graph, existing runtime
inventory, and the same configured esbuild override selection in the current observer/signature.
Register these before pack discovery so configuration failure preserves repair subscriptions. Reuse
existing path matching, physical-link guards, coalescing, failure retention and watcher teardown;
no new scanner, watcher framework or persisted receipt. Acceptance must include compiler edits,
runtime edits and missing override creation while the authored tree remains unchanged, plus actual
filesystem event delivery through a retained watcher. This closes one B1 subscription gap, not native
library/platform or successful input/output association requirements.


### Idle tooling subscription checkpoint

Source `0bb9e64ec` implements the bounded correction above using the existing package/runtime readers
and esbuild override selector. Valid signatures include those inputs; failed pack discovery retains
their repair probes. Physical-link guards and watcher coalescing/teardown remain the existing owners.

All 23 watcher/runner/retry cases pass in 3.67s, including actual private filesystem changes to compiler,
runtime and initially missing override with no authored edit. Two affected override ownership/fallback
cases pass separately in 5.45s. Logs: `/private/tmp/apack-tooling-watch-focused.log` and
`/private/tmp/apack-tooling-watch-override.log`. The first real-FSEvents attempt inside the sandbox
returned asynchronous EMFILE errors; the same tests pass outside it without changing limits or
assertions. Unit fixtures use private tiny tool inventories, avoiding repeatedly scanning the real
compiler for tests about unrelated resolution behavior.

CLI types, three-file correctness lint, package refresh and whitespace checks pass. A separate real
inventory probe against the refreshed distributable compiler succeeds and explicitly verifies the
selected runtime and CLI entry subscriptions: 15,413 paths, 3,382ms on this checkout. Log:
`/private/tmp/apack-tooling-watch-inventory.log`. That is an observed scan cost, not a latency guarantee;
the watcher now performs the complete tool inventory when refreshing its input signature. No
unvalidated metadata cache or event-only freshness authority was introduced.

This closes the demonstrated idle tooling subscription omission. Continue the existing B1/B3 matrix's
externally linked native/runtime, namespace/thread and platform lifetime acceptance; B4–B6 and all other
active goal phases remain required. No broad gate or cross-platform completion is claimed.


## Native module and namespace/thread acceptance (2026-10-17)

Checkpoint `701928e9f` adds a real outside native-addon execution case. It passes against existing
production code: no new loader, native hook or namespace framework is needed. The current input view
materializes positive file queries in `snapshot()`, and native module resolution uses that owned tree.
The case copies the platform Rollup addon into a private location outside the pack, loads it through
an authored CommonJS compiler module, verifies the exported native function, compares owned bytes,
and checks the runtime's loaded-image report: the owned addon is loaded; the original private source
is not. Modifying that source then refuses final input validation. This is darwin/arm64 acceptance,
not proof about every addon's external libraries or another platform's unload behavior.

The strengthened case passes in 17.57s including runner setup:
`/private/tmp/apack-native-module-owned.log`. Its initial version also passed; loaded-image assertions
were added because merely finding copied bytes would not prove which library executed.

Current bounded reconciliation:

| Path | Existing owner and evidence | Disposition |
|---|---|---|
| Authored/declared dependency bytes before preloads, package membership and initially absent dependencies | `createPackCompilerInputView`; five view cases and actual native startup case | Supported cases accepted; retain them for final validation. |
| Outside transitive imports, missing/retargeted resolution parents, ambient types, Vue scripts and projected identities | `readCompilerModuleInputs`, file view and native read tree; all 24 module-input cases pass | Supported namespace cases accepted; no replacement resolver needed. |
| Outside native addon execution and changed-input refusal | Common module/input owner; new actual loaded-image case above | Locally accepted; external native-library and platform lifetime coverage remain open. |
| Thread observation consistency, native refusals, cursor prefixes and restoration conflicts | `createCompilerInputObservations`, `assertNativeCompilerObservations`; four cases pass; `finishStartup` awaits startup observations and merges with compilation observations before final validation | Serialized consistency accepted; this does not prove every platform/thread resource lifetime. |

The 33 view/observation/module-input cases pass in 1.75s:
`/private/tmp/apack-namespace-thread-acceptance.log`. The existing actual early-native startup case
also passes (2.13s including runner setup), preserving initial options and authored/dependency bytes
before a preload rewrites ambient values:
`/private/tmp/apack-native-thread-startup-acceptance.log`. CLI types, focused correctness lint and
whitespace checks pass. No full integration suite or broad chain was rerun.

Next reconcile effective environment inputs used by actual frontend/content compilation with the
execution identity before B4; do not infer coverage from NODE_OPTIONS alone. External linked native
libraries and required platform/thread lifetimes remain in B1/B3. B4–B6, all-kind discovery, all three
Phase 6 streams and final strict committed-source `--all` remain required.


## Initial environment identity audit (2026-10-17)

The real frontend bundler emits different `import.meta.env.VITE_APACK_PROBE` values for two otherwise
identical inputs, while `compilerExecutionIdentity()` remains identical. Disposable proof:
`/private/tmp/apack-compiler-environment-proof.mts`, terminal log
`/private/tmp/apack-compiler-environment-proof.log` (`outputsDiffer`, both environment-use assertions
true; `identitiesDiffer` false). No production data or installed binaries are changed.

The bounded correction is a digest of the initial inherited environment, shared by execution identity,
frontend configuration identity and watch signatures. Include arbitrary content/compiler environment
keys rather than an allowlist that misses author-defined reads. Exclude explicit private transport,
cache/diagnostic and owned-temporary-directory fields; normalize captured compiler paths back to their
source origins. Persist only a digest, not raw values. Capture execution context once before user
initialization/compilation, matching the existing startup semantics: deterministic compiler/preload
mutations are execution, not external changes to launch inputs. Do not proxy process.env or change the
environment's runtime behavior. Prove ordinary value/membership changes, private-field/path stability,
redaction, actual frontend output and retained-generation replacement. This is B1 input coverage and
B2 configuration coherence, not a new environment service or completion of B4's successful receipt.


### Initial environment identity checkpoint

Source `84f473549` adds a shared initial-environment digest to native execution identity, frontend
configuration and watcher signatures. Arbitrary author/compiler keys participate, avoiding a VITE-only
allowlist. Explicit transport/temp/cache/diagnostic fields are excluded; owned compiler path prefixes
normalize to source origins without conflating unrelated same-prefix paths. Raw environment maps are
not recorded. Existing ordered NODE_OPTIONS remains separate. In-process compilation now captures its
initial execution context once, consistently with native startup; no process.env proxy or mutation of
the runtime environment was introduced.

Evidence:

- The original frontend proof now reports different emitted environment-dependent output **and**
  different identities. `/private/tmp/apack-compiler-environment-fixed.log`.
- All 25 environment/condition/watcher/builder cases pass in 33.05s. This includes value/presence and
  ordering checks, private-path/transport stability, digest redaction and retained frontend generation
  replacement when an inherited VITE key changes. `/private/tmp/apack-environment-focused.log`.
- The refreshed bundled native startup captures the original environment before a user preload
  changes a normal key, alongside the existing options/data checks. One case passes (95ms body,
  3.00s runner total), `/private/tmp/apack-environment-startup.log`.
- CLI types, eight-file correctness lint, package refresh and whitespace checks pass.
  `/private/tmp/apack-environment-types-final.log`, `/private/tmp/apack-environment-packages.log`.

The fake builder's mutable input-hash handoff moved from an environment variable to its existing
private `.apack` fixture directory. This preserves its protocol without a test-only exclusion in the
production environment contract.

A required repeat-build check hit its unchanged 60s aggregate budget during the second build, after
reporting facade reuse: `/private/tmp/apack-environment-repeat-build.log`. Owned processes stopped;
subsequent authoritative process inspection found another worktree running integration jobs, which
does not establish the timeout's cause. One diagnostic run with a command-local 120s observation
allowance completes both builds in 64.02s and passes unchanged assertions for the sealed revision,
cache stamp and workspace cleanup: `/private/tmp/apack-environment-repeat-build-diagnostic.log`.
This proves normalization across real private compiler/runtime/esbuild copies. No committed test or
product deadline changed. The default-budget failure remains a B6/final-gate validation item; the
longer diagnostic pass is not a strict-gate pass. Do not repeat a broad run to investigate it.

The environment identity is deliberately conservative: included keys invalidate even when a given
compiler does not read them. B4/B5 must state the expected build context, rather than treating the
ambient environment of a different authoring command as equivalent or persisting raw credentials for
replay. This checkpoint closes the demonstrated initial-environment omission; native external-library
and platform/lifetime acceptance, B4–B6 and all other goal phases remain required.


## Passive glob observation audit (2026-10-17)

B4 inspection found a concrete serialization gap: `compiler-file-view` records a TypeScript `glob`
query, but native observation replay correctly refuses that compiler-specific operation. A new
private regression fails before implementation with `Unsupported native compiler observation: glob`:
`/private/tmp/apack-glob-observation-repro.log`. Its include pattern reaches an initially empty nested
directory outside the pack, so replay must also detect a deep later addition.

Reuse the existing filesystem read scope while the actual TypeScript directory operation executes.
Record its directory and consumed metadata facts, rather than persisting a glob operation that would
require TypeScript in passive readers. Keep TypeScript as the resolver/selector; no second glob
implementation or recursive source scanner. Preserve the local captured result/argument cache and
live compiler-side final validation. Native replay must accept unchanged facts, refuse a deep added
match, and accept exact restoration. This is a prerequisite for persisting the completed frame,
not completion of B4 or a replacement for the existing output receipt.


### Passive glob replay checkpoint

Source `6c7198474` records the native directory/metadata facts consumed by TypeScript's actual glob
operation, keeping its selector and local result cache. The authored owner supplies its complete file
inventory; passive replay does not activate TypeScript. Unchanged inputs and exact restoration pass;
a deep outside addition refuses replay. Generated authored outputs stay excluded, including physical
path aliases. Fifty view/module/observation cases, CLI types/lint/package refresh and real early native
startup pass. Evidence: `/private/tmp/apack-glob-normalized-final.log`,
`/private/tmp/apack-glob-normalized-types-final.log`, `/private/tmp/apack-glob-native-startup.log`.
This closes the demonstrated frame-serialization gap; B4 persistence remains outstanding.

### Compiler/watch integration repair (2026-10-17)

The preserved rebase log reported eight failures across four watch integration files. Stash
`aa4d761c` changes diagnostic deadlines only and remains intact. An unchanged external-types
reproduction triggers and publishes its external edit but exceeds its total test budget. Its CPU
profile attributes about 16s to repeated watcher discovery and about 7s separately to retained compiler
verification; this demonstrates redundant work, not a missing event or the cause of every historical
failure. Profile: `/private/tmp/apack-watch-profile`; baseline: `/private/tmp/apack-watch-external-baseline.log`.

The repair retains tooling discovery per watch session until a relevant tooling/environment change,
preserving physical aliases, partial repair probes, missing members and unnamed-event invalidation.
Initial post-build discovery closes the subscription window. Build-time compiler byte verification
remains independent. Temporary module-discovery views are disposed after each scan. No timeout,
assertion, fixture input or compiler verification was weakened.

All 24 cases in the four affected integration files pass with two workers, including all eight reported
failures: `/private/tmp/apack-watch-affected-two-cores.log` (316.16s). Eighteen focused watcher cases,
CLI typecheck and three-file lint pass: `/private/tmp/apack-watch-focused-final.log` and
`/private/tmp/apack-watch-types-final.log`. The external-types case remains close to its unchanged
60s budget (59.58s); this is not robust timing headroom. The broader pool was interrupted to target the
affected cases, after 12 compiler-filesystem cases passed; it separately found an existing shared-package
list refusal at `fe-bundler.ts:376`. `/private/tmp/apack-watch-integration-two-cores.log` is not a
completed broad gate. The original repeat-build budget failure, B4–B6 and final strict acceptance remain
open. No work in the Claude research worktree was changed.


## Common input-record boundary audit (2026-10-17)

B4 must bind completed observations to sealed output, not merely store the initial phase-cache hash.
The current `finishStartup()` validates a merged frame then discards it. Native replay currently lives
in the CLI, so passive host consumers cannot reuse it without reversing the package boundary. Move
that existing native capture/replay owner to `@apackdev/host/build/compiler-inputs`; keep TypeScript
activation, compiler installation and worker lifetime in the CLI. No second scanner or query grammar.

This checkpoint must preserve existing filesystem/metadata/cursor behavior and actual native startup,
and prove fresh-process host replay neither imports TypeScript/Vite/CLI nor installs filesystem hooks.
Then expose the completed producer frame and bind it through the existing integrity record. Audit
reused phase outputs too: a phase skipped by a cache cannot silently drop its external consumed inputs
from the successful record. Expected media/public/CSS/chunk output membership and B5's four consumers
remain required; moving the shared owner does not close B4 or platform/native-library acceptance.


### Common native input owner checkpoint

Source `0434a0703` moves the existing capture/replay implementation to the host-only
`build/compiler-inputs` export, with every CLI reader migrated and no forwarding files. The shared
filesystem contract no longer imports TypeScript types. Explicit compilation scopes still own adapter
installation; importing/replaying facts does not activate a compiler or replace filesystem operations.
Host bridge policy explicitly keeps this tooling out of pack runtime APIs.

All 82 capture/namespace/metadata/cursor/descriptor/path/replay and bridge checks pass in 4.35s:
`/private/tmp/apack-common-inputs-focused-final.log`. The fresh-process replay probe poisons compiler
imports and checks unchanged native read/stat functions. Actual bundled early startup also passes
(73ms body, 1.90s total): `/private/tmp/apack-common-inputs-native-startup.log`. Host/CLI types,
39-file lint and package refresh pass. No broad suite was rerun. This is shared ownership, not completed
B4 persistence or final acceptance. Next expose and validate the completed frame, including explicit
generated reads and retained inputs from reused phases, before binding it to sealed output.


### Explicit generated-input replay checkpoint

Source `2d7dd140c` repairs a demonstrated completed-frame gap: a compiler explicitly captures generated
bytes, but replay applies authored-discovery exclusions to those recorded reads and rejects unchanged
input. The regression fails before the repair at `file/src/__generated__/types.ts`:
`/private/tmp/apack-completed-frame-generated-repro.log`. Replay now honors explicit file/location facts;
it does not add all generated files to authored membership. Unchanged input, an unrelated generated
addition and exact restoration pass; changed consumed bytes refuse. Fifty-two affected cases, including
fresh-process passive replay, pass in 2.28s: `/private/tmp/apack-completed-frame-generated-focused.log`.
Host/CLI types, two-file lint and whitespace checks pass. No broad suite was rerun.

Next producer work remains B4's completed successful record, common integrity association and expected
output inventory, followed by B5 consumers. In that design, distinguish captured timestamps consumed by
author code from incidental file touches, and retain external inputs of reused phases. These are
acceptance requirements to inspect, not authorization for another scanner/cache framework. Native
external-library/platform lifetime cases and the final committed-source strict gate remain open.


### External-types aggregate budget correction

The user reports another external-types 60s aggregate timeout after the repaired case passed in
59.58s. Its four compiler attempts share one scenario budget. Give only this scenario 120s; retain all
20s rebuild waits, assertions, input scope and global/suite budgets. This follows the demonstrated
aggregate cost, not an assumption that every integration timeout is slow compilation. The prior
unchanged-assertion two-worker pass remains behavioral evidence; the larger limit is not a new pass
or a claim that individual rebuild stalls are fixed.


### Completed source input/output association checkpoint

Source checkpoint: `0192d2819`.

`dist/build-inputs.json` is source-only metadata, sealed by the existing integrity receipt alongside
all output. No layout stamp, snapshot format, installed asset manifest or revision algorithm changes.
Existing staging filters omit this root metadata just as they omit `phase-cache.json`. The common host
reader checks the record against the verified receipt and replays current source/package facts without
compiler or pack activation. The initial execution context is a digest, never raw environment values;
a different inspecting command's ambient environment is not the recorded build context.

The producer settles loader teardown and startup threads, performs final input validation, merges
completed observations and writes the record before sealing. Its package graph scope is root-relative,
flags are sorted/unique and observations use the existing deterministic encoder. Early phase hashes
remain private keys, not substitutes for the completed frame. Cache reads require a verified/current
record; reused phases retain the prior facts into final validation and the replacement record. A
changed external input therefore cannot disappear merely because its phase was skipped. Failure
continues to discard the candidate and retain the incumbent pair.

Actual publication exposed two representation defects, repaired here rather than hidden by a timeout:

- A private compiler runtime's absent `lib` path projected onto a present original directory, causing
  immediate false staleness. Frame completion excludes installation-owned facts before projection;
  their captured/read-only installation and identity remain their owner. Build-time full validation
  remains intact. Generic capture/projection tests retain their original complete frames.
- Native resolver preparation enumerated raw root siblings, accidentally making publication-created
  `dist` an input. It now uses the existing filtered resolution inventory instead of duplicating its
  enumeration. Explicit entry into a generated directory still admits and verifies that directory's
  files/membership; ordinary authored membership remains unchanged. Raw pack-code directory reads
  retain their original native semantics.

The fresh-process passive test also caught an indirect TypeScript import through layout's SDK build
barrel. Existing byte/receipt verification and its walker now live in the native `packs/assets.ts`
module, shared with layout and the record reader. There is one verifier, with unchanged format,
checksum, membership and identity rules. The full existing 110-case layout/installation suite passes.
The complete authored/dependency input-view constructor also moved to the common host owner; CLI
imports it rather than retaining a second implementation or compatibility wrapper.

Evidence:

- 100 cases across ten affected files pass in 5.65s, including a fresh process that blocks compiler
  imports and checks filesystem functions remain unintercepted. Log:
  `/private/tmp/apack-build-record-focused-final.log`.
- 110 existing layout/receipt/staging/installation cases pass in 3.57s:
  `/private/tmp/apack-build-record-layout.log`.
- Real captured worker, two builds: source-frame currentness, prior phase reuse, identical sealed
  revision and both input-tree removals pass (50.00s case, 51.68s runner):
  `/private/tmp/apack-build-record-worker-final.log`. This used a command-local 120s diagnostic budget
  for the previously measured 64s scenario; no default budget changed and this is not a strict-gate
  result. The later native-verifier relocation is behavior-preserving and covered by its 110 cases.
- Host/CLI typechecks pass; logs `/private/tmp/apack-build-record-{host,cli}-types-final.log`.
  Changed-file lint is recorded in `/private/tmp/apack-build-record-lint.log`.

This closes B4's completed-frame/receipt association slice. Expected producer output membership and
bytes (media/public/CSS/lazy/worker), remaining B1/B3 external-library/platform lifetime acceptance,
B5's archive/prebuilt/default-fork/drive policies and expected compiler/options contexts, B6, all
Phase 6 streams and final committed-source strict `--all` remain required. No broad gate was repeated
to diagnose these two reproduced failures, and no whole-goal completion is claimed.


### Frontend shared-metadata selection repair

`readPackDevServerInputs` derived its metadata list from literal SDK/UI names. The shared-package
rule correctly rejected the duplicated SDK inventory. It now derives SDK package owners from the
frontend `getSdkFeModules()` declaration through `sharedInstancePackage`, deduplicates them and keeps
UI's dynamic metadata. It does not substitute `SHARED_INSTANCE_PACKAGES` or the backend dependency
list: EARS remains bundled by frontends rather than becoming host-shared frontend startup metadata.

Six `findSharedPackageLists` cases pass, including every registered consumer, with the check unchanged:
`/private/tmp/apack-frontend-metadata-rule.log`. All eight builder cases pass (26.35s runner), including
a new regression proving SDK/UI metadata changes alter the startup signature while an EARS-only
metadata change does not: `/private/tmp/apack-frontend-metadata-focused.log`. The first sandboxed
builder run reached two `spawn EPERM` failures when its existing process-group cleanup launched `ps`;
the permitted rerun passed without source, assertion or deadline changes. CLI typecheck and changed-file
lint pass; type log `/private/tmp/apack-frontend-metadata-types.log`. This resolves the previously
recorded hardcoded-list failure; it does not convert the interrupted broad integration run into a pass.


### Frontend output expectations checkpoint

Source checkpoint: `0e84bd67c`.

The producer now retains final writer byte hashes in `build/build-outputs.ts`, scoped to its candidate.
Frontend bundling records Vite's actual returned chunk/asset bytes and copied public bytes from the
existing public-file walk. The build checks these expectations after loader/thread settlement and
input validation, immediately before sealing. Missing/changed expected output refuses the candidate;
there is no second on-disk output manifest or reference scanner. Existing integrity and installation
rules remain the published authority. Ordered writes preserve Vite's intentional replacement of a
public placeholder by an emitted file; they do not impose a new collision policy on that behavior.

Focused acceptance:

- The actual frontend compiler emits CSS, a lazy chunk, a worker, their maps and nested public files.
  Every recorded output matches its written bytes; deleting or changing each file refuses the final
  check, and restoration succeeds. This also covers an emitted entry replacing `public/fe.js`.
- The existing captured-public case now exercises expected-output recording: changed live public
  originals do not replace captured copied bytes, file permissions survive, placeholders are replaced,
  and the existing input-change refusal remains. Both frontend cases pass (12.08s runner, 9.70s bodies):
  `/private/tmp/apack-output-expectations-frontend-final.log`.
- The actual build's missing-producer-output case refuses before sealing, keeps the incumbent directory
  inventory and removes staging (20.01s): `/private/tmp/apack-output-expectations-publication.log`.
- The output owner refuses missing/changed/escaped output, accepts restored bytes and tracks ordered
  replacement: `/private/tmp/apack-output-expectations-unit.log`.
- CLI typecheck, seven-file lint and package refresh pass. Type and package logs:
  `/private/tmp/apack-output-expectations-types-final.log`,
  `/private/tmp/apack-output-expectations-packages.log`.

Remaining B4 producer work is media plus backend/content/helper and declaration/reused-phase writer
results. Extend this same short-lived expectation owner from their actual copy/writer results; do not
invent a new receipt or infer dependencies from generated JavaScript. B1/B3 lifetime acceptance, B5
consumer policies, B6, all Phase 6 streams and final committed-source strict `--all` remain required.
No broad or final acceptance is claimed by these focused checks.


### Content and media output expectations checkpoint

Source checkpoint: `72435c778`.

`CompilePackOptions.recordOutput` reports the actual writer bytes at absolute output paths. The CLI
passes its existing in-memory output owner. All compiled source/dataset JSON, the content index and
ordinary media-file copies report through the same write path. The callback observes bytes already
consumed from the accepted input view; it does not rescan live source or reconstruct output from
content links. Native link/special-file copying and the installed regular-file policy are unchanged.

Acceptance:

- All 22 content-compiler cases plus the output owner pass (2.49s runner). The existing markdown/media
  case now proves exact callback membership and bytes for content, index and media:
  `/private/tmp/apack-content-output-unit.log`.
- The real external-pack build compiles media, then the test removes its copied file before completion.
  Final output validation refuses publication, preserves the incumbent directory inventory and removes
  staging (24.10s case, 28.20s runner): `/private/tmp/apack-content-output-publication-final.log`.
  An initial fixture inherited the helper's default memos feature; declaring `features: {}` fixes the
  fixture without changing the exercised compiler or acceptance assertion.
- SDK and CLI typechecks and five-file lint pass. Type logs:
  `/private/tmp/apack-content-output-{sdk,cli}-types.log`.
- Packages refresh succeeds before report generation. The first report update refused stale published
  packages as designed; after refreshing, the generated contract adds only the callback. Existing LF
  report endings are preserved. All 28 SDK reports check current:
  `/private/tmp/apack-content-output-api-check.log`.

Remaining B4 writer coverage is native backend/content/helper bundles and declaration/reused-phase
outputs. Existing receipt/format and installed source-free behavior remain unchanged; B1/B3 acceptance,
B5 consumer policies, B6, all Phase 6 streams and final strict committed-source `--all` remain required.


### Remaining writer output expectations checkpoint

Source checkpoint: `d4e24d4b5`.

The same candidate-scoped owner now receives every supported file writer:

- esbuild backend/runtime, content compilers/runtime and step facets report emitted bytes after the
  existing source-map projection. A standalone caller requesting output records also writes those
  captured results; the ordinary standalone path and in-memory flow-helper module path retain their
  existing behavior. A missing native output inventory refuses rather than silently recording no files.
- Facade, helper and Monaco DSL declarations report text after rendering and union normalization.
  Flow-helper executable text is in the snapshot, not a fictitious separate file.
- Reused phase output must be present in the previous verified receipt and match its expected hash
  before copying. Captured matching bytes are written with copied permissions and recorded for final
  destination validation. A changed cached file cannot be re-signed merely because it was copied.
- Snapshot, private phase-cache and completed input metadata retain expected writer bytes too. The
  input writer returns its canonical encoding rather than making the CLI duplicate its serialization.
  Final sealing still owns the canonical manifest and integrity receipt, without another format/store.

The facade/DSL internal call interfaces now take their optional compilation/read/output controls in
one options argument. All in-tree callers are migrated; no positional-argument compatibility path.

Evidence:

- 28 unit/passive cases across four files pass (2.10s), including changed reused bytes, missing receipt
  membership, post-copy destination changes and compiler-free record verification:
  `/private/tmp/apack-remaining-output-unit-final.log`.
- All six DSL cases pass (2.77s), including expected final rendered bytes and post-write corruption:
  `/private/tmp/apack-remaining-output-dsl.log`.
- Three real native-compiler cases pass (11.36s): inherited resolution/transform behavior without an
  owned tree, captured configuration without live reparsing, expected rewritten output bytes and a
  missing source map: `/private/tmp/apack-remaining-output-native-final.log`.
- Host/CLI types, eleven-file lint and packages refresh pass. Logs:
  `/private/tmp/apack-remaining-output-host-types.log`,
  `/private/tmp/apack-remaining-output-types-final.log`,
  `/private/tmp/apack-remaining-output-packages-final.log`.
- Actual captured worker: two builds preserve phase reuse, identical sealed revision and input-tree
  cleanup in 65.20s (67.42s runner): `/private/tmp/apack-remaining-output-repeat-diagnostic.log`.
  Its default 60s scenario run timed out during the second completion after reaching phase reuse:
  `/private/tmp/apack-remaining-output-repeat.log`. No own child remained afterward. The previously
  measured 64.02s run predates these writer changes; 50.00s was also observed. Only this two-installation,
  two-build scenario now receives 120s total, with assertions and global budgets unchanged. The
  diagnostic behavioral pass is not a strict-gate pass; the deadline-only edit was not rerun separately.

Supported file-writer expectation coverage is implemented; it does not waive B1/B3 external-library
or platform/thread-lifetime acceptance. B5 now needs the four actual consumer policies/comparison
contexts and migration off their replaced freshness heuristics. B6, all Phase 6 streams and the final
committed-source strict `--all` remain required. No broad acceptance is claimed here.

## Prebuilt-test consumer checkpoint

Source checkpoint: `c70f37c3b`.

The Playwright fixture now uses the common sealed build-input record instead of `staleBuildOutput`.
It verifies output integrity before replaying the completed source/dependency observations and requires
the recorded `--release` option for a release test invocation. Its context is the compiler/execution
context of the explicitly selected existing build; the Playwright process's environment does not become
a new compiler context. A normal prebuilt invocation may test a release build. This check neither
compiles nor activates the pack, and installed/offline discovery is unchanged.

Five filesystem cases cover timestamp touches, same-mtime source/dependency edits, exact restoration,
linked external inputs, added/removed membership, missing/modified output and metadata, missing dist,
and the release-option requirement. They pass in 2.01s (90ms test bodies):
`/private/tmp/apack-prebuilt-record-regression.log`. Ten existing checkout-freshness cases also pass;
the combined run initially exposed an overly specific error-message assertion in the new dependency
case, corrected to require the actual changed dependency path. Testing types and four-file lint pass:
`/private/tmp/apack-prebuilt-record-types-final.log`, `/private/tmp/apack-prebuilt-record-lint.log`.

The archive-based fixture path still has its separate mtime check. Archive/default-fork/drive migration,
actual cached app-preparation acceptance, B1/B3 lifetime closure, B6 and final strict acceptance remain
open. Archive also needs a deliberate boundary for root-level generated archive output: the current
authored inventory would otherwise treat a default-location archive as a new source input. This finding
does not justify omitting archive freshness or broadly excluding arbitrary authored `.tgz` inputs.

## Default-fork consumer wiring and real prebuilt acceptance

Default-fork preparation now verifies the selected shipped output and replays its common completed
input record before capturing its revision, and again after building the fork. The comparison context
is the selected build's captured compiler/options, not a newly inferred environment for the preparation
script. The prepared handoff now pins its archive SHA-256; verification checks actual archive bytes
and exact published checksum contents rather than accepting two files merely because they exist.

Direct typechecking of `tests/scripts/prepare-default-pack-fork.ts` passes (the normal `tests/tsconfig`
does not itself include that script): `/private/tmp/apack-default-fork-direct-types.log`. One-file lint
passes: `/private/tmp/apack-default-fork-record-lint-final.log`.

The normal `npm run build:default-setup` refreshes the changed testing/CLI packages and successfully
publishes the real default pack with its completed record and supported expected outputs:
`/private/tmp/apack-b5-default-setup-build.log`. A direct call through the actual prebuilt consumer
accepts that build without compilation and refuses it for a release invocation:
`/private/tmp/apack-prebuilt-real-default.log`. The first sandboxed build attempt stopped at tsx's IPC
socket before compilation; the permitted normal command completed successfully.

The full fork preparation, cache-reuse and app boundary have not been rerun for this wiring. Run them
once with the remaining archive/drive migrations rather than rebuilding this large fork at every
consumer edit. This is not a converged or whole-goal strict pass; B1/B3, B6 and every preserved Phase 6
stream remain required.

## Archive and drive consumer checkpoint

Default-fork source checkpoint: `6a4f68602`.

All four B5 consumer implementations now use the common completed record for pack freshness:

- Archive holds the producer lock before reading its record, verifies sealed output, replays inputs,
  creates the archive in an owned temporary directory and rechecks inputs before copying archive and
  checksum into the requested destination. Source/input refusal leaves incumbent published files intact;
  the lock is released even if temporary cleanup fails. Default output is now `.apack/archives`, so a
  repeat archive does not add generated downloads to authored membership. Arbitrary `.tgz` source inputs
  are not excluded. Custom `--out` stays available; callers should keep generated output under `.apack/`
  or outside the source tree. Its expected compiler/options context is the selected build's captured
  context, not the environment of this packaging command.
- `PACK_ARCHIVE` captures the current local record and its verified receipt together, uses staging's
  existing published-file projection and compares the installer's verified candidate during acceptance.
  Its input replay happens again there, preserving rollback on refusal. This avoids both duplicate archive
  extraction and a second read that could combine one build's options with another build's file map.
  Without local dist, an explicit archive remains independently verified without authored-source
  comparison. A requested release comparison requires local release output. Every fixture install also
  checks the expected pack id before placement.
- Drive checks the default pack's sealed record and inputs but continues on refusal with attributed
  guidance. The app-runtime timestamp hint remains explicitly separate; that app build does not publish
  a pack record. Drive does not claim that hint proves runtime freshness.

Removed `staleBuildOutput`, the archive mtime walker and the replaced pack-side drive comparison.
The published-file projection is shared with staging/source provenance; no new input scanner or receipt.
Updated CLI help, public reference, fixture guide and release-test stand-in agree with the new contract.

Evidence:

- All 31 release/archive integration cases pass (9.89s runner), including repeated default-location
  archives, timestamp touches, same-mtime manifest changes, byte restoration and retained checksum:
  `/private/tmp/apack-b5-archive-release.log`. The final archive regression passes in 2.43s runner
  (154ms body): `/private/tmp/apack-b5-archive-repeat-final.log`.
- Six prebuilt/archive cases pass with the pinned receipt projection (2.21s runner, 132ms bodies):
  `/private/tmp/apack-b5-archive-consumer-pinned.log`. They include altered published-file hashes,
  changed inputs at acceptance, source-free archive selection and release-comparison refusal.
- 113 layout/record cases and ten staging cases pass in the initial 124-case run; one existing staging
  case is sandbox-blocked at `os.uptime()` (`uv_uptime EPERM`): `/private/tmp/apack-b5-host-layout.log`.
  All eleven staging cases then pass with system-uptime access (1.47s):
  `/private/tmp/apack-b5-staging-permitted.log`. No product workaround or assertion/deadline change.
- Host, CLI, testing and scripts types pass; logs `/private/tmp/apack-b5-{host,cli,testing}-types-final.log`
  and `/private/tmp/apack-b5-scripts-types.log`. Nine-file lint passes:
  `/private/tmp/apack-b5-lint-final.log`. Direct drive execution exits 0 while reporting the exact changed host
  input and rebuild guidance: `/private/tmp/apack-b5-drive.log`.

Real combined default/fork preparation, cached app acceptance and the real-default archive case remain
to be run against this final wiring. Do not count the earlier real prebuilt pass as proving those paths.
B1/B3 lifetime closure, B6 convergence, all Phase 6 streams and final committed-source strict `--all`
remain required. Available disk before these runs is 83GiB; no broad suite was launched here.

## Worker watch continuity and repair

Source checkpoint: `77e4bffc5`.

An actual worker-backed content compiler publishes correctly but ignores an external edit under watch:
`/private/tmp/apack-watch-worker-before.log`. Capture already exposes typed input probes, so startup
now retains newly observed external probes in per-thread, append-only reports under the existing
build workspace. The parent reads them after compiler exit, including failed builds. These are
subscription hints, not another source scanner, cache or output authority. Newline framing preserves
completed hints across interrupted writes; initial capture and authored/output exclusions remain intact.

The existing compiler watcher owns nonrecursive namespaces, missing-path guards and physical aliases.
Successful builds replace runtime probes; failures retain previous and newly discovered repair probes.
Freshness uses the sealed build's captured facts: static fingerprints retain ordinary source/package
ownership, while native queries and additional runtime reads use the common passive replayer. Keeping
static paths distinct prevents a runtime input from losing freshness checks after its first rebuild.
Recursive native listings and consumed cursor entries report nested directories without a new walk.

Review also fixed cancellation recreating subscriptions after close, preserved native termination
exit-status behavior while retaining build-owner refusals, and excluded owned compiler metadata reads
from authored capture. The latter had leaked `compiler-inputs.json` into disposable watch paths.

Evidence:

- Real initial publication, failed external retarget, incumbent preservation and missing-file repair
  pass in 68.27s; repair publication takes 26.57s:
  `/private/tmp/apack-watch-worker-recovery-measured.log`. The new scenario uses 120s overall and the
  existing 60s integration budget per build wait, rather than a deadline fitted to that measurement.
  Existing scenarios and global budgets are unchanged.
  The composed scenario passes again on committed source `77e4bffc5` in 76.06s, using its declared
  budgets without command-line overrides: `/private/tmp/apack-watch-committed-recovery.log`.
- Startup/builder/frontend/protocol coverage: 106 checks across nine files pass in 26.88s;
  `/private/tmp/apack-watch-worker-final-fast.log`. Final metadata, recursive directory, native probe,
  retry/close and policy coverage: 73 checks across six files pass in 5.28s;
  `/private/tmp/apack-watch-final-checks.log`. Another 22 existing captured-view/replay checks pass:
  `/private/tmp/apack-watch-final-input-views.log`.
- The recursive probe case fails before the producer fix and passes afterward:
  `/private/tmp/apack-watch-recursive-before.log`, `/private/tmp/apack-watch-recursive-after.log`.
- Actual blocked-worker termination still refuses publication and retains its incumbent (35.27s):
  `/private/tmp/apack-watch-final-termination.log`. Actual frontend/probe reports contain no private
  compiler paths after disposal (30.46s): `/private/tmp/apack-watch-source-path-fixed.log`.
- CLI, host and repo-checks types and changed-file correctness lint pass:
  `/private/tmp/apack-watch-final-{cli,host,repo}-types.log`, `/private/tmp/apack-watch-final-lint.log`.

The initial growing-list recorder and duplicate full-record replay caused avoidable overhead; both
were removed before this checkpoint. Native addon/external-library and platform lifetime closure,
converged integration/B6, all remaining Phase 6 work and final strict committed-source acceptance
remain required. This is not a broad pass.

## Compiler-created worker input ownership

Source checkpoint: `c7d5603c5`.

The finite B1/B3 audit found a reproducible omission: an actual content compiler reads an outside file
through `node:worker_threads`, publishes its value, and passive freshness still accepts the build after
that file changes. The failing case completes the build and fails only the final refusal assertion:
`/private/tmp/apack-worker-input-before.log` (24.78s). This is a demonstrated missing input, not a
timeout diagnosis or a reason to redesign every compiler path.

The native startup owner now owns ordinary compiler-created workers and their nested workers, in
addition to each thread's asynchronous module loader. Each receives the existing captured read view;
its completed observations merge into the same successful build-input record. A private broadcast
channel carries collection requests without touching application messages or workerData. A disposable
report under the existing worker workspace closes the ordering race between broadcast delivery and
native thread exit; it is transport, not another cache or freshness authority.

Natural exit, explicit termination and final build settlement collect observations. Final settlement
awaits native termination of remaining workers before publication. Explicit execArgv retains the private
bootstrap; explicit environments receive only the required private handoff fields. A two-second grace
bounds a worker that cannot begin collection, rather than the duration of filesystem verification or
nested collection. An unresponsive worker is terminated and publication refuses; incomplete input
reports cannot certify output. This is input/lifetime ownership, not a JavaScript security boundary.

Evidence:

- Original isolated regression passes after the first implementation in 26.90s:
  `/private/tmp/apack-worker-input-after.log`.
- The extended real compiler case covers explicitly terminated, naturally exiting (with explicit
  execArgv/environment), nested and still-running background workers. It verifies each independently
  read external file invalidates freshness. Existing native launch/preload and loader invalidation
  cases also pass: three cases, 83.01s total, unchanged per-test budgets:
  `/private/tmp/apack-worker-input-lifetime.log`.
- Reviewed collection adds a responsiveness acknowledgment so nested verification does not consume
  the termination grace. Both the four-variant positive case (35.38s) and an actual CPU-blocked worker
  refusal (12.25s) pass, preserving the incumbent file and publishing no replacement:
  `/private/tmp/apack-worker-input-reviewed.log`.
- Startup/options, environment, builder cancellation/reuse and subprocess inventory: 26 checks pass
  across four files in 28.20s: `/private/tmp/apack-worker-input-fast.log`.
- CLI types and correctness lint pass:
  `/private/tmp/apack-worker-input-final-types.log`, `/private/tmp/apack-worker-input-final-lint.log`.

Follow-up `77e4bffc5` implements the previously missing watch subscriptions and recovery; see
[watch continuity](#worker-watch-continuity-and-repair). Native addons/external libraries and
platform-specific lifetime acceptance remain open, as do B6 and the whole-goal final strict gate.
No B1/B3 completion or broad pass is claimed.

## Generic acceptance repair

Source checkpoint: `f8fbbedf5`.

Reviewed candidate `d5845c96f` against current source and the three supplied logs. Applied only its
generic watcher mock, build-input declarations and sealed fixture repairs; research work and its
timeout exceptions remain untouched. Strict admission remains in place. Missing, changed and extra
frontend receipt files retain their existing refusal coverage in `pack-layout.spec.ts`.

The latest integration log also exposed a content compiler failure fixture declaring nonexistent
`src/content/flows`. Removing that unrelated source lets it reach its intended dependent compiler
bundle failure; its unchanged assertion passes in 10.87s.

Evidence:

- `packages:ensure` passes: `/private/tmp/apack-generic-acceptance-packages.log`.
- All 155 checks across the six affected fast files pass in 10.22s:
  `/private/tmp/apack-generic-acceptance-focused.log`. An initial sandboxed run lost a worker IPC
  channel; the permitted subprocess run completes successfully.
- The replacement/cache scenario executes three real builds. At the existing 60s deadline it times
  out at 63.50s; a single diagnostic with 120s passes all unchanged assertions in 59.27s:
  `/private/tmp/apack-generic-output-swap-focused.log`,
  `/private/tmp/apack-generic-output-swap-diagnostic.log`. Its source now uses that bounded 120s limit.
- The timeout registry documents this scenario and the two already-committed 120s scenarios, previously
  measured at 61.51s and 73.69s. No global timeout changes. These entries register measured scenario
  costs; they do not establish that compilation is efficient.
- Focused correctness lint passes on all seven changed code files.
- CLI, host, API test and repo-checks TypeScript checks pass. The timeout policy's 42 checks pass
  after registering the final exception: `/private/tmp/apack-generic-acceptance-types.log`,
  `/private/tmp/apack-generic-acceptance-timeouts.log`.

Aggregate integration acceptance remains open: the supplied run reached its 600s suite deadline.
The earlier log's repeat-worker 60s failure predates its existing 120s override. No aggregate pass,
performance improvement or strict final gate is claimed. Finish remaining affected integration checks
on two cores before broad convergence; do not diagnose this again by repeating the full chain.

## Real default-fork handoff acceptance

Verified on committed source `895143b7b`, following the generic acceptance repair and native directory
namespace fix. This closes the previously failing fresh-fork archive/handoff path without changing
source, assertions or deadlines:

- `npm run build:default-setup` passes:
  `/private/tmp/apack-b5-current-default-build.log`.
- `prepare-default-pack-fork.ts` completes the actual fork build and archive, then its `--check`
  accepts the cached handoff, including the shipped input record, archive digest and checksum:
  `/private/tmp/apack-b5-current-fork-preparation.log`,
  `/private/tmp/apack-b5-current-fork-check.log`.
- Refreshed all four app bundles with `npm run build:runtime -- --cores 2`; API 13.3s, main 1.4s,
  preload 0.8s and renderer 33.1s:
  `/private/tmp/apack-b5-current-runtime-build.log`. Existing bundles predated an inlined host change;
  their presence was insufficient evidence of current runtime coverage.
- The first lifecycle attempt refuses the old external fixture before app startup because its recorded
  compiler-directory source changed. This is the intended prebuilt freshness check, not an app failure:
  `/private/tmp/apack-b5-current-fork-app.log`. Rebuilt only that stale fixture:
  `/private/tmp/apack-b5-current-external-build.log`.
- The unchanged `test-default-pack-fork.ts` then completes all four app launches. Actual replacement
  updates two windows and survives dev reload (14.5s); normal boot retains the fork (8.8s), respects
  removal (2.4s), and accepts explicit restoration (2.9s). Host preferences persist through this flow.
  `/private/tmp/apack-b5-current-fork-app-rebuilt.log`. The runner owns and removes its temporary data;
  production storage is untouched.

This is B5/default-fork and replacement lifecycle evidence, not an aggregate integration, all-kind
discovery or final strict pass. B1/B3 native/platform/thread closure, B6 and all remaining Phase 6 and
Phase 7 requirements remain active. Reuse these builds and evidence unless relevant inputs change.

## Fresh publication directory namespace repair

Consumer source checkpoint: `8058fd1a2`.

The real default pack builds successfully from that checkpoint:
`/private/tmp/apack-b5-committed-default-build.log`. Its real archive case exceeds the fast suite's
15s budget, then passes unchanged in integration in 19.39s (21.22s runner):
`/private/tmp/apack-b5-real-default-archive.log`,
`/private/tmp/apack-b5-real-default-archive-integration.log`. The case is moved to the existing
integration config; no global deadline or assertion is changed.

The existing external contract command builds both fixture packs and passes all 38 contract cases.
It also builds the full default fork, but archiving that fresh build refuses this observation:
`["node-directory","",{"withFileTypes":true}]`.
`/private/tmp/apack-b5-external-contract.log` records the exact failure. The initial source namespace
had no dist; publication added it. This is a producer observation inconsistency, not evidence about
which process deleted a directory in any earlier run. No app half was started.

The common file view's native readdir and directory cursors now share module resolution's authored
namespace exclusion policy. Returned results and their later validation both apply it; filtering only
the replay would discard a fact the compiler actually consumed. Explicit reads inside an excluded
output directory still expose and validate that directory's contents. Outside namespaces, native order,
entry types, mutable copies, prefix/terminal behavior and refusal semantics remain owned as before.
No observation format, compatibility read or additional scanner is introduced.

Evidence:

- A small real-filesystem regression fails before the change when outputs are published, then passes
  afterward. It covers readdir/recursive results, cursor enumeration, passive replay, explicit output
  reads and refusal of new source inputs. Two host cases pass in 668ms:
  `/private/tmp/apack-fresh-directory-before.log`, `/private/tmp/apack-fresh-directory-after.log`.
- All 29 existing file/input-view and observation cases pass in 1.23s:
  `/private/tmp/apack-fresh-directory-views.log`.
- Both actual native directory/cursor cases pass in 28.06s, preserving callback, promise, recursive,
  mutable Dirent and native handle behavior: `/private/tmp/apack-fresh-directory-native.log`.
- The existing actual two-build worker case now deliberately enumerates the source root and archives
  its first fresh publication. Fresh acceptance, input replay, archive creation, unchanged revision,
  phase reuse and cleanup all pass in 61.51s (63.45s runner), within its existing 120s scenario budget:
  `/private/tmp/apack-fresh-directory-worker.log`. No third build or new expensive fixture is added.
- Host/CLI types, five-file correctness lint and published-package refresh pass:
  `/private/tmp/apack-fresh-directory-{host,cli}-types.log`,
  `/private/tmp/apack-fresh-directory-lint.log`, `/private/tmp/apack-fresh-directory-packages.log`.

The full default/fork preparation and app acceptance still need completion against this correction;
the 61.51s producer proof is not their substitute. Keep B1/B3 native/platform lifetime gaps, B6,
all Phase 6 streams and final committed-source strict `--all` open. Next rebuild the selected default
pack, then exercise normal preparation/cache verification and the app half without another broad
diagnostic loop. The failed preparation's own temporary directory was removed by its existing finally;
the prior prepared fork cache and unrelated work remain intact.

## Package-relative native library ownership

Source checkpoint: `6710e3026`.

The B1/B3 audit distinguishes three actual loader paths:

| Path | Existing owner | Finding and disposition |
|---|---|---|
| A native addon selected by package import | Compiler native package capture and private read tree | Preserve the existing package inventory and OS-relative layout. |
| A native addon selected by extensionless file path | Common module resolver and native input reader | Reproduced missing adjacent library in the private tree. Resolve the selected `.node` through `prepareNative` and capture its owning package with the existing `packageInputs` owner. |
| An addon linked to an absolute external library | OS loader; no corresponding captured-library owner | Reproduced execution of the live original library and no changed-input refusal. Still required and open; copying package-relative assets does not close it. |

The file-path repair adds no resolver, binary rewriter, observation format or CLI runtime tool dependency.
The macOS regression compiles a real N-API addon and dylib with a loader-relative install name. It proves
extensionless resolution loads the copied library, replacement of the original leaves execution on
captured bytes, and source freshness refuses that replacement. Its `clang`/Node headers are developer
test requirements, documented in the CLI guide. Other-platform acceptance remains open.

Focused evidence:

- New real native-library regression: one pass, 14.42s;
  `/private/tmp/apack-native-package-regression.log`.
- Existing loose outside-native-addon regression: one pass, 14.27s;
  `/private/tmp/apack-native-package-existing.log`.
- Subprocess inventory and timeout policy: 53 passes in 2.19s;
  `/private/tmp/apack-native-package-tooling-final.log`.
- CLI/repo-checks types and correctness lint pass:
  `/private/tmp/apack-native-package-{types,repo-types,lint}.log`.
- Actual public `runPackBuild` compiles content using the copied addon/library, seals its inputs,
  then completes compiler disposal. Passive replay detects original-library replacement and accepts
  exact restoration. Result: `value=11`, `ownedLibrary=true`, `changedLibraryRefused=true`,
  `exactRestorationCurrent=true`; `/private/tmp/apack-native-public-build.log`.
- Absolute external-library counterexample: `/private/tmp/apack-native-link-before.log`.
  Package-relative before/after diagnostics: `/private/tmp/apack-native-package-{before,after}.log`.

The strict checkpoint chain was started once on two cores and deliberately stopped with SIGINT
(exit 130) during external authoring release verification, after roughly six minutes. Package checks,
API/schema/export reports and the completed renderer/API/ears/SDK/host/UI/CLI/main/preload typechecks
passed. The run is incomplete, not a strict pass; no test failure or timeout was observed before the
stop. Its owned processes were confirmed terminal. Evidence: `/private/tmp/apack-native-checkpoint-chain.log`
and `node_modules/.cache/apack-chain/runs/2026-10-17T08-24-20Z-19202/`. Continue from the focused source
checkpoint instead of repeating that broad run as a prerequisite to independent implementation.
The required converged B6 and final committed-source checks remain outstanding. This local
repair does not close external linked-runtime libraries, arbitrary native I/O, other-platform lifetime
acceptance, B6 or the final committed-source strict gate. No exclusion is approved. Continue independent
required work while deciding the external loader boundary; do not start a general binary relocation or
resource-confinement project as an incidental extension of this repair.
