import type { FlowDSL } from '../types';
import { entryWithListeners, action, branch } from './_patterns';

export default {
  "Command Listener": entryWithListeners(
    [], // no entry steps, just keep_alive
    [
      {
        event: "user.command",
        label: "Route Command",
        exits: [[
          branch([
            {
              if: "$.event.data.payload.command == 'gcmsg'",
              steps: [action("Git Commit Command", {
                label: "commit",
                map: {
                  text: "$.event.data.payload.text",
                  threadId: "$.event.data.payload.threadId",
                },
              })],
            },
            {
              if: "$.event.data.payload.command == 'pr2md'",
              steps: [action("PR to Markdown", {
                label: "export PR",
                map: {
                  text: "$.event.data.payload.text",
                  threadId: "$.event.data.payload.threadId",
                },
              })],
            },
          ]),
        ]],
      },
    ],
  ),
} satisfies FlowDSL;
