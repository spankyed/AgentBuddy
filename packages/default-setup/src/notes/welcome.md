---
type: document
icon: "👋"
---

# Welcome to AgentBuddy

AgentBuddy is an AI-development environment and work platform. It features persistent conversations — with rich artifacts, interactive permissions, and automation you can see and customize.

---

## What You Can Do

- **Chat with Claude Code** in threaded conversations that persist across sessions
  - **Import existing sessions** from your Claude Code CLI history
  - **Approve or deny** file edits, bash commands, and other tool requests inline
  - **Fork, revert, and rewind** conversations — branch from any message or roll back changes
  - **View diffs, plans, and session stats** as artifacts alongside your conversation
- **Organize work** with threads, tags, statuses, and a kanban board
- **Build automation flows** — write arbitrary javascript and orchestrate logic visually with a node-based editor
- **Edit code** with a built-in code editor — including source control, a file explorer, and a terminal

---

## How It Works

The interface has four areas:

- **Toolbar** (left) — switch between plugins: Threads, Notes, Code, Library, Flows, and more
- **Canvas** (top) — the main content area, changes based on the active plugin
- **Chat** (bottom) — where you send messages and respond to permission requests
- **Inspection panel** (right, toggleable) — contextual details for the active plugin
- **Recent bar** (bottom edge) — quick-switch between recent threads

---

## Getting Started

1. **Send your first message** — click `+ New thread` at the bottom of the chat, type a request, and hit Send
2. **Set a project directory** — you'll be prompted to select a working directory
3. **Handle permissions** — when an agent wants to edit files, you'll see an approve/deny prompt inline
4. **Review artifacts** — diffs, plans, and session details appear as artifacts in the thread dashboard
5. **Import past sessions** — use `/cc-import` to bring in existing Claude Code CLI sessions

---

## Key Concepts

- **Thread** — a conversation container. Each thread carries its own artifacts, tags, and status.
- **Artifact** — rich content attached to a thread: code diffs, plans, session stats, notes, and more.
- **Flow** — a visual, node-based automation. Flows define how the system reacts to events — routing messages, handling permissions, running actions.
- **Action** — a reusable function invoked by flows. The actual logic behind each step.
- **Mode** — threads operate in modes that determine how messages are routed and processed.

---

## Tips

- **Resize the chat** by dragging the divider between canvas and chat. Right-click the divider to maximize chat.
- **Use commands** like `/cc-resume`, `/cc-fork`, `/cc-compact`, and `/cc-context` directly in chat.
- **Fork a conversation** from any message to explore a different approach without losing your original thread.
- **Check the Brain plugin** to see how flows execute in real time — useful for understanding and debugging automation.
