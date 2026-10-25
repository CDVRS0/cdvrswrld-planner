export function nextDay(date) {
  const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
export function weekKey(date) {
  const d = new Date(`${date}T12:00:00Z`), day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}
export function carryCandidates(day, date, tasks = []) {
  const entries = [];
  for (const [field, label] of [['carryForward', 'Carry forward'], ['remember', 'Remember tomorrow']]) {
    const text = day.record?.handoff?.[field]?.trim();
    if (text) entries.push({ id: JSON.stringify([date, field, text]), text, label, sourceDate: date, kind: 'note' });
  }
  for (const [bi, block] of (day.blocks || []).entries()) for (const [ti, task] of block.tasks.entries()) {
    if (!task.done && task.text?.trim()) entries.push({ id: JSON.stringify([date, bi, ti, task.text]), text: task.text, label: block.label, sourceDate: date, kind: 'action' });
  }
  for (const item of Object.values(day.record?.handoff?.incoming || {})) {
    if (!item.done && (!item.taskId || tasks.some(t => t.id === item.taskId && !['done', 'cancelled'].includes(t.status)))) entries.push(item);
  }
  for (const task of tasks) {
    if (task.source !== 'migration' && !['done', 'cancelled'].includes(task.status) && (task.scheduled_date <= date || task.due_date && task.due_date <= date)) {
      entries.push({ id: `cloud:${task.id}`, text: task.title, label: 'Existing cloud task (date unchanged)', taskId: task.id, sourceDate: task.scheduled_date || date, kind: 'action' });
    }
  }
  return [...new Map(entries.map(item => [item.id, item])).values()];
}
export function appendCarry(day, entries) {
  const incoming = { ...(day.record?.handoff?.incoming || {}) };
  for (const entry of entries) if (!Object.hasOwn(incoming, entry.id)) incoming[entry.id] = { ...entry, done: false };
  return { ...day, record: { ...day.record, handoff: { ...day.record?.handoff, incoming } } };
}
export function handoffText(day, date, entries) {
  const r = day.record || {};
  return [`Planner handoff · ${date}`, 'Use this approved context to help me continue. Suggest changes for my approval; do not claim to have saved or rescheduled anything.',
    ...[['Energy', r.nature?.energy], ['Intention', r.nature?.intention], ['Main objective', r.plan?.objective], ['Next action', r.work?.firstAction], ['Context for the next agent', r.handoff?.summary], ['Carry forward', r.handoff?.carryForward], ['Remember tomorrow', r.handoff?.remember], ['Review / next priority', r.review?.tomorrow]].filter(([, value]) => value?.trim()).map(([label, value]) => `${label}: ${value}`),
    'Selected unfinished actions and notes:', ...entries.map(e => `- ${e.text} (${e.label}; from ${e.sourceDate})`),
    'Calendar commitments:', ...(day.calendarEvents || []).map(e => `- ${e.title}: ${e.start}–${e.end}`),
    r.plan?.commitments || '', ...((r.plan?.timeBlocks || []).map(b => `- ${b.start_time}–${b.end_time} ${b.title}`)),
  ].filter(Boolean).join('\n\n');
}
