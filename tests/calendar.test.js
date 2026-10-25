import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCalendar, calendarText, wallInstant, busyIntervals, plannerEvents } from '../src/lib/calendar.js';
const wrap=events=>'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//EN\r\n'+events+'END:VCALENDAR\r\n';
const event=body=>'BEGIN:VEVENT\r\n'+body+'END:VEVENT\r\n';
const options={weekStart:'2026-10-19',zone:'Europe/London',provider:'google'};
test('Google UTC events convert to local time across the end of British Summer Time',async()=>{
 const rows=await parseCalendar(wrap(event('UID:one\r\nDTSTART:20261020T090000Z\r\nDTEND:20261020T100000Z\r\nSUMMARY:Call\\, team\r\n')),options);
 assert.equal(rows.length,1);assert.equal(rows[0].date,'2026-10-20');assert.equal(rows[0].title,'Call, team');assert.equal(rows[0].start,'2026-10-20T09:00:00.000Z');
 assert.equal(wallInstant('2026-10-20','10:00','Europe/London').toISOString(),'2026-10-20T09:00:00.000Z');
 assert.equal(wallInstant('2026-10-26','10:00','Europe/London').toISOString(),'2026-10-26T10:00:00.000Z');
});
test('all-day multi-day Apple events use the exclusive end date and stable occurrence IDs',async()=>{
 const text=wrap(event('UID:trip\r\nDTSTART;VALUE=DATE:20261020\r\nDTEND;VALUE=DATE:20261022\r\nSUMMARY:Trip\r\n'));
 const rows=await parseCalendar(text,{...options,provider:'apple'});assert.deepEqual(rows.map(e=>e.date),['2026-10-20','2026-10-21']);assert.ok(rows.every(e=>e.allDay));assert.deepEqual(rows,await parseCalendar(text,{...options,provider:'apple'}));
});
test('recurring events honor EXDATE and overridden occurrences without creating duplicates',async()=>{
 const text=wrap(event('UID:daily\r\nDTSTART:20261019T090000Z\r\nDTEND:20261019T100000Z\r\nRRULE:FREQ=DAILY;COUNT=4\r\nEXDATE:20261020T090000Z\r\nSUMMARY:Daily\r\n')+event('UID:daily\r\nRECURRENCE-ID:20261021T090000Z\r\nDTSTART:20261021T110000Z\r\nDTEND:20261021T120000Z\r\nSUMMARY:Moved\r\n'));
 const rows=await parseCalendar(text,options);assert.equal(rows.length,3);assert.equal(rows.find(e=>e.date==='2026-10-21').start,'2026-10-21T11:00:00.000Z');assert.ok(!rows.some(e=>e.date==='2026-10-20'));
});
test('clock-change gaps and repeated floating times fail explicitly instead of silently shifting commitments',async()=>{
 assert.throws(()=>wallInstant('2026-03-29','01:30','Europe/London'),/does not exist/);
 assert.throws(()=>wallInstant('2026-10-25','01:30','Europe/London'),/repeats/);
});
test('calendar export escapes titles, retains unique IDs and round-trips timed blocks',async()=>{
 const events=[{id:'approved-block',title:'Creative, work; next\nline',start:'2026-10-20T09:00:00.000Z',end:'2026-10-20T10:00:00.000Z'}];
 const text=await calendarText(events);const imported=await parseCalendar(text,options);assert.equal(imported.length,1);assert.equal(imported[0].title,events[0].title);assert.equal(imported[0].start,events[0].start);
});
test('busy windows combine actual calendar events, approved time blocks and 30-minute manual commitments',async()=>{
 const day={record:{plan:{timeBlocks:[{id:'b',title:'Create',start_time:'11:00',end_time:'12:00'}],commitments:'09:00 Call'}},calendarEvents:[{id:'e',title:'Meeting',start:'2026-10-20T13:00:00Z',end:'2026-10-20T14:00:00Z'}]};
 assert.deepEqual(busyIntervals(day,'2026-10-20','Europe/London').map(w=>[w.start,w.end]),[[660,720],[540,570],[840,900]]);
 assert.equal(plannerEvents({days:{'2026-10-20':day}},'Europe/London','owner').length,2,'external calendar events are not exported a second time');
});
