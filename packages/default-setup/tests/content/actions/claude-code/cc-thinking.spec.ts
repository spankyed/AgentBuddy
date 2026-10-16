import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { query } from '../../../../src/features/code/be/services/claude-code/query.ts';
import { describe, expect, it, vi } from 'vitest';
import { mockService } from '@apackdev/testing/harness';
import { services, type Services } from '#generated/services.ts';
import { action } from '../../../../src/content/actions/claude-code/cc-command.ts';
function setup(options:{busy?:boolean;cwd?:string;absent?:boolean}={}) {
 const setThinking=vi.fn().mockResolvedValue(undefined),owner={busy:!!options.busy,closing:false,sessionCwd:options.cwd??'/selected',handle:{setThinking}};
 const conversation={owner},getConversation=vi.fn(()=>options.absent?undefined:conversation),writeSettings=vi.fn();
 mockService<Services,'cli'>('cli',{claudeCode:{getConversation,getWorkingDir:()=>'/selected',writeSettings} as never});
 mockService<Services,'chat'>('chat',{sendBlockMessage:vi.fn()});return {owner,setThinking,getConversation,writeSettings};
}
const run=(text?:string)=>action({command:'cc-thinking',threadId:'thinking-thread',text},services,{} as never,'thinking-flow');
describe('live thinking command',()=>{
 it.each([['2048',{budgetTokens:2048}],['default omitted',{budgetTokens:null,display:'omitted'}],['display default',{display:null}],['0 highlights',{budgetTokens:0,display:'highlights'}]])('maps %s without saving or claiming effective state',async(text,change)=>{
  const f=setup();expect((await run(text as string)).text).toContain('Effective behavior depends on the model');expect(f.setThinking).toHaveBeenCalledWith(change);expect(f.writeSettings).not.toHaveBeenCalled();
 });
 it.each(['','1.5','NaN','display','display unknown','2048 summarized extra'])('rejects malformed arguments %s before mutation',async text=>{
  const f=setup();expect((await run(text)).text).toContain('Usage:');expect(f.setThinking).not.toHaveBeenCalled();
 });
 it.each([{busy:true},{cwd:'/other'},{absent:true}])('requires an idle matching owner %j',async options=>{
  const f=setup(options);await run('2048');expect(f.setThinking).not.toHaveBeenCalled();
 });
 it('retains partial-refusal details without claiming rollback',async()=>{
  const f=setup();f.setThinking.mockRejectedValueOnce(new Error('highlights refused; budget applied'));
  const result=await run('4096 highlights');expect(result.text).toContain('budget applied');expect(result.text).toContain('may still apply');expect(f.writeSettings).not.toHaveBeenCalled();
 });
 it('reports replacement of the process during mutation',async()=>{
  const f=setup();f.setThinking.mockImplementationOnce(async()=>{f.getConversation.mockReturnValue(undefined)});
  expect((await run('2048')).text).toContain('effective state is unknown');
 });
});

it.skipIf(!process.env.CLAUDE_THINKING_TEST_BINARY)('preserves actual native display refusal in the source command without a model call or settings write',async()=>{
 const root=await mkdtemp(join(tmpdir(),'native-thinking-app-'));let requests=0;
 const server=createServer((_req,res)=>{requests++;res.writeHead(503);res.end('unexpected request');});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();if(!address||typeof address==='string')throw new Error('missing loopback address');
 let handle:Awaited<ReturnType<typeof query>>|undefined;
 try {
  const config=join(root,'home','.claude');await mkdir(config,{recursive:true});const settings=join(config,'settings.json'),before=JSON.stringify({apiKeyHelper:'/usr/bin/printf research-fixture-key',language:'preserve'});await writeFile(settings,before);
  handle=await query({cwd:root,cliPath:process.env.CLAUDE_THINKING_TEST_BINARY,model:'claude-sonnet-4-20250514',keepStdinOpen:true,noSessionPersistence:true,env:{PATH:process.env.PATH,HOME:join(root,'home'),CLAUDE_CONFIG_DIR:config,ANTHROPIC_BASE_URL:`http://127.0.0.1:${address.port}`,DISABLE_AUTOUPDATER:'1',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS:'1'}});await handle.initialized;
  const conversation={owner:{busy:false,closing:false,sessionCwd:root,handle}};
  mockService<Services,'cli'>('cli',{claudeCode:{getConversation:()=>conversation,getWorkingDir:()=>root} as never});mockService<Services,'chat'>('chat',{sendBlockMessage:vi.fn()});
  expect((await run('2048')).text).toContain('acknowledged');const refusal=await run('4096 highlights');expect(refusal.text).toContain('experimental betas are off');expect(refusal.text).toContain('max_thinking_tokens was applied');
  expect((await run('display summarized')).text).toContain('acknowledged');await handle.close();handle=undefined;
  expect(requests).toBe(0);expect(await readFile(settings,'utf8')).toBe(before);
 } finally {await handle?.close();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await rm(root,{recursive:true,force:true});}
},20000);
