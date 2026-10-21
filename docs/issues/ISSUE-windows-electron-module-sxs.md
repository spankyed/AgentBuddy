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

**Next diagnostic:** reproduce on the [Windows development VM](../references/guides/windows-development-vm.md)
and read the activation failure with `sxstrace` and the Application event log; a CI log cannot show which
manifest or assembly the loader rejected. Its checkout `C:\src\apack` is on `session/integration-sharding`.

The three Windows failures in front of this one are fixed: the job-ownership step running before
`npm ci`, the PE metadata helpers' five-second limit, and `Get-FileHash` in the publisher-policy fixture.
