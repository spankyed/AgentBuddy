# Windows 11 desktop acceptance

Continue the current settings and pack contracts goal. At its next usable checkpoint, incorporate a
bounded Windows 11 x64 acceptance pass. Do not abandon in-flight repairs or restart accepted work.
Read CLAUDE.md, the goal's current execution ledger and the
[Windows development VM guide](../guides/windows-development-vm.md) first.

## Why

Our existing Azure VM runs **Windows Server 2025 Datacenter Azure Edition x64**, not Windows 11.
Its compiler, native-loader and process-lifetime results remain useful, but do not establish desktop
compatibility on Windows 11. A read-only source search found no explicit Server-edition branches or
hardcoded Server 2025 build assumptions; that is limited evidence, not proof of compatibility. The
Windows compiler helpers are intended to handle general Windows loading and process behavior.

## Environment

- Prefer a **temporary, separate Windows 11 x64 VM**. Preserve the existing `apack-windows-dev`
  Server VM, its disk, tooling, snapshots, saved patches and diagnostic evidence. Do not reimage it.
- Before provisioning, verify current Azure Windows 11 image availability, region/quota and the
  user's licensing eligibility against official documentation. Do not assume the Server license or
  free-trial credit grants Windows client virtualization rights. If unavailable, explain the specific
  blocker and propose a legitimate Windows 11 x64 alternative; do not silently substitute Server or ARM.
- Prepare the exact image, size, access approach, estimated compute/storage/network costs and cleanup
  list for user review before creating chargeable resources. This prompt requests planning and
  acceptance work; it does not itself approve provisioning, a paid subscription upgrade or licensing
  attestations. Honor any separate explicit authorization already given for this exact environment.
- Reuse the existing access and spending safeguards: restricted access, verified host identity, no
  public RDP, no credentials in source or logs, automatic shutdown and retained trial spending limit.
  Budget alerts are not hard spending caps. Do not upgrade to pay-as-you-go automatically.
- Coordinate ownership before deallocating the Server VM while Windows 11 is used. Do not stop
  another session. Keep one expensive execution owner and the established two-core test budget.
- Isolate source, dependencies, generated output and app profiles. Pin the tested commit, toolchain,
  exact Windows image/build and test commands. Prepare a standard non-administrator account for
  normal app/CLI use; elevate only setup operations that require it.

## Bounded acceptance

Use the same committed source and packaged app/CLI output as the current checkpoint. Reuse existing
tests and prepared fixtures where they establish the boundary; do not build a second harness or run
every suite again merely because this is another machine.

1. Install and launch the packaged desktop app as a standard user. Verify renderer/backend startup,
   core navigation, settings persistence and clean restart using disposable data.
2. Exercise external authoring with the actual locally packed CLI/SDK packages: scaffold, build,
   archive and install an external pack against the isolated host. Exercise the installed pack in the
   app. Public npm, Homebrew or GitHub releases are not prerequisites and are not authorized here.
3. Run the relevant existing Windows native-loader/runtime-capture and process-cleanup regressions.
   Confirm actual selected libraries, owned runtime behavior and child cleanup on the covered exit
   paths. Inventory covered cases first; do not repeat the entire historical native investigation.
4. Verify normal app shutdown and uninstall. Distinguish removal of binaries from retained user data;
   clean up only this run's disposable profile and outputs.

For failures, retain the exact command, commit, logs and process exit information. Distinguish a
Windows 11 product defect from fixture/setup failure, slow execution or an unproven hypothesis. Use
the smallest reproducer before changing product code. Do not weaken validation, broadly increase
timeouts, modify Windows security policy or start another open-ended compiler redesign.

## Completion and handoff

Record a small acceptance matrix in the owning goal/evidence: case, exact source/environment,
result, evidence location and any remaining limitation. Incorporate this pass into the existing final
Windows desktop acceptance, without replacing the goal's strict final gate or unrelated platform
obligations. Update the current handoff rather than adding contradictory "next" instructions.

Export useful evidence before cleanup. Deallocate the temporary VM when idle; compute shutdown
does not remove disk/IP charges. Once the user authorizes disposal and evidence is retained, delete
only the temporary VM and its explicitly inventoried dedicated resources. Preserve the Server VM
and shared resources. Report any remaining billable resources. No push, release or publication is
authorized by this prompt.
