# User-Defined Services: Architecture

## Context

Users should be able to import services from GitHub repos and use them under `services.*` in actions/flows with full intellisense. Built-in services (logger, llm, codex, etc.) stay in the monorepo but go through the **same interface** as user-imported services — unified registration, config, enable/disable, and type exposure.

## Key decisions from discussion

- **UI**: Settings subtab for service management
- **Distribution**: Services are GitHub repos with a framework-specific config, NOT npm packages
- **Unified interface**: No "built-in" vs "user" distinction at the interface level. Both use the same registration, config schema, and type system. Internals can differ (static import vs dynamic load).

---

## Service repo format

A service is a GitHub repo with this structure:

```
my-weather-service/
  buddy.config.ts          # service manifest (required)
  src/
    index.ts               # service entry point
    helpers.ts             # optional helpers
  package.json             # npm deps the service needs (axios, etc.)
```

### Manifest (`buddy.config.ts`)

```typescript
import type { ServiceConfig } from '@agentbuddy/service-sdk'; // or inline type

export default {
  key: 'weather',                    // → services.weather
  displayName: 'Weather',
  description: 'OpenWeatherMap integration',
  main: 'src/index.ts',             // entry point
  config: {                          // rendered as settings UI
    apiKey: { type: 'string', label: 'API Key', secret: true },
    units:  { type: 'enum', options: ['metric', 'imperial'], default: 'metric' },
  },
} satisfies ServiceConfig;
```

### Entry point (`src/index.ts`)

Factory function — receives the services object and user config, returns the service:

```typescript
export default function createService(services: any, config: any) {
  const { logger } = services;

  return {
    async getCurrentWeather(city: string) {
      logger.info('Fetching weather', { city });
      const res = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?q=${city}&units=${config.units}&appid=${config.apiKey}`
      );
      return res.json();
    },

    async getForecast(city: string, days = 5) {
      // ...
    },
  };
}
```

TypeScript source is compiled by the framework at install time (esbuild, same as action compilation). The **return type** is extracted for Monaco intellisense.

---

## Unified service interface

Both built-in and user services are represented by a `ServiceDefinition`:

```typescript
interface ServiceDefinition {
  key: string;                          // services.key
  displayName: string;
  description?: string;
  source: 'builtin' | 'user';          // internal: determines loading strategy
  enabled: boolean;
  config?: {                            // schema for user-configurable values
    [field: string]: {
      type: 'string' | 'number' | 'boolean' | 'enum';
      label: string;
      default?: any;
      secret?: boolean;
      options?: string[];               // for enum
    };
  };
  configValues?: Record<string, any>;   // user-provided config values
  typeDefs?: string;                    // .d.ts content for Monaco
}
```

**Built-in services** register their definitions at startup — same shape, `source: 'builtin'`, types come from the existing rollup pipeline.

**User services** register their definitions at install time — `source: 'user'`, types are extracted from the TypeScript source.

The Settings UI renders both identically: list of services with enable/disable toggles, config fields, status indicators.

---

## Installation flow (user services)

```
User pastes GitHub URL
  │
  ▼
1. Clone/download repo → ~/.agentbuddy/services/<key>/
  │
  ▼
2. Read buddy.config.ts → validate manifest
  │
  ▼
3. npm install (in service dir) → install deps from package.json
  │
  ▼
4. esbuild bundle src/index.ts → compiled JS (same pipeline as action compilation)
  │
  ▼
5. Extract types: tsc on source → .d.ts for the return type of createService()
  │
  ▼
6. Register ServiceDefinition in EARS (key, displayName, config schema, types, etc.)
  │
  ▼
7. Load at runtime: require() compiled JS, call factory(services, config)
  │
  ▼
8. Push updated type declaration to frontend → Monaco addExtraLib()
```

---

## Runtime loading

```typescript
// packages/api/src/services/user-services.ts

const USER_SERVICES_DIR = path.join(os.homedir(), '.agentbuddy', 'services');

function loadUserServices(builtinServices: BuiltinServices): Record<string, any> {
  const registry = settingsQueries.getServiceRegistry();
  const loaded: Record<string, any> = {};

  for (const [key, def] of Object.entries(registry)) {
    if (!def.enabled || def.source !== 'user') continue;
    try {
      const compiled = path.join(USER_SERVICES_DIR, key, 'dist', 'index.js');
      delete require.cache[require.resolve(compiled)]; // ensure fresh load
      const factory = require(compiled).default;
      loaded[key] = factory(builtinServices, def.configValues ?? {});
    } catch (e) {
      logger.error(`Service "${key}" failed to load`, e);
    }
  }
  return loaded;
}
```

Modify `getServices()` to merge:

```typescript
function getServices() {
  const builtin = require('./index').default;
  return { ...builtin, ...loadUserServices(builtin) };
}
```

---

## Type system (Monaco intellisense)

### How user service types get to Monaco

1. **At install time**: Run TypeScript compiler on service source to extract the return type of `createService()`. Store the resulting `.d.ts` text in the `ServiceDefinition.typeDefs` field.

2. **On app startup / service change**: Generate a combined declaration string from all enabled services:

```typescript
function generateUserServicesDeclaration(registry: Record<string, ServiceDefinition>): string {
  const blocks: string[] = [];
  const fields: string[] = [];

  for (const [key, def] of Object.entries(registry)) {
    if (!def.enabled || !def.typeDefs) continue;
    blocks.push(`namespace __Svc_${key} {\n${def.typeDefs}\n}`);
    fields.push(`${key}: __Svc_${key}.ServiceExports;`);
  }

  return `
    ${blocks.join('\n')}
    declare const services: typeof import('@app/defs/action').services & {
      ${fields.join('\n')}
    };
  `;
}
```

3. **Inject into Monaco** via `addExtraLib()` (same pattern as `updateDslParamsType`):

```typescript
let userServicesDisposable: IDisposable | null = null;

export function updateUserServicesType(monaco: Monaco, declaration: string): void {
  if (userServicesDisposable) userServicesDisposable.dispose();
  userServicesDisposable = monaco.languages.typescript.typescriptDefaults
    .addExtraLib(declaration, 'inmemory:///dsl-user-services.d.ts');
}
```

4. **Push updates** via existing WebSocket/tRPC bus when services change.

### Built-in service types

Continue using the existing pipeline (tsc → rollup → `action-defs.d.ts`). The user services declaration **extends** the built-in type via intersection (`& { ... }`), so both coexist without conflict.

---

## Dependency management

### Service deps (e.g., axios in a weather service)

Each service dir has its own `package.json` and `node_modules/`. `npm install` runs in the service directory. Dependencies are fully isolated from the app and from other services.

**Trade-off**: No cross-service deduplication. If two services both use `axios`, it's installed twice. Acceptable — disk space is cheap, and isolation prevents version conflicts.

**Alternative (future)**: Hoist all service deps into a shared `~/.agentbuddy/services/node_modules/`. This is an optimization, not a requirement.

### App deps vs service deps

Fully isolated. The app bundles its own `node_modules/` inside the Electron app. Service `node_modules/` live in user data. No version conflicts possible.

---

## Pitfalls & mitigations

| Pitfall | Risk | Mitigation |
|---------|------|------------|
| **Native modules** | Service uses a package requiring node-gyp compilation | Detect `binding.gyp` at install time, warn user. Electron's Node headers may be needed — run install with `--runtime=electron`. |
| **Service crashes** | Bad factory function throws at load time | `try/catch` in `loadUserServices()`, mark service as errored in registry, skip it. Show error in Settings UI. |
| **Naming conflicts** | User service key collides with built-in (e.g., `logger`) | Validate key against built-in names at install time. Reject conflicts. |
| **Type quality** | Service author writes bad/no types | `ServiceExports` interface is required. If types fail to extract, service works at runtime but without intellisense. |
| **Complex .d.ts** | Service types import from other packages | Require service `.d.ts` to be self-contained (inlined). Recommend `dts-bundle-generator` in the service authoring docs. The esbuild + tsc pipeline can handle this. |
| **Stale service** | GitHub repo deleted or updated | Store installed version/commit hash. "Update" button re-clones latest. |
| **Config secrets** | API keys stored in EARS | Use the existing `Secret` entity type or encrypt config values with `secret: true`. |
| **Hot reload** | User installs service while app is running | Clear require cache → re-load → regenerate types → push to frontend. No app restart needed. |
| **Circular deps** | Service calls `services.action.getAndExecute()` which loads services again | `getServices()` already uses lazy `require()` — cache the merged result to prevent re-evaluation loops. |

---

## Implementation phases

### Phase 1: Infrastructure
- Create `~/.agentbuddy/services/` directory structure
- Service registry in EARS (CRUD for `ServiceDefinition`)
- Install flow: clone repo → npm install → esbuild compile → register
- Runtime loading: dynamic `require()` + factory call → merge into services object
- **Files**: new `services/user-services.ts`, extend settings system

### Phase 2: Settings UI
- Services subtab in Settings plugin
- Install from GitHub URL
- Per-service: enable/disable, config editor, status/error display
- Built-in services listed with same UI (enable/disable, config where applicable)
- **Files**: new Vue component in settings plugin

### Phase 3: Type intellisense
- Extract return type of `createService()` via TypeScript compiler API
- Generate combined user services declaration
- `updateUserServicesType()` in Monaco config
- Push type updates to frontend on service changes via existing event bus
- **Files**: `monaco-config.ts`, new tRPC endpoint for type sync

### Phase 4: Unified built-in registration
- Add `ServiceDefinition` for each built-in service
- Register at startup through same interface
- Built-in services appear in Settings UI alongside user services
- **Files**: `services/index.ts` refactor

### Phase 5: Distribution & polish
- Setup packs can declare service dependencies (repo URLs)
- Import flow installs services from pack
- Service update mechanism (re-clone latest from GitHub)
- Service authoring docs + template repo

---

## Open questions

1. **Service SDK package**: Should we publish an `@agentbuddy/service-sdk` npm package with types for `ServiceConfig`, `createService` signature, etc.? Or just inline types in the template repo?

2. **Service versioning**: When a user "updates" a service (re-clones from GitHub), how do we handle breaking changes? Semantic versioning in `buddy.config.ts`? Or just "latest from main branch"?

3. **Service discovery**: Beyond pasting GitHub URLs, should there be a curated list / search? (Likely a future product feature, not part of v1.)
