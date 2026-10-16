import { expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getUsage } from '#features/code/be/services/claude-code/usage.ts';
it.each([false,true])('fresh usage closes after native refusal=%s',async refusal=>{
 const cwd=await mkdtemp(join(tmpdir(),'usage-fixture-')),cliPath=join(cwd,'fixture.mjs');
 try {
  const snapshot={session:{total_cost_usd:0,total_api_duration_ms:0,total_duration_ms:1,total_lines_added:0,total_lines_removed:0,model_usage:{}},subscription_type:null,rate_limits_available:false,rate_limits:null,behaviors:null};
  await writeFile(cliPath,`#!${process.execPath}
import {createInterface} from 'node:readline';import {writeFileSync} from 'node:fs';const requests=[];
const input=createInterface({input:process.stdin});input.on('line',line=>{const value=JSON.parse(line);requests.push(value);const init=value.request.subtype==='initialize';const response=${refusal}&&!init?{subtype:'error',request_id:value.request_id,error:'usage refused'}:{subtype:'success',request_id:value.request_id,response:init?{commands:[],agents:[],models:[]}:${JSON.stringify(snapshot)}};console.log(JSON.stringify({type:'control_response',response}));});input.on('close',()=>writeFileSync('capture.json',JSON.stringify(requests)));`,{mode:0o755});
  const pending=getUsage({cwd,cliPath,env:{PATH:process.env.PATH,HOME:cwd},includeBehaviors:true});if(refusal)await expect(pending).rejects.toThrow('usage refused');else await expect(pending).resolves.toEqual(snapshot);
  const requests=JSON.parse(await readFile(join(cwd,'capture.json'),'utf8'));expect(requests.map((value:{request:unknown})=>value.request)).toEqual([expect.objectContaining({subtype:'initialize'}),{subtype:'get_usage',skip_behaviors:false}]);
 } finally {await rm(cwd,{recursive:true,force:true});}
});
it('rejects invalid discovery options before launching',async()=>{
 await expect(getUsage({cwd:'/private-fixture',prompt:'must not send'} as never)).rejects.toThrow('unsupported usage options: prompt');
 await expect(getUsage({cwd:'/private-fixture',includeBehaviors:'invalid'} as never)).rejects.toThrow();
});
