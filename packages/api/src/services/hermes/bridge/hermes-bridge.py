#!/usr/bin/env python3
"""
Hermes Agent Bridge — JSONL subprocess protocol for AgentBuddy.

Reads JSONL commands from stdin, writes JSONL responses to stdout.
Stderr is reserved for Python logging (forwarded to AgentBuddy logs).

Protocol:
  Request:  {"id": "req-1", "method": "chat", "params": {...}}
  Response: {"id": "req-1", "type": "result", "data": {...}}
  Stream:   {"id": "req-1", "type": "token", "data": {"text": "..."}}
  Error:    {"id": "req-1", "type": "error", "data": {"message": "..."}}
"""

import json
import sys
import os
import time
import threading
import collections
import hashlib
import logging
import signal
from pathlib import Path

# ── Logging to stderr (never stdout — that's the protocol channel) ───────────

logging.basicConfig(
    stream=sys.stderr,
    level=logging.DEBUG if os.getenv("HERMES_BRIDGE_DEBUG") else logging.INFO,
    format="[hermes-bridge] %(levelname)s %(message)s",
)
logger = logging.getLogger("hermes-bridge")

# ── Agent Discovery ──────────────────────────────────────────────────────────

HOME = Path.home()
BRIDGE_DIR = Path(__file__).resolve().parent


def _discover_agent_dir(hint: str | None = None) -> Path | None:
    """Locate the hermes-agent checkout using multi-strategy search."""
    candidates = []

    # 0. Explicit hint from AgentBuddy settings
    if hint:
        candidates.append(Path(hint).expanduser().resolve())

    # 1. HERMES_WEBUI_AGENT_DIR env var
    if os.getenv("HERMES_WEBUI_AGENT_DIR"):
        candidates.append(Path(os.getenv("HERMES_WEBUI_AGENT_DIR")).expanduser().resolve())

    # 2. HERMES_HOME / hermes-agent
    hermes_home = os.getenv("HERMES_HOME", str(HOME / ".hermes"))
    candidates.append(Path(hermes_home).expanduser() / "hermes-agent")

    # 3. Common install paths
    candidates.append(HOME / ".hermes" / "hermes-agent")
    candidates.append(HOME / "hermes-agent")

    # 4. XDG
    xdg_data = Path(os.getenv("XDG_DATA_HOME", str(HOME / ".local" / "share")))
    candidates.append(xdg_data.expanduser() / "hermes-agent")

    # 5. System-wide
    for sys_prefix in ("/opt", "/usr/local", "/usr/local/share"):
        candidates.append(Path(sys_prefix) / "hermes-agent")

    for path in candidates:
        if path.exists() and (path / "run_agent.py").exists():
            return path.resolve()

    return None


def _inject_agent_path(agent_dir: Path):
    """Add agent dir to sys.path (at end, to avoid shadowing pip packages)."""
    s = str(agent_dir)
    if s not in sys.path:
        sys.path.append(s)


# ── Agent Cache ──────────────────────────────────────────────────────────────

SESSION_AGENT_CACHE: collections.OrderedDict = collections.OrderedDict()
SESSION_AGENT_CACHE_MAX = 50
SESSION_AGENT_CACHE_LOCK = threading.Lock()

# Active streams that can be cancelled
ACTIVE_STREAMS: dict[str, threading.Event] = {}
ACTIVE_STREAMS_LOCK = threading.Lock()

# Environment lock — prevents concurrent env var mutations across threads
_ENV_LOCK = threading.Lock()

# SessionDB instance — initialized in main() after agent path injection
_session_db = None


# ── JSONL I/O ────────────────────────────────────────────────────────────────

def _write(obj: dict):
    """Write a JSONL line to stdout."""
    line = json.dumps(obj, ensure_ascii=False, default=str)
    sys.stdout.write(line + "\n")
    sys.stdout.flush()


def _reply(req_id: str, data: dict):
    """Send a result response."""
    _write({"id": req_id, "type": "result", "data": data})


def _stream_event(req_id: str, event_type: str, data: dict):
    """Send a streaming event."""
    _write({"id": req_id, "type": event_type, "data": data})


def _error(req_id: str, message: str, code: str = "ERROR"):
    """Send an error response."""
    _write({"id": req_id, "type": "error", "data": {"message": message, "code": code}})


# ── Method Handlers ──────────────────────────────────────────────────────────

_AIAgent = None  # Lazy-loaded


_agent_params_cache: set | None = None


def _ensure_agent_class():
    global _AIAgent
    if _AIAgent is None:
        from run_agent import AIAgent
        _AIAgent = AIAgent


def _get_agent_params() -> set:
    """Cache the AIAgent.__init__ parameter names."""
    global _agent_params_cache
    if _agent_params_cache is None:
        import inspect
        _agent_params_cache = set(inspect.signature(_AIAgent.__init__).parameters.keys())
    return _agent_params_cache


def handle_health(req_id: str, params: dict):
    """Health check — verifies agent is importable."""
    try:
        _ensure_agent_class()
        _reply(req_id, {"status": "ok", "agent_available": True})
    except ImportError as e:
        _reply(req_id, {"status": "ok", "agent_available": False, "error": str(e)})


def handle_list_sessions(req_id: str, params: dict):
    """List Hermes sessions from the native SessionDB (state.db)."""
    try:
        if _session_db is None:
            return _reply(req_id, {"sessions": []})

        limit = params.get("limit", 50)
        raw = _session_db.list_sessions_rich(
            limit=limit,
            order_by_last_active=True,
        )
        sessions = []
        for row in raw:
            sessions.append({
                "id": row.get("id", ""),
                "model": row.get("model", ""),
                "source": row.get("source", ""),
                "message_count": row.get("message_count", 0),
                "updated_at": row.get("last_active") or row.get("started_at", 0),
                "title": row.get("title") or row.get("preview") or row.get("id", "")[:12],
                "started_at": row.get("started_at", 0),
            })

        _reply(req_id, {"sessions": sessions})
    except Exception as e:
        _error(req_id, str(e))


def handle_get_session(req_id: str, params: dict):
    """Get a single session with messages from SessionDB."""
    try:
        session_id = params.get("sessionId")
        if not session_id:
            return _error(req_id, "sessionId required")

        if _session_db is None:
            return _error(req_id, "SessionDB not available", "NOT_READY")

        session = _session_db.get_session(session_id)
        if not session:
            return _error(req_id, f"Session {session_id} not found", "NOT_FOUND")

        messages = _session_db.get_messages(session_id)
        session["messages"] = messages

        _reply(req_id, {"session": session})
    except Exception as e:
        _error(req_id, str(e))


def handle_create_session(req_id: str, params: dict):
    """Create a new Hermes session in SessionDB."""
    try:
        if _session_db is None:
            return _error(req_id, "SessionDB not available", "NOT_READY")

        import uuid
        session_id = str(uuid.uuid4())[:8]
        model = params.get("model", "")
        title = params.get("title", "")

        _session_db.create_session(
            session_id=session_id,
            source="agentbuddy",
            model=model,
        )

        if title:
            try:
                _session_db.set_session_title(session_id, title)
            except (ValueError, Exception):
                pass  # Title collision or invalid — non-fatal

        session = _session_db.get_session(session_id) or {
            "id": session_id,
            "model": model,
            "source": "agentbuddy",
            "title": title,
        }

        _reply(req_id, {"session": session})
    except Exception as e:
        _error(req_id, str(e))


def handle_chat(req_id: str, params: dict):
    """
    Run a conversation turn with the Hermes agent.

    Streams token/tool events back as JSONL lines, finishes with a 'done' event.
    """
    session_id = params.get("sessionId")
    message = params.get("message", "")
    model = params.get("model", "")
    workspace = params.get("workspace", str(HOME))

    if not message:
        return _error(req_id, "message required")

    # Create cancel event for this stream
    stream_id = f"{req_id}-{int(time.time() * 1000)}"
    cancel_event = threading.Event()
    with ACTIVE_STREAMS_LOCK:
        ACTIVE_STREAMS[stream_id] = cancel_event

    _stream_event(req_id, "stream_start", {"streamId": stream_id})

    def _run():
        try:
            _ensure_agent_class()

            # Set environment under lock to prevent concurrent mutations
            with _ENV_LOCK:
                os.environ["TERMINAL_CWD"] = str(workspace)
                os.environ["HERMES_EXEC_ASK"] = "1"
                if session_id:
                    os.environ["HERMES_SESSION_KEY"] = session_id

            # Build agent kwargs
            agent_kwargs = {
                "model": model,
                "platform": "webui",
                "quiet_mode": True,
                "session_id": session_id or "",
            }
            if _session_db is not None:
                agent_kwargs["session_db"] = _session_db

            # Streaming callbacks
            def on_token(text):
                if cancel_event.is_set() or text is None:
                    return
                _stream_event(req_id, "token", {"text": str(text), "streamId": stream_id})

            def on_tool(tool_name=None, tool_args=None, tool_call_id=None, result=None, **kwargs):
                if cancel_event.is_set():
                    return
                _stream_event(req_id, "tool_call", {
                    "name": str(tool_name or ""),
                    "args": tool_args if isinstance(tool_args, dict) else {},
                    "toolCallId": str(tool_call_id or ""),
                    "result": str(result)[:2000] if result else None,
                    "streamId": stream_id,
                })

            agent_kwargs["stream_delta_callback"] = on_token
            agent_kwargs["tool_progress_callback"] = on_tool

            # Check for optional callback params
            _agent_params = _get_agent_params()

            if "tool_start_callback" in _agent_params:
                def on_tool_start(tool_call_id, name, args):
                    if cancel_event.is_set():
                        return
                    _stream_event(req_id, "tool_start", {
                        "toolCallId": str(tool_call_id or ""),
                        "name": str(name or ""),
                        "args": args if isinstance(args, dict) else {},
                        "streamId": stream_id,
                    })
                agent_kwargs["tool_start_callback"] = on_tool_start

            if "tool_complete_callback" in _agent_params:
                def on_tool_complete(tool_call_id, name, result, **kwargs):
                    if cancel_event.is_set():
                        return
                    _stream_event(req_id, "tool_complete", {
                        "toolCallId": str(tool_call_id or ""),
                        "name": str(name or ""),
                        "result": str(result)[:2000] if result else None,
                        "streamId": stream_id,
                    })
                agent_kwargs["tool_complete_callback"] = on_tool_complete

            if "reasoning_callback" in _agent_params:
                def on_reasoning(text):
                    if cancel_event.is_set() or text is None:
                        return
                    _stream_event(req_id, "reasoning", {"text": str(text), "streamId": stream_id})
                agent_kwargs["reasoning_callback"] = on_reasoning

            # Get or create cached agent
            agent = _get_or_create_agent(session_id, agent_kwargs)

            # Load session history from SessionDB
            messages = []
            if session_id and _session_db is not None:
                messages = _session_db.get_messages_as_conversation(session_id)

            # Run the conversation
            result = agent.run_conversation(
                user_message=message,
                conversation_history=messages if messages else None,
            )

            _stream_event(req_id, "done", {
                "streamId": stream_id,
                "finalResponse": result.get("final_response", ""),
                "completed": result.get("completed", True),
                "sessionId": session_id,
            })

        except Exception as e:
            logger.exception("Chat error")
            _stream_event(req_id, "stream_error", {
                "streamId": stream_id,
                "message": str(e),
            })
        finally:
            with ACTIVE_STREAMS_LOCK:
                ACTIVE_STREAMS.pop(stream_id, None)

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()


def _get_or_create_agent(session_id: str, kwargs: dict):
    """Get cached agent or create new one."""
    sig_blob = json.dumps([
        kwargs.get("model", ""),
        kwargs.get("platform", ""),
    ], sort_keys=True)
    agent_sig = hashlib.sha256(sig_blob.encode()).hexdigest()[:16]

    agent = None
    with SESSION_AGENT_CACHE_LOCK:
        cached = SESSION_AGENT_CACHE.get(session_id)
        if cached and cached[1] == agent_sig:
            agent = cached[0]
            SESSION_AGENT_CACHE.move_to_end(session_id)
            logger.debug("Reusing cached agent for session %s", session_id)

    if agent is not None:
        # Refresh per-turn callbacks
        for key in ("stream_delta_callback", "tool_progress_callback",
                     "tool_start_callback", "tool_complete_callback",
                     "reasoning_callback"):
            if key in kwargs:
                setattr(agent, key, kwargs[key])
        return agent

    # Create new agent — filter kwargs to only supported params
    supported = _get_agent_params()
    filtered = {k: v for k, v in kwargs.items() if k in supported}
    agent = _AIAgent(**filtered)

    with SESSION_AGENT_CACHE_LOCK:
        SESSION_AGENT_CACHE[session_id or "ephemeral"] = (agent, agent_sig)
        # Evict oldest if over limit
        while len(SESSION_AGENT_CACHE) > SESSION_AGENT_CACHE_MAX:
            SESSION_AGENT_CACHE.popitem(last=False)

    logger.debug("Created new agent for session %s", session_id)
    return agent


def handle_cancel_stream(req_id: str, params: dict):
    """Cancel an active stream."""
    stream_id = params.get("streamId", "")
    with ACTIVE_STREAMS_LOCK:
        cancel_event = ACTIVE_STREAMS.get(stream_id)
        if cancel_event:
            cancel_event.set()
            _reply(req_id, {"cancelled": True, "streamId": stream_id})
        else:
            _reply(req_id, {"cancelled": False, "streamId": stream_id})


def handle_list_models(req_id: str, params: dict):
    """List available models from Hermes config."""
    try:
        hermes_home = os.getenv("HERMES_HOME", str(HOME / ".hermes"))
        config_path = Path(hermes_home) / "config.yaml"

        models = []
        if config_path.exists():
            try:
                import yaml
                cfg = yaml.safe_load(config_path.read_text()) or {}
                # Extract model profiles
                model_profiles = cfg.get("model_profiles", {})
                for name, profile in model_profiles.items():
                    models.append({
                        "name": name,
                        "provider": profile.get("provider", ""),
                        "model": profile.get("model", name),
                    })
            except ImportError:
                # No pyyaml — try basic parsing
                pass

        _reply(req_id, {"models": models})
    except Exception as e:
        _error(req_id, str(e))


def handle_list_skills(req_id: str, params: dict):
    """List Hermes skills."""
    try:
        hermes_home = os.getenv("HERMES_HOME", str(HOME / ".hermes"))
        skills_dir = Path(hermes_home) / "skills"
        skills = []

        if skills_dir.exists():
            for category_dir in sorted(skills_dir.iterdir()):
                if category_dir.is_dir():
                    for skill_file in sorted(category_dir.iterdir()):
                        if skill_file.suffix in (".md", ".txt"):
                            skills.append({
                                "name": skill_file.stem,
                                "category": category_dir.name,
                                "path": str(skill_file),
                                "content": skill_file.read_text()[:500],
                            })

        _reply(req_id, {"skills": skills})
    except Exception as e:
        _error(req_id, str(e))


def handle_save_skill(req_id: str, params: dict):
    """Create or update a skill."""
    try:
        name = params.get("name", "")
        category = params.get("category", "custom")
        content = params.get("content", "")

        if not name:
            return _error(req_id, "name required")

        hermes_home = os.getenv("HERMES_HOME", str(HOME / ".hermes"))
        skill_dir = Path(hermes_home) / "skills" / category
        skill_dir.mkdir(parents=True, exist_ok=True)

        skill_file = skill_dir / f"{name}.md"
        skill_file.write_text(content)

        _reply(req_id, {"saved": True, "path": str(skill_file)})
    except Exception as e:
        _error(req_id, str(e))


def handle_delete_skill(req_id: str, params: dict):
    """Delete a skill."""
    try:
        path = params.get("path", "")
        if not path:
            return _error(req_id, "path required")

        skill_file = Path(path)
        if skill_file.exists():
            skill_file.unlink()
            _reply(req_id, {"deleted": True})
        else:
            _error(req_id, "Skill not found", "NOT_FOUND")
    except Exception as e:
        _error(req_id, str(e))


def handle_get_memory(req_id: str, params: dict):
    """Read memory files (MEMORY.md, USER.md, SOUL.md)."""
    try:
        hermes_home = os.getenv("HERMES_HOME", str(HOME / ".hermes"))
        memory_files = {}

        for name in ("MEMORY.md", "USER.md", "SOUL.md"):
            filepath = Path(hermes_home) / name
            if filepath.exists():
                memory_files[name] = filepath.read_text()
            else:
                memory_files[name] = ""

        _reply(req_id, {"files": memory_files})
    except Exception as e:
        _error(req_id, str(e))


def handle_write_memory(req_id: str, params: dict):
    """Write a memory file."""
    try:
        filename = params.get("filename", "")
        content = params.get("content", "")

        if filename not in ("MEMORY.md", "USER.md", "SOUL.md"):
            return _error(req_id, f"Invalid memory file: {filename}")

        hermes_home = os.getenv("HERMES_HOME", str(HOME / ".hermes"))
        filepath = Path(hermes_home) / filename
        filepath.write_text(content)

        _reply(req_id, {"written": True, "filename": filename})
    except Exception as e:
        _error(req_id, str(e))


def handle_list_tools(req_id: str, params: dict):
    """List available Hermes tools/toolsets."""
    try:
        hermes_home = os.getenv("HERMES_HOME", str(HOME / ".hermes"))
        config_path = Path(hermes_home) / "config.yaml"

        tools = []
        enabled_toolsets = []

        if config_path.exists():
            try:
                import yaml
                cfg = yaml.safe_load(config_path.read_text()) or {}
                enabled_toolsets = cfg.get("enabled_toolsets", [])
            except ImportError:
                pass

        # Try to get tool list from agent
        try:
            _ensure_agent_class()
            # Enumerate available toolsets from the agent module
            try:
                from tools import TOOL_REGISTRY
                for name, tool_cls in TOOL_REGISTRY.items():
                    tools.append({
                        "name": name,
                        "enabled": name in enabled_toolsets if enabled_toolsets else True,
                        "description": getattr(tool_cls, "description", ""),
                    })
            except ImportError:
                pass
        except Exception:
            pass

        _reply(req_id, {"tools": tools, "enabledToolsets": enabled_toolsets})
    except Exception as e:
        _error(req_id, str(e))


def handle_get_persona(req_id: str, params: dict):
    """Get the SOUL.md persona file."""
    try:
        hermes_home = os.getenv("HERMES_HOME", str(HOME / ".hermes"))
        soul_path = Path(hermes_home) / "SOUL.md"

        content = ""
        if soul_path.exists():
            content = soul_path.read_text()

        _reply(req_id, {"content": content, "path": str(soul_path)})
    except Exception as e:
        _error(req_id, str(e))


def handle_update_persona(req_id: str, params: dict):
    """Update the SOUL.md persona file."""
    try:
        content = params.get("content", "")
        hermes_home = os.getenv("HERMES_HOME", str(HOME / ".hermes"))
        soul_path = Path(hermes_home) / "SOUL.md"
        soul_path.parent.mkdir(parents=True, exist_ok=True)
        soul_path.write_text(content)

        _reply(req_id, {"written": True, "path": str(soul_path)})
    except Exception as e:
        _error(req_id, str(e))


def handle_list_workspaces(req_id: str, params: dict):
    """List known workspaces."""
    try:
        hermes_home = os.getenv("HERMES_HOME", str(HOME / ".hermes"))
        config_path = Path(hermes_home) / "config.yaml"

        workspaces = []
        if config_path.exists():
            try:
                import yaml
                cfg = yaml.safe_load(config_path.read_text()) or {}
                ws = cfg.get("workspaces", [])
                if isinstance(ws, list):
                    workspaces = ws
            except ImportError:
                pass

        _reply(req_id, {"workspaces": workspaces})
    except Exception as e:
        _error(req_id, str(e))


# ── Method Router ────────────────────────────────────────────────────────────

METHODS = {
    "health": handle_health,
    "listSessions": handle_list_sessions,
    "getSession": handle_get_session,
    "createSession": handle_create_session,
    "chat": handle_chat,
    "cancelStream": handle_cancel_stream,
    "listModels": handle_list_models,
    "listSkills": handle_list_skills,
    "saveSkill": handle_save_skill,
    "deleteSkill": handle_delete_skill,
    "getMemory": handle_get_memory,
    "writeMemory": handle_write_memory,
    "listTools": handle_list_tools,
    "getPersona": handle_get_persona,
    "updatePersona": handle_update_persona,
    "listWorkspaces": handle_list_workspaces,
}


# ── Main Loop ────────────────────────────────────────────────────────────────

def main():
    # Graceful shutdown on SIGTERM
    def _shutdown(signum, frame):
        logger.info("Received signal %s, shutting down", signum)
        sys.exit(0)
    signal.signal(signal.SIGTERM, _shutdown)

    # Parse startup config from first line (optional)
    agent_dir_hint = os.getenv("HERMES_WEBUI_AGENT_DIR")

    # Discover and inject agent
    agent_dir = _discover_agent_dir(agent_dir_hint)
    if agent_dir:
        _inject_agent_path(agent_dir)
        logger.info("Hermes agent found at: %s", agent_dir)
    else:
        logger.warning("Hermes agent not found — chat will fail but management commands may work")

    # Initialize SessionDB (agent's native SQLite storage)
    global _session_db
    if agent_dir:
        try:
            from hermes_state import SessionDB
            _session_db = SessionDB()
            logger.info("SessionDB initialized at %s", _session_db._db_path if hasattr(_session_db, '_db_path') else '~/.hermes/state.db')
        except ImportError:
            logger.warning("hermes_state not available — session management will be limited")
        except Exception as e:
            logger.warning("Failed to initialize SessionDB: %s", e)

    # Signal readiness
    _write({"type": "ready", "data": {"agentDir": str(agent_dir) if agent_dir else None}})

    # Read JSONL from stdin
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
        except json.JSONDecodeError as e:
            logger.error("Invalid JSON: %s", e)
            continue

        req_id = request.get("id", "")
        method = request.get("method", "")
        params = request.get("params", {})

        handler = METHODS.get(method)
        if handler:
            try:
                handler(req_id, params)
            except Exception as e:
                logger.exception("Handler error for method %s", method)
                _error(req_id, str(e))
        else:
            _error(req_id, f"Unknown method: {method}", "METHOD_NOT_FOUND")


if __name__ == "__main__":
    main()
