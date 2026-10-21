# Windows: the Electron-runtime PE case fails side-by-side activation

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

**It does not reproduce on the [Windows development VM](../references/guides/windows-development-vm.md)**
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
