# User-Defined Services: Security Overview

## Context

User-defined services let AgentBuddy install code from GitHub repos, compile it locally, load it into the backend runtime, and expose it to actions/flows through `services.*`.

The first implementation pass is a working prototype. This document captures the security concerns and design decisions that need a second pass before the feature should be treated as safe for broad use.

## Prototype trust model

For the prototype, user-defined services should be treated as trusted local extensions.

Installing a service means the user is choosing to run that repo's code with AgentBuddy backend privileges. The prototype should make this clear in the UI, but it does not need to solve sandboxing, signing, permission prompts, or curated distribution yet.

## Primary risks

| Risk | Why it matters |
|------|----------------|
| Arbitrary code execution | A service can run JavaScript inside the backend process. |
| Dependency install scripts | `npm install` can run lifecycle scripts from the service and its dependencies. |
| Secret exposure | Services may receive API keys or access existing services that can read secrets. |
| Filesystem access | Services can use Node APIs or existing services to read/write local files. |
| Network exfiltration | Services can send user data, secrets, prompts, files, or workflow data to external endpoints. |
| Process spawning | Services may indirectly access CLI/process capabilities through existing AgentBuddy services. |
| Persistent side effects | Services can create timers, sockets, watchers, caches, or background work that survive reloads. |
| Supply-chain drift | Updating a GitHub repo or dependency can change behavior after the user initially trusted it. |
| Type/runtime mismatch | Type declarations can make a service look safer or narrower than its runtime behavior. |

## Security second-pass work

### Explicit install warning

The install flow should clearly state that user-defined services run local code with backend privileges. The warning should show the repo URL and resolved commit before installation.

### Source identity

Installed services should record:

- Repo URL
- Branch/tag/ref requested by the user
- Resolved commit hash
- Install timestamp
- Package manager and lockfile status
- Last update timestamp

### Secret handling

Secret config values should be stored as secret references, not plain values in the service registry. The UI should only receive redacted values. Runtime config resolution should happen immediately before service instantiation.

### Capability boundaries

The second pass should decide whether services receive the full `services` object or a scoped capability object. A scoped object would let AgentBuddy expose only the APIs a service declares or the user approves.

### Lifecycle management

Services should eventually support lifecycle hooks so enable/disable/update can clean up resources:

```typescript
interface ServiceLifecycle {
  start?(): Promise<void> | void;
  stop?(): Promise<void> | void;
  dispose?(): Promise<void> | void;
  healthCheck?(): Promise<{ ok: boolean; message?: string }>;
}
```

### Dependency controls

The second pass should decide how strict installs should be:

- Whether to allow `npm install` lifecycle scripts
- Whether lockfiles are required
- Whether native modules are allowed
- Whether dependencies should be audited or only surfaced as warnings
- Whether updates require explicit user approval

### Sandboxing options

Possible future isolation models:

- Keep trusted in-process services for advanced users
- Run services in a worker process with a constrained IPC API
- Run services with a capability-based service proxy
- Support curated/signed services with stronger defaults

## Non-goals for prototype

The prototype does not need to solve:

- Full process sandboxing
- Service signing
- Curated marketplace review
- Automated dependency auditing
- Fine-grained permission prompts
- Malicious package prevention

## Acceptance bar before wider release

Before treating user-defined services as broadly safe, AgentBuddy should have:

- Clear install/update trust prompts
- Commit-pinned installs
- Redacted secret storage and UI display
- Service status/error reporting
- A documented service lifecycle contract
- A decision on full `services` access versus scoped capabilities
- A documented update policy for breaking changes and supply-chain drift
