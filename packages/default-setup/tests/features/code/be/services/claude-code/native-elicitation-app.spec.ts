import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { importCompiledContent } from '@apackdev/sdk/utils';
import { importFlows, startApp } from '@apackdev/testing/harness';
import { services } from '#generated/services.ts';
import { repository } from '#generated/repository.ts';
import * as store from '#features/code/be/services/claude-code/handle-store.ts';
import * as runner from '#features/code/be/services/claude-code/runner.ts';
import { getClaudeState } from '../../../../../../src/content/actions/claude-code/_helpers/thread-context.ts';
const executable=process.env.CLAUDE_RESEARCH_EXECUTABLE,workspace=process.env.CLAUDE_RESEARCH_WORKSPACE,server=process.env.CLAUDE_RESEARCH_MCP_SERVER;
it.skipIf(!executable||!workspace||!server)('routes native URL elicitation choices through compiled app interactions independently of tool approval',async()=>{
 expect(process.env.HOME).toBe(workspace);for(const key of ['ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','CLAUDE_CODE_OAUTH_TOKEN'])expect(process.env[key]).toBeUndefined();
 const cwd=join(workspace!,'project');await mkdir(cwd,{recursive:true});await writeFile(join(workspace!,'.claude','settings.json'),JSON.stringify({apiKeyHelper:'/usr/bin/printf research-fixture-key'}));
 const capture=join(workspace!,'mcp-input.jsonl');
 services.settings.set({kind:'feature',featureRef:'default-setup/code'},['cliPaths','claude-code'],executable!);
 const compiledDir=resolve(import.meta.dirname,'../../../../../../dist/runtime/content');importCompiledContent({compiledDir,include:{flows:new Set(),library:new Set(),notes:new Set(),settings:new Set()}});
 const flows=JSON.parse(readFileSync(join(compiledDir,'flows.content.json'),'utf8'));importFlows({'Claude Code':{...flows['Claude Code'],root:true}});
 const app=await startApp({systems:['brain']});await app.runFlow('Claude Code');const streams=vi.spyOn(runner,'spawnStream');const cases: Array<{choice:string;mode:string;serverAnswer:unknown;sameOwner:boolean;closed:boolean}>=[];
 try{
  for(const choice of ['accept','decline','cancel','form-unsupported']){
   const mode=choice==='form-unsupported'?'form':'url';
   execFileSync(executable!,['mcp','add-json','research',JSON.stringify({type:'stdio',command:process.execPath,args:[server!,capture,mode]}),'--scope','user'],{cwd,env:process.env,timeout:10000});
   let priorCapture='';try{priorCapture=await readFile(capture,'utf8')}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
   const{id}=repository.threadCommands.create({topic:'MCP elicitation '+choice,instructions:'',tags:[]});repository.threadCommands.update(id,{context:{claudeCode:{cwd,permissionMode:'default'}}});
   const state=()=>getClaudeState(services,id);const user=repository.chatCommands.addMessage({threadId:id,sender:'user',text:'Run the local research echo fixture once.'});
   await app.runFlow('Claude Code',{event:'user.message',data:{threadId:id,text:user.text,messageId:user.id,mode:'Claude Code',phase:'Edit'}});
   await vi.waitFor(()=>expect(state()?.pendingControlRequest?.toolName).toBe('mcp__research__echo'),{timeout:15000});const owner=store.getConversation(id)!.owner;
   const permission=state()!.pendingControlRequest!;await app.runFlow('Claude Code',{event:'interactive.message.response',data:{threadId:id,messageId:permission.approvalMessageId,response:{approved:true}}});
   if(mode==='url'){
    await vi.waitFor(()=>expect(state()?.pendingElicitation).toBeDefined(),{timeout:15000});const pending=state()!.pendingElicitation!;expect(state()?.pendingControlRequest).toBeUndefined();expect(store.isConversationBusy(id)).toBe(true);
    const message=repository.chatQueries.threadData(id)?.messages?.find(value=>value.id===pending.approvalMessageId);expect(message?.text).toContain('MCP server research');
    expect(message?.blocks).toEqual(expect.arrayContaining([expect.objectContaining({type:'link',props:expect.objectContaining({links:expect.arrayContaining([expect.objectContaining({label:'https://example.invalid/research-elicitation'})])})}),expect.objectContaining({type:'button-group'})]));
    await app.runFlow('Claude Code',{event:'interactive.message.response',data:{threadId:id,messageId:pending.approvalMessageId,response:{buttonId:choice}}});
   }
   await vi.waitFor(()=>expect(state()?.turns).toBe(1),{timeout:15000});await vi.waitFor(()=>expect(store.isConversationBusy(id)).toBe(false));expect(state()?.pendingElicitation).toBeUndefined();expect(store.getConversation(id)?.owner).toBe(owner);
   const inputs=(await readFile(capture,'utf8')).slice(priorCapture.length).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));const answer=inputs.find(value=>value.id==='fixture-elicitation'&&value.result)?.result;expect(answer).toEqual({action:mode==='form'?'cancel':choice});
   if(mode==='form')expect(repository.chatQueries.threadData(id)?.messages?.some(message=>message.text?.includes('Form input is not supported yet'))).toBe(true);
   expect(await store.closeIdleConversation(id)).toBe(true);cases.push({choice,mode,serverAnswer:answer,sameOwner:true,closed:true});
   execFileSync(executable!,['mcp','remove','research','--scope','user'],{cwd,env:process.env,timeout:10000});
  }
  expect(streams).toHaveBeenCalledTimes(4);await writeFile(join(workspace!,'elicitation-app-evidence.json'),JSON.stringify({compiledFlow:true,productionLaunchService:true,separateToolApproval:true,explicitUserChoices:true,urlNeverOpened:true,nativeProcesses:4,cases},null,2));
 }finally{store.killAllHandles()}
},90000);
