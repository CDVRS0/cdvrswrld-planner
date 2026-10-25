import { addDays, dateInZone, wallInstant } from './calendar.js';

let identityScript;
export function loadGoogleIdentity() {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google.accounts.oauth2);
  if (!identityScript) identityScript = new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'https://accounts.google.com/gsi/client'; script.async = true;
    script.onload = () => window.google?.accounts?.oauth2 ? resolve(window.google.accounts.oauth2) : reject(new Error('Google authorization could not load.'));
    script.onerror = () => { identityScript = null; reject(new Error('Google authorization is unavailable. Try again.')); };
    document.head.append(script);
  });
  return identityScript;
}
async function googlePages(path, token, params, request = fetch) {
  const items = []; let pageToken;
  for (let page = 0; page < 20; page++) {
    const url = new URL(`https://www.googleapis.com/calendar/v3/${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await request(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
    if (response.status === 401) throw new Error('Google access has expired. Reconnect Google to read this week.');
    if (!response.ok) throw new Error(response.status === 403 ? 'Google Calendar access was not granted, or the Calendar API is not enabled for this app.' : 'Google Calendar could not be read. Try again.');
    const data = await response.json(); items.push(...(data.items || [])); pageToken = data.nextPageToken;
    if (!pageToken) return items;
  }
  throw new Error('This calendar needs more pages than can be loaded safely. Choose a smaller calendar.');
}
export function googleCalendars(token, request) {
  return googlePages('users/me/calendarList', token, { maxResults: '250', minAccessRole: 'reader', fields: 'items(id,summary,primary,timeZone,accessRole),nextPageToken' }, request);
}
export async function googleWeek(token, calendarId, weekStart, zone, request) {
  const items = await googlePages(`calendars/${encodeURIComponent(calendarId)}/events`, token, {
    timeMin: wallInstant(weekStart, '00:00', zone).toISOString(), timeMax: wallInstant(addDays(weekStart, 7), '00:00', zone).toISOString(),
    singleEvents: 'true', orderBy: 'startTime', maxResults: '2500', showDeleted: 'true',
    fields: 'items(id,summary,start,end,status,iCalUID,originalStartTime),nextPageToken',
  }, request);
  const result = [];
  for (const item of items) {
    if (!item.start || !item.end) continue;
    const allDay = Boolean(item.start.date);
    const start = allDay ? wallInstant(item.start.date, '00:00', zone) : new Date(item.start.dateTime);
    const end = allDay ? wallInstant(item.end.date, '00:00', zone) : new Date(item.end.dateTime);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) continue;
    const original = item.originalStartTime?.date || (item.originalStartTime?.dateTime ? new Date(item.originalStartTime.dateTime).toISOString() : allDay ? item.start.date : start.toISOString());
    for (let date = weekStart; date < addDays(weekStart, 7); date = addDays(date, 1)) {
      if (start >= wallInstant(addDays(date, 1), '00:00', zone) || end <= wallInstant(date, '00:00', zone)) continue;
      result.push({ id: `google:${item.iCalUID || item.id}:${original}:${date}`, uid: item.iCalUID || item.id, date,
        title: (item.summary || '(Untitled event)').slice(0, 300), start: start.toISOString(), end: end.toISOString(), allDay,
        zone, provider: 'google', cancelled: item.status === 'cancelled', calendarId });
    }
  }
  return result;
}
export const googleEventLink = event => {
  const compact = value => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE'); url.searchParams.set('text', event.title);
  url.searchParams.set('dates', `${compact(event.start)}/${compact(event.end)}`);
  return url.toString();
};
// Useful for callers validating that Google's event dates are in the selected zone.
export { dateInZone };
