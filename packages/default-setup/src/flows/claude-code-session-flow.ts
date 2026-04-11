import type { FlowDSL } from '../types';
import { entryWithListeners, action } from './_patterns';

/**
 * "Claude Code Session" flow.
 *
 * Entered on `claude.code.session.start` (fired by the threads system when
 * a new thread is created with forcedMode = 'claude-code'). Once running it
 * stays keep_alive and listens for:
 *   - user.message                       → run a new turn
 *   - claude.code.permission.response    → relay decision to the in-flight turn
 *   - claude.code.cancel                 → stop the in-flight turn
 */
export default {
  'Claude Code Session': entryWithListeners(
    [
      action('Start Claude Code Session', {
        label: 'start',
        map: {
          threadId: '$.event.data.payload.threadId',
          cwd: '$.event.data.payload.cwd',
          model: '$.event.data.payload.model',
          permissionMode: '$.event.data.payload.permissionMode',
          appendSystemPrompt: '$.event.data.payload.appendSystemPrompt',
          addDirs: '$.event.data.payload.addDirs',
        },
      }),
    ],
    [
      {
        event: 'user.message',
        label: 'User turn',
        exits: [[
          action('Run Claude Code Turn', {
            label: 'turn',
            map: {
              threadId: '$.event.data.payload.threadId',
              text: '$.event.data.payload.text',
              references: '$.event.data.payload.references',
            },
          }),
        ]],
      },
      {
        event: 'claude.code.permission.response',
        label: 'Permission response',
        exits: [[
          action('Resolve Claude Code Permission', {
            label: 'resolvePerm',
            map: {
              requestId: '$.event.data.payload.requestId',
              decision: '$.event.data.payload.decision',
              scope: '$.event.data.payload.scope',
            },
          }),
        ]],
      },
      {
        event: 'claude.code.cancel',
        label: 'Cancel turn',
        exits: [[
          action('Cancel Claude Code Turn', {
            label: 'cancel',
            map: { threadId: '$.event.data.payload.threadId' },
          }),
        ]],
      },
    ],
  ),
} satisfies FlowDSL;
