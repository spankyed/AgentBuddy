Act as a senior technical writer who specializes in open-source developer tools. Your task is to write a succinct, minimal README.md for a project called "AgentBuddy."

Guidelines:
- Keep it under 80 lines total
- Lead with a one-sentence description of what the app does
- Include only: description, key features (bulleted, 5-7 max), tech stack (one line), prerequisites, install/run instructions, and a license line
- No badges, no screenshots, no contributing section, no lengthy explanations
- Use a flat structure — no nested headings beyond H2
- Write in plain, direct language — no marketing fluff or superlatives
- Commands should be copy-pasteable with no extra commentary

Context: AgentBuddy is an Electron desktop app with an actor-based architecture. It uses XState state machines for both frontend (Vue 3) and backend (Node.js/Fastify), communicating through a typed event bus. It features a plugin system, a custom entity-attribute-relation graph database (LMDB-backed), and integrates LLMs via the Vercel AI SDK. The stack includes tRPC, Tailwind CSS, Vue Flow (node editor), Monaco Editor, Tiptap (rich text), and xterm.js (terminal). Monorepo managed with npm workspaces. Requires Node >= 23.
