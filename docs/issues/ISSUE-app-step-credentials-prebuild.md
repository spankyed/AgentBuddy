# The credential-boundary app test builds a pack on every run

`tests/packs/external-pack/tests/e2e/settings-ownership.spec.ts > accepted dependency credentials enforce
shared, owner-only and reload boundaries` creates a dependent pack in a temporary directory, runs
`apack pack build` and a typecheck on it, then installs it: 26.7s of the 50s its file takes, and that file is
now the slowest one in the `test:external-pack:app` step's parallel suite, so it bounds the step.

Building the dependent pack once, in `test:external-pack:contract` beside the other fixture packs, and having
the test install that build would take about 20s off the step. It moves the build into a producer rather than
removing it, so check the producer's place on the critical path before doing it. The test's own assertions
(shared, owner-only and reload credential boundaries) are about installation and runtime, not the build.
