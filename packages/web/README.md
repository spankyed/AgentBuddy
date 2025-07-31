# AgentBuddy

Built with Vue 3, TypeScript and Vite. We've developed a plugin-based architecture with XState state management. The application features a flexible canvas area, chat interface, inspection panel, and toolbar.

## Tech Stack

- **Framework:** Vue 3
- **Build Tool:** Vite
- **Language:** TypeScript
- **State Management:** XState + @xstate/vue
- **Styling:** TailwindCSS + SASS
- **Icons:** Lucide Vue

## Architecture

AgentBuddy is built on a plugin-based architecture where each feature is encapsulated as a plugin. The application consists of four main areas:

1. **Toolbar**: Left-side navigation for switching between plugins
2. **Canvas Area**: Main workspace that adapts based on the active plugin
3. **Chat Area**: Persistent chat interface across all plugins
4. **Inspection Panel**: Context-sensitive panel for detailed information

### State Management

The application uses XState for robust state management with the following key features:

- **Application State**: Manages plugin selection, view toggles, and navigation
- **Trail System**: Handles breadcrumb navigation and view targeting
- **Plugin System**: Each plugin has its own state machine

### Plugin System

Plugins available in the application:

- **Agent**: Default plugin (main functionality)
- **Threads**: Thread management
- **Dialog**: Conversation pathways
- **Brain**: Operations management
- **Files**: File system interface
- **Code**: Code editing/viewing tools
- **Prompt Builder**: AI prompt construction

## Project Structure

```
src/
├── app.vue           # Main application component
├── application.ts    # Application initialization and setup
├── assets/          # Static assets
├── components/      # Vue components
│   └── layout/      # Core layout components
├── helpers/         # Utility functions and types
├── plugins/         # Plugin implementations
│   ├── _blank/     # Base plugin template
│   ├── agent/      # Default plugin
│   └── threads/    # Thread management plugin
├── state/          # XState machines
│   ├── app-state.ts   # Main application state
│   └── trail-actor.ts # Navigation state
└── style.css       # Global styles
```

## Development

### Prerequisites

- Node.js 16+
- npm 7+

### Getting Started

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run development server:**
   ```bash
   npm run dev
   ```
   This will start the development server with hot module replacement and XState inspector enabled.

3. **Build for production:**
   ```bash
   npm run build
   ```

4. **Preview production build:**
   ```bash
   npm run preview
   ```

## Dependencies

### Core Dependencies
- **Vue 3**: Progressive JavaScript framework
- **XState + @xstate/vue**: State management with finite state machines
  - @statelyai/inspect for state visualization
- **Lucide Vue**: Modern icon set
- **Vue Arrange**: Layout management

### Development Dependencies
- **Vite**: Next generation frontend tooling
  - @vitejs/plugin-vue for Vue 3 support
- **TypeScript**: Type safety and developer experience
- **TailwindCSS**: Utility-first CSS framework
- **PostCSS**: CSS transformations
- **SASS**: Advanced styling capabilities

## Contributing

### Code Style

- Use TypeScript for all new code
- Follow Vue 3 Composition API patterns
- Implement new features as plugins when possible
- Use XState for complex state management

### Plugin Development

To create a new plugin:

1. Copy the `_blank` plugin template
2. Implement required interfaces:
   - State machine
   - UI components (canvas, panel, chat)
   - Plugin metadata (id, label, icon)
3. Register the plugin in `plugins/index.ts`

## License

Private project - All rights reserved