import mockData from '../mock-data';
import { bp, spawn } from '@/shared/ears/blueprint';
import { addRole, addRelation } from '@/shared/ears/attribute-storage';
import { EARS } from '@/shared/ears/types';
import { setNewMessage } from '.';

/**
 *   • All messages / context items / canvas content attach to the _newest_ thread
 *   • Every thread entity is created
 */
export function loadMockData(): void {
  const messageBps = mockData.messages.map(m =>
    bp(EARS.Entity.Message)
      .attr('text', m.content)
      .attr('sender', m.sender)
      .attr('timestamp', m.timestamp)
      .build(),
  );

  const ctxItemBps = mockData.contextItems.map(c =>
    bp(EARS.Entity.CtxItem)
      .attr('title', c.title)
      .attr('content', c.content)
      .attr('type', c.type)
      .build(),
  );

  const canvasBp = bp(EARS.Entity.CanvasItem)
    .attr('type', mockData.canvasContent.type)
    .attr('content', mockData.canvasContent.content)
    .build();

  /*───────────────────────*
   * 2 ▸ Find newest thread *
   *───────────────────────*/
  const newestThread = mockData.threads.reduce((acc, t) =>
    !acc || t.timestamp > acc.timestamp ? t : acc, undefined as typeof mockData.threads[number] | undefined);

  if (!newestThread) {
    console.warn('No threads found in mock data');
    return;
  }

  /*───────────────────────*
   * 3 ▸ Spawn all threads  *
   *───────────────────────*/
  let latestThreadId: EARS.EntityId | undefined;

  for (const t of mockData.threads) {
    const threadId = spawn(
      bp(EARS.Entity.Thread)
        .attr('title', t.title)
        .attr('timestamp', t.timestamp)
        .build(),
    );

    if (t === newestThread) latestThreadId = threadId;
  }

  /*───────────────────────*
   * 4 ▸ Attach children    *
   *───────────────────────*/
  if (!latestThreadId) return; // should never happen

  // Get all messages except the last one and the last message separately
  const lastMsg = messageBps[messageBps.length - 1];
  const restMessagesBps = messageBps.slice(0, -1);

  for (const threadChildBp of [...restMessagesBps, ...ctxItemBps, canvasBp]) {
    const childId = spawn(threadChildBp);                 // entity (deduped)
    addRelation(latestThreadId, EARS.RelKind.CONTAINS, childId);
  }

  /* Last‑message bookkeeping */
  if (lastMsg) {
    // Use array indexing which TypeScript knows is safe after length check
    const lastMsgId = spawn(lastMsg);    // cached ID
    addRelation(latestThreadId, EARS.RelKind.CONTAINS, lastMsgId);
    setNewMessage(lastMsgId, latestThreadId);
  }

  /* Mark the newest thread */
  addRole(latestThreadId, EARS.RoleKind.Custom('latest_thread'));
}