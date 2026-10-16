import {PassThrough} from 'node:stream';
import {mockService} from '@apackdev/testing/harness';
import {services,type Services} from '#generated/services.ts';
import {repository} from '#generated/repository.ts';
import {chatService} from '#features/threads/be/services/chat.ts';
import * as store from '#features/code/be/services/claude-code/handle-store.ts';
import type {QueryHandle} from '#features/code/be/services/claude-code/query.ts';
import type {StreamLine} from '#features/code/be/services/claude-code/types.ts';
import {action as chat} from '../../../../src/content/actions/claude-code/chat.ts';
import {action as selectDirectory} from '../../../../src/content/actions/claude-code/handle-directory-select.ts';
import {getClaudeState} from '../../../../src/content/actions/claude-code/_helpers/thread-context.ts';
import {replayQueuedMessage} from '../../../../src/content/actions/claude-code/_helpers/stream-consumer.ts';
vi.mock('../../../../src/content/actions/claude-code/_helpers/context-usage.ts',()=>({refreshThreadContextUsage:vi.fn(async()=>{})}));
afterEach(()=>store.killAllHandles());
const schema={type:'object',properties:{answer:{type:'integer'}},required:['answer']};
function setup(context:Record<string,unknown>={cwd:'/fixture'}){
 const {id}=repository.threadCommands.create({topic:'Structured Chat',instructions:'',tags:[]});repository.threadCommands.update(id,{context:{claudeCode:context}});
 const natives:{events:PassThrough;handle:QueryHandle;input:string}[]=[];let sequence=0;
 const opened=vi.fn(async(key,launchKey,_options,consume)=>{
  const events=new PassThrough({objectMode:true}),entry={events,handle:undefined as unknown as QueryHandle,input:''};
  entry.handle={events:events as AsyncIterable<StreamLine>,send:vi.fn(()=>entry.input=`schema-input-${++sequence}`),hasPendingBackgroundTasks:()=>false,close:vi.fn(async()=>{events.end()}),kill:vi.fn(()=>events.end()),setPermissionMode:vi.fn(async mode=>mode)} as unknown as QueryHandle;natives.push(entry);
  return store.openConversation(key,launchKey,async()=>entry.handle,consume);
 });
 mockService<Services,'cli'>('cli',{claudeCode:{openConversation:opened,getConversation:store.getConversation,isConversationBusy:store.isConversationBusy,closeIdleConversation:store.closeIdleConversation,getHandle:store.getHandle,isCurrentTurn:store.isCurrentTurn,clearHandle:store.clearHandle,storeHandle:store.storeHandle,sessionExists:vi.fn(async()=>true)} as never});
 mockService<Services,'chat'>('chat',{...chatService,resolveReferences:vi.fn(async()=>({textPrefix:'',imageBlocks:[]}))} as never);
 mockService<Services,'threads'>('threads',{updateChatState:vi.fn()});mockService<Services,'logger'>('logger',{debug:vi.fn(),info:vi.fn(),warn:vi.fn(),error:vi.fn()});
 const emitted=vi.fn(),execute=vi.fn(async(_label:string,_params:Record<string,any>)=>({success:true}));mockService<Services,'emitter'>('emitter',{sendToSystem:emitted,broadcastToPlugin:vi.fn()});mockService<Services,'action'>('action',{executeIfFound:execute});
 const invoke=(jsonSchema?:unknown)=>chat({threadId:id,text:'Fixture',jsonSchema},services,{} as never,'');
 const finish=async()=>{
  const native=natives.at(-1)!;native.events.write({type:'command_lifecycle',state:'started',command_uuid:native.input});native.events.write({type:'system',subtype:'init',session_id:'fixture-session',cwd:'/fixture'});
  native.events.write({type:'result',subtype:'success',is_error:false,session_id:'fixture-session',user_message_uuid:native.input,result:'{"answer":42}',structured_output:{answer:42}});
  await vi.waitFor(()=>expect(store.isConversationBusy(id)).toBe(false));
 };
 return{id,opened,natives,invoke,finish,execute};
}
it('reuses an identical schema and replaces an idle process when schema changes or is omitted',async()=>{
 const f=setup();expect(await f.invoke(schema)).toMatchObject({streaming:true});expect(f.opened.mock.calls[0][2].jsonSchema).toEqual(schema);await f.finish();
 expect(await f.invoke(structuredClone(schema))).toMatchObject({streaming:true});await f.finish();expect(f.opened).toHaveBeenCalledOnce();
 const changed={...schema,required:[]};expect(await f.invoke(changed)).toMatchObject({streaming:true});await f.finish();expect(f.opened).toHaveBeenCalledTimes(2);expect(f.natives[0].handle.close).toHaveBeenCalledOnce();
 expect(await f.invoke()).toMatchObject({streaming:true});await f.finish();expect(f.opened).toHaveBeenCalledTimes(3);expect(f.opened.mock.calls[2][2].jsonSchema).toBeUndefined();expect(f.natives[1].handle.close).toHaveBeenCalledOnce();
 expect(await f.invoke()).toMatchObject({streaming:true});await f.finish();expect(f.opened).toHaveBeenCalledTimes(3);
});
it.each([{forkPending:true},{isRunning:true}])('preserves a schema snapshot through queue and replay (%j)',async state=>{
 const f=setup({cwd:'/fixture',...state});if(state.isRunning)mockService<Services,'cli'>('cli',{claudeCode:{isConversationBusy:vi.fn(()=>true)} as never});
 const requested=structuredClone(schema);expect(await f.invoke(requested)).toMatchObject({queued:true});requested.required.push('mutated');
 const queued=getClaudeState(services,f.id)?.queuedMessage;expect(queued?.jsonSchema).toEqual(schema);
 await replayQueuedMessage(services,f.id,queued!,services.logger);expect(f.execute).toHaveBeenCalledWith('Claude Code Chat',expect.objectContaining({jsonSchema:schema}));expect(f.opened).not.toHaveBeenCalled();
});
it('preserves schema through the directory picker retry',async()=>{
 const f=setup({});mockService<Services,'settings'>('settings',{get:vi.fn(({kind})=>kind==='app'?{projects:[]}:{}),update:vi.fn()} as never);
 expect(await f.invoke(schema)).toMatchObject({awaitingDirectory:true});const pending=getClaudeState(services,f.id)?.pendingDirectorySelect;expect(pending?.jsonSchema).toEqual(schema);
 await selectDirectory({threadId:f.id,response:{path:'/fixture'},pendingDirectorySelect:pending},services);
 expect(f.execute).toHaveBeenCalledWith('Claude Code Chat',expect.objectContaining({jsonSchema:schema}));
});
it('rejects unserializable input before queueing or opening a process',async()=>{
 const f=setup({cwd:'/fixture',forkPending:true}),circular:Record<string,unknown>={};circular.self=circular;
 expect(await f.invoke(circular)).toMatchObject({success:false,error:'jsonSchema must be JSON serializable'});expect(f.opened).not.toHaveBeenCalled();expect(getClaudeState(services,f.id)?.queuedMessage).toBeUndefined();
});
it('drains a queued schema change through the actual Chat action without waiting on its own retiring consumer',async()=>{
 const f=setup();f.execute.mockImplementation(async(_label,params)=>chat(params,services,{} as never,''));
 expect(await f.invoke(schema)).toMatchObject({streaming:true});const changed={...schema,required:[]};expect(await f.invoke(changed)).toMatchObject({queued:true});
 const first=f.natives[0];first.events.write({type:'command_lifecycle',state:'started',command_uuid:first.input});first.events.write({type:'system',subtype:'init',session_id:'fixture-session',cwd:'/fixture'});first.events.write({type:'result',subtype:'success',is_error:false,session_id:'fixture-session',user_message_uuid:first.input,result:'first'});
 await vi.waitFor(()=>expect(f.opened).toHaveBeenCalledTimes(2),{timeout:700});expect(f.opened.mock.calls[1][2].jsonSchema).toEqual(changed);await f.finish();
});
