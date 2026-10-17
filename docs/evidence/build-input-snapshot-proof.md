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
