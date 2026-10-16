import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {mockService} from '@apackdev/testing/harness';
import {services,type Services} from '#generated/services.ts';
import {repository} from '#generated/repository.ts';
import {query} from '#features/code/be/services/claude-code/query.ts';
import * as store from '#features/code/be/services/claude-code/handle-store.ts';
import type {ClaudeConversationTurn} from '#features/code/be/services/claude-code/conversation.ts';
import type {StreamLine} from '#features/code/be/services/claude-code/types.ts';
import {consumeConversationTurn} from '../../../../src/content/actions/claude-code/_helpers/stream-consumer.ts';
import {chatService} from '#features/threads/be/services/chat.ts';
vi.mock('../../../../src/content/actions/claude-code/_helpers/context-usage.ts',()=>({refreshThreadContextUsage:vi.fn(async()=>{})}));
const executable=process.env.CLAUDE_RESEARCH_EXECUTABLE,workspace=process.env.CLAUDE_RESEARCH_WORKSPACE,endpoint=process.env.CLAUDE_RESEARCH_MODEL_URL,mode=process.env.CLAUDE_RESEARCH_STRUCTURED_MODE;
it.skipIf(!executable||!workspace||!endpoint||!mode)('preserves native structured output and source presentation across success, repair and exhaustion',async()=>{
 expect(['valid','repair','exhaust']).toContain(mode);expect(process.env.HOME).toBe(workspace);expect(new URL(endpoint!).hostname).toBe('127.0.0.1');
 const cwd=join(workspace!,'project');await mkdir(cwd);
 const {id}=repository.threadCommands.create({topic:'Native structured output',instructions:'',tags:[]});
 mockService<Services,'cli'>('cli',{claudeCode:{getConversation:store.getConversation,getHandle:store.getHandle,isCurrentTurn:store.isCurrentTurn,storeHandle:store.storeHandle,clearHandle:store.clearHandle} as never});
 const updates=vi.fn(chatService.updateMessageState),emitted=vi.fn();
 mockService<Services,'chat'>('chat',{...chatService,updateMessageState:updates});
 mockService<Services,'logger'>('logger',{debug:vi.fn(),info:vi.fn(),warn:vi.fn(),error:vi.fn()});
 mockService<Services,'threads'>('threads',{updateChatState:vi.fn()});
 mockService<Services,'emitter'>('emitter',{sendToSystem:emitted,broadcastToPlugin:vi.fn()});
 const schema={type:'object',properties:{answer:{type:'integer'},marker:{type:'string',const:'STRUCTURED_FIXTURE'}},required:['answer','marker'],additionalProperties:false};
 const native=await query({cwd,cliPath:executable,jsonSchema:schema,env:{...Object.fromEntries(Object.keys(process.env).map(key=>[key,undefined])),PATH:process.env.PATH,HOME:workspace,CLAUDE_CONFIG_DIR:join(workspace!,'.claude'),ANTHROPIC_BASE_URL:endpoint,DISABLE_AUTOUPDATER:'1',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',...(mode==='exhaust'?{MAX_STRUCTURED_OUTPUT_RETRIES:'2'}:{})},settingSources:[],settings:JSON.stringify({apiKeyHelper:'/usr/bin/printf research-fixture-key'}),model:'sonnet',tools:[],strictMcpConfig:true,keepStdinOpen:true,surfaceControlRequests:true,noSessionPersistence:true,maxTurns:8,signal:AbortSignal.timeout(25000)});
 const consume=(turn:ClaudeConversationTurn)=>consumeConversationTurn(turn,{services,threadId:id,text:'Structured fixture',sessionCwd:cwd});
 const owner=await store.openConversation(id,'structured-native-fixture',async()=>native,consume),events:StreamLine[]=[];
 owner.subscribe(event=>events.push(event));
 try{
  owner.start('Return only the fixed structured fixture.',consume);
  await vi.waitFor(()=>expect(events.some(event=>event.type==='result')).toBe(true),{timeout:15000});
  await vi.waitFor(()=>expect(emitted.mock.calls.some(([,event])=>event.eventType==='cc.stream.completed')).toBe(true),{timeout:5000});
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
  expect(completion.payload.hadErrors).toBe(mode!=='valid');
  await owner.close();
  await writeFile(join(workspace!,'structured-output-app-evidence.json'),JSON.stringify({mode,sourceConsumer:true,nativeOwner:true,terminalMapped:true,presentationVerified:true,closed:true,qualification:'Actual query/owner/source consumer, schema validation and text updates only. Chat action schema configuration, compiled/mounted UI, other schemas/providers and default retry limits remain open.'},null,2));
 }finally{store.killAllHandles();}
},15000);
