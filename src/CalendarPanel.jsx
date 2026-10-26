import { useState } from 'react';
import { addDays, parseCalendar, viewerZone, plannerEvents, downloadCalendar, timeInZone } from './lib/calendar';
import { downloadBackup } from './lib/cloud';
import GoogleCalendarConnect from './GoogleCalendarConnect';

export default function CalendarPanel({ p, c }) {
  const [provider, setProvider] = useState('google'), [zone, setZone] = useState(() => p.week.timeZone || viewerZone());
  const [preview, setPreview] = useState(null), [approved, setApproved] = useState(false);
  const [backup, setBackup] = useState(''), [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const signature = JSON.stringify(p.week);
  return <details className="calendar-panel"><summary>Google & Apple Calendar</summary>
    <p>Read your Google calendar or import a calendar .ics file for {p.wk}–{addDays(p.wk, 6)}. Events are reviewed before you approve saving to the Planner. Your Google calendar will continue to appear in Apple Calendar as usual.</p>
    {!c.ready && <div className="calendar-prerequisite" role="note">
      <strong>{!c.user ? 'Sign in to your Planner first' : c.conflicts?.length ? 'Resolve the cloud changes first' : 'Finish connecting your Planner cloud first'}</strong>
      <p>{!c.user ? 'Use the Planner email and password at the top of the page. Calendar controls unlock after your cloud connection is ready.' : c.conflicts?.length ? 'Choose which values to keep in the cloud review panel above. Your calendar controls will unlock after saving those choices.' : 'In the cloud panel above, confirm the connection and choose Load cloud Planner, or back up and approve importing existing records.'}</p>
      <button onClick={() => {
        const panel = document.querySelector('.cloud-panel'); panel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        panel?.querySelector('input[type=email], input[type=checkbox], input[type=radio]')?.focus({ preventScroll: true });
      }}>Open cloud setup</button>
    </div>}
    <GoogleCalendarConnect key={c.user?.id || 'signed-out'} p={p} c={c} zone={zone} onPreview={value => { setPreview(value); setApproved(false); setError(''); }} />
    <div className="calendar-controls"><label>Calendar source<select value={provider} onChange={e => { setProvider(e.target.value); setPreview(null); }}><option value="google">Google Calendar</option><option value="apple">Apple Calendar</option></select></label>
      <label>Display time zone<input value={zone} onChange={e => { setZone(e.target.value); setPreview(null); }} /></label>
      <label>Calendar file<input type="file" accept=".ics,text/calendar" disabled={!c.ready} onChange={async e => {
        setError(''); setMessage(''); setApproved(false); setPreview(null);
        try { const file = e.target.files[0]; if (!file) return; if (file.size > 2000000) throw new Error('Choose a calendar file under 2 MB.');
          const events = await parseCalendar(await file.text(), { weekStart: p.wk, provider, zone });
          setPreview({ wk: p.wk, events });
        } catch (err) { setError(err.message); }
      }} /></label></div>
    <p>Google: Settings → Import & export → Export. Apple Calendar on Mac: File → Export → Export. Use .ics, not a calendar archive.</p>
    {preview && preview.wk === p.wk && <div className="calendar-preview"><h3>{preview.events.length} occurrences in this week</h3>
      <ul>{preview.events.slice(0, 50).map(event => <li key={event.id}>{event.date} · {event.allDay ? 'All day' : timeInZone(new Date(event.start), zone)} · {event.title}{event.cancelled ? ' (remove cancelled occurrence)' : ''}</li>)}</ul>
      {preview.events.length > 50 && <p>Showing the first 50 of {preview.events.length} occurrences.</p>}
      <label className="consent"><input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)} />I approve adding/updating these calendar occurrences in my Planner cloud. They can be included when I ask CEED to plan my day.</label>
      <button disabled={!c.ready} onClick={() => { try { downloadBackup(); setBackup(signature); } catch (err) { setError(err.message); } }}>Back up Planner before import</button>
      <button disabled={!c.ready || !approved || backup !== signature || !preview.events.length} onClick={() => {
        p.importCalendarEvents(preview.events, zone); setPreview(null); setApproved(false); setMessage('Calendar changes added. Check Saved to cloud before closing.');
      }}>Approve calendar import</button>
    </div>}
    <button disabled={!c.ready} onClick={async () => { try { await downloadCalendar(plannerEvents(p.week, zone, c.user.id)); setError(''); setMessage('Schedule downloaded. Review it in Google or Apple Calendar before importing.'); } catch (err) { setError(err.message); } }}>Export this week’s Planner schedule (.ics)</button>
    <p>Commitments without an end time export as 30-minute events. Imported calendar events are not re-exported, avoiding copies of your existing events. Repeated file imports into a calendar app may create duplicates.</p>
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </details>;
}
