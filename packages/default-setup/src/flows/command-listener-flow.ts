import type { FlowDSL } from '../types';
import { entry, on, keepAlive, action, branch } from './_patterns';

export default {
  "Command Listener": [
    entry([keepAlive()]),
    on("user.command", [[
      branch([
        {
          if: "$.event.data.payload.command == 'gcmsg'",
          steps: [action("Git Commit Command", {
            label: "commit",
            map: {
              text: "$.event.data.payload.text",
              threadId: "$.event.data.payload.threadId",
              references: "$.event.data.payload.references",
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
              references: "$.event.data.payload.references",
            },
          })],
        },
      ]),
    ]], "Route Command"),
  ],
} satisfies FlowDSL;
