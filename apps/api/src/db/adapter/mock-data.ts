// // mockData.ts
// import { EARS } from '@/shared/ears/types';
// import {
//   entity,
//   attrText,
//   attrTime,
//   attrJson,
//   role,
//   relation,
// } from './schema';

// const nowMs = Date.now();

// export const now = new Date(nowMs);

// export const rows = {
//   entity: [
//     { id: 'Agent-demo',   type: 'Agent',   createdAt: nowMs },
//     { id: 'Thread-ui',    type: 'Thread',  createdAt: nowMs - 9 * 60_000 },
//     { id: 'Msg-1',        type: 'Message', createdAt: nowMs - 5 * 60_000 },
//     { id: 'Msg-2',        type: 'Message', createdAt: nowMs - 4 * 60_000 },
//   ],
//   attrText: [
//     {
//       entityId: 'Thread-ui',
//       kind:     'title',
//       idx:       0,
//       value:    'UI Layout Reorganisation',
//     },
//     {
//       entityId: 'Msg-1',
//       kind:     'text',
//       idx:       0,
//       value:    'How do I use CSS vars?',
//     },
//     {
//       entityId: 'Msg-1',
//       kind:     'sender',
//       idx:       0,
//       value:    'user',
//     },
//   ],
//   attrTime: [
//     {
//       entityId: 'Thread-ui',
//       kind:     'timestamp',
//       idx:       0,
//       value:    nowMs - 9 * 60_000,
//     },
//     {
//       entityId: 'Msg-1',
//       kind:     'timestamp',
//       idx:       0,
//       value:    nowMs - 5 * 60_000,
//     },
//   ],
//   role: [
//     {
//       entityId: 'Thread-ui',
//       role:     EARS.RoleKind.Custom('latest_thread'),
//     },
//   ],
//   relation: [
//     {
//       srcId: 'Agent-demo',
//       kind:   EARS.RelKind.OWNS,
//       tgtId:  'Thread-ui',
//       info:   JSON.stringify({}),
//     },
//     {
//       srcId: 'Thread-ui',
//       kind:   EARS.RelKind.CONTAINS,
//       tgtId:  'Msg-1',
//       info:   JSON.stringify({}),
//     },
//     {
//       srcId: 'Thread-ui',
//       kind:   EARS.RelKind.CONTAINS,
//       tgtId:  'Msg-2',
//       info:   JSON.stringify({}),
//     },
//   ],
// };