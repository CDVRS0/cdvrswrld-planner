import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAYS_CONFIG } from '../src/data/days.js';
import { dailyActions, changeDayActions, planningDay } from '../src/lib/daily-actions.js';
import { updateCloudAction } from '../src/lib/daily-cloud.js';
import { carryCandidates } from '../src/lib/handoff.js';
const date = '2026-10-26';
const fresh = () => ({ blocks: DAYS_CONFIG[0].blocks.map(b => ({ ...b, tasks: b.tasks.map(text => ({ text, done: false })) })), record: { plan: { commitments: '10:00 Meeting' }, handoff: { summary: 'Keep this context' } }, calendarEvents: [{ id: 'cal', title: 'Meeting' }] });
const task = (id, fields = {}) => ({ id, title: id, source: 'manual', status: 'todo', updated_at: 'v1', scheduled_date: date, ...fields });
test('legacy and new OS templates never inflate the daily task count or carry-forward', () => {
 for (let i=0;i<7;i++) { const day={blocks:DAYS_CONFIG[i].blocks.map(b=>({...b,tasks:b.tasks.map(text=>({text,done:false}))}))}; const d=`2026-10-${26+i <= 31 ? 26+i : 1}`; const selected=i===6?'2026-11-01':d;
  assert.equal(dailyActions(day,selected).unfinished.length,0);
  assert.equal(carryCandidates(day,selected).length,0);
 }
 const day=fresh();day.blocks[0].tasks[0].source='os-prompt';assert.equal(dailyActions(day,date).unfinished.length,0);
});
test('manual tasks matching a prompt still count; legacy custom and duplicate actions are preserved',()=>{
 const day=fresh();day.blocks[0].tasks.push({id:'manual',source:'manual',text:'Energy check',done:false},{text:'Call client',done:false},{text:'Call client',done:false});
 const model=dailyActions(day,date);assert.equal(model.unfinished.length,3);assert.equal(new Set(model.unfinished.map(t=>t.key)).size,3);assert.equal(day.blocks[0].tasks.length,9);
});
test('today, completed, overdue backlog, unscheduled and future tasks remain distinct without migration duplicates',()=>{
 const m=dailyActions(fresh(),date,[task('today'),task('done',{status:'done'}),task('overdue',{scheduled_date:'2026-10-25'}),task('unscheduled',{scheduled_date:null}),task('future',{scheduled_date:'2026-10-27'}),task('migration',{source:'migration'}),task('deleted',{status:'cancelled'})]);
 assert.deepEqual(m.unfinished.map(t=>t.id),['today']);assert.equal(m.completed.length,1);assert.deepEqual(m.backlog.map(t=>t.id),['overdue','unscheduled']);assert.equal(m.deleted.length,1);
});
test('only three distinct explicitly chosen unfinished priorities are shown',()=>{
 const day=fresh();day.record.plan.priorityKeys=['cloud:one','cloud:one','cloud:done','cloud:two','cloud:three','cloud:four'];
 assert.deepEqual(dailyActions(day,date,[task('one'),task('two'),task('three'),task('four'),task('done',{status:'done'})]).priorities.map(t=>t.id),['one','two','three']);
});
test('fresh start soft deletes only selected unfinished real actions and restores them without losing records',()=>{
 const day=fresh();day.blocks[1].tasks.push({id:'a',source:'manual',text:'Draft',done:false},{id:'b',source:'manual',text:'Completed',done:true});
 const model=dailyActions(day,date);const next=changeDayActions(day,date,[...model.unfinished,...model.completed].map(t=>t.key),'delete');
 assert.equal(dailyActions(next,date).unfinished.length,0);assert.equal(dailyActions(next,date).completed.length,1);assert.equal(dailyActions(next,date).deleted.length,1);
 assert.deepEqual(next.calendarEvents,day.calendarEvents);assert.equal(next.record.plan.commitments,'10:00 Meeting');assert.equal(next.record.handoff.summary,'Keep this context');assert.equal(day.blocks[1].tasks.at(-2).dismissed,undefined);
 const restored=changeDayActions(next,date,model.unfinished.map(t=>t.key),'restore');assert.equal(dailyActions(restored,date).unfinished.length,1);
 assert.deepEqual(changeDayActions(restored,date,['local:unknown'],'delete'),restored);
});
test('carried actions can be removed and restored without changing their source day or reoffering deleted items',()=>{
 const day=fresh();day.record.handoff.incoming={x:{id:'x',kind:'action',text:'Carry action',sourceDate:'2026-10-25',done:false},note:{id:'note',kind:'note',text:'Context',sourceDate:'2026-10-25'}};
 const next=changeDayActions(day,date,['incoming:x'],'delete');assert.equal(dailyActions(next,date).unfinished.length,0);assert.equal(next.record.handoff.incoming.note.text,'Context');assert.equal(carryCandidates(next,date).some(t=>t.id==='x'),false);
 assert.equal(dailyActions(changeDayActions(next,date,['incoming:x'],'restore'),date).unfinished.length,1);
});
test('AI planning context excludes prompts and deleted actions while preserving notes and schedule',()=>{
 const day=fresh();day.blocks[0].tasks.push({text:'User action',source:'manual',done:false},{text:'Deleted',source:'manual',dismissed:true});const result=planningDay(day,date);
 assert.deepEqual(result.blocks.flatMap(b=>b.tasks).map(t=>t.text),['User action']);assert.deepEqual(result.calendarEvents,day.calendarEvents);assert.equal(result.record.handoff.summary,day.record.handoff.summary);
});
test('cloud task mutations are owner scoped and compare version and status; stale or forbidden writes fail',async()=>{
 const filters=[];let response={data:[{id:'owned'}],error:null};const q={update(v){assert.equal(v.status,'cancelled');return q;},eq(k,v){filters.push([k,v]);return q;},select(){return Promise.resolve(response);}};const client={from(name){assert.equal(name,'planner_tasks');return q;}};
 await updateCloudAction(client,'owner',task('owned'),{status:'cancelled'});assert.deepEqual(filters,[['user_id','owner'],['id','owned'],['updated_at','v1'],['status','todo']]);
 response={data:[],error:null};await assert.rejects(()=>updateCloudAction(client,'owner',task('owned'),{status:'cancelled'}),/changed on another device/);
 response={data:null,error:{message:'denied'}};await assert.rejects(()=>updateCloudAction(client,'owner',task('owned'),{status:'cancelled'}),/denied/);
});

test('removing a carried cloud action dismisses this day’s reference without cancelling its original task',()=>{
 const original=task('earlier',{scheduled_date:'2026-10-25'});const day=fresh();day.record.handoff.incoming={link:{id:'link',taskId:'earlier',kind:'action',text:'Earlier',sourceDate:'2026-10-25',done:false}};
 const m=dailyActions(day,date,[original]);assert.equal(m.unfinished.length,1);assert.equal(m.unfinished[0].kind,'incoming');assert.equal(m.unfinished[0].linkedTask.id,'earlier');
 const removed=changeDayActions(day,date,['incoming:link'],'delete');assert.equal(dailyActions(removed,date,[original]).unfinished.length,0);assert.equal(original.status,'todo');assert.equal(original.scheduled_date,'2026-10-25');
 assert.equal(dailyActions(changeDayActions(removed,date,['incoming:link'],'restore'),date,[original]).unfinished.length,1);
});

test('earlier real OS actions enter the backlog without default prompts or edits to the source day',()=>{
 const source={...fresh(),blocks:DAYS_CONFIG[6].blocks.map(b=>({...b,tasks:b.tasks.map(text=>({text,done:false}))}))};source.blocks[0].tasks.push({id:'earlier',source:'manual',text:'Finish the mix',done:false});
 const weeks={'2026-10-19':{days:{'2026-10-25':source}}};const day=fresh();const model=dailyActions(day,date,[],weeks);
 assert.equal(model.backlog.length,1);assert.equal(model.backlog[0].title,'Finish the mix');assert.equal(model.unfinished.length,0);assert.equal(source.blocks[0].tasks.at(-1).done,false);
 day.record.handoff.incoming={[model.backlog[0].incomingId]:{id:model.backlog[0].incomingId,text:'Finish the mix',kind:'action',sourceDate:'2026-10-25'}};
 assert.equal(dailyActions(day,date,[],weeks).backlog.length,0);assert.equal(dailyActions(day,date,[],weeks).unfinished.length,1);
});


test('legacy BST-shifted day keys do not turn built-in prompts into backlog work',()=>{
 const shifted={blocks:DAYS_CONFIG[0].blocks.map(b=>({...b,tasks:b.tasks.map(text=>({text,done:false}))}))};
 const weeks={'2026-09-20':{days:{'2026-09-20':shifted}}};
 assert.equal(dailyActions(fresh(),date,[],weeks).backlog.length,0);
 shifted.blocks[0].tasks.push({id:'explicit',source:'manual',text:'CDVRS Sports planning',done:false});
 assert.equal(dailyActions(fresh(),date,[],weeks).backlog.length,1);
});
