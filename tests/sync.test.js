import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeChanges, readPages, PlannerSync } from '../src/lib/sync.js';
const wk='2030-01-07';
const base={notes:'original',weeklySections:[],days:{'2030-01-07':{record:{nature:{energy:'steady',intention:'create'}},blocks:[]}}};
const copy=v=>structuredClone(v);
test('independent record edits and separate checkbox edits merge without dropping either device',()=>{
 const local=copy(base),remote=copy(base);local.notes='this device';remote.days['2030-01-07'].record.nature.energy='high';
 const result=mergeChanges(base,local,remote);assert.equal(result.conflicts.length,0);assert.equal(result.value.notes,'this device');assert.equal(result.value.days['2030-01-07'].record.nature.energy,'high');
 const original=[{text:'One',done:false},{text:'Two',done:false}];
 const merged=mergeChanges(original,[{text:'One',done:true},original[1]],[original[0],{text:'Two',done:true}]);
 assert.equal(merged.conflicts.length,0);assert.ok(merged.value.every(t=>t.done));
});
test('same-field and structurally different list edits require an explicit choice',()=>{
 const result=mergeChanges({note:'base'},{note:'mine'},{note:'theirs'});assert.deepEqual(result.conflicts[0].path,['note']);assert.equal(result.value.note,'mine');
 const list=mergeChanges([{text:'One'}],[{text:'Two'}],[{text:'Three'}]);assert.equal(list.conflicts.length,1);
});
test('pagination loads every row rather than silently stopping at the server page size',async()=>{
 const all=Array.from({length:1103},(_,id)=>({id}));let calls=0;
 const rows=await readPages(()=>({range:async(start,end)=>{calls++;return {data:all.slice(start,end+1),error:null};}}));
 assert.equal(rows.length,1103);assert.equal(calls,3);
});
function fixture(){
 const rows=[{id:'week',period:'weekly',user_id:'owner',period_start:wk,notes:JSON.stringify({format:'cdvrs-planner-v5',week:copy(base)}),updated_at:'v1'}];
 const db={rows,fail:false,writes:[],gate:null};
 const client={from(table){const filters=[];const query={select(){return query;},eq(k,v){filters.push([k,v]);return query;},in(k,v){filters.push([k,v]);return query;},order(){return query;},async range(a,b){const source=table==='planner_reflections'?rows:[];return {data:copy(source.filter(r=>filters.every(([k,v])=>Array.isArray(v)?v.includes(r[k]):r[k]===v)).slice(a,b+1)),error:null};}};return query;},async rpc(name,args){assert.equal(name,'save_planner_week_v2');db.writes.push(copy(args));if(db.gate)await db.gate;if(db.fail)return {data:null,error:{code:'NETWORK',message:'offline'}};if(args.p_expected_version!==rows[0].updated_at)return {data:null,error:{code:'P0001',message:'Planner changed on another device'}};rows[0].notes=JSON.stringify({format:'cdvrs-planner-v5',week:args.p_week});rows[0].updated_at='v'+(Number(rows[0].updated_at.slice(1))+1);return {data:{version:rows[0].updated_at},error:null};}};
 const statuses=[],seen=[];const sync=new PlannerSync(client,'owner',{weeks:w=>seen.push(copy(w)),records(){},status:s=>statuses.push(s)});sync.seed(rows,{[wk]:copy(base)});
 return {db,sync,statuses,seen};
}
test('a remote independent edit is included in the atomic save and stale content is never sent',async()=>{
 const {db,sync,statuses}=fixture();const local=copy(base);local.notes='mine';sync.edit({[wk]:local});
 const remote=copy(base);remote.days['2030-01-07'].record.nature.energy='remote';db.rows[0].notes=JSON.stringify({format:'cdvrs-planner-v5',week:remote});db.rows[0].updated_at='v2';
 await sync.flush();assert.equal(db.writes.length,1);assert.equal(db.writes[0].p_expected_version,'v2');assert.equal(db.writes[0].p_week.notes,'mine');assert.equal(db.writes[0].p_week.days['2030-01-07'].record.nature.energy,'remote');assert.equal(statuses.at(-1),'Saved to cloud');
});
test('overlapping edits block writes until chosen values are approved',async()=>{
 const {db,sync}=fixture();sync.edit({[wk]:{...copy(base),notes:'mine'}});db.rows[0].notes=JSON.stringify({format:'cdvrs-planner-v5',week:{...copy(base),notes:'theirs'}});db.rows[0].updated_at='v2';
 await sync.flush();assert.equal(db.writes.length,0);assert.equal(sync.conflicts.length,1);
 await sync.resolve({[wk+':'+JSON.stringify(['notes'])]:'local'});assert.equal(db.writes.length,1);assert.equal(JSON.parse(db.rows[0].notes).week.notes,'mine');
});
test('failed atomic requests retain local edits and version; a retry persists them',async()=>{
 const {db,sync,statuses}=fixture();sync.edit({[wk]:{...copy(base),notes:'retain me'}});db.fail=true;await sync.flush();
 assert.equal(sync.base[wk].version,'v1');assert.equal(sync.local[wk].notes,'retain me');assert.match(statuses.at(-1),/^Not saved/);
 db.fail=false;await sync.flush();assert.equal(JSON.parse(db.rows[0].notes).week.notes,'retain me');assert.equal(statuses.at(-1),'Saved to cloud');
});
test('cloud deletion is reviewed instead of dropping the local week or retrying indefinitely',async()=>{
 const {db,sync}=fixture();db.rows.length=0;await sync.flush();assert.equal(sync.conflicts.length,1);assert.equal(db.writes.length,0);assert.ok(sync.local[wk]);
 await sync.resolve({[wk+':[]']:'remote'});assert.equal(sync.local[wk],undefined);assert.equal(sync.conflicts.length,0);
});
test('edits made during an in-flight save are drained after the first transaction finishes',async()=>{
 const {db,sync,statuses}=fixture();let release;db.gate=new Promise(r=>release=r);
 sync.edit({[wk]:{...copy(base),notes:'first edit'}});const first=sync.flush();
 while(!db.writes.length)await new Promise(r=>setTimeout(r,1));
 sync.edit({[wk]:{...copy(base),notes:'typed during save'}});db.gate=null;release();await first;
 for(let i=0;i<100&&statuses.at(-1)!=='Saved to cloud';i++)await new Promise(r=>setTimeout(r,2));
 assert.equal(JSON.parse(db.rows[0].notes).week.notes,'typed during save');assert.equal(db.writes.length,2);assert.equal(statuses.at(-1),'Saved to cloud');
});
