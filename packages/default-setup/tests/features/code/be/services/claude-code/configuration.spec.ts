import { expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getConfigurationSummary } from '#features/code/be/services/claude-code/configuration.ts';
it.each([false,true])('fresh configuration closes after native refusal=%s',async refusal=>{
 const cwd=await mkdtemp(join(tmpdir(),'configuration-fixture-')),cliPath=join(cwd,'fixture.mjs');
 try {
  const snapshot={effective:{model:'sonnet',env:{TOKEN:'secret-fixture'}},applied:{model:'native',effort:'low'},errors:[]};
  await writeFile(cliPath,`#!${process.execPath}
import {createInterface} from 'node:readline';import {writeFileSync} from 'node:fs';const requests=[];
const input=createInterface({input:process.stdin});input.on('line',line=>{const value=JSON.parse(line);requests.push(value);const init=value.request.subtype==='initialize';const response=${refusal}&&!init?{subtype:'error',request_id:value.request_id,error:'configuration refused'}:{subtype:'success',request_id:value.request_id,response:init?{commands:[],agents:[],models:[]}:${JSON.stringify(snapshot)}};console.log(JSON.stringify({type:'control_response',response}));});input.on('close',()=>writeFileSync('capture.json',JSON.stringify(requests)));`,{mode:0o755});
  const pending=getConfigurationSummary({cwd,cliPath,env:{PATH:process.env.PATH,HOME:cwd}});if(refusal)await expect(pending).rejects.toThrow('configuration refused');else await expect(pending).resolves.toMatchObject({configuredModel:'sonnet',appliedModel:'native',appliedEffort:'low',configurationErrorCount:0});
  const requests=JSON.parse(await readFile(join(cwd,'capture.json'),'utf8'));expect(requests.map((value:{request:unknown})=>value.request)).toEqual([expect.objectContaining({subtype:'initialize'}),{subtype:'get_settings'}]);
 } finally {await rm(cwd,{recursive:true,force:true});}
});
it('rejects invalid discovery options before launching',async()=>{
 await expect(getConfigurationSummary({cwd:'/private-fixture',prompt:'must not send'} as never)).rejects.toThrow('unsupported configuration summary options: prompt');
});
