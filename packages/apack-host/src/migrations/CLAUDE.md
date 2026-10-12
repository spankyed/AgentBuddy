# Migrations (`@apackdev/host/migrations`)

Versioned migrations represent deliberate future data changes. Historical pre-0.4 settings conversion
has been removed: normal settings writes and imports use the current contract. Do not recreate aliases,
fallback readers or invalid-value exemptions. Developer backup conversion, if needed, is a separately
invoked operation on a copy; it is not part of boot or import.

## Runners

The API boot, app-data reset and backup import run `runAppMigrations(registry)` and
`runPackMigrations(targets)` through `startPacks()`, after pack `onInit` and before applying content.

| Runner | Target version | Recorded version |
| --- | --- | --- |
| `runAppMigrations` | Registered packs' `migrations.app` targets at the host app version | `AppState.version` |
| `runPackMigrations` | Each pack's manifest version and `migrations.pack` targets | `AppState.packVersions[packId]` |

A pack declares the version line; provenance does not select it. Either a shipped or external pack may
use either line. A migration module exports `DeclaredMigration` (`description`, `up`); its target comes
from the manifest key. Codegen assembles the runtime `PackMigration`.

The host and default-setup currently declare no migrations. Add one only for a concrete supported data change, not hypothetical
old installations. The frontend runner (`src/fe/migrations`) operates separately on window storage.

App migrations run when `stored < target <= app version`. A prerelease uses its release as the cap;
development runs pending targets without a cap. No recorded app version means new data at the current
version. Pack migrations compare the per-pack stored version with the pack's manifest version.

A failure stops subsequent migrations and does not record success. `startPacks()` skips pack migrations
and content after an app migration failure; the next boot retries. Pack failures retain that pack's
recorded version. Idempotent guards are required because development/prerelease startup may run a
migration again. Reset clears app data and initializes the current state; import restores current data
before running applicable versioned migrations.

The app-line record is currently global. A pack disabled across an app upgrade cannot catch up its
app-line migrations independently. The replacement work must settle a per-pack record before enabling
that lifecycle; do not assume the existing runner already handles it.

## Adding a pack migration

Use `apack pack add migration <target>` for a pack version change, or add `--app` when the data follows
the host app version. The command writes the file and the manifest entry. Regenerate pack bindings and
validate the real lifecycle that runs the change.

```json
"migrations": {
  "pack": { "1.1.0": "src/migrations/1.1.0.ts#migration" }
}
```

Do not bump release metadata by hand. Keep each transformation idempotent, test failure/retry and
version recording, and update every owned consumer with the contract change.

Coverage: `tests/migrations/runner.spec.ts` checks version lines, release/prerelease/development behavior
and failures. `tests/services/host-runtime.spec.ts` checks startup/reset ordering. API
`tests/runtime/app-reset.spec.ts` exercises reset with built packs; `host-data-services.spec.ts` exercises
real current-format export/import, app completion and unavailable-pack override preservation.
