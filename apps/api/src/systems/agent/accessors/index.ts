import { addRole, hasRoleX, queryEntitiesByRelationTo, removeRole, addRelation, getAttribute } from '@/shared/ears/attribute-storage';
import { EARS } from '@/shared/ears/types';

export function addToAgent(agentId: EARS.EntityId, messageId: EARS.EntityId) {
  addRelation(agentId, 'contains', messageId);
}

export function setLastMessage(agentId: EARS.EntityId, newMessageId: EARS.EntityId) {
  const messages = queryEntitiesByRelationTo('contains', agentId, true);
  const lastMessage = messages.find(hasRoleX('last'));

  if (lastMessage){
    removeRole(lastMessage, 'last')
  }

  addRole(newMessageId, 'last')
}

export function getLastMessage(agentId: EARS.EntityId): string | undefined {
  const messages = queryEntitiesByRelationTo('contains', agentId, true);
  messages.find(hasRoleX('last'));

  if (messages.length === 0) {
    return undefined;
  }

  console.log('last one b4 super', getAttribute(messages[0], EARS.AttrKind.Custom('text')));
  return getAttribute(messages[0], EARS.AttrKind.Custom('text')) ?? undefined;
}
