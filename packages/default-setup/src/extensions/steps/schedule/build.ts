import { EARS } from '@abuddy/sdk';
import { Cron } from 'croner';

export function compile(track: Record<string, unknown>, trackId: string, ts: number, trackKey: string): Record<string, unknown> {
  return {
    id: trackId,
    entityType: EARS.Entity.Node,
    createdAt: ts,
    nodeType: 'schedule',
    label: (track as any).label || 'Schedule',
    description: (track as any).description,
    trackKey,
    cronExpression: (track as any).schedule,
  };
}

export function decompile(node: Record<string, unknown>): Record<string, unknown> {
  return { schedule: (node as any).cronExpression };
}

function validateCron(cron: string | undefined, fieldName: string): string[] {
  const errors: string[] = [];
  if (!cron || cron.trim().length === 0) {
    errors.push(`Missing required field: ${fieldName}`);
  } else {
    const parts = cron.trim().split(/\s+/);
    if (parts.length < 5 || parts.length > 6) {
      errors.push('Invalid cron expression');
    } else {
      try { new Cron(cron); } catch { errors.push('Invalid cron expression'); }
    }
  }
  return errors;
}

export function validateTrack(track: Record<string, unknown>): { valid: boolean; errors: string[] } {
  const errors = validateCron((track as any).schedule as string | undefined, 'schedule');
  return { valid: errors.length === 0, errors };
}

export function validate(node: Record<string, unknown>): { valid: boolean; errors: string[] } {
  const errors = validateCron((node as any).cronExpression as string | undefined, 'cronExpression');
  return { valid: errors.length === 0, errors };
}
