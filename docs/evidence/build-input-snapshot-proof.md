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


## Installed native library declarations (2026-10-17)

A read-only `otool -arch arm64 -l` inspection of this checkout's Rollup, LMDB, msgpackr-extract and
fsevents native objects records only `/usr/lib` or `/System/Library/Frameworks` load commands.
Evidence: `/private/tmp/apack-native-load-command-audit.log`. Rollup also has an absolute build-machine
`LC_ID_DYLIB` name; it is distinct from its `LC_LOAD_DYLIB` entries. An unqualified list of dylib-looking
paths must not be treated as a dependency inventory.

This inspects installed object declarations, not the actual load set of every compiler operation.
It neither proves dynamic loading/native I/O is captured nor closes the existing absolute external-
library reproducer, platform acceptance or thread lifetime requirements. No loader/scanner policy or
scope exclusion is implemented. The native boundary ADR remains proposed and requires explicit
approval for a reduced guarantee; a pending question is not approval.

## Remaining resource lifetime audit (2026-10-17)

Current source audit separates the supported operations and their actual owners. This is not a claim
that arbitrary native code is confined, and does not add security isolation to this goal.

| Operation | Current owner and evidence | Remaining closure |
|---|---|---|
| Primary loader observations | `compiler-startup.ts` awaits its coordinator before final input validation; `compiler-startup-inputs.ts` owns the view | Existing launch/loader and observation checks cover local ownership. Retain for final acceptance. |
| Naturally exiting, explicitly terminated, nested and background JS workers | `compiler-threads.ts` collects reports and awaits native termination; `c7d5603c5` and `77e4bffc5` prove external reads, blocked-worker refusal and watch repair | Local macOS ownership accepted in the recorded actual worker cases. Other-platform behavior remains unverified. |
| Timers and native work inside a compiler process | `build-worker.ts` drains diagnostics and exits; parent verification follows process close | Local process-lifetime ownership is covered by the background-work and exit-handler cases. External native-library input capture remains a separate B1 issue. |
| Inherited compiler subprocesses on POSIX | `build-process.ts` creates a dedicated group; `stopCompilerProcessGroup` stops live group members before parent publication | Actual macOS background-child, cancellation and parent-loss cases are recorded. Linux has the same code path but no native-run acceptance here. |
| Retained Vite generation and its subprocesses on POSIX | `frontend-process.ts` awaits close, then stops the group; builder retirement closes frontend before removing its compiler installation | Existing real generation replacement, failure retention, HMR and cancellation cases cover local ownership. Preserve these; do not create a new resource manager. |
| Temporary views and compiler/runtime installation | Build `finally` waits worker/observer settlement before removing its read tree; builder close drains queued work and awaits generation disposal | Existing cancellation/reuse/retirement checks cover local ownership. Cleanup failure remains a refusal, not permission to publish. |
| Windows build and frontend subprocesses | Both parents set `grouped = false`; fallback termination calls only `child.kill`. Worker parent-loss handlers stop only themselves. Normal build exit has no Windows descendant owner | Concrete implementation gap: no equivalent descendant-lifetime owner is present. A real Windows implementation and acceptance are required; a mocked process call is insufficient. |

The Windows gap follows the current branches in `build-process.ts`, `build-worker.ts`,
`frontend-process.ts` and `frontend-worker.ts`. The existing actual background-child assertion in
`build-worker.integration.spec.ts` explicitly skips subprocess creation/verification on Windows.
It therefore cannot establish Windows descendant cleanup. No native Windows reproducer was run.

[Node 23.11.1 documents `subprocess.kill`](https://nodejs.org/download/release/v23.11.1/docs/api/child_process.html#subprocesskillsignal)
as signaling the child. [Windows Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)
provide descendant lifetime ownership, including termination when the last owning handle closes.
Inference for this implementation: a late PID-tree command can race worker exit, so adding that command
alone would not establish the goal's normal-exit, crash, cancellation and parent-loss guarantees.

Before implementing Windows closure, prototype a native lifetime owner against the real build and
Vite launch paths. Prove descendant ownership begins before user/compiler initialization and survives
worker exit; test success, failed build, explicit cancellation, parent loss and generation replacement.
No implementation or new dependency is selected by this audit. A native Windows runner is required
for acceptance. Do not weaken or remove the Windows requirement, silently refuse that platform, or
claim all-platform B3 completion from the accepted macOS path.

## External native-library search-path prototype (2026-10-17)

A private macOS ARM64 / Node 23.11.1 prototype evaluates whether a loader search-path override could
close the absolute-library counterexample without binary rewriting or additional capture machinery.
It compiles two real N-API addons, each linked to its own absolute `libvalue.dylib`, with values 11 and
22. Copies are retained under distinct captured directories; originals are then replaced with values
91 and 92. The original retained reproducer is read for its addon source only and remains untouched.

Observed results:

- Baseline: both distinct absolute dependencies load and return `[11, 22]`.
- With `DYLD_LIBRARY_PATH` naming the captured left directory, the left addon returns 11 and the
  loaded-image report names the captured library, despite its original now returning 91.
- With both captured directories in the search path, both addons return `[11, 11]`; the loaded-image
  report names only the left captured library. Different absolute identities have collapsed by basename.

Log: `/private/tmp/apack-native-loader-path-proof.log`. The log records the retained private fixture;
reproducer: `/private/tmp/apack-native-loader-path-proof.py`. Each compile/child has a finite deadline;
no app data, compiler implementation, existing fixture or support policy was changed.

This rejects a search-path-only fix: a single-library success does not preserve resolution semantics.
It does not prove exact per-image rebinding impossible or establish capture of transitive/dynamic
loads or native file I/O. Those would require their own demonstrated design, not a broad claim from
this prototype. Full external-library capture remains open; the proposed bounded support policy is
still unapproved. No product loader interception, scanner, binary rewriting or new dependency is added.

## Bounded macOS module-library admission (2026-10-17)

The user approved captured package-contained and OS library support with refusal of identifiable
outside dependencies (`711565757`). Source `cc186a0d0` adds dependency-free Mach-O inspection to
selected absolute native images in the existing `CompilationInputs.prepareNative` path. It reads
captured bytes, distinguishes dependency commands from `LC_ID_DYLIB`, selects the current architecture
from universal images, and checks transitive loader-relative libraries and ordered rpaths. Absolute
references back to live original-package libraries are unsupported too; package containment alone
cannot turn that original path into captured loading. No binary rewriting or loader search override
is introduced, and developer `clang`/headers remain test requirements only.

Namespace preparation must not reject an unused native main when package exports select JavaScript.
The policy therefore runs for selected images, outside the lookup-cache short circuit. Failed loads
retain observed inputs in the same read owner; repeated attempts cannot bypass refusal. Tests cover
an actual JavaScript exports fallback followed by two refused loads of the native entry.

Focused evidence:

- Three real macOS ARM64 / Node 23.11.1 addon cases pass in 26.73s: captured relative loading retains
  value 11 after the original library changes; direct and transitive outside references refuse before
  addon initialization or OS loading. `/private/tmp/apack-native-boundary-real.log`.
- 29 existing captured module/read-tree checks and 12 initial binary/policy cases pass together.
  The final ordered-rpath refinement adds a thirteenth policy case; all 13 pass separately. The real
  fixture uses literal loader-relative paths; the added rpath ordering branch is covered by this final
  policy run. Logs: `/private/tmp/apack-native-boundary-unit.log`,
  `/private/tmp/apack-native-boundary-unit-final.log`.
- An isolated Vitest module mock disables only the new checker. The real absolute-reference case then
  fails because the native import resolves instead of refusing. Production source is never mutated.
  `/private/tmp/apack-native-boundary-mutation.log` and the retained config path in
  `/private/tmp/apack-native-mutation-config.txt`.
- All 53 subprocess-inventory/timeout checks pass; CLI and scripts/repo/publish/E2E types, correctness
  lint and whitespace checks pass. Logs: `/private/tmp/apack-native-boundary-tooling.log`,
  `/private/tmp/apack-native-boundary-types.log`, `/private/tmp/apack-native-boundary-tooling-types.log`,
  `/private/tmp/apack-native-boundary-lint.log`.

This accepts the selected-module slice, not every native path. Early preloads, thread and Vite/compiler
initialization, inherited loader environment, unresolved name searches and computed native loading
still need the bounded-contract audit. ELF/PE implementation/native acceptance, public-build incumbent
retention and the final strict gate remain open. Static declarations cannot establish confinement of
arbitrary native I/O. The owning goal retains those requirements within the approved boundary.

Windows CI preparation: `26832d633` adds a manual tests-only Windows baseline; `6fb4d9bcb` exposes it
as `ci.yml`'s `compiler_windows` dispatch input using a same-commit reusable workflow. Full manual CI
remains the default, automatic triggers remain disabled, and Windows repository permissions are read
only. This avoids relying on registration of a new dispatch workflow on the default branch; see
[GitHub's manual workflow rules](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).
YAML and dispatch-routing assertions pass locally. Push permission is pending; no run is claimed.
Existing Windows test skips do not establish the still-missing descendant-lifetime owner.

## Native startup admission checkpoint (2026-10-17)

Source `e6dd35d52` installs one native-load admission port in the existing compiler interception
owner. Startup native admission remains active after startup filesystem interception stops; executable
compilation scopes supply their own native-image owner. Already captured installation/read-tree
images are inspected in place rather than copied again and recorded as ephemeral source inputs.
Startup captures source native packages into its existing data read tree. The shared package-graph
adapter replaces duplicated graph-to-snapshot assembly; no new input inventory is introduced.

On macOS ARM64 / Node 23.11.1, all four real addon cases pass in 51.76s (53.24s runner): the three
selected-module cases plus a public builder case. The latter verifies actual compiler-preload library
paths, changed-library freshness, direct and transitive pre-initialization refusal, and preservation
of the incumbent revision after both failed candidates. Its own duration is 29.08s, within the existing
60s case budget. Log: `/private/tmp/apack-native-startup-real-final.log`.

Other focused evidence:

- 79 affected host/CLI input, read-tree, cache and generation cases pass across six files in 3.68s:
  `/private/tmp/apack-native-startup-focused.log`.
- 53 subprocess inventory/timeout checks pass in 1.74s:
  `/private/tmp/apack-native-startup-tooling.log`.
- Host and CLI typechecks and repository correctness lint pass:
  `/private/tmp/apack-native-startup-types-final.log`, `/private/tmp/apack-native-startup-lint.log`.
- Matching CLI/testing packages built successfully:
  `/private/tmp/apack-native-startup-packages.log`.

The initial public fixture incorrectly retained a loader-only TypeScript configuration (`noLib` and
old module resolution). Correcting the fixture exposed a separate attribution issue: one proof file
was overwritten by multiple processes inheriting `NODE_OPTIONS`. A diagnostic append-only trace
identified the actual compiler loading its captured library, while checkout npm setup and the content
runtime checker loaded the original. Log: `/private/tmp/apack-native-startup-public-diagnostic.log`.
The final regression deliberately executes its native probe only in owned compiler startup, matching
the existing startup fixtures. It does **not** prove capture for those other processes. Their inherited
preload execution is a demonstrated open path requiring reconciliation with their existing owners;
do not erase that finding or claim universal preload admission from this test.

No broad chain rerun was used to diagnose these focused failures. B6 convergence and the final
committed-source strict `--all` remain outstanding. Thread/Vite acceptance, ELF/PE native policy and
runtime proof, inherited loader environment, computed/native name searches and Windows descendant
ownership remain open within the approved support boundary. Windows workflow dispatch still awaits
permission to push the committed branch; no remote run has occurred.

## Published runtime initialization boundary (2026-10-17)

Source `70101557e` resolves the runtime-checker finding from the preceding startup checkpoint without
making the dependent-runtime simulation another compiler process. `checkContentRuntimeLoads` exists
to prove a compiled bundle loads in a dependent's fresh SDK runtime with optional peers absent.
Replaying compiler initialization there violates that purpose: a preload can supply app globals or
loaders and make an otherwise unusable published runtime pass. The checker now omits compiler
`NODE_OPTIONS`, retaining its explicit Node invocation and optional-peer blocker. Actual compiler
workers continue receiving their ordered launch options unchanged. Public CLI and contributor docs
state the distinction.

Evidence:

- A real child-process regression supplies a required global from both `--require` and `--import`
  compiler hooks. Before the fix the checker incorrectly accepts the bundle; the test fails on
  `success: true`. `/private/tmp/apack-runtime-preload-red.log` (1.26s runner).
- After the fix all six runtime-load/checker cases pass (1.66s runner), including the new refusal,
  absent hook side effects, valid SDK-only runtime, source-condition isolation, native/throwing runtime
  refusal and missing-SDK cleanup. `/private/tmp/apack-runtime-preload-focused.log`.
- The actual bundled compiler's ordered require/import/loader initialization and changed-loader-input
  rebuild pass in 35.05s (36.62s runner). `/private/tmp/apack-runtime-preload-worker.log`.
- Matching CLI package build, CLI typecheck, focused correctness lint and whitespace checks pass.
  `/private/tmp/apack-runtime-preload-packages.log`, `/private/tmp/apack-runtime-preload-types.log`.

Checkout npm setup executes before compiler installation/source capture. Its inherited initialization
is part of preparation, not an ongoing compilation phase needing a post-capture input owner. This
clarifies the prior diagnostic instead of labeling every subprocess a new capture requirement. The
runtime check deliberately no longer executes compiler initialization. Arbitrary compiler-created
subprocess capture, native thread/frontend coverage, ELF/PE and Windows lifetime acceptance are not
established by this checkpoint. No timeout or acceptance assertion was weakened; B6 convergence and
the final committed-source strict `--all` remain open.

## Frontend launch-option identity (2026-10-17)

Source `abdcb7c95` corrects an inspected omission in the existing frontend generation owner. Vite
inherits the source-condition-filtered `NODE_OPTIONS`, but `readPackDevServerInputs` included only
the general environment digest, which deliberately excludes that separately ordered option contract.
Changing a preload/import/loader option could therefore rebuild the backend while reusing Vite's old
initialization. The existing signature now includes parsed effective options using the same source
condition filter as launch. No second generation owner or source inventory is added, and ordinary
source edits remain outside the startup signature for HMR.

The regression fails on the prior source because changing option order produces the identical
signature (`/private/tmp/apack-frontend-options-red.log`). All nine builder checks pass after the fix
in 25.21s (26.66s runner), covering normal reuse, configuration replacement, failure/cancellation,
retirement and POSIX descendant cleanup in addition to the new option case. The option case also
proves equivalent quoting/spacing and the ignored checkout source condition do not change identity,
while changed option targets do. `/private/tmp/apack-frontend-options-focused.log`. CLI typecheck and
focused correctness lint pass; `/private/tmp/apack-frontend-options-types.log`.

This accepts launch-option identity, not capture of arbitrary preload modules/data or all native
frontend initialization. The retained frontend still needs its bounded native-path audit and relevant
acceptance without freezing the authored source graph used for HMR. Windows lifetime implementation,
remote execution and the converged/final strict gates remain open.

## Native worker library acceptance (2026-10-17)

Source `c3b27fda7` extends the existing real-addon fixture to execute through a compiler-created worker.
The actual content compiler awaits a normal Node worker; the existing startup/thread owner supplies
capture and settlement. No additional thread protocol, resource owner or platform implementation is
introduced. The test checks the reported native thread ID, actual loaded library paths, input freshness
when the original library changes, direct and transitive outside-library refusal before initialization,
and preservation of the published incumbent revision after both failed candidates.

On macOS ARM64 / Node 23.11.1 the worker case passes in 38.18s (39.68s runner):
`/private/tmp/apack-native-thread-real.log`. The refactored shared preload case passes independently
in 27.77s (29.22s runner): `/private/tmp/apack-native-thread-preload-regression.log`.
All 53 subprocess inventory/timeout checks pass (1.81s runner), CLI typecheck and focused correctness
lint pass: `/private/tmp/apack-native-thread-tooling.log`, `/private/tmp/apack-native-thread-types.log`.
The matching CLI package built before these real runs: `/private/tmp/apack-native-thread-packages.log`.
No budgets changed and no unrelated broad suite ran. This closes these local native-thread cases;
other OS/runtime evidence, retained frontend coverage and converged/final strict gates remain open.

## Inherited native search-path counterexample (2026-10-17)

A private 0.84s experiment uses a real Node addon with a loader-relative dependency. With default
resolution it loads the library beside the addon and returns 11. Launching the identical addon with
`DYLD_LIBRARY_PATH` pointing to a second directory instead loads that directory's library and returns
91. The paths in `process.report.sharedObjects` distinguish the actual loaded files. All compile and
child invocations have finite 15s deadlines; no production files or source modules are modified.

Reproducer: `/private/tmp/apack-relative-library-override-proof.py`.
Result and retained fixture root: `/private/tmp/apack-relative-library-override-proof.json`.
This extends the earlier absolute-library search-path prototype: loader-relative dependency commands
alone do not prove captured loading when inherited loader overrides select a different image.
[Apple's current loader implementation](https://github.com/apple-oss-distributions/dyld/blob/main/dyld/DyldProcessConfig.cpp)
models search-path overrides separately from image dependency declarations; its
[dynamic-library guidelines](https://developer.apple.com/library/archive/documentation/DeveloperTools/Conceptual/DynamicLibraries/100-Articles/DynamicLibraryUsageGuidelines.html)
describe environment-dependent library search.

The next implementation must preserve the startup loader environment before user initialization can
rewrite `process.env`, inspect the candidates actually selected by configured search paths, and refuse
identifiable outside-image selection before native initialization. An unused search directory is not
itself an outside dependency, so a blanket ban is not the intended solution. Library insertion that
occurs before JavaScript startup needs its pre-launch owner considered separately. This is a concrete
remaining bounded-contract defect, not evidence for universal native-I/O confinement or permission to
expand into a general sandbox. Retained Vite initialization and ELF/PE/platform acceptance stay open.

## Native search override admission (2026-10-17)

Source `70480baeb` closes the preceding `DYLD_LIBRARY_PATH` counterexample through the existing native
load owners. The bootstrap captures that launch-time list before user preloads and carries it through
same-process loader/worker lineage. Compilation admission uses the same retained settings. This is
necessary because dyld consumes its settings at process launch; deleting the variable later does not
change the loader. [Apple's implementation](https://github.com/apple-oss-distributions/dyld/blob/main/dyld/DyldProcessConfig.cpp)
records that behavior in `PathOverrides::addEnvVar` and applies library overrides in `forEachPathVariant`.

Admission checks matching dylib basename candidates, including the native entry itself, before calling
the OS loader. A matching outside image refuses with its native requester, candidate path and variable
name. Missing candidates remain observed inputs; their later appearance invalidates the completed
build. Existing OS-file candidates stop the search before later unused directories. Framework
references are not incorrectly processed as dylib basenames; their distinct loader controls remain
unimplemented. Already owned compiler/read-tree bytes keep their existing owner, while outside lookup
probes join the source observation view rather than leaking private copy paths into the build record.

Evidence on macOS ARM64 / Node 23.11.1:

- A real public build launches with an empty override directory. A preload deletes the variable, then
  the actual content compiler creates a worker that loads the addon from captured bytes. Adding a
  matching outside library invalidates freshness; the next candidate refuses before addon initialization
  and retains the incumbent revision. 31.03s case / 32.53s runner:
  `/private/tmp/apack-native-search-real.log`.
- 20 binary/policy and 24 existing module-input cases pass in 0.94s runner:
  `/private/tmp/apack-native-search-focused.log`. Seven added cases cover immutable launch settings,
  addon/dependency/OS-reference overrides, harmless missing candidates, search order and the framework
  distinction. Eight startup environment/worker ownership cases also pass in 2.49s:
  `/private/tmp/apack-native-search-startup-unit.log`.
- A private Vitest mock disables only search-path observation while retaining the dependency checker.
  All three targeted override-refusal cases then fail. Repository source is unchanged by this mutation
  probe: `/private/tmp/apack-native-search-mutation.log`; its retained setup is named by
  `/private/tmp/apack-native-search-mutation-config.txt`.
- All 53 subprocess inventory/timeout cases, CLI types, correctness lint and whitespace checks pass:
  `/private/tmp/apack-native-search-tooling.log`, `/private/tmp/apack-native-search-types.log`,
  `/private/tmp/apack-native-search-lint.log`. Matching package build:
  `/private/tmp/apack-native-search-packages.log`.

This is not a full dyld resolver or pre-launch library-admission implementation. Framework/versioned/
fallback/suffix controls, shared-cache-specific override precedence and library insertion before JS
startup require their own applicable-path audit and acceptance. Retained Vite initialization, ELF/PE,
other-platform evidence, Windows descendant ownership and the converged/final strict gates remain open.
No timeout changed, no blanket ban on loader environment was added, and no broad suite rerun was used
as diagnosis.

## Pre-launch library insertion admission (2026-10-17)

Source `99ca1c6af` places `DYLD_INSERT_LIBRARIES` admission before compiler preparation (including
checkout subprocesses) and immediately before build/frontend worker launch. JavaScript native-module
interception is too late for these libraries: their constructors execute while the OS starts the
process. The policy permits normal absolute OS-library paths and refuses live package/outside paths,
including relative names and normalized paths escaping an OS prefix. This applies the same existing
bounded rule as absolute native dependency references: an absolute path back to an original package
is not captured loading. Package libraries continue to use captured compiler module loading; there
is no insertion-path rewriting or separate external-library capture mechanism.

The common Mach-O policy also checks applicable `DYLD_LIBRARY_PATH` overrides of inserted OS-library
references before launch. OS shared-cache paths need not exist as standalone files to be allowed.
This checkpoint does not claim a complete shared-cache/alternate-loader resolver.

Evidence on macOS ARM64 / Node 23.11.1:

- The actual public builder succeeds with `/usr/lib/libSystem.B.dylib` insertion. A compiled external
  dylib has a real constructor writing an owned marker. Both builder and retained-frontend launch
  reject its insertion, and reject a live original-package library path, without creating the marker
  or changing the published incumbent revision. The case passes in 25.70s (27.14s runner):
  `/private/tmp/apack-native-insertion-real.log`.
- All 24 native binary/policy cases pass (0.25s runner), including insertion absence, OS insertion,
  outside/relative selection and prefix traversal:
  `/private/tmp/apack-native-insertion-unit.log`.
- A private setup replaces only insertion admission with a no-op; the three refusal cases then fail.
  Production source is unchanged by the probe: `/private/tmp/apack-native-insertion-mutation.log`;
  `/private/tmp/apack-native-insertion-mutation-config.txt` names its retained setup.
- All 53 subprocess inventory/timeout cases, CLI types, focused correctness lint and whitespace
  checks pass: `/private/tmp/apack-native-insertion-tooling.log`,
  `/private/tmp/apack-native-insertion-types.log`, `/private/tmp/apack-native-insertion-lint.log`.
  Matching package build: `/private/tmp/apack-native-insertion-packages.log`.

No release workflow, remote push or production data was used. No timeout changed or broad pool was
rerun for diagnosis. Framework/versioned/fallback/suffix controls, shared-cache precedence, retained
frontend initialization beyond this pre-launch boundary, ELF/PE, Windows lifetime/native execution
and the converged/final strict gates remain open in the owning goal.


## Windows package launcher and local integration checkpoint (2026-10-17)

The user authorized branch pushes and focused Windows CI and pushed `e8940bb6d`.
[Run 39057355477](https://github.com/spankyed/AgentBuddy/actions/runs/39057355477)
on Windows x64 / Node 23.11.1 installed dependencies successfully, then failed before tests:
`spawnSync npm ENOENT`, from `published-manifest.ts` during the EARS package build.
The package-list/archive helper invoked npm without the Windows command-wrapper handling present
in its sibling checkout/package-build launchers. This is a demonstrated tool-launch defect, not
evidence of a compiler-capture failure.

The repair invokes npm's JavaScript entry with Node on Windows, using npm's lifecycle entry when
available and the standard adjacent Windows installation otherwise. Arguments remain separate;
no shell interprets package or destination paths. The existing archive test now uses spaces and `&`
in both paths. The focused Windows job includes that real staging suite and records Node/npm entry
information. The sibling launchers already handle Windows wrappers; they are unchanged.

Local checks: all 15 published-manifest tests pass (2.56s runner), all 53 subprocess/deadline
inventory checks pass (2.16s runner), and host typecheck and focused correctness lint pass.
Tooling log: `/private/tmp/apack-windows-npm-tooling.log`. Logs: `/private/tmp/apack-windows-npm-unit.log`,
`/private/tmp/apack-windows-npm-types.log`. Native Windows acceptance remains pending the repaired run.

The already-running two-core integration pool against `e8940bb6d` expired at its unchanged 600s
deadline, without an assertion failure reported before termination. Eight complete files reported
474 passing cases, including all 14 build-output cases, 11 scaffold cases, 15 compiler-configuration
cases and all seven native-library cases. The run was still progressing through compiler file reads
when terminated. This is incomplete pool acceptance, not a pass or evidence of a deadlock.
Log: `/private/tmp/apack-native-checkpoint-integration.log`. The default-pack rebuild passed first:
`/private/tmp/apack-native-checkpoint-default.log`. Do not repeat the broad run for Windows-launch
diagnosis or silently widen its deadline. B6 and final strict acceptance remain open.


### First repaired Windows run: launcher accepted, UI paths exposed

Source `d7dc7f224` was pushed and tested by
[run 39058353468](https://github.com/spankyed/AgentBuddy/actions/runs/39058353468).
The runner confirmed the adjacent npm JavaScript entry exists. Both EARS and SDK built and staged
successfully, establishing the repaired npm launch through the original failing path. Preparation
then failed at UI's export-map check, before compiler tests. Full log:
`/private/tmp/apack-windows-39058353468-failed.log`.

Inspection found `computeEntries()` writes native `path.relative()` results directly into package
subpaths and targets. Windows therefore emits backslashes. Normalize public-module paths to `/`
before sorting and writing the map; keep private-module filtering over filesystem paths. The existing
nested-entry case and a new export-target/order case run in the focused Windows job. No committed
package export, API contract or timeout changes.

All three local export tests pass (0.235s runner), UI types and focused lint pass:
`/private/tmp/apack-windows-ui-exports-unit.log`, `/private/tmp/apack-windows-ui-exports-types.log`.
The first local `exports:check` attempt hit sandbox-only tsx IPC denial; the unchanged check passes
with IPC access: `/private/tmp/apack-windows-ui-exports-check.log`. Native Windows/compiler and
full-pool acceptance remain open.


### Windows package preparation passes; module identity diagnostic

[Run 39058623655](https://github.com/spankyed/AgentBuddy/actions/runs/39058623655), source
`6a8a514cf`, passes complete package preparation. All 15 real packaging tests pass on Windows,
including the source/destination metacharacter case. Compiler tests then stop at the pre-existing
checkout-location identity assertion in `compiler-module-inputs.spec.ts`: two equivalent fixture
locations produce different hashes. 25 cases pass before fail-fast; this is an actual Windows
identity failure, with no evidence yet identifying the differing input.
Log: `/private/tmp/apack-windows-39058623655-failed.log`.

Add a direct comparison of the existing observation entries before their hashes in that regression.
This preserves its assertion and makes the next native run expose the exact query/value difference;
do not guess at path aliases, file timestamps or resolution semantics from two opaque hashes.
All 24 local module-input cases pass (1.06s runner), with focused lint and whitespace checks:
`/private/tmp/apack-windows-module-observations.log`. The Windows compiler and descendant-lifetime
checkpoints remain open.


### Windows observation diff identifies inconsistent realpath policy

Diagnostic source `8fb57ac5e`, [run 39058844360](https://github.com/spankyed/AgentBuddy/actions/runs/39058844360),
shows matching file hashes but different relative query paths containing
`../../../../../../runneradmin/AppData/Local/Temp/apack-module-inputs-<random>/...`.
The namespace resolver uses `fs.realpathSync.native`, which expands Windows short names differently
from `fs.realpathSync`, used by compiler observation roots and captured-installation roots. Comparing
those spellings treats the same checkout as an unrelated path.

Align `physicalWatchPath()` with the existing `fs.realpathSync()` root policy. Keep explicit native
metadata queries intact; preserve symlink and missing-parent resolution. No per-reader conversion,
root-name stripping or weakened hash assertion.

58 focused module/view/watch cases pass locally across five files (1.01s and 4.11s runners), including
namespace retarget refusal, copied-source identity and actual watcher events. Host types, focused lint
and whitespace checks pass. Logs: `/private/tmp/apack-windows-path-identity-unit.log`,
`/private/tmp/apack-windows-path-watch-unit.log`, `/private/tmp/apack-windows-path-types.log`.
The native Windows rerun must establish whether this closes the observed discrepancy; compiler
platform and descendant-lifetime completion are not claimed by these local checks.


### Windows path identity accepted; portable cleanup permissions

Source `707b17837`, [run 39059173727](https://github.com/spankyed/AgentBuddy/actions/runs/39059173727),
passes all 24 module-input cases on Windows, including equivalent-checkout identity and captured
source identity. Preparation continues to pass. The next failure is the read-tree cleanup fixture's
POSIX-only `0755` directory assertion: Windows reports `0666` after chmod. Sixty cases pass before
fail-fast; log `/private/tmp/apack-windows-39059173727-failed.log`.

Correct the fixture to compare actual pre/post foreign mode and explicitly forbid chmod of both
the foreign directory and its symlink. Compare executable bits against the source's actual supported
bits. Keep file read-only assertions on all platforms; directory POSIX write-bit assertions apply
only where chmod supports them. This does not claim Windows ACL confinement or change production
cleanup. All five local read-tree cases and focused lint pass:
`/private/tmp/apack-windows-read-tree-permissions.log`.


### Windows cleanup accepted; isolate POSIX executable-bit assertions

Source `caf9a29c0`, [run 39059442652](https://github.com/spankyed/AgentBuddy/actions/runs/39059442652),
passes all five read-tree cases on Windows and all six other files reached before fail-fast.
It stops at runtime identity's POSIX chmod assertion: Windows has no executable bits to remove.
69 cases pass, six platform cases skip, one fails. Log:
`/private/tmp/apack-windows-39059442652-failed.log`.

Keep runtime byte/capture-location identity and restored-byte equality on every platform. Split
POSIX execute-bit invalidation into its own POSIX-only case. Audit the selected suites' chmod
assertions and compare the workspace-link installation's captured execute bits against the actual
source bits, keeping its file read-only assertion on every platform. No production hash changes.
All 17 local runtime/installation cases pass (12.25s runner), with focused lint and whitespace:
`/private/tmp/apack-windows-runtime-permissions.log`.


### Windows runtime permission checks accepted; repair fault-injection path

Source `75be5b00b`, [run 39059751459](https://github.com/spankyed/AgentBuddy/actions/runs/39059751459),
passes all six other selected files. Its only reported failure is installation corruption refusal:
the test matches `/nested/index.cjs`, so its mutation never runs on Windows. 79 cases pass and seven
platform cases skip. Log: `/private/tmp/apack-windows-39059751459-failed.log`.
Use `path.join()` for the fault-injection suffix; the focused local corruption case and lint pass
(`/private/tmp/apack-windows-installation-mutation.log`). Production refusal remains unchanged.
Collect all failures in this small isolated unit step instead of stopping at the first; retain
fail-fast for the expensive real worker baseline. No test selection or deadline changes.


### Windows focused units accepted; real worker drive-root failure

Source `22739f676`, [run 39059985521](https://github.com/spankyed/AgentBuddy/actions/runs/39059985521),
passes all seven focused files: 81 cases pass, seven platform-specific cases skip. Preparation and
the native startup probe pass. The real repeated-build case then fails while compiling content:
`EISDIR: illegal operation on a directory, lstat 'C:'`. Its 93.46s result is a failure, not a timeout.
Log: `/private/tmp/apack-windows-39059985521.log`.

The worker catch logs only `errorMessage(error)`, discarding the stack needed to attribute that
drive-root query. Log the Error itself in this private worker, retaining the existing failure exit
and publication behavior. The next focused run must identify the failing call before changing path
semantics. Focused lint and whitespace checks pass. This diagnostic source change does not close
real Windows compilation or descendant-lifetime acceptance.


### Native-path policy correction and checkout setup prerequisite

Source `71e862359`, [run 39060486872](https://github.com/spankyed/AgentBuddy/actions/runs/39060486872),
passes focused units and preserves the real failure stack. `physicalWatchPath()` calls ordinary
`fs.realpathSync()`, which fails while probing a namespaced Windows drive root. This matches
[Node's documented realpath defect](https://github.com/nodejs/node/pull/65378). The earlier ordinary-
realpath alignment fixed one identity test but is insufficient. Use native realpath consistently
for compiler roots, namespace, package inputs, captured trees and passive freshness; preserve authored
metadata-query semantics. That coherent policy change is in progress, not accepted by this entry.
Log: `/private/tmp/apack-windows-39060486872.log`.

A local real-worker attempt stopped earlier: the pack's selected esbuild 0.25.12 binary leaked into
checkout setup, whose tsx uses esbuild 0.27.7. Log: `/private/tmp/apack-native-path-policy-worker.log`.
Clear only `ESBUILD_BINARY_PATH` in checkout setup's subprocess environment. Keep it in the caller
and later compiler capture. A disposable checkout executes its actual npm setup script and records
that unrelated environment survives while the compiler override is absent. All eight checkout tests
and focused lint pass (0.521s runner): `/private/tmp/apack-checkout-compiler-environment.log`.
A private mutation restores inherited environment; the real subprocess case then fails showing
`binary: selected-pack-binary`, proving fault detection without touching production source:
`/private/tmp/apack-checkout-env-mutation.log`, configuration recorded in
`/private/tmp/apack-checkout-env-mutation-config.txt`.


### Consistent native compiler path identity (2026-10-17)

Replace the earlier ordinary-realpath alignment with one native canonical policy across compiler
roots, package graph origins, runtime/installation captures, private work trees, watch targets and
passive freshness. Normalize the module-program root after preserving the caller's root spelling
in its input view. Keep the authored `realpath` and `realpathNative` query ports distinct; there is
no runtime-version fallback or stripping of Windows path namespaces.

Root spellings project through the common file view. A real root link retains its final namespace
slot, so `lstat`/`readlink`, directory facts and passive retarget refusal still describe that link.
A focused regression first failed with a falsely stale lstat mode when the link was erased:
`/private/tmp/apack-native-path-root-link-before.log`. The corrected projection passes, including
retargeting to identical bytes. Authored-root watcher exclusions also recognize canonical paths;
a linked pack does not gain duplicate external subscriptions for its own sources.

Local evidence:

- Initial direct-consumer run: 115 cases passed, five failures exposed canonical-path assumptions
  in fault injection and the watcher authored-root exclusion. Log:
  `/private/tmp/apack-native-path-policy-unit.log`.
- Repaired module/view/watch regressions: 44 pass (4.15s runner):
  `/private/tmp/apack-native-path-policy-regressions.log`.
- Final affected package/view/passive/watch checks: 82 pass across seven files (5.48s runner):
  `/private/tmp/apack-native-path-policy-final-unit.log`. POSIX-only execute-bit assertions are
  separate; file-origin and supported-mode assertions remain active on Windows.
- Real repeated-build acceptance, after setup environment repair: 90.63s case / 92.57s runner,
  including matching package rebuilds, captured esbuild execution, useful source paths, publication,
  archive/freshness validation and unchanged facade/build reuse:
  `/private/tmp/apack-native-path-policy-worker-repaired.log`. The subsequent root-link review
  correction is covered by the focused root-link/passive cases; final Windows runtime remains pending.
- Host and CLI/testing types, focused correctness lint and whitespace checks pass:
  `/private/tmp/apack-native-path-policy-host-types.log`,
  `/private/tmp/apack-native-path-policy-cli-types.log`. All 53 process-inventory/deadline checks pass
  (2.61s runner): `/private/tmp/apack-native-path-policy-tooling.log`.

The focused Windows job now covers the changed package/view/passive/check-out/watch/tool-identity
owners before its real worker baseline. It retains two workers and the existing deadlines. The
real test records canonical workspace paths so its no-private-path assertion checks actual owner
locations. No broad pool was restarted. Windows/native lifetime, remaining loader controls, ELF/PE,
retained frontend initialization and converged/final strict acceptance remain open. The installed
Apple dyld manual was inspected for the remaining control audit; its text is retained at
`/private/tmp/apack-dyld-native-controls.txt`, not treated as proof of runtime acceptance.

### Windows native-path fixture correction (2026-10-17)

Source `525350813` passes matching package preparation and 148 focused Windows checks in
[run 39062528890](https://github.com/spankyed/AgentBuddy/actions/runs/39062528890).
Three assertions fail because two fixture factories still use ordinary realpath: their expected
`RUNNER~1` paths differ from native canonical `runneradmin` paths. The runtime callback correctly
reports the canonical source; its map lookup uses the other spelling. Correct those fixture origins
and the copied-tree realpath query to native realpath. No production behavior, guards or deadlines
change. Eight affected local checks pass (0.317s runner), as do focused correctness lint and whitespace
checks: `/private/tmp/apack-windows-native-fixture-check.log`. Windows real-worker acceptance remains
pending because the preceding unit step prevented it from running. Full run log:
`/private/tmp/apack-windows-39062528890.log`.

An independent, disposable macOS prototype confirms the next loader gap: a native addon with a bare
`libapackproof.dylib` dependency passes current admission, while a fresh Node child with
`DYLD_FALLBACK_LIBRARY_PATH` selects an external library and returns its value 37. Prototype script:
`/private/tmp/apack-native-fallback-proof.cjs`. This establishes a concrete missing input/admission
case; it does not establish a repair or justify treating every dyld control as equivalent.

Windows follow-up on `672645cf4`: all 14 focused files pass (151 cases, eight platform skips).
[Run 39062755440](https://github.com/spankyed/AgentBuddy/actions/runs/39062755440) reaches and completes
the first real pack build, then its useful-source-path assertion compares short and native spellings.
`compiler-commonjs.ts` intentionally passes the logical source path to `_compile` while retaining its
owned module identity. The assertion now resolves the returned source file and directory natively and
compares them with the original source locations. A private compiler copy still fails that comparison;
repeat-build revision/cache equality and receipt no-private-path checks remain. No production mapping
changes. Full log: `/private/tmp/apack-windows-39062755440.log`. Repeat-build completion and subsequent
worker cases remain unverified on Windows.

### Explicit native fallback admission (2026-10-17)

The disposable native prototype above proves current admission omitted explicit dyld fallback lookup.
Capture `DYLD_FALLBACK_LIBRARY_PATH` with the existing launch-time native environment and carry it
through the existing startup/thread ownership. Reuse the ordered search check for overrides and
fallbacks. Inspect current-directory candidates for bare names first; only consult fallback paths when
normal resolution did not select a library. Missing candidates remain observed inputs. A captured
relative library does not consult an unused external fallback. No library relocation, environment
scrubbing, compatibility handling or new owner is introduced.

Acceptance on macOS ARM64 / Node 23.11.1:

- All 27 native-library unit cases pass (0.315s runner), including frozen fallback settings after
  environment mutation, selected outside fallback refusal, current-directory precedence and unused
  fallback preservation: `/private/tmp/apack-native-fallback-unit.log`.
- Four actual native/compiler cases pass (67.77s runner; no deadline changes): relative captured
  loading, direct outside refusal, transitive outside refusal, and the new public-build fallback case.
  `/private/tmp/apack-native-fallback-worker-final.log`.
- The new case first loads the actual external library in a fresh Node child. It then publishes a
  valid incumbent and attempts loading from an owned compiler preload after clearing the setting.
  An owned-attempt marker proves the compiler reached admission, the addon initialization marker
  remains absent, the diagnostic names `DYLD_FALLBACK_LIBRARY_PATH`, and the incumbent revision stays
  unchanged. The earlier version could pass on an unrelated runtime-probe failure; its fixture was
  corrected before acceptance. A fixture setup collision and sandbox IPC refusal were also corrected;
  neither is product failure evidence.
- CLI typecheck, focused correctness lint and whitespace checks pass:
  `/private/tmp/apack-native-fallback-types.log`.

This closes explicit fallback admission for the exercised path. Default fallback policy for older
images, framework/versioned/suffix/shared-cache controls, retained frontend native initialization,
ELF/PE and native platform/descendant acceptance remain open. B6/final strict acceptance is not claimed.

### Native framework search admission (2026-10-17)

A disposable actual Mach-O framework prototype returns 11 with its package-relative dependency and
37 under `DYLD_FRAMEWORK_PATH`, while the previous admission check accepts the external override.
Removing the original framework also demonstrates external fallback selection. A separate actual
`DYLD_LIBRARY_PATH` basename candidate leaves the framework at 11, validating the existing distinction
between dylib and framework lookup. Script and fixture record:
`/private/tmp/apack-native-framework-proof.cjs`, `/private/tmp/apack-native-framework-proof.json`.

Extend the existing search helper, preserving its ordered first-match behavior. Framework references
use the entire `Foo.framework/Foo` or `Foo.framework/Versions/A/Foo` suffix rather than a basename.
Capture both framework environment lists in the existing frozen startup environment, inherited by
compiler threads; no new owner or runtime loader is introduced. Missing overrides remain reads;
fallbacks are consulted only after normal resolution fails. This preserves an existing relative
framework rather than refusing an unused outside fallback.

| Executed path | Existing owner | Result |
|---|---|---|
| Explicit dylib fallback after preload deletes its environment setting | Startup native-module admission | Pass; retains `59b890dcb` behavior. |
| Framework override after preload deletes its environment setting | Same startup native-module admission | Pass; full versioned framework candidate attributed and refused before initialization. |
| Missing original framework with explicit outside fallback | Same startup native-module admission | Pass; fallback attributed and refused before initialization. |

MacOS ARM64 / Node 23.11.1: all 30 unit cases pass (0.202s runner), with complete/flat framework
paths, missing-candidate observations, fallback eligibility and immutable launch settings:
`/private/tmp/apack-native-framework-unit.log`. Three real public-build cases pass (63.65s runner;
individual cases 19.56–22.96s, unchanged deadlines): `/private/tmp/apack-native-framework-worker.log`.
Each proves the selected library using a fresh child's actual loaded-image report, publishes a valid
incumbent, reaches the owned compiler preload, refuses before addon initialization and preserves the
incumbent revision. All three diagnostics name the selected path and appropriate dyld variable.
CLI types, correctness lint and whitespace checks pass:
`/private/tmp/apack-native-framework-types.log`.

This closes the exercised explicit framework search paths. Versioned overrides, image suffixes,
shared-cache controls, default fallback behavior, retained frontend native initialization, ELF/PE and
platform lifetime remain open, as do converged/final gates. The API live ledger is also reconciled
with its already recorded A4/A5 implementation and local app/schema/API acceptance; final producer/app
convergence is retained rather than repeating an already completed migration.

### Windows repeated-build timing diagnosis (2026-10-17)

[Run 39063156389](https://github.com/spankyed/AgentBuddy/actions/runs/39063156389) on `59b890dcb`
passes all 14 unit files (154 cases, eight platform skips). The repeated-worker case completes the
first actual build, useful-source-path checks, input replay and archive, then reaches its second
checkout setup before the unchanged 120-second case deadline expires. The first output handoff takes
about 69 seconds; the second setup starts at about 84 seconds. The run does not prove a deadlock or
completion of the second build. Cleanup then encounters EPERM while the timed-out operation is still
using the fixture. Full log: `/private/tmp/apack-windows-39063156389.log`.

Give this one Windows case a bounded 180-second diagnostic allowance while retaining 120 seconds on
macOS; record elapsed milestones after builds, input replay and archive. The purpose is to distinguish
phase cost from stalled progress, not to certify Windows acceptance from a timeout change. The next
native run must finish and preserve repeat revision/cache equality, input/output checks and workspace
cleanup. Do not increase other case or suite deadlines. Existing timeout-exception guidance records
this exact measured boundary. All 53 deadline/subprocess tooling checks, CLI types and focused lint
pass; `/private/tmp/apack-windows-repeat-diagnostic-tooling.log`,
`/private/tmp/apack-windows-repeat-diagnostic-types.log`. The subprocess inventory now includes the
fresh Node child introduced for actual launch-setting selection; no new subprocess is added here.

### Native image suffix counterexample (2026-10-17)

A disposable actual Mach-O prototype returns 11 normally and 37 under `DYLD_IMAGE_SUFFIX=_apack`.
The selected package-contained suffixed library has an absolute outside dependency. Current admission
inspects the nominal library instead and accepts the image. This is a demonstrated next gap, not a
repair or a reason to refuse every suffix setting. Preserve loader selection and inspect the selected
variant, including its transitive dependencies and missing-candidate observations. Prototype:
`/private/tmp/apack-native-suffix-proof.cjs`; selected paths:
`/private/tmp/apack-native-suffix-proof.json`. Apple's
[dyld configuration source](https://github.com/apple-oss-distributions/dyld/blob/main/dyld/DyldProcessConfig.cpp)
was located for the next suffix-order audit; no implementation is inferred merely from that search.

### Selected native image suffix admission (2026-10-17)

Extend the existing frozen launch environment and native admission owner with ordered image suffixes.
The earlier actual counterexample is repaired by inspecting selected variants, including transitive
commands, rather than nominal bytes. Missing variants remain observations. A missing owned candidate
is checked before realpath, preserving ordinary fallback without querying a nonexistent copied file.
Suffixes apply before rpath expansion; override directories retain their outer search order.

Apple's [configuration implementation](https://github.com/apple-oss-distributions/dyld/blob/main/dyld/DyldProcessConfig.cpp)
(`addSuffix`, `forEachImageSuffix`, `forEachPathVariant`) supplies the selection-order reference.
Unlike the abbreviated installed manual description, that implementation inserts suffixes before the
leaf's last dot, including `.node`. A fresh native process confirms actual selection of both
`addon_apack.node` and `libvalue_apack.dylib` with `_missing:_apack`; the loaded-image report also names
the outside dependency in the original counterexample. The existing private prototype paths above
retain those files. This is loader-selection evidence, not universal native I/O confinement.

macOS ARM64 / Node 23.11.1 evidence:

- 35 native unit cases and 11 subprocess-inventory cases pass (1.16s runner):
  `/private/tmp/apack-native-suffix-unit.log`. New cases cover transitive selected versus unused nominal
  dependencies, suffix/rpath ordering, missing variant observations without nonexistent realpath,
  addon suffixes, override-directory order and full framework suffix paths. Launch settings remain
  frozen after preload mutation.
- The actual public-build suffix case passes (25.54s case / 27.06s runner):
  `/private/tmp/apack-native-suffix-worker.log`. A fresh child first proves native selection. The owned
  preload then clears the setting and still executes value 37 from the captured suffixed library;
  its loaded-image report excludes original bytes. The recorded inputs are current, then refuse
  after the selected variant changes. A subsequent attempted build reaches owned admission and names
  the suffixed image's new outside dependency, without initializing the addon or replacing the incumbent.
- CLI types, focused correctness lint and whitespace checks pass:
  `/private/tmp/apack-native-suffix-types.log`. The subprocess inventory records the real native child;
  no general launcher or new resource owner is introduced.

Versioned overrides, shared-cache controls, default fallback policy, retained frontend native
initialization, ELF/PE and platform/descendant acceptance remain open. B6/final strict acceptance is
not claimed. Windows timing run `39063657523` continues against its pinned `0c259a570` checkpoint.

### Windows repeated-build forward progress (2026-10-17)

[Run 39063657523](https://github.com/spankyed/AgentBuddy/actions/runs/39063657523), pinned to
`0c259a570`, passes all 157 focused unit cases (eight platform skips). Phase milestones report first
build completion at 77.735s, input replay at 82.085s and archive at 90.275s. The second compiler
reuses facade types, emits compiled output and reports `Output: dist/` around 174s. The 180s test
deadline expires before the command returns and cleanup completes. This demonstrates forward
progress rather than a stalled compiler; it does not prove completion or acceptable cleanup.
Full log: `/private/tmp/apack-windows-39063657523.log`.

Set only this Windows scenario to 240s, based on its measured two fresh installations/builds plus
archive/replay/cleanup cost. The macOS budget stays 120s; assertions and every other deadline stay.
The workflow now selects its actual startup/repeat-build baseline, rather than running the entire
worker file before Windows descendant ownership exists. This is a diagnostic boundary, not exclusion
of required final native cancellation/parent-loss/replacement checks. The next committed-source run
must finish revision/cache equality and workspace cleanup before this baseline is accepted.

### Windows Job Object launcher proof design (2026-10-17)

The production Windows branches still kill only their worker PID. Prototype a private job before
selecting production wiring: create the Node worker suspended, assign it to a kill-on-close job,
then resume it. Keep the existing compiler's Node IPC protocol rather than introducing another
candidate transport. The wrapper waits on root/parent process handles, stops the job and queries its
active-process count before reporting normal completion. Creation/assignment failures terminate the
still-suspended child. The job handle is not inheritable by compiler code.

The proof forwards the inherited libuv stdio table from the wrapper's startup information.
[libuv's Windows spawn implementation](https://github.com/libuv/libuv/blob/v1.x/src/win/process.c)
establishes that table; [Microsoft's Job Object contract](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)
establishes assignment and kill-on-close semantics. These sources justify a prototype, not acceptance
of the implementation or universal handle-transfer compatibility.

`.github/scripts/compiler-job-proof.{cjs,ps1}` exercises bidirectional JSON IPC, stdout/stderr,
arguments containing spaces/quotes/backslashes, cwd and an explicit environment marker. A real
Node child starts its own background Node descendant before the outer controller requests normal
exit, nonzero exit or kills the launcher. The test must observe both processes stopped. A 30-second
outer deadline bounds the proof; helper work/data is isolated to its private temporary directory.
The focused Windows workflow executes it before npm installation, giving early native diagnostics.
This is not production wiring and does not close parent-loss/replacement acceptance. The C# interop
and inherited IPC remain unverified until native execution; macOS cannot provide that evidence.
Node syntax, focused correctness lint and whitespace checks pass locally. No extra published package
or runtime dependency is introduced by the proof.

Windows baseline run `39064147051` on `f10e4bcf6` passes 162 focused unit cases (eight platform skips),
then completes its first build at 61.972s and archive at 73.861s. It is cancelled during the second
setup when the next prototype workflow is manually dispatched. Full log:
`/private/tmp/apack-windows-39064147051.log`. This is orchestration cancellation, not compiler failure
or acceptance of the 240s case. The outer CI workflow's `cancel-in-progress: true` overrides the called
Windows workflow's noncancelling policy. Restrict outer cancellation to full CI; focused Windows runs
queue so an explicitly running diagnostic can finish. Do not dispatch another run while one is active
merely to observe newer source; wait for terminal evidence. Run `39064447097` remains live against
`62f6a03b8`, with the native Job Object proof before package installation.

### Windows Job owner integration checkpoint (2026-10-17)

[Run 39064447097](https://github.com/spankyed/AgentBuddy/actions/runs/39064447097) on `62f6a03b8`
passes all three actual native Job Object scenarios: exit 0, exit 7 and forced launcher cancellation.
Both root/descendant processes are stopped; exit codes, JSON IPC, stdout/stderr, cwd, environment and
quoted arguments are preserved. The proof takes about two seconds across the three scenarios.
Full log: `/private/tmp/apack-windows-39064447097.log`. Its later unit step passes 161 cases and fails
one existing copied-runtime `execFileSync` at its 5s timeout, preventing the build baseline. The same
probe passed earlier native runs; this is not evidence of a compiler deadlock. Give only its Windows
execution 10s, retaining local 5s and all damaged/aliased/missing-runtime assertions.

Production integration:

- `spawnCompilerWorker` routes build and Vite starts to the same captured Windows launcher asset.
  It passes the selected executable, correctly quoted argv and cwd via owned JSON; environment and
  libuv IPC/stdio remain inherited. PowerShell does not interpret worker arguments. Its compiler,
  configuration and .NET temporary files stay in the existing worker-owned workspace.
- The launcher moves from prototype storage to `bin/compiler-windows.ps1`, shipped by the existing CLI
  writer and inventoried by compiler capture. The native proof imports the actual spawn helper before
  dependency installation, rather than maintaining a second launch implementation. UTF-8 JSON reading
  and Unicode path/argument cases address Windows PowerShell's default decoding difference.
- Job assignment precedes resume. Normal root exit terminates descendants and waits for zero active
  job processes before returning the root exit code; parent loss or forced launcher death closes its
  noninheritable kill-on-close job handle. Native parent-loss/replacement acceptance remains open.
- Frontend readiness carries the actual Vite PID rather than conflating it with a platform lifetime
  owner. Synchronous launch setup failure removes the frontend workspace. The real descendant-publication
  test no longer skips Windows and uses the platform-appropriate terminal-process check.

Local macOS evidence:

- All nine build/frontend owner cases pass (26.40s runner), covering verified reuse, replacement,
  interrupted startup, scope retirement, cancellation and real descendants:
  `/private/tmp/apack-windows-job-local-owner.log`.
- The final descendant-publication case passes again (1.38s / 3.15s runner):
  `/private/tmp/apack-windows-job-publication-local.log`.
- CLI types and focused correctness lint pass:
  `/private/tmp/apack-windows-job-integration-types.log`.
- The CLI package builds successfully and its copied launcher matches source byte-for-byte:
  `/private/tmp/apack-windows-job-package.log`.

Asset ownership review also exposes a cache omission: bundled CLI outputs listed only `package.json`
and `dist/`, so deleting copied bin/template output leaves a recorded package current. Two disposable
filesystem cases using the real CLI output declaration fail before the correction:
`/private/tmp/apack-windows-launcher-output-before.log`. Declare copied directory inputs/outputs
through `bundled()` once, covering CLI `bin` and `templates`. Deletion/changed bytes now invalidate
reuse; restored bytes recover it. All 100 freshness and 53 tooling cases pass (1.86s runner):
`/private/tmp/apack-windows-job-integration-freshness.log`. An initial sandbox-only run could not query
OS uptime in six preexisting lock cases; rerunning with the required OS access passes, without changes
to those assertions.

This source checkpoint requires native execution of the integrated helper, publication boundary and
real repeated compiler. Windows parent-loss/replacement, the remaining B1 native-input/platform cases,
B6 and final strict `--all` remain open. The focused workflow now waits rather than cancelling older
native diagnostics; no new dispatch is made until the preceding run is terminal.

### Windows environment and final lifetime cases (2026-10-17)

[Run 39065375155](https://github.com/spankyed/AgentBuddy/actions/runs/39065375155) on `b1c1c87c6`
passes the production helper's three native launch cases, including Unicode, and all 162 focused unit
cases (eight platform skips). Its publication command runs 17 files rather than the requested one:
`with-source.mjs` uses `shell: true` on Windows, splitting the quoted multiword filter. An unintended
SIGTERM-handler test fails, and the descendant-publication case is never reached. This is not evidence
against the job's publication boundary. Preserve the log:
`/private/tmp/apack-windows-39065375155.log`. Use direct `node node_modules/vitest/vitest.mjs` in the
focused workflow and put the same source condition in the step environment; remove the extra shell
hops for both unit and baseline commands. No test assertions or deadlines change for this correction.

Extend the native proof using its existing start/stop lifecycle: concurrently start two job owners,
retire the previous one, prove the replacement and its descendant are still live, then retire it.
For parent loss, a separate Node controller starts the actual production helper and reports its owner,
worker and descendant IDs. Kill that controller with SIGKILL, without application cleanup, and require
all three processes to stop within the existing two-second settlement bound. The entire proof retains
its 30-second limit. These cases remain pending native execution, not accepted by local syntax checks.

Environment review identifies a separate introduced assumption: `CreateProcessW` with a null environment
inherits PowerShell startup's modifications. Microsoft documents
[PSModulePath reconstruction](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_psmodulepath)
and [process-scope execution-policy environment](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies).
Keep the launcher environment separate from the requested compiler environment. Send the latter in a
length-prefixed UTF-16 block over one private inherited memory pipe. The launcher reads exactly that
block, excludes the pipe from the worker's stdio table/handle inheritance, sorts the Windows environment
and supplies it directly to `CreateProcessW`. Only original stdio and Node IPC reach the worker. Node's
case-insensitive key selection and serialization channel settings are preserved. Environment values
never enter the on-disk launch configuration; no encoded environment variable or credential file is
introduced. Launcher temporary files remain in the existing job workspace.

The native proof now checks original module-path and policy values, Unicode/newline environment data,
undefined-variable absence, and omission of environment keys from the launch file, in addition to its
existing argv/IPC/stdio/lifetime checks. These are native acceptance requirements for the new handoff;
no claim of their execution is made yet. Local checks pass:

- CLI types: `/private/tmp/apack-windows-job-environment-types.log`.
- CLI package build: `/private/tmp/apack-windows-job-environment-package.log`.
- 53 deadline/subprocess tooling cases (1.71s runner):
  `/private/tmp/apack-windows-job-environment-tooling.log`.
- Actual POSIX descendant-publication preservation (1.48s case / 3.00s runner):
  `/private/tmp/apack-windows-job-environment-posix.log`.
- Native proof syntax, focused correctness lint and whitespace checks.

The preceding Windows run is terminal. The next focused run must first pass the production helper
proof, then the exact descendant-publication case and actual repeated-build baseline. Other native
input/platform cases, B6 and the final full strict gate remain open.

Native result update: [run 39066744863](https://github.com/spankyed/AgentBuddy/actions/runs/39066744863)
on committed source `519ac2a16` passes the complete `Windows compiler job ownership` step on Windows
x64 / Node 23.11.1. The source proof runs success, nonzero exit, forced owner cancellation, two live
replacement owners and forced independent-controller loss; environment/module-policy/Unicode/absence,
argv/stdio/IPC and no-environment-in-config assertions all pass. The job subsequently failed during
dependency installation: ripgrep's GitHub release API request returned HTTP 403. Full log:
`/private/tmp/apack-windows-39066744863.log`. Publication and real repeated-build acceptance did not run.
The focused workflow now supplies `GITHUB_TOKEN` to `npm ci`, matching the main CI. The installed
`@vscode/ripgrep/lib/postinstall.js` explicitly reads that variable and its downloader supplies it as
GitHub API authorization. This addresses the missing authentication; the response alone does not
establish why GitHub refused the unauthenticated request. No dependency, retry or timeout changes.
This closes the helper's native cases, not the complete Windows producer/frontend or whole-goal gates.

### Windows producer baseline acceptance (2026-10-17)

[Run 39067640431](https://github.com/spankyed/AgentBuddy/actions/runs/39067640431) on committed source
`1dacb59ec` completes successfully on Windows x64 / Node 23.11.1, using two test workers. Full log:
`/private/tmp/apack-windows-39067640431.log`.

- The complete production job-owner proof passes again, including environment/IPC, nonzero exit,
  cancellation, independent-controller loss and isolated replacement.
- `npm ci` succeeds with the installer's supported GitHub authentication; matching packages build.
- Fourteen focused files pass: 162 checks, eight platform skips, 13.25 seconds runner duration.
- The exact real descendant-publication case passes (1.22 seconds test time); unrelated cases are
  deliberately unselected, not additional acceptance.
- Both actual build-worker baseline cases pass: launch identity and repeated build/cache/archive
  identity. The latter takes 164.325 seconds within the existing Windows-only 240-second budget;
  runner duration is 167.34 seconds. No new timeout adjustment.

This closes the pending Windows baseline and actual descendant-publication checks. It does not prove
retained frontend native admission, all other native input/platform cases, B6 or final strict acceptance.
The subsequent macOS fallback source checkpoint is not part of this run.

### SDK-dependent standard native fallbacks (2026-10-17)

Source `6fd1a5050` closes the missing standard-fallback observations for the locally exercised macOS
compiler runtime. The reader extracts the selected image's macOS SDK from `LC_BUILD_VERSION` or
`LC_VERSION_MIN_MACOSX`. Standard dylib/framework fallbacks apply below SDK 14; modern SDK images
must not acquire those searches. An absent explicit fallback variable selects standard paths, while
an explicitly empty variable disables them. Existing package-relative dependencies still resolve
before fallback directories are consulted. Diagnostics attribute standard fallback selections without
claiming an unset environment variable selected them.

This follows Apple's [fallback search implementation](https://github.com/apple-oss-distributions/dyld/blob/main/dyld/DyldProcessConfig.cpp)
and [SDK policy](https://github.com/apple-oss-distributions/dyld/blob/main/common/MachOFile.cpp), verified
against actual loader behavior on macOS 26.3.1 / ARM64 / Node 23.11.1. The proof builds private native
fixtures with SDK 13 and 14 metadata and removes their dependency; native failure diagnostics reveal
which fallback paths dyld searched. The inspector's probes agree for dylibs and frameworks, both with
absent and explicitly empty fallback settings. It never creates or removes a file in system directories.

Evidence:

- Forty-two focused unit cases pass, including standard outside-library refusal, SDK cutoff,
  both version-command encodings/endian orders, empty-list suppression and package-first framework
  resolution: `/private/tmp/apack-native-default-fallback-unit.log`.
- Four native SDK/framework/dylib loader cases pass in 2.90 seconds runner time:
  `/private/tmp/apack-native-default-fallback-loader.log`.
- The existing public-build explicit-fallback refusal and incumbent-retention case passes, together
  with the first two loader cases, in 31.99 seconds runner time:
  `/private/tmp/apack-native-default-fallback-integration.log`. Initial sandbox execution was stopped
  by `tsx` IPC `EPERM` during package preparation; the same selection passes with local IPC permission.
- CLI typechecking and correctness lint pass; no schema/API exports or timeout changes.

This proves the ordinary locally exercised runtime's standard fallback policy. AMFI restricted/hardened
runtime policy is not established by this proof and remains open, alongside versioned/shared-cache
controls, retained frontend native initialization, ELF/PE and converged/final acceptance. This is not
universal dyld emulation, native-I/O confinement or completion of B1/B3.

### Retained Vite native input ownership (2026-10-17)

Source `ce172953d` puts the existing compiler bootstrap ahead of retained Vite's user preloads.
Backend startup and Vite share native admission/read-tree ownership. Backend keeps its package capture;
Vite uses a lazy view and copies selected native images, including transitive libraries, so an addon
inside the authored pack does not cause Vue sources to become frozen inputs. The launch environment
is retained across owned worker/loader lineages. Input collection is checked before readiness and
before builder reuse; cancellation releases pending IPC listeners and lets the builder retire its
process owner. Cleanup removes private read trees only after process/group/job settlement.

Local macOS ARM64 / Node 23.11.1 evidence:

- 52 native-library/builder checks pass in 28.37 seconds, including pending freshness-check cancellation:
  `/private/tmp/apack-frontend-native-unit.log`.
- Actual native Vite preload and explicit-worker cases pass. They load owned addon/library bytes,
  retain HMR for Vue files in the same authored package, detect changed native bytes and refuse an
  outside-library replacement before addon initialization while preserving the running frontend.
  The existing backend native preload/thread cases also pass after the owner extraction. Four cases,
  79.19 seconds runner time: `/private/tmp/apack-frontend-native-integration.log`.
- Existing real backend/Vite generation replacement, failed-incumbent retention, HMR and awaited
  retirement pass in 53.24 seconds: `/private/tmp/apack-frontend-native-generation.log`.
- Actual simultaneous Vite owners survive independent replacement and close; each descendant stops
  with its own owner. The final packaged-bootstrap check passes in 8.38 seconds:
  `/private/tmp/apack-frontend-native-owners.log`.
- CLI typechecking, correctness lint, coordinator syntax and package build pass. Final cleanup
  distinguishes native-input refusal from configuration refusal. Its removal of the exposed
  `stopReads` field was incorrect; the Windows run below exposes the missed callers and the next
  checkpoint restores the required phase boundary. No timeout changes or public SDK/schema changes.

The Windows workflow adds the actual Vite owner case and pending-check cancellation to its focused
selection. Its execution on this source remains pending; the earlier green Windows producer baseline
was on `1dacb59ec` and does not certify these changes.

Remaining frontend acceptance/implementation is explicit: live delivery of newly discovered native
inputs and failed-startup probes to watch subscriptions; frontend preload JavaScript input ownership;
custom-loader and late-load acceptance. Do not treat checking freshness when a build is requested as
automatic external-change detection. Existing versioned/shared-cache/restricted-runtime policy,
ELF/PE, platform coverage and converged/final gates remain open. Native I/O and arbitrary computed
loading retain the user-approved bounded contract; this checkpoint is not security isolation.

### Compiler preload boundary correction (2026-10-17)

[Windows run 39069433335](https://github.com/spankyed/AgentBuddy/actions/runs/39069433335) on
`0ac839c94` passes the full native job-owner proof, 169 focused checks (eight platform skips), both
real descendant-publication/pending-check-cancellation cases, and actual Vite replacement with
independent descendant cleanup (21.485 seconds test time). Log:
`/private/tmp/apack-windows-39069433335.log`.

The baseline then fails immediately: `startup.stopReads is not a function`. Removing that method was
an incorrect cleanup, not a platform limitation. A source-only search missed `bin/apack.mjs` and the
embedded JavaScript launch fixture. The CLI entry must stop generic preload reads before loading its
worker bundle while retaining captured inputs and native admission for compilation. Full disposal is
a different operation. Native Vite has its separate lazy owner and does not require this phase call.

Source `482ee0598` restores the method without changing those semantics or adding an alias. The exact
launch-identity case and real two-build/cache/archive baseline pass locally in 48.36 seconds:
`/private/tmp/apack-startup-read-boundary-baseline.log`. Package build, CLI typechecking and lint pass.
The CLI guide now records the two phases. Windows acceptance of the repaired backend baseline is
pending; the passing Vite/job-owner cases do not replace it. Live watch delivery and all other named
compiler/platform gaps remain open.


### Live frontend native watch and shared copies (2026-10-17)

Source: `ccaa809a8`. The builder exposes its frontend input subscription and currentness check to its
watch owner. Failed frontend candidates retain their discovered missing-input probes; successful
replacement drops retired subscriptions. No alternate freshness record or runtime compatibility path
is introduced.

The real reproducer exposed a second defect: esbuild's late worker replayed the native preload against
the changed, broken original library. The retained frontend then blocked its synchronous transform.
Per-thread atomic native receipts now share already admitted copies; copies survive their creating
worker and are deleted when the frontend process owner settles. Snapshot checks verify both original
inputs and immutable copied bytes/modes. Read-tree file modes are recorded from the actual created file,
including platform normalization. Frontend freshness IPC refuses after five seconds when unresponsive;
cancellation and process retirement remain separate operations.

Validation on macOS ARM64 / Node 23.11.1:

- Real live-watch case: unchanged timestamp does not publish; a changed graph with a missing helper
  refuses before native initialization; the incumbent still serves Vue; adding only that external
  helper triggers publication, loads value 22 instead of 11, and retires the old frontend. Pass in
  72.758 seconds, repair published 28.483 seconds after helper creation.
  `/private/tmp/apack-vite-watch-recovery-final.log`.
- Four existing actual backend/Vite native preload and explicit-worker cases pass in 75.91 seconds:
  `/private/tmp/apack-vite-watch-native-regressions.log`.
- Forty focused builder/watch/read-tree checks pass:
  `/private/tmp/apack-vite-watch-unit.log`. Six read-tree checks pass again after actual captured-mode
  normalization: `/private/tmp/apack-vite-watch-read-tree-final.log`.
- CLI types, scripts types and changed-source lint pass:
  `/private/tmp/apack-vite-watch-types-final.log`, `/private/tmp/apack-vite-watch-scripts-types.log`,
  `/private/tmp/apack-vite-watch-lint-final.log`.
- The new full native watch scenario needs initial publication, refusal and real repair sequentially.
  An earlier measured run reached repair at 55.13 seconds and exceeded its 20-second repair wait while
  compilation continued. This single scenario has a recorded 120-second budget and 40-second repair
  deadline. The passing run completed repair in 28.483 seconds. Assertions are unchanged; no suite-wide
  deadline was raised. Timeout policy checks pass.

Required checkpoint command: `npm run chain -- --strict --cores 2 --no-classify`.
It failed after 938.3 seconds at the host pool, with 5,381 checks passed and three bookkeeping failures:
Windows proof source missing from declared lint inputs (two guards), and the new native replacement
compile missing from subprocess inventory. Both declarations are corrected in `ccaa809a8`; the focused
111 cases and complete affected repository suite (951 checks / 47 files) pass. Logs:
`/private/tmp/apack-vite-watch-checkpoint-chain.log`,
`/private/tmp/apack-vite-watch-repo-repair.log`, `/private/tmp/apack-vite-watch-repo-suite.log`.
The gate had already passed packaged authoring (267.5 seconds), external-pack contracts including fork
preparation (328.4 seconds), default-pack build, facade/schema/import checks, lint and typechecks.
Pack-unit/integration pools and app checks were not reached. This is a usable focused source checkpoint,
not a converged strict pass; preserve the stopped run and diagnose specific later failures rather than
repeating broad runs for reassurance.

Windows run `39069845156` on `d8a1c02dc` is terminal success: complete native helper lifetime matrix,
package build, 169 unit checks (eight platform skips), both descendant/cancellation cases, independent
Vite owners/replacement/descendants, startup and repeated-build/cache/archive identity. Full log:
`/private/tmp/apack-windows-39069845156.log`; baseline runner duration 167.24 seconds.
That result closes the restored `stopReads` boundary acceptance on Windows; newer live-watch source
still needs applicable platform acceptance.

Remaining: frontend preload JavaScript contents/resolution, named loader/late-load paths, versioned/
shared-cache/restricted-runtime native controls, ELF/PE and remaining platform acceptance, B6 and final
committed-source strict `--all`. Arbitrary native I/O remains outside the user-approved bounded contract.


### Retained frontend preload JavaScript ownership (2026-10-17)

Source `c85f3fd95`. A small extension to the actual native-preload case reproduced a separate gap:
appending bytes to the initialized CommonJS preload still returned `true` from frontend currentness.
The failing proof is `/private/tmp/apack-frontend-preload-js-proof.log` (7.80 seconds).

The existing startup filesystem capture now also owns frontend initialization. The actual CLI entry
ends that read scope for its selected frontend/build owner before importing the compiler bundle;
ordinary authored Vue reads stay live. Native admission retains its independent process lifetime.
Frontend freshness also collects active worker/loader startup observations through the existing
coordinator. Atomic native receipts still retain exited-worker copies and source observations; the
existing five-second frontend currentness bound covers an unresponsive collection request.

Validation:

- Actual Vite direct-preload and explicit-worker cases both pass with added assertions that changed
  preload bytes refuse currentness and restoring the initialized bytes restores it. Existing Vue edit,
  native input change, pre-initialization refusal and incumbent-serving assertions remain. Two cases,
  15.99 seconds: `/private/tmp/apack-frontend-preload-js-acceptance.log`.
- Actual watch unchanged-touch/refusal/external-helper-only recovery/retirement still passes after
  worker collection is included: 73.97 seconds, `/private/tmp/apack-frontend-preload-js-watch-recovery.log`.
- CLI types, package build, changed-source lint, CLI bin syntax and diff checks pass. Logs:
  `/private/tmp/apack-frontend-preload-js-types.log`,
  `/private/tmp/apack-frontend-preload-js-packages.log`.

This focused checkpoint does not close all loader/module-resolution or platform acceptance. The prior
strict checkpoint and its corrected repository bookkeeping failures remain recorded above; no new
broad diagnostic run was launched. Custom-loader/ESM and transitive-resolution cases, named native
platform controls, B6 and final committed-source strict `--all` remain open.


### macOS launch-policy investigation (2026-10-17)

User priority: pause local build/native-test runs, preserve work, investigate system-wide launch
failures, and keep remote GitHub runs going. No implementation changes or expensive local tests were
made during this investigation. The tree was clean at `4b4d820fa`.

Preserved evidence: `/private/tmp/apack-launch-policy-visllvke` (owner-only directory). It contains
copies of `/tmp/apack-launch-hang.txt` and `/tmp/apack-syspolicyd-hang.txt`, before/after process
snapshots, bounded policy logs and CPU capture, a fresh Activity Monitor sample, service metadata and
controlled-launch/cleanup records. Full machine process logs stay outside the repository.

Confirmed:

- Slack PID 15518, ChatGPT PID 17469 and Activity Monitor PID 17615 were stopped (`T`) at initial
  inspection. The fresh Activity Monitor sample still shows only `_dyld_start` and a 96 KB footprint.
- No current owned build/test/Vite process was running. The historical orphan PID 84238 was preserved
  according to prior instructions; it was idle and no signal was sent to it. Other sessions and
  language servers were untouched.
- The ten-minute policy capture contains seven Node assessments at seven distinct path hashes,
  seven addon assessments at five paths and seven `libvalue.dylib` assessments at five paths.
  It also contains 93 notarization-daemon error rows and eight network receive-timeout rows.
  The prior daemon sample shows active YARA/signature work, not proof of a deadlock.
- CPU capture was 66.62% idle, with about 74 GiB disk available. At a later snapshot syspolicyd used
  0% CPU while the three apps remained stopped. These observations do not establish resource
  exhaustion or daemon health.
- One controlled fresh launch of the unmodified built-in Activity Monitor exited `open` successfully
  but produced another stopped pre-startup task (PID 35753). Local testing had already ended.
  Targeted TERM removed only that extra diagnostic instance; the original app tasks were untouched.
- The original Node executable has no extended attributes. This does not rule out provenance or
  first-use policy assessments of newly materialized files.
- Current privileged daemon sampling/descriptor inspection is unavailable to this session;
  noninteractive sudo reports that a password is required. Service identity is verified from its
  installed plist and `launchctl print`: `system/com.apple.security.syspolicy`, PID 514, running.

Interpretation: our fixture/native runtime launches generated real launch-policy work. Repeated new
executable/library paths could contribute to policy churn, especially alongside observed online
failures. They are not proven to have caused the unrelated apps' stopped launches. Quieting local
runs did not restore launch behavior, and no OS daemon deadlock or descriptor exhaustion is proven.
The code audit found no SIGSTOP/SIGTSTP/SIGCONT use in the compiler/build/test paths inspected.

Smallest next recovery action: an admin-controlled targeted TERM of the verified syspolicy service,
then one ordinary app-launch check. It has not been performed by this session. Preserve security
settings/databases and app bundles. If that does not restore normal launches, save work before a normal
machine restart. Do not inject SIGCONT into app tasks to bypass the unresolved launch check.

Prevention pending diagnosis: keep expensive local native/captured-executable runs stopped until
ordinary launches work; avoid repeating broad suites; prefer an isolated macOS runner for sustained
native acceptance. Consider reuse of identical immutable runtime copies only as a bounded follow-up
if measurements establish that new copies are driving assessments; do not replace the input-coherence
contract or begin an open-ended compiler redesign from this correlation.

Remote CI clarification: cancellation was submitted before the user's follow-up arrived. Run
`39075394015` was restored with `gh run rerun` as attempt 2 on the same `4b4d820fa` source. Do not cancel
GitHub runs as part of this local-machine investigation.


### Recovery, Windows acceptance and isolated macOS execution (2026-10-17)

The user confirmed that a machine restart restored usability, and reported that the restart took
roughly ten minutes and apps initially loaded unusually. This does not identify a causal service or
prove that native tests caused the incident. A stalled initial-launch handoff is a working hypothesis,
not a diagnosis; CPU capacity, daemon deadlock and descriptor exhaustion were not established.
Do not repeat sustained native/captured-runtime/startup-cancellation testing on this daily-use Mac.

Windows run `39075394015`, attempt 2, is terminal **success** on `4b4d820fa`. It passes the complete
native launcher ownership matrix, matching package build, 170 selected unit cases (eight platform
skips), both descendant/cancellation cases, independent retained Vite owners, startup identity and
repeated-build/cache/archive acceptance. The final baseline runner duration is 161.96 seconds.
Log: `/private/tmp/apack-windows-39075394015-attempt2.log`. This does not establish native PE admission
or final strict acceptance. Attempt 1 was cancelled before the user clarified that remote jobs must
continue; attempt 2 preserves the same source.

A focused macOS dispatch is added to the existing CI workflow (`compiler_macos=true`). It selects
only `.github/workflows/compiler-macos.yml`, on a disposable `macos-26` runner with Node 23.11.1.
The job records actual OS/architecture/source and checks native fixture headers. It runs selected
compiler ownership cases and the existing native admission/preload/watch file, with explicit worker
bounds, fail-fast and no automatic cancellation. No new native test was executed locally to validate
this routing change. Static YAML parsing, job-selection review and diff checks pass; actual hosted
workflow acceptance remains required.

The runner label is explicit rather than `latest`; its actual image is recorded by the run.
[GitHub's runner inventory](https://github.com/actions/runner-images) and
[hosted-runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
describe the macOS labels and disposable hosted environments. Isolation is an operational precaution,
not evidence for an M1 hardware limitation or a substitute for diagnosing the incident.

### Retained frontend ESM/loader acceptance preparation (2026-10-17)

The next focused case exercises the actual retained Vite process with an ESM preload, its transitive
bare-package import and a custom loader reading an external payload. It checks execution values and
the authored `import.meta.url`, invalidation after changing the loader payload, transitive module bytes
or package export selection, exact-restoration reuse and live Vue edits. It uses existing frontend
capture/collection; no new loader or production capture mechanism is introduced speculatively.
CLI TypeScript, focused correctness lint, YAML parsing/routing and diff checks pass. Runtime acceptance
is pending on hosted macOS; no captured-runtime or native test was executed on the daily-use Mac.

The macOS dispatch accepts `compiler_macos_test` to select one integration case and skip the unit batch.
The pattern travels through an environment variable and quoted argv, not shell-code interpolation.
An empty pattern retains the full focused acceptance job. Existing run `39079072090` continues on
`6e19d17b8`; do not cancel or replace it to test this additional case.

### First hosted macOS result and watch completion boundary (2026-10-17)

Run `39079072090` is terminal failure on `6e19d17b8`, macOS 26.6.2 (25G83), ARM64, Node 23.11.1,
Apple clang 21.0.0. All 76 selected unit checks pass. Native integration passes four real default-loader
cases and independent Vite ownership, then stops at the watch scenario; later cases were not executed.
Preserved log: `/private/tmp/apack-hosted-macos-39079072090-job.log`.

The watch scenario reaches initial backend readiness at 54.10 seconds, frontend readiness at 61.74
seconds and the timestamp-only check at 69.65 seconds. After the native edit, the log shows a new
`packages:ensure` and subsequently the expected missing-helper `ERR_DLOPEN_FAILED`. Its separate
20-second console-observation wait expires first; cleanup suppresses the eventual watch error log.
This proves event detection and forward progress, not a missed rebuild or passing recovery.

The correction observes the actual `builder.build` calls and awaits their rejection/resolution,
then checks the existing refusal/publication assertions. Missing watch events still fail within 20
seconds; the complete initial/refused/repaired generation scenario has a single 180-second budget,
instead of competing compilation waits. Incumbent retention, no native initialization, exact native
values and old-process retirement remain required. No production source or suite-wide deadline changes.
CLI types, correctness lint, diff checks and all 42 timeout-policy checks pass; hosted repair acceptance
remains pending. No native runtime was executed locally.

### Native startup package metadata omission (2026-10-17)

Hosted run `39079253353` on `0275df801` fails the single new frontend case in 12.39 seconds:
the real ESM preload executes correctly, loader payload/transitive module byte changes invalidate,
but changing `preload-dependency/package.json` from `./first.mjs` to `./second.mjs` incorrectly remains
current. Log: `/private/tmp/apack-hosted-esm-39079253353.log`. This is a demonstrated metadata omission,
not a deadline failure. Vue preservation assertions after that point were not reached.

The shared native startup data owner now observes enclosing `package.json` files (including absent
nearer scopes) when capturing a startup read. Node's internal package metadata access bypasses the
filesystem wrappers. This uses the existing file view and watch recorder for both build and frontend
startup; it adds no resolver, loader or rewrite, and capture still stops at the existing frontend phase
boundary. Compiler-owned paths remain excluded. CLI TypeScript, focused lint and diff checks pass;
the same real frontend reproducer still requires hosted acceptance on this correction.

### Hosted watch acceptance and retained scenario budget (2026-10-17)

Run `39079492068` passes the isolated real watch case on `e6ce60a78` in 98.76 seconds (runner 101.34
seconds): frontend ready at 40.01 seconds, timestamp-only check at 43.95, missing-helper refusal at
60.97, repaired input created at 61.02 and replacement published at 97.46. Every incumbent, value,
publication and retirement assertion passes. Log: `/private/tmp/apack-hosted-watch-39079492068.log`.

The measured pass fits the original 120-second scenario budget. Restore that budget instead of keeping
the provisional 180-second allowance; the substantive correction remains awaiting actual build
completion rather than console timing. No repeat native run is needed solely to show that 98.76 is
less than 120. This accepts watch behavior on `e6ce60a78`, not the subsequent metadata correction.
Run `39079716622` queues the exact ESM/loader reproducer on metadata repair `6d482e79f`; do not restart
that run or claim acceptance before it completes.

### Frontend metadata acceptance and next versioned-loader proof (2026-10-17)

Run `39079716622` is terminal success on `6d482e79f`: the exact ESM/loader/transitive package-export
case passes in 17.90 seconds (runner 20.77 seconds). It also reaches and passes the unchanged Vue/live
source assertions. Log: `/private/tmp/apack-hosted-esm-39079716622.log`. This closes that demonstrated
package metadata omission; it does not claim every possible resolution or native platform case passed.

Before changing the remaining versioned-loader path, inspect
[Apple's dyld implementation](https://github.com/apple-oss-distributions/dyld/blob/main/dyld/DyldProcessConfig.cpp):
`processVersionedPaths` scans library/framework directories, reads install names and versions, and builds
overrides used by `forEachPathVariant` after ordinary environment overrides. It is not a basename-only
search. Shared-cache and restricted-runtime policy remain separate open cases.

| Next bounded path | Existing owner / gap | Proof and acceptance |
|---|---|---|
| `DYLD_VERSIONED_LIBRARY_PATH` / `DYLD_VERSIONED_FRAMEWORK_PATH` | Shared native owner inspects ordinary library paths but captures neither versioned directory selection nor its launch-time state | In hosted CI only, build private override images with the fixture library's install name. First prove a fresh ordinary Node actually loads their value/path. Then require retained frontend admission to refuse before addon initialization, even when a preload deletes the variable. Reuse the current owner; no binary rewriting or general loader framework. |

The proof reuses the existing native fixture and cleanup ownership. Its fresh Node selection call is
declared in the subprocess inventory. CLI types, focused lint and diff checks pass; native behavior
and any implementation correction await this focused hosted run. No native test was executed locally.

### Versioned override reproducer and launch admission (2026-10-17)

Run `39079991483` on `99c910914` confirms the library-path omission in 22.13 seconds: ordinary Node
loads the private override's value 22 and exact path, then the captured frontend unexpectedly starts
instead of refusing. Framework execution is not reached because the run is fail-fast. Log:
`/private/tmp/apack-hosted-versioned-39079991483.log`.

Use environment admission rather than a second dyld resolver. Versioned search directories must be
existing absolute directories under `/usr/lib` or `/System/Library`, with physical targets in those OS
locations. Other configured directories, including unused, missing and relative directories, refuse
before build or frontend launch. Empty variables are allowed; empty components in a nonempty search
list are refused. This deliberately conservative configuration policy keeps package libraries on the
existing captured package-relative path; it does not claim to reproduce install-name/version selection.
Public CLI docs and the native-boundary ADR state that policy explicitly.

The common prelaunch guard is now named `assertCompilerLibraryEnvironment`, with all build/frontend
callers migrated outright. It retains insertion checks and adds no process, loader or native parser.
All 44 parser/environment cases, CLI TypeScript and changed-file correctness lint pass. Those local
checks do not execute captured runtimes or native fixtures. Both real versioned cases still require
hosted acceptance of the correction. Shared-cache and restricted-runtime acceptance, ELF/PE and
converged/final gates remain open.

Versioned admission source: `0f0f6a43c`. Follow-up `b7385c0bb` rejects non-OS roots before stat/realpath,
avoiding probes of arbitrary configured paths. Two focused regressions enforce that ordering; all 46
parser/environment checks, CLI types and lint pass. Hosted run `39080454772` is queued on `b7385c0bb`
for both real versioned cases. Preserve this exact run rather than dispatching a duplicate.

Run `39080454772` is terminal success on `b7385c0bb`: both real library/framework versioned cases pass
in 9.24 and 6.78 seconds (16.02 seconds tests, 18.05 seconds runner). Each proves actual ordinary-Node
override selection, the attributed directory refusal and absent addon initialization. Log:
`/private/tmp/apack-hosted-versioned-39080454772.log`. This accepts the documented OS-directory launch
policy, not a full dyld resolver or the still-open shared-cache/restricted-runtime and ELF/PE coverage.

### Shared-cache environment audit and bounded admission (2026-10-17)

Source audit of [Apple's dyld process configuration](https://github.com/apple-oss-distributions/dyld/blob/main/dyld/DyldProcessConfig.cpp)
shows `DYLD_SHARED_CACHE_DIR` selecting a directory before JavaScript. `DYLD_SHARED_REGION` can request
private use subject to platform policy. The simulator/internal-OS root/overlay branches are distinct
from ordinary desktop macOS; do not invent support requirements for those runtimes from their names.

Extend the existing prelaunch OS-directory policy to the shared-cache directory. This setting holds
one path, not a colon-separated list. Preserve ordinary OS cache use and the existing environment
identity; refuse other configured locations before build/frontend launch without probing outside
paths. No cache copying, binary parsing or custom cache generation is introduced.

The existing OS-insertion/constructor refusal scenario now also checks outside cache configuration
through both real public launch paths and preserves the accepted build revision. This proves admission,
not execution of a manufactured shared cache. All 48 parser/environment checks, CLI types, focused
lint and diff checks pass; actual extended-scenario acceptance remains pending on hosted macOS.
The workflow also records the real Node image's linked libraries, signature flags and entitlements
using `otool`/`codesign` on the disposable runner. These are evidence for the exercised runtime,
not an assumption that every hardened profile has been accepted. Restricted-runtime and ELF/PE
coverage and converged/final gates remain open. No native runtime batch was executed locally.

Shared-cache correction source `ef01842ed` is running as hosted run `39080870051` with only the extended
launch-admission scenario selected. Platform/library/signature recording passed; test acceptance is
pending. Follow this existing run rather than dispatching a replacement.

### Shared-cache scenario timeout and exercised signing profile (2026-10-17)

Run `39080870051` is terminal failure on `ef01842ed`: the scenario reaches normal build output at
23:59:04, then expires its 60-second case budget at 23:59:15. No guard assertion failure is reported;
the missing phase markers do not establish whether the baseline or subsequent duplicate compiler
capture was still active. Log: `/private/tmp/apack-hosted-cache-39080870051.log`.

Remove the extra installation capture by routing frontend refusal through the same builder's
`serveFrontend`. Give the fixture a real frontend entry so it reaches the same prelaunch gate.
Keep the 60-second budget and every constructor/refusal/incumbent assertion; add three phase timings
to distinguish baseline cost from refusals if it fails again. CLI types, lint and diff checks pass;
the revised real scenario still requires hosted execution. No product guard or deadline changes here.

The runner's actual Node 23.11.1 ARM64 binary has Developer ID signature `HX7739G8FX`, runtime flag
`0x10000`, and entitlements allowing dyld variables and disabling library validation. Its three listed
linked libraries are normal OS images. Thus earlier acceptance on this hosted Node exercises that
hardened profile. The repo's app entitlements omit those two exceptions; do not claim equivalent
acceptance of the signed app profile from the Node result. No signing configuration was changed.
The diagnostic adopts Apple's current `codesign --display --entitlements - --xml` syntax after the run
reported deprecation of the colon prefix; see [Apple's entitlement inspection example](https://developer.apple.com/documentation/technotes/tn3125-inside-code-signing-provisioning-profiles).

Revised source `baf461618` is running in hosted macOS run `39081394988`, selecting the same single
scenario with its unchanged 60-second budget. Do not dispatch a duplicate while this run is live.
