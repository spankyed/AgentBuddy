import { expect, it, vi } from 'vitest';
import { mockService } from '@apackdev/testing/harness';
import { services, type Services } from '#generated/services.ts';
import { action } from '../../../../src/content/actions/claude-code/cc-command.ts';
const run=(text?:string)=>action({command:'cc-tasks',threadId:'task-thread',text},services,{} as never,'task-flow');
function setup(tasks:object[]=[]){const query=vi.fn(),owner={closing:false,sessionCwd:'/native-project',listObservedTasks:()=>tasks};mockService<Services,'cli'>('cli',{claudeCode:{getConversation:()=>({owner}),query} as never});mockService<Services,'chat'>('chat',{sendBlockMessage:vi.fn()});return {query,owner};}
it('shows observed native scope, unknown status and stale details without starting a process',async()=>{
 const f=setup([{id:'1',subject:'Fixture'},{id:'2',subject:'Changed',status:'completed',blockedBy:['1'],needsRefresh:true}]);const result=await run();expect(result.text).toContain('/native-project');expect(result.text).toContain('status not yet reported');expect(result.text).toContain('awaiting native read');expect(result.text).toContain('not a fresh read');expect(f.query).not.toHaveBeenCalled();
});
it('distinguishes no observations from an empty persisted list and unavailable owner',async()=>{
 const f=setup();expect((await run()).text).toContain('may be gated off');f.owner.closing=true;expect((await run()).text).toContain('unavailable');expect(f.query).not.toHaveBeenCalled();
});
it('rejects arguments instead of implying an unimplemented refresh or mutation',async()=>{const f=setup();expect((await run('refresh')).text).toContain('Usage:');expect(f.query).not.toHaveBeenCalled();});
