import { addRole, hasRoleX, queryEntitiesByRelationTo, removeRole, addRelation, getAttribute, queryEntitiesByRole, addAttribute } from '@/shared/ears/attribute-storage';
import { createEntity } from '@/shared/ears/create-entity';
import { EARS } from '@/shared/ears/types';

function getLatestThreadId(): EARS.EntityId | undefined {
  return queryEntitiesByRole(EARS.RoleKind.Custom('latest_thread'))[0] ?? undefined;
}

function getLatestMessageId(): EARS.EntityId | undefined {
  return queryEntitiesByRole(EARS.RoleKind.Custom('latest_message'))[0] ?? undefined;
}

export function addMessageToLatestThread(content: string) {
  const newMsgId = createEntity(EARS.Entity.Message);
  addAttribute(newMsgId, EARS.AttrKind.Custom('text'), content);
  const latestThreadId = getLatestThreadId();

  if (!latestThreadId) {
    console.warn('No new thread found');
    return;
  }

  addRelation(latestThreadId, EARS.RelKind.CONTAINS, newMsgId);

  setNewMessage(newMsgId, latestThreadId);
}

export function setNewMessage(newMessageId: EARS.EntityId, threadId?: EARS.EntityId) {
  const latestThreadId = threadId || getLatestThreadId();

  if (!latestThreadId) {
    console.warn('No new thread found');
    return;
  }
  const messages = queryEntitiesByRelationTo(EARS.RelKind.CONTAINS, latestThreadId, true);
  const lastLatestMessage = messages.find(hasRoleX(EARS.RoleKind.Custom('latest_message')));

  if (lastLatestMessage){
    removeRole(lastLatestMessage, EARS.RoleKind.Custom('latest_message'))
  }

  addRole(newMessageId, EARS.RoleKind.Custom('latest_message'));
}

export function getLatestMessage(): string | undefined {
  const latestMessageId = getLatestMessageId();

  if (!latestMessageId) {
    console.warn('No latest thread found');
    return undefined;
  }

  return getAttribute(latestMessageId, EARS.AttrKind.Custom('text')) ?? undefined;
}
