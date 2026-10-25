import { useEffect, useRef, useState } from 'react';
import { googleCalendars, googleWeek, loadGoogleIdentity } from './lib/google-calendar';

export default function GoogleCalendarConnect({ p, c, zone, onPreview }) {
  const clientId = import.meta.env.VITE_GOOGLE_CALENDAR_CLIENT_ID;
  const [oauth, setOauth] = useState(null), [calendars, setCalendars] = useState([]), [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [connected, setConnected] = useState(false);
  const access = useRef(null), mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    if (clientId && c.user) loadGoogleIdentity().then(value => { if (mounted.current) setOauth(value); }).catch(e => { if (mounted.current) setError(e.message); });
    return () => { mounted.current = false; access.current = null; };
  }, [clientId, c.user]);
  async function readWeek(token, calendarId) {
    const wk = p.wk;
    setBusy(true); setError('');
    try {
      const events = await googleWeek(token, calendarId, wk, zone);
      const ids = new Set(events.map(event => event.id));
      const removed = Object.values(p.week.days).flatMap(day => day.calendarEvents || []).filter(event => event.provider === 'google' && event.calendarId === calendarId && !ids.has(event.id)).map(event => ({ ...event, cancelled: true }));
      if (mounted.current) onPreview({ wk, events: [...events, ...removed] });
    }
    catch (e) { if (mounted.current) setError(e.message); }
    finally { if (mounted.current) setBusy(false); }
  }
  return <section className="google-connect"><h3>Use the Google calendar you see in Apple Calendar</h3>
    {!clientId ? <p>Live Google authorization needs a one-time Google OAuth client ID configuration. Calendar-file import/export is available below.</p> : <>
      <p>Connect with read-only access. Your Google token stays in memory for this browser session. Approve importing the returned events before they are saved to your Planner.</p>
      <button disabled={!c.ready || !oauth || busy} onClick={() => {
        setError('');
        const client = oauth.initTokenClient({ client_id: clientId, scope: 'https://www.googleapis.com/auth/calendar.readonly',
          callback: async response => {
            if (!mounted.current) return;
            if (response.error || !response.access_token || !oauth.hasGrantedAllScopes(response, 'https://www.googleapis.com/auth/calendar.readonly')) { setError('Google Calendar read access was not granted.'); return; }
            access.current = { token: response.access_token, expires: Date.now() + Number(response.expires_in || 3600) * 1000 };
            setBusy(true);
            try {
              const list = await googleCalendars(response.access_token); if (!mounted.current) return;
              setCalendars(list); setConnected(true);
              const calendarId = list.find(value => value.primary)?.id || list[0]?.id || '';
              setSelected(calendarId); if (calendarId) await readWeek(response.access_token, calendarId);
            } catch (e) { if (mounted.current) setError(e.message); }
            finally { if (mounted.current) setBusy(false); }
          }, error_callback: () => { if (mounted.current) { setBusy(false); setError('Google authorization was closed or blocked. Try again.'); } },
        });
        client.requestAccessToken({ prompt: '' });
      }}>{connected ? 'Reconnect Google' : 'Connect Google Calendar'}</button>
      {connected && <><label>Google calendar<select value={selected} onChange={e => setSelected(e.target.value)}>{calendars.map(calendar => <option key={calendar.id} value={calendar.id}>{calendar.summary}</option>)}</select></label>
        <button disabled={!c.ready || !selected || busy} onClick={() => {
          if (!access.current || access.current.expires <= Date.now() + 30000) { setError('Google access has expired. Reconnect Google to read this week.'); return; }
          void readWeek(access.current.token, selected);
        }}>{busy ? 'Reading…' : 'Read this week from Google'}</button>
        <button onClick={() => { access.current = null; setConnected(false); setCalendars([]); }}>Disconnect this browser session</button></>}
    </>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
