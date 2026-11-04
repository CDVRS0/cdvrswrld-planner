import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAdaptive, approvedAdaptivePlan, adaptiveCandidates, adaptiveFingerprint } from '../src/lib/adaptive.js';
import { busyIntervals } from '../src/lib/calendar.js';
const candidates = [{ key: 'music', title: 'Produce music' }, { key: 'gym', title: 'Gym' }];
const fixed = [{ title: 'Work', start: 16 * 60, end: 18 * 60 }];
const context = { candidates, fixed, bounds: { start_time: '14:00', end_time: '22:00' } };
const response = () => ({ summary: 'Music first; gym can wait.', start_time: '14:00', end_time: '22:00', unavailable: [{ title: 'Commute', start_time: '15:30', end_time: '16:00' }], sessions: [{ key: 'music', start_time: '14:30', end_time: '15:15', reason: 'Creative work before your shift' }, { key: null, start_time: '18:00', end_time: '18:30', reason: 'Recover after work' }], later: [{ key: 'gym', reason: 'Not enough time to travel and train' }], priorityKeys: ['music'], assumptions: '45-minute music session' });
test('late wake, work and commute create a realistic reviewed schedule without changing tasks', () => {
 const raw = response(), before = JSON.stringify(candidates);
 const result = validateAdaptive(raw, context);
 assert.equal(result.sessions[0].title, 'Produce music'); assert.equal(result.later[0].title, 'Gym'); assert.equal(JSON.stringify(candidates), before);
 assert.equal(result.sessions[1].title, 'Break / recovery');
});
test('rejects overlaps with work, travel and other proposed sessions', () => {
 for (const [start, end] of [['16:30','17:00'],['15:30','15:45'],['18:00','18:20']]) { const r = response(); r.sessions[0].start_time = start; r.sessions[0].end_time = end; assert.throws(() => validateAdaptive(r, context), /overlaps/); }
});
test('rejects outside hours, invalid/overnight times and widening explicit bounds', () => {
 for (const [start,end] of [['13:00','13:30'],['22:00','23:00'],['23:00','01:00'],['25:00','26:00']]) { const r=response();r.sessions[0].start_time=start;r.sessions[0].end_time=end;assert.throws(()=>validateAdaptive(r,context)); }
 const r=response();r.start_time='12:00';assert.throws(()=>validateAdaptive(r,context),/outside/);
});
test('rejects invented, repeated, dropped tasks and priorities not in schedule', () => {
 const changes=[r=>r.sessions[0].key='invented',r=>r.later=[],r=>r.later[0].key='music',r=>r.priorityKeys=['gym']];
 for(const change of changes){const r=response();change(r);assert.throws(()=>validateAdaptive(r,context));}
});
test('allows zero-capacity day while preserving every action for later', () => {
 const r=response();r.sessions=[];r.later=candidates.map(t=>({key:t.key,reason:'Working / travelling'}));r.priorityKeys=[];
 assert.equal(validateAdaptive(r,context).later.length,2);
});
test('atomic approval preserves locked blocks, original records and an undo snapshot', () => {
 const old={objective:'Finish album',commitments:'16:00 Work',priorityKeys:['music'],timeBlocks:[{id:'locked',locked:true,title:'Appointment'},{id:'flex',title:'Old plan'}]};
 const snapshot=JSON.stringify(old), proposal=validateAdaptive(response(),context);
 const next=approvedAdaptivePlan(old,proposal,'Shift change','new');
 assert.equal(JSON.stringify(old),snapshot);assert.equal(next.objective,old.objective);assert.equal(next.timeBlocks[0].id,'locked');assert.equal(next.timeBlocks.length,3);
 assert.deepEqual(next.adaptive.previous.timeBlocks,old.timeBlocks);
 const restored={...next,...next.adaptive.previous};assert.deepEqual(restored.timeBlocks,old.timeBlocks);
});
test('weekly tasks are opt-in; completed items excluded; loose sessions remain candidates', () => {
 const model={unfinished:[{key:'music',title:'Produce music'}]};const week={weeklySections:[{key:'work',label:'Work',items:[{text:'Invoice',done:false},{text:'Done',done:true}]}]};
 assert.equal(adaptiveCandidates(model,week,false).length,1);
 assert.equal(adaptiveCandidates(model,week,true).length,2);
 assert.equal(adaptiveCandidates(model,week,false,{record:{plan:{timeBlocks:[{id:'a',title:'Produce music'},{id:'b',title:'Call'},{id:'c',title:'Locked',locked:true}]}}}).length,2);
});
test('approved unavailable hours constrain later ordinary AI recommendations',()=>{
 const proposal=validateAdaptive(response(),context);const plan=approvedAdaptivePlan({},proposal,'Work','new');
 const windows=busyIntervals({record:{plan}},'2026-11-04','Europe/London');
 assert(windows.some(w=>w.title==='Commute'&&w.start===930));assert(windows.some(w=>w.title==='Before available hours'&&w.end===840));assert(windows.some(w=>w.title==='After available hours'&&w.start===1320));
});
test('task/schedule/commitment changes invalidate a proposal basis',()=>{
 const day={record:{plan:{commitments:'10:00 Call'}}};const a=adaptiveFingerprint(day,candidates,fixed,'Europe/London');
 assert.notEqual(a,adaptiveFingerprint({...day,record:{plan:{commitments:'11:00 Call'}}},candidates,fixed,'Europe/London'));
 assert.notEqual(a,adaptiveFingerprint(day,[...candidates,{key:'new',title:'New work'}],fixed,'Europe/London'));
});
