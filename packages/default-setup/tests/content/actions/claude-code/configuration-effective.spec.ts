import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { query } from '../../../../src/features/code/be/services/claude-code/query.ts';
import { getConfigurationSummary } from '../../../../src/features/code/be/services/claude-code/configuration.ts';
import { expect, it, vi } from 'vitest';
import { mockService } from '@apackdev/testing/harness';
import { services, type Services } from '#generated/services.ts';
import { action } from '../../../../src/content/actions/claude-code/cc-command.ts';
const summary={configuredModel:'sonnet',perModelEffort:'low',appliedModel:'native-model',appliedEffort:'low',configurationErrorCount:0};
function setup(cwd?:string){const live=vi.fn().mockResolvedValue(summary),fresh=vi.fn().mockResolvedValue(summary),read=vi.fn(()=>{throw Error('raw settings must not be read')});mockService<Services,'cli'>('cli',{claudeCode:{getWorkingDir:()=>'/selected',getConversation:()=>cwd?{owner:{sessionCwd:cwd,handle:{getConfigurationSummary:live}}}:undefined,getConfigurationSummary:fresh,readSettings:read} as never});mockService<Services,'chat'>('chat',{sendBlockMessage:vi.fn()});return {live,fresh,read};}
const run=(text='effective')=>action({command:'cc-config',threadId:'config-thread',text},services,{} as never,'config-flow');
it('reports parsed and applied fields from a matching native process without reading raw user settings',async()=>{const f=setup('/selected'),result=await run();expect(result.text).toContain('Parsed effort for applied model: low');expect(result.text).toContain('Native applied model: native-model');expect(result.data).toEqual(summary);expect(f.live).toHaveBeenCalledOnce();expect(f.read).not.toHaveBeenCalled();expect(f.fresh).not.toHaveBeenCalled();});
it.each([undefined,'/other'])('requires explicit startup without a matching owner (%s)',async cwd=>{const f=setup(cwd);expect((await run()).text).toContain('session hooks');expect(f.fresh).not.toHaveBeenCalled();expect((await run('effective start')).text).toContain('Temporary native process');expect(f.fresh).toHaveBeenCalledWith({cwd:'/selected'});expect(f.read).not.toHaveBeenCalled();});
it('rejects arguments before access and preserves native refusal',async()=>{const f=setup('/selected');expect((await run('effective start extra')).text).toContain('Usage:');expect(f.live).not.toHaveBeenCalled();f.live.mockRejectedValueOnce(new Error('not available on this connection'));expect((await run()).text).toContain('not available on this connection');expect(f.read).not.toHaveBeenCalled();});

it.skipIf(!process.env.CLAUDE_CONFIGURATION_TEST_BINARY)('compares actual native parsed/applied effort without returning fixture secrets',async()=>{
 const root=await mkdtemp(join(tmpdir(),'native-configuration-app-'));let requests=0;
 const server=createServer((_req,res)=>{requests++;res.writeHead(503);res.end('unexpected model call');});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('missing loopback address');
 let handle:Awaited<ReturnType<typeof query>>|undefined;
 try {
  const config=join(root,'home','.claude');await mkdir(config,{recursive:true});const settings=join(config,'settings.json');
  const nativeEnvironment: NodeJS.ProcessEnv = Object.fromEntries(Object.keys(process.env).map(key => [key, undefined]));
  Object.assign(nativeEnvironment, {PATH:process.env.PATH,HOME:join(root,'home'),CLAUDE_CONFIG_DIR:config,ANTHROPIC_BASE_URL:`http://127.0.0.1:${address.port}`,DISABLE_AUTOUPDATER:'1',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1'});
  const options={cwd:root,cliPath:process.env.CLAUDE_CONFIGURATION_TEST_BINARY,env:nativeEnvironment};
  for(const effort of ['low','max']){
   const before=JSON.stringify({model:'sonnet',apiKeyHelper:'/usr/bin/printf research-fixture-key',env:{CLAUDE_RESEARCH_SECRET:'secret-fixture-sentinel'},modelSettings:{'claude-sonnet-5-5':{effortLevel:effort}}});await writeFile(settings,before);
   handle=await query({...options,keepStdinOpen:true,noSessionPersistence:true});await handle.initialized;const conversation={owner:{sessionCwd:root,handle}};
   mockService<Services,'cli'>('cli',{claudeCode:{getWorkingDir:()=>root,getConversation:()=>conversation,readSettings:()=>{throw Error('raw settings must not be read')}} as never});mockService<Services,'chat'>('chat',{sendBlockMessage:vi.fn()});
   const result=await run();expect(result.data.perModelEffort).toBe(effort==='low'?'low':undefined);expect(result.data.appliedEffort).toBe(effort==='low'?'low':'medium');expect(JSON.stringify(result)).not.toContain('secret-fixture-sentinel');expect(result.data).not.toHaveProperty('effective');
   await handle.close();handle=undefined;const fresh=await getConfigurationSummary(options);expect(fresh).toEqual(result.data);expect(await readFile(settings,'utf8')).toBe(before);
  }
  expect(requests).toBe(0);
 } finally {await handle?.close();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await rm(root,{recursive:true,force:true});}
},20000);
