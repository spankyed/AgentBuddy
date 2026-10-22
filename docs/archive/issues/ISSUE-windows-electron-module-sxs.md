# Windows: the Electron-runtime PE case failed side-by-side activation

**Status:** resolved 2026-10-21 by `b5ae5b62c`. The full `compiler_windows` workflow passes on `windows-latest`
(run `39661693026` on `e5d790b20`, every step, 26 of 26 PE cases).

## Cause

The compiler's read tree stored a captured file under a directory keyed by the literal root of the path it
was reached by. Windows reaches the same file as `\\?\C:\…` and as `C:\…`, so the addon and the files its
activation context names landed in two different directories. The loader then resolved the context against a
tree that held only half of it and refused the image. `compilerReadMapping`
(`packages/apack-cli/bin/compiler-source-hooks.mjs`) now keys storage on the drive spelling, so every spelling
of a file reaches one copy; `compiler-read-tree.spec.ts` holds it with a Windows-only case. The VM did not
reproduce it because its runs reached the files by one spelling.

## Original report

`compiler-pe-libraries.native.spec.ts > preserves Electron module native selection and refuses it through
compiler startup` fails on a hosted `windows-latest` runner at its accepted path, before any refusal is
checked. Loading the fixture's compiled addon under the captured Electron runtime throws:

```
Error: The application has failed to start because its side-by-side configuration is incorrect.
\\?\C:\Users\runneradmin\AppData\Local\Temp\apack-electron-module-…\pack\binding\addon.node
  at process.dlopen (dist/package/dist/compiler-startup.cjs:720:22)   code: 'ERR_DLOPEN_FAILED'
```

Evidence: compiler-windows run `39562959164` on `c2cefd600` (7 of 26 cases pass before it; the suite bails on
the first failure). It is a Windows loader refusal of the fixture addon's or the captured runtime's
activation context, not a deadline. The case captures through its own path, not the shared compiler
installation.

**It does not reproduce on the [Windows development VM](../../references/guides/windows-development-vm.md)**
(2026-10-21, `master` at `c2c4b5aef`, Windows Server 2025 Azure Edition, Build Tools 18.11):
- the case passes alone;
- it passes after the publisher-policy case;
- the whole PE file passes, 26 of 26 in 755s, with CI's flags (`--bail=1`, one thread, no file parallelism).

The fixture needs the native SDK the workflow prepares (`.github/scripts/setup-node-native-sdk.ps1`, run with
`RUNNER_TEMP` and `GITHUB_ENV` pointed at local paths).

So it is specific to the hosted runner, not to the code or the fixtures. The runner is `windows-2025-vs2026`
with Visual Studio 18 Enterprise and MSVC 14.51. **Next diagnostic, on the runner itself:** a filtered
`compiler_windows` dispatch that runs `sxstrace` around the case and uploads its parsed log and the Application
event log's SideBySide entries. The VM cannot show what the runner's loader rejected.

The three Windows failures in front of this one are fixed: the job-ownership step running before
`npm ci`, the PE metadata helpers' five-second limit, and `Get-FileHash` in the publisher-policy fixture.
