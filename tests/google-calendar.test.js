import { test } from 'node:test';
import assert from 'node:assert/strict';
import { googleCalendars, googleWeek, googleEventLink } from '../src/lib/google-calendar.js';
import { parseCalendar } from '../src/lib/calendar.js';
test('Google reads use only the approved API origin, bearer headers and complete pagination',async()=>{
 const calls=[];const request=async(url,options)=>{calls.push({url:new URL(url),options});return {ok:true,status:200,json:async()=>calls.length===1?{items:[{id:'first'}],nextPageToken:'next'}:{items:[{id:'second'}]}};};
 const calendars=await googleCalendars('session-only-token',request);assert.equal(calendars.length,2);assert.equal(calls.length,2);
 assert.ok(calls.every(c=>c.url.origin==='https://www.googleapis.com'&&!c.url.href.includes('session-only-token')&&c.options.headers.Authorization==='Bearer session-only-token'));
 assert.equal(calls[1].url.searchParams.get('pageToken'),'next');
});
test('Google expanded occurrences and calendar files share stable identifiers',async()=>{
 const item={id:'google-id',iCalUID:'same-uid',summary:'Meeting',start:{dateTime:'2026-10-20T09:00:00Z'},end:{dateTime:'2026-10-20T10:00:00Z'}};
 const request=async()=>({ok:true,status:200,json:async()=>({items:[item]})});
 const google=await googleWeek('token','primary','2026-10-19','Europe/London',request);
 const file=await parseCalendar('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:same-uid\r\nDTSTART:20261020T090000Z\r\nDTEND:20261020T100000Z\r\nSUMMARY:Meeting\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n',{weekStart:'2026-10-19',provider:'google',zone:'Europe/London'});
 assert.equal(google[0].id,file[0].id);assert.equal(google[0].calendarId,'primary');
});
test('expired Google authorization requires reconnection and never silently returns an empty calendar',async()=>{
 await assert.rejects(()=>googleCalendars('expired',async()=>({ok:false,status:401})),/expired/);
});
test('review links open an event draft; they do not call a calendar write API',()=>{
 const url=new URL(googleEventLink({title:'Review & create',start:'2026-10-20T09:00:00Z',end:'2026-10-20T10:00:00Z'}));
 assert.equal(url.origin,'https://calendar.google.com');assert.equal(url.searchParams.get('action'),'TEMPLATE');assert.equal(url.searchParams.get('text'),'Review & create');assert.equal(url.searchParams.get('dates'),'20261020T090000Z/20261020T100000Z');
});
