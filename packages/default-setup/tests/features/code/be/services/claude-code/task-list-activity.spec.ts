import { describe, expect, it } from 'vitest';
import { createClaudeTaskListActivity } from '#features/code/be/services/claude-code/task-list-activity.ts';
import type { StreamLine } from '#features/code/be/services/claude-code/types.ts';
const task={id:'1',subject:'Fixture',status:'pending',blockedBy:['2'],blocks:[]};
function setup(){const tracker=createClaudeTaskListActivity();const observe=(line:unknown)=>tracker.observe(line as StreamLine);return {tracker,observe,call:(id:string,name:string,input={})=>observe({type:'assistant',message:{content:[{type:'tool_use',id,name,input}]}}),reply:(id:string,value:unknown,extra={})=>observe({type:'user',message:{content:[{type:'tool_result',tool_use_id:id,content:'Do not parse display text'}]},tool_use_result:value,...extra})};}
describe('native task observations',()=>{
 it('correlates summaries, snapshots and status changes without inferring a create status',()=>{
  const f=setup();f.call('create','TaskCreate');f.reply('create',{task:{id:'1',subject:'Fixture'}});expect(f.tracker.list()).toEqual([{id:'1',subject:'Fixture'}]);
  f.call('get','TaskGet',{taskId:'1'});f.reply('get',{task});f.call('update','TaskUpdate',{taskId:'1'});f.reply('update',{success:true,taskId:'1',updatedFields:['status'],statusChange:{from:'pending',to:'in_progress'}});expect(f.tracker.list()[0].status).toBe('in_progress');
  f.call('edit','TaskUpdate',{taskId:'1'});f.reply('edit',{success:true,taskId:'1',updatedFields:['subject']});expect(f.tracker.list()[0]).toMatchObject({subject:'Fixture',needsRefresh:true});
  f.call('list','TaskList');f.reply('list',{tasks:[{...task,status:'completed'}]});expect(f.tracker.list()[0]).toMatchObject({status:'completed'});expect(f.tracker.list()[0].needsRefresh).toBeUndefined();
 });
 it('uses missing-task metadata to remove a record and never creates a task from an update',()=>{
  const f=setup();f.call('list','TaskList');f.reply('list',{tasks:[task]});f.call('missing','TaskGet',{taskId:'1'});f.reply('missing',{task:null});expect(f.tracker.list()).toEqual([]);
  f.call('unknown','TaskUpdate',{taskId:'1'});f.reply('unknown',{success:true,taskId:'1',updatedFields:['status'],statusChange:{from:'pending',to:'completed'}});expect(f.tracker.list()).toEqual([]);
 });
 it('rejects uncorrelated, errored, child, replay and ambiguous outer metadata',()=>{
  const f=setup();f.reply('unknown',{task});f.call('get','TaskGet',{taskId:'1'});f.reply('get',{task},{parent_tool_use_id:'agent'});expect(f.tracker.list()).toEqual([]);
  f.reply('get',{task},{isReplay:true});expect(f.tracker.list()).toEqual([]);
  f.observe({type:'user',message:{content:[{type:'tool_result',tool_use_id:'get',is_error:true}]},tool_use_result:{task}});expect(f.tracker.list()).toEqual([]);
  f.call('a','TaskGet',{taskId:'1'});f.call('b','TaskGet',{taskId:'2'});f.observe({type:'user',message:{content:[{type:'tool_result',tool_use_id:'a'},{type:'tool_result',tool_use_id:'b'}]},tool_use_result:{task}});expect(f.tracker.list()).toEqual([]);
 });
 it('does not replace snapshots on malformed/duplicate IDs or mismatched task identity',()=>{
  const f=setup();f.call('list','TaskList');f.reply('list',{tasks:[task]});f.call('get','TaskGet',{taskId:'1'});f.reply('get',{task:{...task,id:'2'}});expect(f.tracker.list()[0].id).toBe('1');
  f.call('duplicate','TaskList');f.reply('duplicate',{tasks:[task,task]});f.call('malformed','TaskList');f.reply('malformed',{tasks:[{id:'1'}]});expect(f.tracker.list()).toHaveLength(1);
 });
 it('returns isolated known-field copies and clears scope on session change and close',()=>{
  const f=setup();f.observe({type:'system',subtype:'init',session_id:'first'});f.call('list','TaskList');f.reply('list',{tasks:[{...task,metadata:{private:true}}]});const snapshot=f.tracker.list();snapshot[0].blockedBy!.push('foreign');expect(f.tracker.list()[0].blockedBy).toEqual(['2']);expect(f.tracker.list()[0]).not.toHaveProperty('metadata');
  f.observe({type:'system',subtype:'init',session_id:'second'});expect(f.tracker.list()).toEqual([]);f.call('again','TaskList');f.reply('again',{tasks:[task]});f.tracker.close();f.reply('again',{tasks:[task]});expect(f.tracker.list()).toEqual([]);
 });
 it('retires pending identities at turn end and rejects identity rebinding',()=>{
  const f=setup();f.call('old','TaskGet',{taskId:'1'});f.observe({type:'result'});f.reply('old',{task});expect(f.tracker.list()).toEqual([]);
  f.call('same','TaskGet',{taskId:'1'});expect(()=>f.call('same','TaskGet',{taskId:'2'})).toThrow('changed identity');
 });
});
