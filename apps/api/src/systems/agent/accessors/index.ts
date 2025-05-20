import { addRole, hasRoleX, queryEntitiesByRelationTo, removeRole, addRelation, getAttribute, queryEntitiesByRole, addAttribute } from '@/shared/ears/attribute-storage';
import { createEntity } from '@/shared/ears/create-entity';
import { EARS } from '@/shared/ears/types';

function getLastThreadId(): EARS.EntityId | undefined {
  return queryEntitiesByRole(EARS.RoleKind.Custom('last_thread'))[0] ?? undefined;
}

function getLastMessageId(): EARS.EntityId | undefined {
  return queryEntitiesByRole(EARS.RoleKind.Custom('last_message'))[0] ?? undefined;
}

export function addMessageToLatestThread(content: string) {
  const newMsgId = createEntity(EARS.Entity.Message);
  addAttribute(newMsgId, EARS.AttrKind.Custom('text'), content);
  const lastThreadId = getLastThreadId();

  if (!lastThreadId) {
    console.warn('No last thread found');
    return;
  }

  addRelation(lastThreadId, EARS.RelKind.CONTAINS, newMsgId);

  setLastMessage(newMsgId, lastThreadId);
}

export function setLastMessage(newMessageId: EARS.EntityId, threadId?: EARS.EntityId) {
  const lastThreadId = threadId || getLastThreadId();

  if (!lastThreadId) {
    console.warn('No last thread found');
    return;
  }
  const messages = queryEntitiesByRelationTo(EARS.RelKind.CONTAINS, lastThreadId, true);
  const lastMessage = messages.find(hasRoleX(EARS.RoleKind.Custom('last_message')));

  if (lastMessage){
    removeRole(lastMessage, EARS.RoleKind.Custom('last_message'))
  }

  addRole(newMessageId, EARS.RoleKind.Custom('last_message'));
}

export function getLastMessage(): string | undefined {
  const lastMessageId = getLastMessageId();

  if (!lastMessageId) {
    console.warn('No last thread found');
    return undefined;
  }

  return getAttribute(lastMessageId, EARS.AttrKind.Custom('text')) ?? undefined;
}
