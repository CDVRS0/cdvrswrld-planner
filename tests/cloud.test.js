import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrationRows, sourceId, importRows } from '../src/lib/cloud.js';
const week = { notes: 'keep notes', weeklySections: [{ key: 'social', items: [{ text: 'Weekly content', done: true }] }], days: {
 '2026-10-25': { record: { nature: { energy: 'low', ask: 'Keep this' }, social: { published: 'keep social' }, bible: { prayer: 'keep prayer' } },
 blocks: [{ stepKey: 'social', time: '04', label: 'Social', tasks: [{ text: 'Post video', done: true }, { text: 'Write caption', done: false }] }] }
}};
test('migration preserves every original OS field in the weekly cloud snapshot and normalizes tasks', async () => {
 const rows = await migrationRows({ '2026-10-19': week }, 'owner');
 assert.deepEqual(JSON.parse(rows.reflections[0].notes).week, week);
 assert.equal(rows.tasks[0].status, 'done'); assert.equal(rows.tasks[1].status, 'todo');
 assert.equal(rows.nature[0].energy, 'low'); assert.equal(JSON.parse(rows.nature[0].notes).ask, 'Keep this');
 assert.ok(rows.tasks.every(t => t.user_id === 'owner' && t.source === 'migration'));
});
test('source IDs are stable across retries and scoped to user and task identity', async () => {
 assert.equal(await sourceId('one','task'), await sourceId('one','task'));
 assert.notEqual(await sourceId('one','task'), await sourceId('two','task'));
 assert.notEqual(await sourceId('one','task'), await sourceId('one','different task'));
});
test('import skips conflicts, uses bounded batches and stops with a recoverable partial failure', async () => {
 const calls=[];
 const client={from(table){return {upsert:async(rows, options)=>{calls.push({table,rows,options});return {data:null,error:table==='planner_tasks'?{message:'offline'}:null};}};}};
 const rows=await migrationRows({'2026-10-19':week},'owner');
 await assert.rejects(()=>importRows(client,rows), /offline/);
 assert.equal(calls.length,3);
 assert.ok(calls.every(c=>c.options.ignoreDuplicates && c.rows.length<=100));
 assert.equal(calls[0].table,'planner_reflections');
});
