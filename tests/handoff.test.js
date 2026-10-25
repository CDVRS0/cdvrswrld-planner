import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextDay, weekKey, carryCandidates, appendCarry, handoffText } from '../src/lib/handoff.js';
const day = { blocks: [{ label: 'Work', tasks: [{ text: 'Finish mix', done: false }, { text: 'Sent invoice', done: true }] }], record: { nature: { energy: 'steady' }, handoff: { remember: 'Bring headphones' }, plan: { objective: 'Release the track', timeBlocks: [{ title: 'Mix', start_time: '11:00', end_time: '12:00' }] } }, calendarEvents: [{ title: 'Studio', start: '2026-10-25T09:00:00Z', end: '2026-10-25T10:00:00Z' }] };
test('carry-forward crosses week, year and clock changes by calendar date', () => {
  assert.equal(nextDay('2026-10-25'), '2026-10-26'); assert.equal(weekKey(nextDay('2026-10-25')), '2026-10-26');
  assert.equal(nextDay('2026-12-31'), '2027-01-01'); assert.equal(weekKey('2027-01-01'), '2026-12-28');
});
test('only unfinished actions and due cloud tasks are offered; calendar events are not tasks', () => {
  const entries = carryCandidates(day, '2026-10-25', [{ id: 'a', title: 'Late task', source: 'manual', scheduled_date: '2026-10-24', status: 'todo' }, { id: 'b', title: 'Future', source: 'manual', scheduled_date: '2026-10-27', status: 'todo' }, { id: 'c', title: 'Done', source: 'manual', scheduled_date: '2026-10-24', status: 'done' }]);
  assert.deepEqual(entries.map(e => e.text), ['Bring headphones', 'Finish mix', 'Late task']);
  assert.equal(entries[2].taskId, 'a');
});
test('carry-forward is additive, idempotent and retains completion, existing notes and original day', () => {
  const entries = carryCandidates(day, '2026-10-25'), original = structuredClone(day);
  const target = { record: { handoff: { summary: 'Tomorrow context' }, plan: { objective: 'Keep this' } }, blocks: [] };
  const first = appendCarry(target, [entries[0]]); first.record.handoff.incoming[entries[0].id].done = true;
  const second = appendCarry(first, entries);
  assert.equal(Object.keys(second.record.handoff.incoming).length, 2); assert.equal(second.record.handoff.incoming[entries[0].id].done, true);
  assert.equal(second.record.handoff.summary, 'Tomorrow context'); assert.equal(second.record.plan.objective, 'Keep this'); assert.deepEqual(day, original);
});
test('approved incoming items retain source IDs and completed items are not offered again', () => {
  const entries = carryCandidates(day, '2026-10-25'); const target = appendCarry({ blocks: [], record: {} }, entries);
  target.record.handoff.incoming[entries[0].id].done = true;
  assert.deepEqual(carryCandidates(target, '2026-10-26').map(e => e.id), [entries[1].id]);
});
test('AI preview contains selected actions, personal context and commitments without unselected actions', () => {
  const text = handoffText(day, '2026-10-25', []);
  assert.match(text, /steady/); assert.match(text, /Release the track/); assert.match(text, /Studio/); assert.match(text, /11:00–12:00/); assert.doesNotMatch(text, /Finish mix|Sent invoice/);
});
test('previous-day summary is offered as an approved carry item and OS Notes appear in the exact handoff preview', () => {
  const source = structuredClone(day); source.record.handoff.summary = 'Client mix needs a final listen';
  const entries = carryCandidates(source, '2026-10-25'); assert.equal(entries[0].label, 'Previous day handoff');
  const target = appendCarry({ record: {}, blocks: [] }, [entries[0]]);
  assert.equal(Object.values(target.record.handoff.incoming)[0].text, 'Client mix needs a final listen');
  assert.match(handoffText(source, '2026-10-25', entries, 'Prioritise the album release'), /Weekly OS Notes: Prioritise the album release/);
});
test('previous-day handoff lookup crosses Sunday to Monday without changing records', async () => {
  const { previousHandoff } = await import('../src/lib/handoff.js'); const weeks = { '2026-10-19': { days: { '2026-10-25': day } } };
  assert.equal(previousHandoff(weeks, '2026-10-26').sourceDate, '2026-10-25'); assert.equal(previousHandoff(weeks, '2026-10-26').day, day);
  assert.equal(previousHandoff({}, '2026-10-26').day, null);
});
