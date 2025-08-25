# AgentBuddy Database CLI

A powerful command-line interface for managing and querying the AgentBuddy database while the app is offline.

## Features

- **Interactive REPL** - Full interactive shell with command history and tab completion
- **Query Builder** - Use the familiar `qx()` API to query entities
- **Transaction Builder** - Use `tx()` to modify data
- **Clean JSON Export** - Export data with metadata in clean JSON format
- **Script Support** - Run JavaScript/TypeScript files against the database
- **Safety Features** - Confirmation prompts for destructive operations
- **Pretty Output** - Formatted, colorized output for better readability

## Installation

The CLI is already integrated into the AgentBuddy API package. No additional installation required.

## Quick Start

All commands can be run from the project root directory.

## Usage

### Interactive Mode

Start an interactive REPL session:

```bash
npm run db:cli
```

In the REPL, you can:
- Run queries: `qx(EARS.Entity.Settings).pickAll()`
- Execute transactions: `tx("Settings-123").put("key", "value")`
- Get statistics: `.stats`
- Export results: `.export filename.json`
- View help: `.help`

### Execute Commands

Run a single command and exit:

```bash
# Simple query
npm run db:exec "return qx(EARS.Entity.Settings).count()"

# List all settings
npm run db:exec "qx(EARS.Entity.Settings).pickAll().forEach(s => console.log(s))"

# Delete specific entity (with confirmation)
npm run db:exec "tx('Settings-123').destroy()"

# Skip confirmation for destructive operations
npm run db:exec "tx('Settings-123').destroy()" -- --no-confirm
```

### Export Data

Export entities to clean JSON with metadata:

```bash
# Export all Settings (use --silent for clean JSON output)
npm run --silent db:export Settings > settings.json

# Export with timestamp
npm run --silent db:export Settings > "settings-$(date +%Y%m%d-%H%M%S).json"

# Export all entities
npm run --silent db:export > full-backup.json

# Export without metadata (raw data only)
npm run --silent db:export -- --raw Settings > settings-raw.json

# Export specific entity by ID
npm run --silent db:export -- --id Settings-123 > entity.json

# Process with jq
npm run --silent db:export Settings | jq '.exportMetadata'
npm run --silent db:export Settings | jq '.data[].label'
```

**Note:** Always use `npm run --silent` for clean JSON output that can be piped or redirected.

### Run Scripts

Execute JavaScript/TypeScript files:

```bash
# Run a cleanup script
npm run db:script scripts/db/cleanup-settings.ts

# Destroy settings with options
npm run db:script scripts/db/destroy-settings.ts -- --force
npm run db:script scripts/db/destroy-settings.ts -- --dry-run
npm run db:script scripts/db/destroy-settings.ts -- --label secrets

# Inspect relationships
npm run db:script scripts/db/inspect-relations.ts -- --entity Thread-123
```

## Query Examples

### Basic Queries

```javascript
// Count all entities
qx().count()

// Get all settings
qx(EARS.Entity.Settings).pickAll()

// Find specific entity
qx("Settings-123").pickOne()

// Filter by attribute
qx(EARS.Entity.Document).where("status", "published").pickAll()

// Get entity IDs only
qx(EARS.Entity.Thread).ids()
```

### Advanced Queries

```javascript
// Graph traversal
qx("Thread-123")
  .linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Message)
  .orderBy("createdAt")
  .pickAll()

// Complex filtering
qx(EARS.Entity.Document)
  .where("tags", "important")
  .withRole("published")
  .limit(10)
  .pick(["name", "content"])

// Pagination
qx(EARS.Entity.Message)
  .orderBy("createdAt", "desc")
  .page(2, 20) // Page 2, 20 items per page
  .pickAll()
```

## Transaction Examples

### Creating Entities

```javascript
// Create new entity
tx(EARS.Entity.Settings)
  .put("key", "myKey")
  .put("value", "myValue")

// Create with relationships
tx(EARS.Entity.Document)
  .put("name", "My Document")
  .put("content", "...")
  .link(EARS.RelKind.CONTAINS, "Collection-123")
```

### Updating Entities

```javascript
// Update attributes
tx("Settings-123")
  .update("value", "newValue")

// Add to array attribute
tx("Document-123")
  .add("tags", "important")

// Grant role
tx("Document-123")
  .grant("published")
```

### Deleting Data

```javascript
// Delete entity
tx("Settings-123").destroy()

// Remove attribute
tx("Settings-123").drop("oldKey")

// Unlink relationship
tx("Document-123")
  .unlink(EARS.RelKind.CONTAINS, "Collection-123")
```

## Example Scripts

The package includes several useful scripts in `packages/api/scripts/db/`:

### export-json.ts
Export entities with metadata in clean JSON format:
```bash
# Export all Settings
npm run --silent db:export Settings > settings.json

# Export without metadata
npm run --silent db:export -- --raw Settings > settings-raw.json

# Export specific entity
npm run --silent db:export -- --id Thread-123 > thread.json
```

### destroy-settings.ts
Safely destroy settings with various filters:
```bash
# Dry run to see what would be deleted
npm run db:script scripts/db/destroy-settings.ts -- --dry-run

# Destroy all settings (with confirmation)
npm run db:script scripts/db/destroy-settings.ts

# Force destroy without confirmation
npm run db:script scripts/db/destroy-settings.ts -- --force

# Destroy by label or type
npm run db:script scripts/db/destroy-settings.ts -- --label secrets
npm run db:script scripts/db/destroy-settings.ts -- --type plugin
```

### cleanup-settings.ts
Finds and removes duplicate settings entities:
```bash
npm run db:script scripts/db/cleanup-settings.ts
```

### inspect-relations.ts
Visualizes entity relationships:
```bash
# Show overall statistics
npm run db:script scripts/db/inspect-relations.ts

# Inspect specific entity
npm run db:script scripts/db/inspect-relations.ts -- --entity Thread-123 --depth 2

# Inspect all entities of a type
npm run db:script scripts/db/inspect-relations.ts -- --type Thread
```

### export-data.ts
Batch export entities to timestamped files:
```bash
npm run db:script scripts/db/export-data.ts -- --output ./backup --format json
npm run db:script scripts/db/export-data.ts -- --entities Settings,Secret --format csv
```

## Command Line Options

### db:cli
Interactive REPL mode with no additional options.

### db:exec
```
Options:
  --no-confirm              Skip confirmation for destructive operations
```

### db:export
```
Options:
  --raw                     Export data only, without metadata wrapper
  --id <entity-id>          Export specific entity by ID
```

### db:script
```
Options vary by script. Common options:
  --force                   Skip confirmations (destroy-settings.ts)
  --dry-run                 Show what would happen without making changes
  --label <label>           Filter by label field
  --type <type>             Filter by type field
  --verbose                 Show detailed output
```

## Safety Features

- **Confirmation Prompts**: Destructive operations require confirmation by default
- **Transaction Atomicity**: All operations within a transaction succeed or fail together
- **Cycle Detection**: Prevents circular relationships when using `safeLink()`
- **Type Safety**: Full TypeScript support with entity type checking

## Tips & Best Practices

1. **Always backup before bulk operations**: Export your data before running destructive scripts
2. **Use transactions for consistency**: Group related changes in a single transaction
3. **Test queries in REPL first**: Use interactive mode to test complex queries
4. **Leverage scripts for repetitive tasks**: Create reusable scripts for common operations
5. **Monitor performance**: Use `.stats` to check entity counts and relationships

## Troubleshooting

### Database won't initialize
- Ensure the app is not running (database can't be accessed by multiple processes)
- Check that LMDB files exist in the data directory

### Command not found
- Make sure you're in the `packages/api` directory
- Run `npm install` if dependencies are missing

### Permission errors
- The CLI needs read/write access to the LMDB database files
- Check file permissions in the data directory