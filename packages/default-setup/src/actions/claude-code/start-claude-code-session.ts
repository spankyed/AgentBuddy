import type { ActionMeta, Services, Z } from '../../types';

export const meta: ActionMeta = {
  label: 'Start Claude Code Session',
  description: 'Persist a Claude Code session record for a thread and post a greeting message.',
  category: 'claude-code',
  input: {
    threadId: { type: 'string', description: 'Thread that owns the session', required: true },
    cwd: { type: 'string', description: 'Working directory for the claude CLI', required: true },
    model: { type: 'string', description: 'Optional model override (e.g. sonnet)', required: false },
    permissionMode: { type: 'string', description: 'Optional permission mode', required: false },
    appendSystemPrompt: { type: 'string', description: 'Text appended to the system prompt', required: false },
    addDirs: { type: 'object', description: 'Extra --add-dir paths', required: false },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
  z: Z,
  _flowId: string,
) {
  const schema = z.object({
    threadId: z.string(),
    cwd: z.string(),
    model: z.string().optional(),
    permissionMode: z.string().optional(),
    appendSystemPrompt: z.string().optional(),
    addDirs: z.array(z.string()).optional(),
  });

  const parsed = schema.safeParse(params);
  if (!parsed.success) {
    return { success: false, error: parsed.error.message };
  }

  const { threadId, cwd, model, permissionMode, appendSystemPrompt, addDirs } = parsed.data;

  try {
    const session = services.claudeCode.createSession(threadId as any, {
      cwd,
      ...(model && { model }),
      ...(permissionMode && { permissionMode }),
      ...(appendSystemPrompt && { appendSystemPrompt }),
      ...(addDirs && addDirs.length && { addDirs }),
    });

    services.chat.sendBlockMessage({
      threadId: threadId as any,
      text: `Claude Code session ready in ${cwd}`,
      blocks: [],
      forkable: false,
    });

    return { success: true, sessionRecordId: session.id };
  } catch (err: any) {
    const message = err?.message || 'Failed to start Claude Code session';
    services.chat.sendBlockMessage({
      threadId: threadId as any,
      text: `Claude Code session error: ${message}`,
      blocks: [],
      forkable: false,
    });
    return { success: false, error: message };
  }
}
