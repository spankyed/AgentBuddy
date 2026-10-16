---
name: Claude Code commands
---
<!-- section:field -->
**cc-sessions**: Session ID (optional, lists all if omitted)
**cc-permissions**: Show native permission rules, exact stored spellings, sources and editability. Add/remove with `<add|remove> <allow|deny|ask> <userSettings|projectSettings|localSettings> <exact rule>`; native validation and warnings apply. Refreshes a matching idle conversation after saving; reports refresh failure separately.
**cc-config**: get|set <key> [value]
**cc-plan**: Show the current native plan without a model turn
**cc-context**: Show context window usage breakdown
**cc-status**: Show version and auth info
**cc-tasks**: Show last-observed structured native task records from the current process. Does not start a process or model turn, read saved task files, or merge native tasks into app tasks.
**cc-workflows**: List local workflows observed in this conversation; `stop <task id>` requests a specific task stop and reports native status.
**cc-usage**: Show native session totals and account-limit availability. Add `behaviors` for native behavior aggregates. Uses a matching running conversation; `start` permits a temporary process and its session hooks, whose totals are separate. Native account reads may use the network.
**cc-thinking**: Request a live budget (`<integer>` or `default`) and optional display (`summarized`, `omitted`, `highlights`, `default`), or use `display <value>` alone. Requires the matching idle conversation. Adaptive models may ignore a zero budget; display refusal can still apply the accompanying budget. Changes are process-local.
**cc-models**: Show the matching live conversation's native model catalog, effort levels and reported capabilities. Use `start` to explicitly permit a temporary native process and its session hooks. The catalog does not identify the selected model or exhaust custom model IDs.
**cc-model**: Select this thread's model; updates an idle conversation or stages the next launch. With no argument, shows requested and last reported models. Custom model validation may make an API request.
**cc-hooks**: Read hooks from a matching live conversation. start opens a temporary native process and can run configured session-start/end hooks. apply <native JSON edit> delegates add/replace/remove; use original editable matcher/config targets. An open conversation must be idle and match the project; saving closes it and can run its session-end hooks. Reading the new catalog requires an explicit start.
**cc-memory**: Show native instruction/memory files and availability; auto on|off sets the user auto-memory preference
**cc-recap**: Summarize current conversation
**cc-skills**: Show native Skill sources, states and locks; set <name> <on|name-only|user-invocable-only|off> edits a Skill state
**cc-compact**: Custom instructions (optional, summarize context)
**cc-resume**: Session ID (optional, lists sessions if omitted)
**cc-import**: [all] [no-limit] (imports up to 50 from current dir by default; "all" imports from all dirs; "no-limit" removes cap)
**cc-add-dir**: <path> [--remember]
**cc-set-dir**: <path> (set working directory for new threads)
**cc-rename**: New name (optional, auto-generates if omitted)
**cc-fork**: Fork from last assistant message
**cc-stats**: Show version, auth, and config info
**cc-doctor**: Diagnose installation
**cc-mcp**: Manage MCP servers. Quote JSON and arguments containing spaces; quotes/escapes group arguments without shell expansion.
**cc-agents**: List configured agents
**cc-bypass**: Toggle bypass permissions mode
**cc-goal**: <condition> | clear | (no args for status)


Memory, Skills, permission, plan and context reads reuse a matching running conversation.
When none is running, use `cc-memory start`, `cc-skills start`, `cc-permissions start`,
`cc-plan start` or `cc-context start` to launch a temporary native process. Starting and closing it
can run configured session hooks. Fresh memory and Skill edits can start separate processes for
validation and readback: `cc-memory start auto off` or `cc-skills start set <name> off`.
Use `cc-permissions start add deny userSettings Bash` for a fresh permission edit/readback.
Automatic context refresh only reads a running conversation.

**cc-config effective [start]**: Show a safe native model/effort summary, distinguishing parsed settings from reported applied values. Uses a matching live process; `start` explicitly permits a temporary process and its session hooks. Raw environment, helper commands and error details are excluded.

**cc-config save-effort <low|medium|high|xhigh>**: Request the running model’s native user preference write. Requires its matching idle conversation. Shows parsed/report-applied readback; saving a preference does not imply the retained process or next turn changed effort. Native user preferences can affect later launches in other projects.
