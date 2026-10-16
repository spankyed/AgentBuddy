import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { query } from '../../../../src/features/code/be/services/claude-code/query.ts';
import { getUsage } from '../../../../src/features/code/be/services/claude-code/usage.ts';
import { describe, expect, it, vi } from 'vitest';
import { mockService } from '@apackdev/testing/harness';
import { services, type Services } from '#generated/services.ts';
import { action } from '../../../../src/content/actions/claude-code/cc-command.ts';
const snapshot={session:{total_cost_usd:0.125,total_api_duration_ms:12,total_duration_ms:40,total_lines_added:2,total_lines_removed:1,model_usage:{fixture:{inputTokens:12}}},subscription_type:null,rate_limits_available:false,rate_limits:null,behaviors:null};
function setup(cwd?:string){
 const live=vi.fn().mockResolvedValue(snapshot),fresh=vi.fn().mockResolvedValue(snapshot);
 mockService<Services,'cli'>('cli',{claudeCode:{getWorkingDir:()=>'/selected',getConversation:()=>cwd?{owner:{sessionCwd:cwd,handle:{getUsage:live}}}:undefined,getUsage:fresh} as never});
 mockService<Services,'chat'>('chat',{sendBlockMessage:vi.fn()});return {live,fresh};
}
const run=(text?:string)=>action({command:'cc-usage',threadId:'usage-thread',text},services,{} as never,'usage-flow');
describe('native usage command',()=>{
 it('reads the live session and distinguishes unavailable limits from zero',async()=>{
  const f=setup('/selected'),result=await run();expect(result.text).toContain('Native session cost: $0.125');expect(result.text).toContain('Account rate limits: (unavailable)');expect(result.text).not.toContain('behavior aggregates');expect(f.live).toHaveBeenCalledWith({includeBehaviors:false});expect(f.fresh).not.toHaveBeenCalled();
 });
 it.each([undefined,'/other'])('requires explicit startup when owner directory is %s',async cwd=>{
  const f=setup(cwd);expect((await run()).text).toContain('session hooks');expect(f.fresh).not.toHaveBeenCalled();expect(f.live).not.toHaveBeenCalled();
  expect((await run('start')).text).toContain('not the saved conversation totals');expect(f.fresh).toHaveBeenCalledWith({cwd:'/selected',includeBehaviors:false});
 });
 it('only includes behavior aggregates when explicitly requested',async()=>{
  const f=setup('/selected');f.live.mockResolvedValueOnce({...snapshot,rate_limits_available:true,rate_limits:{five_hour:{utilization:0}},behaviors:{day:{count:3}}});const result=await run('behaviors');expect(f.live).toHaveBeenCalledWith({includeBehaviors:true});expect(result.text).toContain('"utilization": 0');expect(result.text).toContain('"count": 3');
 });
 it('rejects unknown arguments before accessing native state and reports native failure',async()=>{
  const f=setup('/selected');expect((await run('extra')).text).toContain('Usage:');expect(f.live).not.toHaveBeenCalled();f.live.mockRejectedValueOnce(new Error('native usage unavailable'));expect((await run()).text).toContain('native usage unavailable');
 });
});

it.skipIf(!process.env.CLAUDE_USAGE_TEST_BINARY)('reads actual private native usage through the command and fresh wrapper without model calls',async()=>{
 const root=await mkdtemp(join(tmpdir(),'native-usage-app-'));let requests=0;
 const server=createServer((_req,res)=>{requests++;res.writeHead(503);res.end('unexpected request');});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('missing loopback address');
 let handle:Awaited<ReturnType<typeof query>>|undefined;
 try {
  const config=join(root,'home','.claude');await mkdir(config,{recursive:true});const settings=join(config,'settings.json'),before=JSON.stringify({apiKeyHelper:'/usr/bin/printf research-fixture-key',language:'preserve'});await writeFile(settings,before);
  const options={cwd:root,cliPath:process.env.CLAUDE_USAGE_TEST_BINARY,env:{PATH:process.env.PATH,HOME:join(root,'home'),CLAUDE_CONFIG_DIR:config,ANTHROPIC_BASE_URL:`http://127.0.0.1:${address.port}`,DISABLE_AUTOUPDATER:'1',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1'}};
  handle=await query({...options,keepStdinOpen:true,noSessionPersistence:true});await handle.initialized;const conversation={owner:{sessionCwd:root,handle}};
  mockService<Services,'cli'>('cli',{claudeCode:{getWorkingDir:()=>root,getConversation:()=>conversation} as never});mockService<Services,'chat'>('chat',{sendBlockMessage:vi.fn()});
  expect((await run()).text).toContain('Account rate limits: (unavailable)');expect((await run('behaviors')).text).toContain('Native behavior aggregates: (unavailable)');await handle.close();handle=undefined;
  const fresh=await getUsage(options);expect(fresh.session.total_cost_usd).toBe(0);expect(fresh.rate_limits_available).toBe(false);expect(fresh.rate_limits).toBeNull();
  expect(requests).toBe(0);expect(await readFile(settings,'utf8')).toBe(before);
 } finally {await handle?.close();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await rm(root,{recursive:true,force:true});}
},20000);
