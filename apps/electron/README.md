# AgentBuddy Electron App

This is the Electron desktop application for AgentBuddy, providing a native desktop experience with integrated backend services.

## Architecture

The Electron app consists of:
- **Main Process**: Manages the application lifecycle, windows, and embeds the backend server
- **Renderer Process**: Runs the Vue.js frontend application
- **Preload Script**: Provides secure IPC communication between main and renderer processes

## Setup

1. Install dependencies from the root directory:
   ```bash
   pnpm install
   ```

2. Build the backend and frontend:
   ```bash
   pnpm be  # Build backend
   pnpm run build:electron -w @abuddy/web  # Build frontend for Electron
   ```

3. Start the Electron app:
   ```bash
   pnpm electron
   ```

## Development

For development with hot-reload:

1. Start the backend and frontend in dev mode:
   ```bash
   pnpm dev
   ```

2. In another terminal, start Electron in dev mode:
   ```bash
   pnpm electron:dev
   ```

## Building

To build the Electron app:

```bash
pnpm electron:build
```

## Packaging

To create distributable packages:

```bash
pnpm electron:package  # Creates unpacked app
pnpm electron:make     # Creates installers
```

## Core Features Included

- **Agent System**: AI chat interface with artifacts
- **Visual Flow Editor**: Create and edit dialog flows
- **Brain System**: Execute and monitor flow execution
- **Database Explorer**: Query and visualize EARS data
- **Thread Management**: Manage conversation threads

## IPC API

The app exposes the following APIs through the preload script:

- `getBackendPort()`: Get the dynamically allocated backend port
- `selectDirectory()`: Open native directory picker
- `selectFile()`: Open native file picker
- `readFile(path)`: Read file contents
- `writeFile(path, content)`: Write file contents
- `getAppVersion()`: Get app version
- `getPlatform()`: Get platform (darwin, win32, linux)
- `openExternal(url)`: Open URL in default browser
- `showItemInFolder(path)`: Show file in system file explorer

## Security

- Context Isolation is enabled
- Node Integration is disabled
- Preload script provides controlled access to Node.js APIs
- Content Security Policy is configured for production builds

## Troubleshooting

### Backend Port Issues
If the backend fails to start, check:
- No other process is using ports 3001-3010
- SQLite database file permissions
- Environment variables are properly loaded

### Build Issues
- Ensure all dependencies are built first: `pnpm build`
- Check that TypeScript compilation succeeds: `pnpm typecheck`
- Verify native modules are rebuilt for Electron: `pnpm electron:build`