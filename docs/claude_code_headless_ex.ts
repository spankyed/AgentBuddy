import { spawn } from "node:child_process";
import * as readline from "node:readline";
import { randomUUID } from "node:crypto";

type ClaudeEvent = Record<string, any>;

type PermissionRequest = {
  toolName: string;
  specifier?: string;
  raw: ClaudeEvent;
};

type UserDecision =
  | { decision: "allow"; rule: string }
  | { decision: "deny" };

class ClaudeHeadlessSession {
  private readonly sessionId: string;
  private readonly cwd: string;
  private readonly tools: string;
  private readonly permissionMode: "default" | "dontAsk" | "acceptEdits";
  private approvals = new Set<string>();
  private maxTurns = 20;

  constructor(opts: {
    cwd: string;
    tools: string;
    permissionMode?: "default" | "dontAsk" | "acceptEdits";
  }) {
    this.cwd = opts.cwd;
    this.tools = opts.tools;
    this.permissionMode = opts.permissionMode ?? "default";
    this.sessionId = randomUUID(); // persistent per wrapper session
  }

  // --------------------------
  // PUBLIC ENTRY
  // --------------------------

  async run(prompt: string) {
    while (true) {
      const result = await this.runOnce(prompt);

      if (result.kind === "completed") {
        return result;
      }

      if (result.kind === "permission_request") {
        const decision = await this.requestUserApproval(result.request);

        if (decision.decision === "deny") {
          return { kind: "denied", request: result.request };
        }

        // Add to approval cache (session-scoped)
        this.approvals.add(decision.rule);

        // Loop again — identical to interactive after approval
        continue;
      }

      return result;
    }
  }

  // --------------------------
  // CORE RUN
  // --------------------------

  private async runOnce(prompt: string) {
    const args = [
      "-p",
      prompt,
      "--resume",
      this.sessionId,
      "--output-format",
      "stream-json",
      "--tools",
      this.tools,
      "--permissionMode",
      this.permissionMode,
      "--max-turns",
      String(this.maxTurns),
    ];

    if (this.approvals.size > 0) {
      args.push("--allowedTools", Array.from(this.approvals).join(","));
    }

    const child = spawn("claude", args, {
      cwd: this.cwd,
      env: process.env,
    });

    const rl = readline.createInterface({ input: child.stdout });
    const events: ClaudeEvent[] = [];

    let permissionRequest: PermissionRequest | null = null;

    rl.on("line", (line) => {
      let ev: ClaudeEvent;
      try {
        ev = JSON.parse(line);
      } catch {
        ev = { type: "non_json_output", text: line };
      }

      events.push(ev);

      const pr = this.extractPermissionRequest(ev);
      if (pr && !permissionRequest) {
        permissionRequest = pr;
      }
    });

    const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      child.on("exit", (code, signal) => resolve({ code, signal }));
    });

    if (permissionRequest) {
      // identical to interactive pause
      child.kill("SIGTERM");
      return { kind: "permission_request", request: permissionRequest, events };
    }

    if (exit.code === 0) {
      return { kind: "completed", events };
    }

    return { kind: "error", code: exit.code, signal: exit.signal, events };
  }

  // --------------------------
  // PERMISSION EXTRACTION
  // --------------------------

  private extractPermissionRequest(ev: ClaudeEvent): PermissionRequest | null {
    const type = (ev.type ?? "").toString().toLowerCase();
    if (!type.includes("permission")) return null;

    const toolName =
      ev.toolName ??
      ev.tool ??
      ev.permissionRequest?.toolName ??
      ev.permission?.toolName ??
      "UnknownTool";

    const specifier =
      ev.command ??
      ev.path ??
      ev.permissionRequest?.command ??
      ev.permission?.command ??
      ev.permissionRequest?.specifier ??
      undefined;

    return { toolName, specifier, raw: ev };
  }

  // --------------------------
  // USER APPROVAL (REPLACE WITH REAL UI)
  // --------------------------

  private async requestUserApproval(req: PermissionRequest): Promise<UserDecision> {
    console.log("Permission requested:");
    console.log("Tool:", req.toolName);
    console.log("Specifier:", req.specifier);

    // Replace this with real modal / UI decision
    const suggestedRule = this.suggestRule(req);

    console.log("Suggested rule:", suggestedRule);

    // Example: always allow in demo
    return { decision: "allow", rule: suggestedRule };
  }

  // --------------------------
  // RULE GENERATION
  // --------------------------

  private suggestRule(req: PermissionRequest): string {
    if (req.toolName === "Bash" && req.specifier) {
      const parts = req.specifier.trim().split(/\s+/);
      if (parts.length >= 2) {
        return `Bash(${parts[0]} ${parts[1]} *)`;
      }
      return `Bash(${req.specifier} *)`;
    }

    if (req.toolName === "Edit" && req.specifier) {
      return `Edit(${req.specifier})`;
    }

    if (req.toolName === "Read") {
      return "Read";
    }

    return req.toolName;
  }
}