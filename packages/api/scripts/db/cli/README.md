# AgentBuddy Database CLI

Scripts for querying and repairing the AgentBuddy database (EARS on LMDB) while the app is closed. They live in `packages/api/scripts/db/`.

## Before you run anything

**Every db script needs `ABUDDY_ENV` and `ABUDDY_USER_DATA_DIR`.** The scripts open the database through `resolveAppContext()` (`@abuddy/sdk/env`), which throws `App environment unknown` without `ABUDDY_ENV`, and `ABUDDY_USER_DATA_DIR` picks the data dir the scripts read and write. Don't point them at the app's live data: copy it and point at the copy.

```bash
# Copy the dev app's data (close the app first), then work on the copy
cp -R "$HOME/Library/Application Support/abuddy-dev" /tmp/abuddy-data-copy

export ABUDDY_ENV=development
export ABUDDY_USER_DATA_DIR=/tmp/abuddy-data-copy

cd packages/api
npm run db:cli
```

`ABUDDY_ENV` is one of `production`, `beta`, `development`, `test`. The app's data dirs are `abuddy`, `abuddy-beta`, `abuddy-dev` and `abuddy-test` under `~/Library/Application Support/` on macOS (`%APPDATA%` on Windows, `$XDG_DATA_HOME` or `~/.local/share` on Linux).

Close the app first: LMDB files can't be safely shared with a running app.

## Where to run the scripts

All `db:*` scripts are defined in `packages/api/package.json`, and `packages/api` is the directory to run them from. The root `package.json` forwards only four of them:

| Script | Root | `packages/api` |
| --- | --- | --- |
| `db:cli` | yes | yes |
| `db:exec` | yes | yes |
| `db:script` | yes | yes |
| `db:reset` | yes | yes |
| `db:export` | no | yes |
| `db:import` | no | yes |
| `db:seed` | no | yes |
| `db:clearSettings` | no | yes |

The root scripts run `npm run <script> -w @app/api --`, so they run in `packages/api`, script paths are relative to it either way, and arguments after a single `--` reach the command from both places (`npm run db:cli -- --no-confirm -e "return 1"`). The examples below run from `packages/api`.

## db:cli

```bash
npm run db:cli                                  # interactive REPL
npm run db:cli -- -e "return qx('Settings').count()"
npm run db:cli -- "return qx('Settings').ids()" # positional arguments are joined into one command
npm run db:cli -- -s scripts/db/inspect-relations.ts
npm run db:cli -- --no-confirm -s scripts/db/inspect-relations.ts --type Flow # CLI options before -s, the script's after its path
```

`db:exec` is `db:cli --exec` and `db:script` is `db:cli --script`: `npm run db:exec "<command>"`, `npm run db:script <path> -- <script arguments>`.

| Flag | Description |
| --- | --- |
| `-e, --exec <command>` | Run one command and exit |
| `-s, --script <path> [args...]` | Run a script and exit: a `.ts`/`.mts`/`.js`/`.mjs` file is imported as a module with the database already open, and sees the arguments after its path as `process.argv.slice(2)`; any other file's contents run as a command. Every argument after the path goes to the script, so put the CLI's own options before `-s` |
| `-o, --output <format>` | `json`, `csv` or `pretty` (default `pretty`). With `-f`, `csv` writes CSV and anything else writes JSON; without `-f`, `json` prints JSON and anything else prints the pretty format |
| `-f, --output-file <path>` | Write an exec command's result to a file instead of printing it |
| `--no-confirm` | Don't ask before a command or script that looks destructive (its text contains `.destroy()`, `.drop(`, `.revoke(`, `.unlink(`, `.clear(`, `dropAttr(`, `destroyEntity(` or `removeRelation(`) |
| `-v, --verbose` | Log database initialization steps |
| `-h, --help` | Show help |

A command is the body of an async function, so **use `return` to get a result** (`return qx('Settings').count()`); without it the result is `undefined`, in the REPL too. Commands see `qx`, `tx`, `EARS`, `getAllEntities`, `getEntitiesOfType`, `getAttr`, `getAttrs`, `getRoles` and `getAll`.

```bash
npm run db:exec "return qx('Settings').pickAll()"
npm run db:cli -- -e "return qx('Settings').pickAll()" -o json -f settings.json
npm run db:exec "tx('Settings-app').destroy()" -- --no-confirm
```

### REPL commands

| Command | Description |
| --- | --- |
| `.help` | Query and transaction examples |
| `.stats` | Entity counts |
| `.export [file]` | Write the last result to a file (`.csv` writes CSV, anything else JSON; default `export-<timestamp>.json`) |
| `.cleanup-tombstoned` | Delete tombstoned entities (see [cleanup-tombstoned](#clicleanup-tombstonedts)) |
| `.clear` | Clear the screen |
| `.exit` | Exit |

History is kept in `~/.agentbuddy_db_history`.

## Queries

Entity types are the names the SDK and the loaded packs declare. `EARS.Entity` holds them (`EARS.Entity.Settings`), and a plain string works too (`qx('Settings')`).

```javascript
return qx().count()                                  // every entity
return qx('Settings').pickAll()                      // every attribute of every Settings row
return qx('Settings-app').pickOne(['data'])          // one entity's fields
return qx('Thread').where('status', 'active').ids()  // filter by attribute
return qx('Document').withRole('published').limit(10).pick(['name', 'content'])

// Graph traversal: the Nodes a Flow contains
return qx('Flow-123').linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Node).pickAll()

// Pagination: page(size, cursor?) returns { items, nextCursor } (ids, and a cursor for the next page or null)
const first = qx('Message').orderBy('createdAt', 'desc').page(20)
const second = qx('Message').orderBy('createdAt', 'desc').page(20, first.nextCursor)
return second.items
```

## Transactions

```javascript
tx('Document').put('name', 'My Document')                          // create (a type name makes a new entity)
tx('Settings-app').put('data', {})                                  // set an attribute
tx('Settings-app').update('data', { general: {} })                  // update an attribute
tx('Document-123').add('tags', 'important')                         // add a value to a multi-valued attribute
tx('Document-123').grant('published')                               // grant a role
tx('Collection-123').link(EARS.RelKind.CONTAINS, 'Document-123')    // link
tx('Settings-app').drop('oldKey')                                   // drop an attribute
tx('Collection-123').unlinkIf(EARS.RelKind.CONTAINS, 'Document-123') // unlink by kind and target
tx('Collection-123').unlink('Relation-456')                         // unlink by relation id
tx('Settings-app').destroy()                                        // destroy an entity
```

## Data scripts

### db:clearSettings (destroy-settings.ts)

Lists the Settings rows (id, label if the row has one, and the keys of its stored data). **It's a dry run by default**: nothing is destroyed until you pass `--force`. The app recreates the default settings on its next start.

```bash
npm run db:clearSettings               # dry run: lists the rows it would destroy
npm run db:clearSettings -- --force    # destroys them
```

Unknown flags are rejected.

### db:reset (reset.ts)

Runs the app's reset (`services.appData.reset()`, as Settings → Reset does): wipes all LMDB data and stored keys in the data dir, runs the built-in packs' init hooks and boot seed (default settings, seeded flows with the root flow), then the app migrations. Use it when the app can't start. There's no confirmation.

```bash
npm run db:reset
```

### db:seed (seed.ts)

Runs the built-in packs' init hooks, then seeds their compiled seed artifacts (actions, prompts, flows, library, ...) into LMDB. Compile them first with `npm run compile` from the root.

```bash
npm run db:seed
```

### db:import (import-backup.ts)

Replaces the database with a backup directory (one containing `metadata.json`), then rehydrates it. It shows the backup's details and asks for confirmation unless `--force` is given.

```bash
npm run db:import -- --path /path/to/backup
npm run db:import -- --path /path/to/backup --force --verbose
```

| Flag | Description |
| --- | --- |
| `-p, --path <dir>` | The backup directory (required) |
| `-f, --force` | Skip the confirmation prompt |
| `-v, --verbose` | Show the imported databases, and the stack trace on failure |
| `-h, --help` | Show help |

### db:export (export.sh, export-json.ts)

Prints entities as JSON with an `exportMetadata` wrapper (timestamp, counts, LMDB paths). It runs the packs' init hooks first, so missing default data is created. Use `npm run --silent` so npm's own output doesn't end up in the JSON; the script discards stderr.

```bash
npm run --silent db:export > full-backup.json                # every entity
npm run --silent db:export Settings > settings.json          # one entity type
npm run --silent db:export -- --id Settings-app > entity.json
npm run --silent db:export -- --raw Settings > settings-raw.json   # data only, no metadata
npm run --silent db:export Settings | jq '.data[].id'
```

### scripts/db/inspect-relations.ts

Prints relation statistics per entity type, or an entity's outgoing and incoming relations.

```bash
npm run db:script scripts/db/inspect-relations.ts                           # stats per entity type
npm run db:script scripts/db/inspect-relations.ts -- --entity Flow-123 --depth 2
npm run db:script scripts/db/inspect-relations.ts -- --type Flow            # the first 5 Flows
npm run db:script scripts/db/inspect-relations.ts -- -e Flow-123 --incoming # only what points at Flow-123
```

| Flag | Description |
| --- | --- |
| `-e, --entity <id>` | Inspect one entity |
| `-t, --type <type>` | Inspect the first five entities of a type |
| `-d, --depth <n>` | How many levels of relations to follow in the directions shown (default 1) |
| `--incoming`, `--outgoing` | Show only incoming or only outgoing relations (default, or both flags: both directions) |

### scripts/db/cleanup-settings.ts

Finds Settings rows that share a `key` (or `name`), and after a `y` confirmation destroys all but the most recently updated one of each.

```bash
npm run db:script scripts/db/cleanup-settings.ts
```

### scripts/db/export-data.ts

Writes each entity type to a timestamped file (`<type in lower case>-<timestamp>.json` or `.csv`) in an output directory, plus an `export-metadata-<timestamp>.json` summary.

```bash
npm run db:script scripts/db/export-data.ts -- --output ./backup --format json
npm run db:script scripts/db/export-data.ts -- --entities Settings,Thread --format csv --verbose
```

Flags: `-o, --output <dir>` (default `./exports`), `-e, --entities <a,b>` (default every registered type), `-f, --format json|csv`, `-v, --verbose`.

### cli/cleanup-tombstoned.ts

Behind the REPL's `.cleanup-tombstoned` command (there's no script entry for it). Deletes every entity record marked `deletedAt` (tombstoned), with its attributes, straight from LMDB in the primary and volatile backup partitions. It doesn't touch the REPL's in-memory data, so restart the CLI to see the result.

```
db> .cleanup-tombstoned
```

## Troubleshooting

- **`App environment unknown`**: set `ABUDDY_ENV` (and `ABUDDY_USER_DATA_DIR`), see [Before you run anything](#before-you-run-anything).
- **Database won't open**: close the app; check that the data dir has LMDB files under `.data/`.
- **`Missing script`**: `db:export`, `db:import`, `db:seed` and `db:clearSettings` exist only in `packages/api`.
