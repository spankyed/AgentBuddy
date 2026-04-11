import type { ActionMeta, Services, Z } from '../../types';

export const meta: ActionMeta = {
  label: 'Resolve Claude Code Permission',
  description: 'Relay the user decision back to the in-flight Claude Code turn.',
  category: 'claude-code',
  input: {
    requestId: { type: 'string', description: 'Pending permission request id', required: true },
    decision: { type: 'string', description: "'allow' | 'allow_session' | 'deny'", required: true },
    scope: { type: 'string', description: 'Optional scope for allow_session', required: false },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
  z: Z,
  _flowId: string,
) {
  const schema = z.object({
    requestId: z.string(),
    decision: z.enum(['allow', 'allow_session', 'deny']),
    scope: z.string().optional(),
  });
  const parsed = schema.safeParse(params);
  if (!parsed.success) {
    return { success: false, error: parsed.error.message };
  }

  const { requestId, decision, scope } = parsed.data;

  try {
    services.claudeCode.pendingPermissions.resolve(requestId, {
      decision,
      ...(scope && { scope }),
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Resolve failed' };
  }
}
