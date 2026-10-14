> Written in Codex session `01a1287c-2130-7191-9b4b-a48dc2edb218`, 2026-10-12.

```text
# Goal: pack access declarations correspond to enforceable permissions

Develop the security design in docs/goals/goal-pack-security-isolation.md before implementing it.
The background was surveyed at 196e54dfd. Re-audit the current loader, SDK bindings, transport,
preload and EARS access paths before relying on those findings.
Read Background, Decisions, Open decisions, Phases and Constraints first.
Complete Phase 1 and prepare the Phase 2 design for review. Resolve its open product/security
decisions before implementing isolation; this document does not select a sandbox mechanism.

Finished when the approved design is implemented and adversarial fixtures prove its declared
boundary in installed builds, legitimate pack behavior passes, public contracts/docs agree, and
the affected checks plus npm run chain pass. Record the outcome and archive this document then.

Work in reviewable phases. Do not publish, push, tag, open a PR or change release metadata unless
requested. Use isolated test data, never production data. Follow CLAUDE.md for implementation,
stored-data migration and validation. Do not add compatibility shims or weaken failing assertions.
```

# Pack security isolation and enforced permissions

Status: planned, design first. Extracted from the manifest maturity discussion; not a prerequisite
for the current settings or discovery work.

## Background

Pack backends load into the API process; pack frontends import into the app renderer and contribute
executable components. Generated types and manifest metadata currently constrain supported authoring,
but do not contain arbitrary code sharing the host's execution environment. The existing `permissions`
field is descriptive metadata, not an enforced grant.

The [manifest maturity plan](../plans/manifest-maturity.md) separates declared consumed APIs from
security permissions. [Settings extraction](../plans/settings-architecture.md) defines shared
cross-pack mutation by default, with optional owner-only mutation through the supported API. The
[discovery plan](../plans/discovery-without-activation.md) makes declared surfaces inspectable without
loading code. None establishes a sandbox for malicious pack code.

Existing inputs must be reconciled rather than implemented independently:

- [Declared capabilities](../plans/declared-capabilities.md): generated services and ambient access,
  including direct repositories, EARS queries/transactions and content appliers.
- [Frontend isolation](deferred/goal-pack-frontend-isolation.md): shared renderer/preload access and
  component integration. Its paths, commands, trust distinctions and proposed mechanisms need re-audit.
- [Fault isolation](../plans/pack-fault-isolation.md): crash containment and the synchronous EARS seam.
  A separate Node process alone is not filesystem/network confinement.

Chrome requires permissions for many extension APIs and distinguishes API permissions from host
access and optional runtime grants. This is evidence for separating declarations from granted access,
not a sandbox specification for apack. [Chrome permission declarations](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)

## Decisions

1. Security permissions are enforced host policy, not generated types, import rules or claims supplied
   in a message. The host associates identity with the execution context/connection it created.
2. Inspect declared access without activation. Keep requests, grants and current availability distinct;
   a dependency declaration neither grants its permissions transitively nor allows impersonation.
3. Every sensitive operation crosses a checked boundary. Closing only generated service access leaves
   direct Node, EARS, renderer globals, API tokens and preload paths to audit.
4. Preserve the shared-by-default settings collaboration policy. Resource grants govern whether a pack
   can reach a settings target; the definition's `access: owner` governs mutation there. Both checks
   apply. This goal does not silently make all cross-pack settings owner-only.
5. Keep crash containment, authoring checks and security confinement distinct in docs and tests. No
   permission guarantee ships for a surface that still has an ambient bypass.

## Open decisions

- **Threat model:** which code is untrusted, which resources it must not reach, and which privileges
  the user may deliberately grant. Include dependencies and build/install hooks, not just runtime entries.
- **Trusted pack policy:** whether any host-shipped code is exempt, and how trust is established.
  A manifest's `builtIn` claim must never confer trust.
- **Execution boundary:** backend sandbox and frontend realm/origin isolation on supported platforms;
  determine the actual restrictions, not just where code runs.
- **Data contract:** replacing or adapting synchronous EARS access across isolation, transaction
  atomicity, query subscriptions and cross-pack repositories. Do not assume synchronous RPC is viable.
- **Permission vocabulary:** concrete resources/actions, grant lifecycle, update escalation, revocation
  and user presentation. Start from audited operations rather than broad service-name booleans.
- **Frontend extension contract:** how custom forms, step/block/artifact viewers, editor extensions and
  app slots work without sharing executable objects and host DOM authority.

## Phases

### 1. Audit all authority paths

Inventory backend entry loading/module bridges, raw Node imports/native modules/child processes,
filesystem/network/terminal access, secrets and inference, repositories/EARS/content appliers,
frontend import maps, preload, renderer globals, API tokens, bus routing and dependency delegation.
Also audit build-time compilers, package lifecycle scripts and installer execution: runtime isolation
does not protect an install that already executes untrusted code with host authority.

Record each path's caller identity, resources, current bypasses and proposed mediation. Name the
operations default-setup actually needs and which cannot retain their present signatures.

**Done when:** the threat model and authority inventory cover both backend and frontend, all supported
contributions and dependency execution, with source evidence and explicit unresolved decisions.

### 2. Prove the boundary and settle the design

Prototype the proposed backend and frontend mechanisms using malicious fixtures and isolated test
resources. Verify confinement of direct file/network/process access and access to host DOM, preload,
tokens and other packs. Test a legitimate settings form and representative EARS operation across the
boundary. Measure startup and interaction costs before choosing a migration strategy.

Specify identities, broker APIs, serializable contracts, grants, update/revocation behavior, contribution
rendering and the trusted-host exception. Document limits and unsupported platforms explicitly.

**Done when:** the design is approved, prototypes demonstrate the claimed restrictions, and every open
decision affecting the chosen mechanism is settled. A prototype failure is evidence to revise the
design, not grounds to weaken the guarantee.

### 3. Implement isolation and permission mediation

Migrate runtime loaders, generated SDK access, transport, data access and frontend integration as one
coherent boundary. Preserve declaration discovery and installed-build validation. Authenticate
callers at the broker, check current grants and resource ownership, and remove ambient authority from
isolated code. Handle disable/uninstall, crashes, pending calls, subscriptions and grant revocation.

**Done when:** supported isolated pack operations work through the broker; denied operations fail
without side effects; replacement/revocation cannot retain stale authority; host-shipped exceptions
cannot be acquired by a pack-authored flag or forged identity.

### 4. Validate installed behavior and finish contracts

Cover direct bypass attempts, forged/delegated identities, dependency permission escalation, restricted
settings mutations, secrets/data access, update grants, revocation and frontend navigation/token escape.
Test actual installed builds and supported platforms, not only mocks of broker checks. Pair denials with
successful granted operations and verify the tests fail if their relevant enforcement is removed.

Update schema/API reports, SDK/authoring docs, installer permission presentation and reconciled older
plans. Run focused boundary specs, external-pack/packaged-authoring and app checks, then the chain.

**Done when:** the declared guarantee has adversarial evidence and maintained guards, legitimate pack
behavior passes, documentation describes the actual trust model, and no descriptive field is presented
as an enforced permission without its corresponding boundary.

## Constraints

Do not expand the current settings, discovery or manifest work into isolation implementation. Their
API contracts can improve independently while documenting trusted in-process execution honestly.
Do not use JavaScript `vm`, workers or a plain child process as proof of confinement. Choose the
mechanism through the prototype and supported-platform audit. Never pass a host-wide API token or
raw privileged handles into an isolated pack. Keep secrets values and arbitrary payload contents out
of permission diagnostics. Re-audit historical plans instead of copying stale exceptions or commands.
