import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {mockService,startApp,importFlows,type TestApp} from '@apackdev/testing/harness';
import {importCompiledContent} from '@apackdev/sdk/utils';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {actionLabel} from '../../../_support/flows.ts';
import {getClaudeState} from '../../../../src/content/actions/claude-code/_helpers/thread-context.ts';
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
const compiled=process.env.CLAUDE_RESEARCH_COMPILED_FLOW==='1';
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
 if(!compiled)mockService<Services,'emitter'>('emitter',{sendToSystem:emitted,broadcastToPlugin:vi.fn()});
 const replay=vi.fn(async(_label:string,params:Record<string,any>)=>chat(params,services,{} as never,''));
 if(!compiled)mockService<Services,'action'>('action',{executeIfFound:replay});
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
 let app:TestApp|undefined;
 if(compiled){
  const compiledDir=resolve(import.meta.dirname,'../../../../dist/runtime/content');
  importCompiledContent({compiledDir,include:{flows:new Set(),library:new Set(),notes:new Set(),settings:new Set()}});
  const flows=JSON.parse(readFileSync(resolve(compiledDir,'flows.content.json'),'utf8'));importFlows({'Claude Code':{...flows['Claude Code'],root:true}});
  app=await startApp({systems:['brain']});await app.runFlow('Claude Code');
 }
 const invoke=async(text:string,jsonSchema:unknown)=>{
  if(!app)return chat({threadId:id,text,jsonSchema},services,{} as never,'');
  const run=await app.runFlow('Claude Code',{event:'user.message',data:{threadId:id,text,jsonSchema,mode:'Claude Code'}});
  expect(run.steps.map(actionLabel)).toContain('Claude Code Chat');return {streaming:true};
 };
 try{
  expect(await invoke('Return only the fixed structured fixture.',schema)).toMatchObject({streaming:true});
  if(mode==='queued'){const queued=await invoke('Second queued structured input',queuedSchema);if(!compiled)expect(queued).toMatchObject({queued:true});expect(getClaudeState(services,id)?.queuedMessage?.jsonSchema).toEqual(queuedSchema);await writeFile(join(workspace!,'queued-schema-ready'),'ready');}
  const replayFailure=()=>compiled?(repository.chatQueries.threadData(id)?.messages??[]).find(message=>message.text?.includes("Couldn't handle queued message:"))?.text:undefined;
  await vi.waitFor(()=>expect(events.filter(event=>event.type==='result').length===(mode==='queued'?2:1)||!!replayFailure()).toBe(true),{timeout:12000});
  if(replayFailure())throw new Error(`Compiled queue replay failed: ${replayFailure()}`);
  if(!compiled)await vi.waitFor(()=>expect(emitted.mock.calls.filter(([,event])=>event.eventType==='cc.stream.completed')).toHaveLength(mode==='queued'?2:1),{timeout:5000});
  if(compiled)await vi.waitFor(()=>expect(getClaudeState(services,id)?.turns).toBe(mode==='queued'?2:1));
  expect(opened).toHaveBeenCalledTimes(mode==='queued'?2:1);
  if(mode==='queued'){if(!compiled)expect(replay).toHaveBeenCalledOnce();expect(owners[0]).not.toBe(owners[1]);expect(owners[0].closing).toBe(true);await owners[0].done;}
  const terminal=events.find(event=>event.type==='result')!;
  const rendered=compiled?(repository.chatQueries.threadData(id)?.messages??[]).map(message=>message.text??''):updates.mock.calls.map(([,patch])=>patch.text).filter((text):text is string=>typeof text==='string');
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
  if(!compiled){const completion=emitted.mock.calls.find(([,event])=>event.eventType==='cc.stream.completed')![1];expect(completion.payload.hadErrors).toBe(mode==='repair'||mode==='exhaust');}
  await owner.close();
  await writeFile(join(workspace!,'structured-output-app-evidence.json'),JSON.stringify({mode,queuedSchemaRestart:mode==='queued',compiledFlow:compiled,sourceChat:!compiled,sourceConsumer:!compiled,nativeOwner:true,terminalMapped:true,presentationVerified:true,closed:true,qualification:compiled?'Actual compiled Claude Code flow/action, native query/owner and completion accounting; mounted UI, broader schemas/providers and remaining native variants unverified.':'Actual source Chat action/query/owner/source consumer and schema forwarding; compiled/mounted UI, other native resume/reuse changes, other schemas/providers and default retry limits remain open.'},null,2));
 }finally{store.killAllHandles();}
},15000);
