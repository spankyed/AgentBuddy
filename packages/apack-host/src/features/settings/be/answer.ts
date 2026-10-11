import type { Reply } from '@apack/sdk/events';
import { broadcastToPlugin } from '../../../events.ts';
import type { OutgoingSettingsEvents } from './types.ts';

/** What a write answers with: it was stored, or it was refused and stored nothing */
export type SettingsAnswer = Extract<OutgoingSettingsEvents, { type: 'SETTINGS_SAVED' | 'SETTINGS_REFUSED' }>;

/**
 * Answers whoever asked for a write, and tells every Settings view when nobody did.
 *
 * A write arrives from the Settings view, from a drive session, or from code with no asker at all — and only
 * the outcome is the asker's. Broadcasting it to the `settings` plugin was the only path for a long time,
 * which meant a sender that was not that plugin learned nothing: a drive session's `/set-setting` reported
 * success for every refused write, because the send had been accepted and the refusal went somewhere it could
 * not see.
 *
 * **Reply or broadcast, never both.** Replying as well would hand the Settings view two `SETTINGS_SAVED` for
 * one save. The reply is the better of the two for it anyway: the broadcast told every window's view that
 * something it never did had been saved.
 *
 * `reply` is passed in rather than read from the delivery in scope, which is what makes the absent case a
 * thing a caller must handle rather than a global it might not think to probe.
 */
export function answerSettings(reply: Reply<SettingsAnswer> | undefined, event: SettingsAnswer): void {
  if (reply === undefined) broadcastToPlugin('settings', event);
  else reply(event);
}
