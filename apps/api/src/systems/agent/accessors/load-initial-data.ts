import {
  addAttribute,
  addRelation,
  addRole,
} from '@/shared/ears/attribute-storage';
import { createEntity } from '@/shared/ears/create-entity';
import { EARS } from '@/shared/ears/types';
import type {
  AgentPluginData,
  Message,
  ContextItem,
  CanvasContent,
  Thread,
} from '@/shared/types';
import { setLastMessage } from '.';
import mockData from '../mock-data';

/**
 * Loads all mock data into the EARS attribute store
 */
export function loadMockData(
): void {
  const lastThreadId = loadThreads(mockData.threads);

  if (!lastThreadId) {
    console.warn('No threads found in mock data');
    return;
  }

  addRole(lastThreadId, EARS.RoleKind.Custom('last_thread'));

  loadMessages(lastThreadId, mockData.messages);
  loadContextItems(lastThreadId, mockData.contextItems);
  loadCanvasContent(lastThreadId, mockData.canvasContent);
}

/*───────────────────────────────────────────────────────────────*
 * ▸ Messages                                                    *
 *───────────────────────────────────────────────────────────────*/
function loadMessages(threadId: EARS.EntityId, messages: Message[]): void {
  for (const [idx, m] of messages.entries()) {
    const msgEntity = createEntity(EARS.Entity.Message);

    addAttribute(msgEntity, EARS.AttrKind.Custom('text'), m.content);
    addAttribute(msgEntity, EARS.AttrKind.Role, m.role);
    addAttribute(msgEntity, EARS.AttrKind.Custom('timestamp'), m.timestamp);

    // Thread (agent) contains message
    addRelation(threadId, EARS.RelKind.CONTAINS, msgEntity);

    if (idx === messages.length - 1) setLastMessage(msgEntity, threadId);
  }
}

/*───────────────────────────────────────────────────────────────*
 * ▸ Context items                                               *
 *───────────────────────────────────────────────────────────────*/
function loadContextItems(
  threadId: EARS.EntityId,
  contextItems: ContextItem[],
): void {
  for (const item of contextItems) {
    const ctxEntity = createEntity(EARS.Entity.CtxItem);

    addAttribute(ctxEntity, EARS.AttrKind.Custom('title'), item.title);
    addAttribute(ctxEntity, EARS.AttrKind.Custom('content'), item.content);
    addAttribute(ctxEntity, EARS.AttrKind.Custom('type'), item.type);

    // addRole(ctxEntity, EARS.RoleKind.Custom('contextItem'));

    // Agent owns these standalone context items
    addRelation(threadId, EARS.RelKind.CONTAINS, ctxEntity);
  }
}

/*───────────────────────────────────────────────────────────────*
 * ▸ Canvas content                                              *
 *───────────────────────────────────────────────────────────────*/
function loadCanvasContent(
  threadId: EARS.EntityId,
  canvas: CanvasContent,
): void {
  const canvasEntity = createEntity(EARS.Entity.CanvasItem);

  addAttribute(canvasEntity, EARS.AttrKind.Custom('type'), canvas.type);
  addAttribute(canvasEntity, EARS.AttrKind.Custom('content'), canvas.content);

  // addRole(canvasEntity, EARS.RoleKind.Custom('canvas'));

  addRelation(threadId, EARS.RelKind.CONTAINS, canvasEntity);
}

/*───────────────────────────────────────────────────────────────*
 * ▸ Threads                                                     *
 *───────────────────────────────────────────────────────────────*/
function loadThreads(
  threads: Thread[],
): EARS.EntityId | undefined {
  let newestThreadId: EARS.EntityId | undefined;
  let newestTs = Number.NEGATIVE_INFINITY;

  for (const t of threads) {
    const threadEntity = createEntity(EARS.Entity.Thread);

    addAttribute(threadEntity, EARS.AttrKind.Custom('title'), t.title);
    addAttribute(threadEntity, EARS.AttrKind.Custom('timestamp'), t.timestamp);

    /* --- pick the most‑recent timestamp on the fly --- */
    const ts = t.timestamp.getTime();              // to epoch‑ms
    if (ts > newestTs) {
      newestTs = ts;
      newestThreadId = threadEntity;
    }
  }

  return newestThreadId;
}
