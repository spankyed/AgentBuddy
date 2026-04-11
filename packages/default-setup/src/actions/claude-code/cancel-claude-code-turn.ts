import type { ActionMeta, Services, Z } from '../../types';

export const meta: ActionMeta = {
  label: 'Cancel Claude Code Turn',
  description: 'Stop the in-flight Claude Code subprocess for a thread.',
  category: 'claude-code',
  input: {
    threadId: { type: 'string', description: 'Thread whose active turn should be cancelled', required: true },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
  z: Z,
  _flowId: string,
) {
  const schema = z.object({ threadId: z.string() });
  const parsed = schema.safeParse(params);
  if (!parsed.success) return { success: false, error: parsed.error.message };

  try {
    services.claudeCode.cancelActiveTurn(parsed.data.threadId as any);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Cancel failed' };
  }
}
