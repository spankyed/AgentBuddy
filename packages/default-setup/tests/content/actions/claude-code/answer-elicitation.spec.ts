import { parseMcpElicitationForm, validateMcpElicitationForm } from '#features/code/shared/mcp-elicitation-form.ts';
import { describe, expect, it, vi } from 'vitest';
import { mockService } from '@apackdev/testing/harness';
import { services, type Services } from '#generated/services.ts';
import { repository } from '#generated/repository.ts';
import { action } from '../../../../src/content/actions/claude-code/answer-elicitation.ts';
import { action as route } from '../../../../src/content/actions/claude-code/route-response.ts';
import { cancelPendingControlRequest, getClaudeState } from '../../../../src/content/actions/claude-code/_helpers/thread-context.ts';
function setup() {
 const {id}=repository.threadCommands.create({ topic: 'Elicitation', instructions: '', tags: [] });
 repository.threadCommands.update(id,{context:{claudeCode:{sessionId:'native-fixture',pendingElicitation:{requestId:'url',approvalMessageId:'url-ui',serverName:'fixture',mode:'url'}}}});
 const respond=vi.fn();mockService<Services,'cli'>('cli',{claudeCode:{getConversation:vi.fn(),getHandle:vi.fn(()=>({respondElicitation:respond}))} as never});
 mockService<Services,'threads'>('threads',{updateChatState:vi.fn()});mockService<Services,'chat'>('chat',{updateMessageState:vi.fn(),sendBlockMessage:vi.fn()});return{id,respond};
}
describe('MCP URL answer and routing',()=>{
 it.each(['accept','decline','cancel'] as const)('sends explicit %s without tool flags or killing the process',async choice=>{
  const{id,respond}=setup();expect(await route({messageId:'url-ui',threadId:id,response:{buttonId:choice,approved:false}},services)).toMatchObject({elicitation:true,requestId:'url'});
  expect(await action({threadId:id,requestId:'url',response:{buttonId:choice}},services)).toEqual({success:true});expect(respond).toHaveBeenCalledWith('url',{action:choice});expect(getClaudeState(services,id)?.pendingElicitation).toBeUndefined();
 });
 it('ignores invalid choices and stale responses, preserving the pending request until it is retired',async()=>{
  const{id,respond}=setup();expect(await action({threadId:id,requestId:'url',response:{buttonId:'unknown'}},services)).toMatchObject({success:false});expect(getClaudeState(services,id)?.pendingElicitation).toBeDefined();
  expect(cancelPendingControlRequest(services,id,'other')).toBe(false);expect(cancelPendingControlRequest(services,id,'url')).toBe(true);
  expect(await action({threadId:id,requestId:'url',response:{buttonId:'accept'}},services)).toMatchObject({success:false});expect(respond).not.toHaveBeenCalled();
 });
 it.each(['missing','closed'])('expires the matching UI when its native process is %s',async mode=>{
  const{id,respond}=setup();respond.mockImplementation(()=>{throw new Error('closed')});mockService<Services,'cli'>('cli',{claudeCode:{getConversation:vi.fn(),getHandle:vi.fn(()=>mode==='missing'?undefined:{respondElicitation:respond})} as never});
  expect(await action({threadId:id,requestId:'url',response:{buttonId:'accept'}},services)).toMatchObject({success:false});expect(getClaudeState(services,id)?.pendingElicitation).toBeUndefined();expect(services.chat.updateMessageState).toHaveBeenCalledWith('url-ui',expect.objectContaining({blockResponse:{cancelled:true}}));
 });
});


it('rejects a stale form before validation or re-presenting input for a replacement process',async()=>{
 const{id,respond}=setup();const validate=vi.fn();mockService<Services,'cli'>('cli',{claudeCode:{getHandle:vi.fn(()=>({respondElicitation:respond})),getConversation:vi.fn(()=>({owner:{hasPendingElicitation:()=>false}})),validateMcpElicitationForm:validate} as never});
 expect(await action({threadId:id,requestId:'url',response:{buttonId:'accept',content:{}}},services)).toMatchObject({success:false});expect(validate).not.toHaveBeenCalled();expect(respond).not.toHaveBeenCalled();
});


it('re-presents invalid form content without answering native, then sends the corrected typed value',async()=>{
 const{id,respond}=setup();const form=parseMcpElicitationForm({type:'object',properties:{choice:{type:'string',enum:['Alpha','Beta']}},required:['choice']});
 repository.threadCommands.update(id,{context:{claudeCode:{pendingElicitation:{requestId:'url',approvalMessageId:'url-ui',serverName:'fixture',mode:'form',form,message:'Choose fixture'}}}});
 mockService<Services,'cli'>('cli',{claudeCode:{getHandle:vi.fn(()=>({respondElicitation:respond})),getConversation:vi.fn(),validateMcpElicitationForm} as never});
 mockService<Services,'chat'>('chat',{updateMessageState:vi.fn(),sendBlockMessage:vi.fn(()=>({messageId:'retry-ui'})) as never});
 expect(await action({threadId:id,requestId:'url',response:{buttonId:'accept',content:{choice:'Gamma'}}},services)).toMatchObject({success:false,reason:'invalid form content'});expect(respond).not.toHaveBeenCalled();expect(getClaudeState(services,id)?.pendingElicitation).toMatchObject({requestId:'url',approvalMessageId:'retry-ui'});
 expect(services.chat.updateMessageState).toHaveBeenCalledWith('url-ui',expect.objectContaining({blockResponse:{validationFailed:true}}));
 expect(await action({threadId:id,requestId:'url',response:{buttonId:'accept',content:{choice:'Beta'}}},services)).toEqual({success:true});expect(respond).toHaveBeenCalledWith('url',{action:'accept',content:{choice:'Beta'}});
});
