import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {mockService} from '@apackdev/testing/harness';
import {services,type Services} from '#generated/services.ts';
import {repository} from '#generated/repository.ts';
import {query} from '#features/code/be/services/claude-code/query.ts';
import * as store from '#features/code/be/services/claude-code/handle-store.ts';
import type {ClaudeConversationTurn} from '#features/code/be/services/claude-code/conversation.ts';
import type {StreamLine} from '#features/code/be/services/claude-code/types.ts';
import {action as chat} from '../../../../src/content/actions/claude-code/chat.ts';
import type {QueryOptions} from '#features/code/be/services/claude-code/types.ts';
import {chatService} from '#features/threads/be/services/chat.ts';
vi.mock('../../../../src/content/actions/claude-code/_helpers/context-usage.ts',()=>({refreshThreadContextUsage:vi.fn(async()=>{})}));
const executable=process.env.CLAUDE_RESEARCH_EXECUTABLE,workspace=process.env.CLAUDE_RESEARCH_WORKSPACE,endpoint=process.env.CLAUDE_RESEARCH_MODEL_URL,mode=process.env.CLAUDE_RESEARCH_STRUCTURED_MODE;
it.skipIf(!executable||!workspace||!endpoint||!mode)('starts native structured responses through the actual Chat action and source consumer',async()=>{
 expect(['valid','repair','exhaust','queued']).toContain(mode);expect(process.env.HOME).toBe(workspace);expect(new URL(endpoint!).hostname).toBe('127.0.0.1');
 const cwd=join(workspace!,'project');await mkdir(cwd);
 const {id}=repository.threadCommands.create({topic:'Native structured chat',instructions:'',tags:[]});
 repository.threadCommands.update(id,{context:{claudeCode:{cwd}}});
 const updates=vi.fn(chatService.updateMessageState),emitted=vi.fn();
 mockService<Services,'chat'>('chat',{...chatService,updateMessageState:updates,resolveReferences:vi.fn(async()=>({textPrefix:'',imageBlocks:[],addDirs:[]}))});
 mockService<Services,'logger'>('logger',{debug:vi.fn(),info:vi.fn(),warn:vi.fn(),error:vi.fn()});
 mockService<Services,'threads'>('threads',{updateChatState:vi.fn()});
 mockService<Services,'emitter'>('emitter',{sendToSystem:emitted,broadcastToPlugin:vi.fn()});
 const replay=vi.fn(async(_label:string,params:Record<string,any>)=>chat(params,services,{} as never,''));
 mockService<Services,'action'>('action',{executeIfFound:replay});
 const schema={type:'object',properties:{answer:{type:'integer'},marker:{type:'string',const:'STRUCTURED_FIXTURE'}},required:['answer','marker'],additionalProperties:false};
 const queuedSchema={...schema,description:'QUEUED_SCHEMA_FIXTURE'};
 const owners:Awaited<ReturnType<typeof store.openConversation>>[]=[];
 let native!:Awaited<ReturnType<typeof query>>,owner!:Awaited<ReturnType<typeof store.openConversation>>;
 const events:StreamLine[]=[];
 const opened=vi.fn(async(key:string,launchKey:string,options:QueryOptions,consume:(turn:ClaudeConversationTurn)=>Promise<void>)=>{
  expect(options.jsonSchema).toEqual(opened.mock.calls.length===1?schema:queuedSchema);
  native=await query({...options,cwd,cliPath:executable,env:{...Object.fromEntries(Object.keys(process.env).map(key=>[key,undefined])),PATH:process.env.PATH,HOME:workspace,CLAUDE_CONFIG_DIR:join(workspace!,'.claude'),ANTHROPIC_BASE_URL:endpoint,DISABLE_AUTOUPDATER:'1',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',...(mode==='exhaust'?{MAX_STRUCTURED_OUTPUT_RETRIES:'2'}:{})},settingSources:[],settings:JSON.stringify({apiKeyHelper:'/usr/bin/printf research-fixture-key'}),model:'sonnet',tools:[],strictMcpConfig:true,keepStdinOpen:true,surfaceControlRequests:true,noSessionPersistence:mode!=='queued',maxTurns:8,signal:AbortSignal.timeout(25000)});
  owner=await store.openConversation(key,launchKey,async()=>native,consume);owner.subscribe(event=>events.push(event));owners.push(owner);return owner;
 });
 mockService<Services,'cli'>('cli',{claudeCode:{openConversation:opened,getConversation:store.getConversation,isConversationBusy:store.isConversationBusy,closeIdleConversation:store.closeIdleConversation,getHandle:store.getHandle,isCurrentTurn:store.isCurrentTurn,storeHandle:store.storeHandle,clearHandle:store.clearHandle,sessionExists:vi.fn(async()=>true)} as never});
 try{
  expect(await chat({threadId:id,text:'Return only the fixed structured fixture.',jsonSchema:schema},services,{} as never,'')).toMatchObject({streaming:true});
  if(mode==='queued')expect(await chat({threadId:id,text:'Second queued structured input',jsonSchema:queuedSchema},services,{} as never,'')).toMatchObject({queued:true});
  await vi.waitFor(()=>expect(events.filter(event=>event.type==='result')).toHaveLength(mode==='queued'?2:1),{timeout:15000});
  await vi.waitFor(()=>expect(emitted.mock.calls.filter(([,event])=>event.eventType==='cc.stream.completed')).toHaveLength(mode==='queued'?2:1),{timeout:5000});
  expect(opened).toHaveBeenCalledTimes(mode==='queued'?2:1);
  if(mode==='queued'){expect(replay).toHaveBeenCalledOnce();expect(owners[0]).not.toBe(owners[1]);expect(owners[0].closing).toBe(true);await owners[0].done;}
  const terminal=events.find(event=>event.type==='result')!;
  const rendered=updates.mock.calls.map(([,patch])=>patch.text).filter((text):text is string=>typeof text==='string');
  if(mode==='exhaust'){
   expect(terminal).toMatchObject({subtype:'error_max_structured_output_retries',is_error:true});
   expect(rendered.some(text=>text.includes('Failed to provide valid structured output after 2 attempts'))).toBe(true);
   expect(rendered).not.toContain('{"answer":42,"marker":"STRUCTURED_FIXTURE"}');
   await expect(native.result).rejects.toThrow();
  }else{
   expect(terminal).toMatchObject({subtype:'success',is_error:false,structured_output:{answer:42,marker:'STRUCTURED_FIXTURE'}});
   expect((await native.result).structuredOutput).toEqual({answer:42,marker:'STRUCTURED_FIXTURE'});
   expect(rendered).toContain('{"answer":42,"marker":"STRUCTURED_FIXTURE"}');
  }
  const completion=emitted.mock.calls.find(([,event])=>event.eventType==='cc.stream.completed')![1];
  expect(completion.payload.hadErrors).toBe(mode==='repair'||mode==='exhaust');
  await owner.close();
  await writeFile(join(workspace!,'structured-output-app-evidence.json'),JSON.stringify({mode,queuedSchemaRestart:mode==='queued',sourceChat:true,sourceConsumer:true,nativeOwner:true,terminalMapped:true,presentationVerified:true,closed:true,qualification:'Actual source Chat action/query/owner/source consumer and schema forwarding; compiled/mounted UI, other native resume/reuse changes, other schemas/providers and default retry limits remain open.'},null,2));
 }finally{store.killAllHandles();}
},35000);
