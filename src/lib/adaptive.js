// Shared by proposal validation, review and cloud application. Never writes data.
export const minute = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null;
const text = (value, max = 1000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
export function interval(value) {
  const start = minute(value?.start_time), end = minute(value?.end_time);
  if (start === null || end === null || end <= start) throw new Error('Use a start and later end time on the selected day. Split overnight shifts across days.');
  return { start, end };
}
const overlaps = (a, b) => a.start < b.end && a.end > b.start;
export function validateAdaptive(raw, { candidates, fixed, bounds = {}, earliest = 0 }) {
  if (!raw || typeof raw.summary !== 'string' || !Array.isArray(raw.sessions) || !Array.isArray(raw.later) || !Array.isArray(raw.unavailable)) throw new Error('CEED returned an incomplete plan. Ask for a new proposal.');
  if (raw.sessions.length > 20 || raw.unavailable.length > 15 || raw.later.length > candidates.length) throw new Error('The proposed plan is too large.');
  const available = { start_time: raw.start_time, end_time: raw.end_time };
  const window = interval(available);
  if (bounds.start_time && window.start < minute(bounds.start_time) || bounds.end_time && window.end > minute(bounds.end_time)) throw new Error('The proposal is outside your available hours.');
  const unavailable = raw.unavailable.map(item => ({ title: text(item.title, 300) || 'Unavailable', start_time: item.start_time, end_time: item.end_time }));
  const occupied = [...fixed, ...unavailable.map(item => ({ ...interval(item), title: item.title }))];
  const used = new Set();
  const sessions = raw.sessions.map(item => {
    const span = interval(item);
    const candidate = item.key ? candidates.find(task => task.key === item.key) : null;
    if (item.key && !candidate) throw new Error('A proposed task is no longer available.');
    if (item.key && used.has(item.key)) throw new Error('A task appears twice in the proposal.');
    if (span.start < earliest) throw new Error('The proposal starts in the past. Ask for a fresh plan for your remaining time.');
    if (span.start < window.start || span.end > window.end) throw new Error('A session falls outside your available hours.');
    const collision = occupied.find(busy => overlaps(span, busy));
    if (collision) throw new Error(`The proposal overlaps ${collision.title || 'another session'}. Ask for a different plan.`);
    occupied.push({ ...span, title: candidate?.title || 'Break' });
    if (item.key) used.add(item.key);
    return { key: candidate?.key || null, title: candidate?.title || 'Break / recovery', start_time: item.start_time, end_time: item.end_time, reason: text(item.reason) };
  }).sort((a, b) => a.start_time.localeCompare(b.start_time));
  const later = raw.later.map(item => {
    const candidate = candidates.find(task => task.key === item.key);
    if (!candidate || used.has(item.key)) throw new Error('A task is duplicated or has changed.');
    used.add(item.key);
    return { key: candidate.key, title: candidate.title, reason: text(item.reason) || 'Leave room for the work that fits today.' };
  });
  // Every supplied task must be accounted for. Nothing silently disappears.
  if (used.size !== candidates.length) throw new Error('Some tasks were left out of the review. Ask for a new proposal.');
  const priorityKeys = [...new Set(Array.isArray(raw.priorityKeys) ? raw.priorityKeys : [])];
  if (priorityKeys.length > 3 || priorityKeys.some(key => !sessions.some(session => session.key === key))) throw new Error('Choose up to three priorities from the scheduled work.');
  return { summary: text(raw.summary, 6000), ...available, unavailable, sessions, later, priorityKeys, assumptions: text(raw.assumptions, 2000) };
}
export function adaptiveCandidates(model, week, includeWeekly, day = {}) {
  const items = model.unfinished.map(task => ({ key: task.key, title: task.title, origin: 'Today', priority: task.priority || 'medium', due_date: task.due_date || null, revision: task.updated_at || null, description: (task.description || '').slice(0, 500), chosen_priority: (model.priorities || []).some(item => item.key === task.key) }));
  if (includeWeekly) for (const section of week.weeklySections || []) for (const [i, item] of section.items.entries()) if (!item.done) items.push({ key: `weekly:${section.key}:${i}:${item.text}`, title: item.text, origin: section.label });
  for (const block of day.record?.plan?.timeBlocks || []) if (!block.locked && !items.some(item => item.key === block.taskKey || item.title === block.title) && block.title !== 'Break / recovery') items.push({ key: `block:${block.id}`, title: block.title, origin: 'Existing session' });
  return items.slice(0, 80);
}
export function adaptiveFingerprint(day, candidates, fixed, zone) {
  return JSON.stringify({ plan: day.record?.plan, candidates, fixed, zone });
}
export function approvedAdaptivePlan(previous, proposal, request, id) {
  const locked = (previous.timeBlocks || []).filter(block => block.locked);
  return { ...previous, priorityKeys: proposal.priorityKeys.filter(key => /^(local|cloud|incoming):/.test(key)), timeBlocks: [...locked, ...proposal.sessions.map((session, i) => ({ id: `${id}:${i}`, title: session.title, start_time: session.start_time, end_time: session.end_time, source: 'ai', taskKey: session.key }))],
    adaptive: { ...proposal, request, approvedAt: new Date().toISOString(), id, previous: { timeBlocks: previous.timeBlocks || [], priorityKeys: previous.priorityKeys || [], adaptive: previous.adaptive ? { ...previous.adaptive, previous: null } : null } } };
}

export function earliestToday(date, zone, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]));
  if (`${parts.year}-${parts.month}-${parts.day}` !== date) return 0;
  return Math.min(1440, Math.ceil((Number(parts.hour) * 60 + Number(parts.minute) + 1) / 5) * 5);
}
