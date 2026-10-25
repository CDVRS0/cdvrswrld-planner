let formatModule;
const calendarFormat = () => formatModule ||= import('ical.js').then(module => module.default);

export const viewerZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London';
const parts = (date, zone) => Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
  timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
}).formatToParts(date).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
export function dateInZone(date, zone) { const p = parts(date, zone); return `${p.year}-${p.month}-${p.day}`; }
export function timeInZone(date, zone) { const p = parts(date, zone); return `${p.hour}:${p.minute}`; }
export function addDays(key, count) { const d = new Date(`${key}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + count); return d.toISOString().slice(0, 10); }
export function wallInstant(date, time, zone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Use a valid date and 24-hour time.');
  const desired = Date.parse(`${date}T${time}:00Z`);
  let guess = desired;
  for (let i = 0; i < 4; i++) {
    const p = parts(new Date(guess), zone);
    const shown = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
    const next = guess + desired - shown;
    if (next === guess) break;
    guess = next;
  }
  if (dateInZone(new Date(guess), zone) !== date || timeInZone(new Date(guess), zone) !== time) throw new Error('This local time does not exist because the clocks change. Choose another time.');
  // A time repeated during the autumn clock change needs an explicit UTC source.
  if ([-3600000, 3600000].some(offset => dateInZone(new Date(guess + offset), zone) === date && timeInZone(new Date(guess + offset), zone) === time)) {
    throw new Error('This local time repeats during the clock change. Use an unambiguous time or a calendar file with UTC/VTIMEZONE information.');
  }
  return new Date(guess);
}
function instant(time, tzid, zone) {
  if (time.zone?.tzid !== 'floating' && time.zone?.tzid !== 'local') return time.toJSDate();
  return wallInstant(time.toString().slice(0, 10), time.toString().slice(11, 16), tzid || zone);
}

export async function parseCalendar(text, { weekStart, provider = 'google', zone = viewerZone() }) {
  if (text.length > 2000000 || !text.includes('BEGIN:VCALENDAR')) throw new Error('Choose a calendar .ics file under 2 MB.');
  const ICAL = await calendarFormat();
  const calendar = new ICAL.Component(ICAL.parse(text));
  for (const component of calendar.getAllSubcomponents('vtimezone')) {
    ICAL.TimezoneService.register(new ICAL.Timezone({ component, tzid: component.getFirstPropertyValue('tzid') }));
  }
  const components = calendar.getAllSubcomponents('vevent');
  if (components.length > 2000) throw new Error('Export a smaller calendar range (under 2,000 event definitions).');
  const start = wallInstant(weekStart, '00:00', zone), end = wallInstant(addDays(weekStart, 7), '00:00', zone);
  const result = new Map(); let iterations = 0;
  const add = (event, occurrence, occurrenceKey) => {
    const item = occurrence.item || event, s = occurrence.startDate, e = occurrence.endDate;
    const cancelled = String(item.component.getFirstPropertyValue('status') || '').toUpperCase() === 'CANCELLED';
    let eventStart, eventEnd;
    const tzid = item.component.getFirstProperty('dtstart')?.getParameter('tzid');
    if (s.isDate) {
      eventStart = wallInstant(s.toString().slice(0, 10), '00:00', zone);
      eventEnd = wallInstant(e.toString().slice(0, 10), '00:00', zone);
    } else { eventStart = instant(s, tzid, zone); eventEnd = instant(e, tzid, zone); }
    if (eventStart >= end || eventEnd <= start || eventEnd <= eventStart) return;
    if (!event.uid || event.uid.length > 1000) throw new Error('A calendar event is missing a valid UID.');
    for (let day = weekStart; day < addDays(weekStart, 7); day = addDays(day, 1)) {
      const dayStart = wallInstant(day, '00:00', zone), dayEnd = wallInstant(addDays(day, 1), '00:00', zone);
      if (eventStart >= dayEnd || eventEnd <= dayStart) continue;
      const id = `${provider}:${event.uid}:${occurrenceKey}:${day}`;
      result.set(id, { id, uid: event.uid, date: day, title: (item.summary || '(Untitled event)').slice(0, 300),
        start: eventStart.toISOString(), end: eventEnd.toISOString(), allDay: Boolean(s.isDate), zone, provider, cancelled });
      if (result.size > 1000) throw new Error('More than 1,000 occurrences fall in this week. Import a smaller calendar.');
    }
  };
  for (const component of components) {
    const event = new ICAL.Event(component);
    if (event.isRecurrenceException() || !event.startDate) continue;
    if (event.isRecurring()) {
      const iterator = event.iterator(); let next;
      while ((next = iterator.next())) {
        if (++iterations > 20000) throw new Error('This recurrence is too large to expand safely. Export only the selected week from your calendar.');
        if (next.toString().slice(0, 10) > addDays(weekStart, 8)) break;
        add(event, event.getOccurrenceDetails(next), next.isDate ? next.toString() : instant(next, component.getFirstProperty('dtstart')?.getParameter('tzid'), zone).toISOString());
      }
    } else add(event, { startDate: event.startDate, endDate: event.endDate }, event.startDate.isDate ? event.startDate.toString() : instant(event.startDate, component.getFirstProperty('dtstart')?.getParameter('tzid'), zone).toISOString());
  }
  return [...result.values()].sort((a, b) => a.start.localeCompare(b.start));
}

export async function calendarText(events) {
  const ICAL = await calendarFormat();
  const root = new ICAL.Component('vcalendar');
  root.addPropertyWithValue('version', '2.0'); root.addPropertyWithValue('prodid', '-//CDVRSWRLD//Planner//EN');
  root.addPropertyWithValue('calscale', 'GREGORIAN');
  for (const item of events) {
    const component = new ICAL.Component('vevent'), event = new ICAL.Event(component);
    event.uid = item.id.includes('@') ? item.id : `${item.id}@cdvrswrld-planner`;
    event.summary = item.title;
    event.startDate = ICAL.Time.fromJSDate(new Date(item.start), true); event.endDate = ICAL.Time.fromJSDate(new Date(item.end), true);
    component.addPropertyWithValue('dtstamp', ICAL.Time.fromJSDate(new Date(), true));
    root.addSubcomponent(component);
  }
  return root.toString() + '\r\n';
}

export function plannerEvents(week, zone, ownerId) {
  const events = [];
  for (const [date, day] of Object.entries(week.days)) {
    for (const block of day.record?.plan?.timeBlocks || []) events.push({ id: `${ownerId}-${block.id}`, title: block.title,
      start: wallInstant(date, block.start_time, zone).toISOString(), end: wallInstant(date, block.end_time, zone).toISOString() });
    for (const [i, line] of (day.record?.plan?.commitments || '').split('\n').entries()) {
      const match = line.match(/^([01]\d|2[0-3]):([0-5]\d)\s+(.+)$/); if (!match) continue;
      const start = wallInstant(date, `${match[1]}:${match[2]}`, zone);
      events.push({ id: `${ownerId}-${date}-${i}`, title: match[3], start: start.toISOString(), end: new Date(start.getTime() + 30 * 60000).toISOString() });
    }
  }
  return events;
}

export function busyIntervals(day, date, zone) {
  const minute = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const result = (day.record?.plan?.timeBlocks || []).map(block => ({ id: block.id, title: block.title,
    start: minute(block.start_time), end: minute(block.end_time) }));
  for (const line of (day.record?.plan?.commitments || '').split('\n')) {
    const match = line.match(/^([01]\d|2[0-3]):([0-5]\d)\s+(.+)$/); if (!match) continue;
    const start = minute(`${match[1]}:${match[2]}`); result.push({ title: match[3], start, end: Math.min(1440, start + 30) });
  }
  const dayStart = wallInstant(date, '00:00', zone), dayEnd = wallInstant(addDays(date, 1), '00:00', zone);
  for (const event of day.calendarEvents || []) {
    const start = new Date(event.start), end = new Date(event.end);
    if (start >= dayEnd || end <= dayStart || event.cancelled) continue;
    result.push({ id: event.id, title: event.title, start: start <= dayStart ? 0 : minute(timeInZone(start, zone)),
      end: end >= dayEnd ? 1440 : minute(timeInZone(end, zone)) });
  }
  return result;
}

export async function downloadCalendar(events) {
  if (!events.length) throw new Error('Add a timed commitment or approve a time block before exporting.');
  const url = URL.createObjectURL(new Blob([await calendarText(events)], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'cdvrswrld-schedule.ics'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
