# The built-in pack's runtime bundle is not reproducible

`packages/default-setup/dist/runtime/index.cjs` differs between builds of identical input. Diagnosed
2026-09-25 while reviewing the chain's cache; not fixed, because the fix is an esbuild upgrade.

## What it is

Three bytes, in whether esbuild emits its interop helper's `isNodeMode` argument:

```
-     import_https = __toESM(require("https"));
+     import_https = __toESM(require("https"), 1);
-     fs6 = __toESM(require("fs/promises"));
+     fs6 = __toESM(require("fs/promises"), 1);
```

The importers are the pack's own sources (`features/code/be/services/gh-cli.ts` and the several files
doing `import * as fs from 'fs/promises'`). Measured: **four runs, four distinct hashes.**

## Who builds it

`dev-build.mjs`, and only `dev-build.mjs`. `abuddy build` stops before `bundlePackRuntime` for a built-in
pack, so the pack's `build` script — `abuddy build && node ... dev-build.mjs` — has exactly one producer
for this file.

Worth stating because the obvious reading is wrong, and was read wrong once: running `abuddy build` alone
repeatedly leaves the file byte-identical, which looks like determinism and is actually the file not being
written at all.

## What it costs

One extra downstream cycle per `compile`, not per run. `compile` rewrites the bundle only when it runs;
every step declaring `PACK_OUTPUTS` then goes stale once — `typecheck`, both unit pools, `test:integration`,
the fixture check, `build:app` — and re-caches on the cycle after. Observed as a warm chain at 34.3s with 9
of 11 cached straight after `--all`, then 26.1s with 10 of 11.

So it is waste rather than breakage, and it is bounded. It is recorded because it is invisible without the
cache verifier, and because the same bundle ships.

## What it is not

Ruled out by measurement, three runs each:

| Hypothesis | Result |
|---|---|
| Codegen output varies | `src/__generated__` byte-identical across builds |
| Missing `tsconfig` (the deterministic bundler passes one) | still 3 distinct hashes |
| `packages: 'external'` vs an explicit `external` list | still 3 distinct hashes |
| Sourcemap generation | still 3 distinct hashes |

`bundlePackSource`, which builds every other artifact in `dist`, is deterministic — only this bundle is not.

## The fix

esbuild is 0.25.12 against 0.28.2. An upgrade is the candidate, and it is not a one-line change: esbuild
builds the pack runtime, the seed runtime, the step build, the FE bundle, `@abuddy/cli`'s and
`@abuddy/testing`'s published bundles, and the API through tsup. It wants its own goal, with the published
bundles re-checked.

Reproduction, which takes about a minute:

```bash
for i in 1 2 3 4; do
  node --import tsx --conditions=@abuddy/source packages/default-setup/dev-build.mjs >/dev/null 2>&1
  shasum -a 256 packages/default-setup/dist/runtime/index.cjs | cut -c1-12
done
```

If an upgrade fixes it, the check that it stays fixed belongs beside the other recorded artifacts: build
twice, compare. If it does not, the remaining option is to stop treating the bundle as a cache input, which
means the steps that read it cache on the pack's sources instead — sound only while nothing else can change
the bundle, which is a weaker claim than reproducibility.
