import { DAYS_CONFIG } from '../data/days.js';

const active = task => !['done', 'cancelled'].includes(task.status);
export function isOSPrompt(task, block, date) {
  if (task.source === 'manual' || task.source === 'ai' || task.id) return false;
  if (task.source === 'os-prompt') return true;
  const weekday = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
  const template = DAYS_CONFIG[weekday]?.blocks.find(b => b.stepKey === block.stepKey && b.label === block.label);
  return Boolean(template?.tasks.includes(task.text));
}
export function localActions(day, date) {
  const result = [];
  for (const [bi, block] of (day.blocks || []).entries()) {
    const occurrences = new Map();
    for (const [ti, task] of block.tasks.entries()) {
      const n = occurrences.get(task.text) || 0; occurrences.set(task.text, n + 1);
      if (isOSPrompt(task, block, date)) continue;
      result.push({ ...task, key: `local:${task.id || JSON.stringify([block.stepKey, block.label, task.text, n])}`, kind: 'local', bi, ti, title: task.text, label: block.label });
    }
  }
  return result;
}
export function dailyActions(day, date, tasks = [], weeks = {}) {
  const local = localActions(day, date);
  const incoming = Object.values(day.record?.handoff?.incoming || {}).filter(t => t.kind === 'action');
  const cloud = tasks.filter(t => t.source !== 'migration').map(t => ({ ...t, key: `cloud:${t.id}`, kind: 'cloud', done: t.status === 'done', dismissed: t.status === 'cancelled', label: 'Cloud task' }));
  const isToday = t => t.scheduled_date === date || (!t.scheduled_date && t.due_date === date);
  const carried = incoming.filter(t => !t.taskId || !cloud.some(c => c.id === t.taskId && isToday(c))).map(t => {
    const linkedTask = t.taskId && tasks.find(c => c.id === t.taskId);
    return { ...t, key: `incoming:${t.id}`, kind: 'incoming', title: linkedTask?.title || t.text, label: `From ${t.sourceDate}`, linkedTask,
      done: linkedTask ? linkedTask.status === 'done' : t.done,
      dismissed: t.dismissed || linkedTask?.status === 'cancelled' };
  });
  const today = [...local, ...cloud.filter(isToday), ...carried];
  const unfinished = today.filter(t => !t.done && !t.dismissed);
  const keys = [...new Set(day.record?.plan?.priorityKeys || [])];
  const priorities = keys.map(k => unfinished.find(t => t.key === k)).filter(Boolean).slice(0, 3);
  const earlier = [];
  for (const week of Object.values(weeks)) for (const [sourceDate, savedDay] of Object.entries(week.days || {})) {
    if (sourceDate >= date) continue;
    for (const action of localActions(savedDay, sourceDate).filter(t => !t.done && !t.dismissed)) {
      const incomingId = JSON.stringify([sourceDate, action.bi, action.ti, action.text]);
      if (Object.hasOwn(day.record?.handoff?.incoming || {}, incomingId)) continue;
      earlier.push({ ...action, key: `backlog:${sourceDate}:${action.key}`, incomingId, sourceDate });
    }
  }
  return { today, unfinished, completed: today.filter(t => t.done && !t.dismissed), deleted: today.filter(t => t.dismissed), priorities,
    backlog: [...earlier, ...cloud.filter(t => active(t) && !isToday(t) && (!t.scheduled_date || t.scheduled_date < date))] };
}
// Soft deletion retains the original action and is reversible from the home page.
export function changeDayActions(day, date, keys, change) {
  const selected = new Set(keys);
  const locals = new Set(localActions(day, date).filter(t => selected.has(t.key)).map(t => `${t.bi}:${t.ti}`));
  const incoming = { ...(day.record?.handoff?.incoming || {}) };
  for (const item of Object.values(incoming)) if (selected.has(`incoming:${item.id}`) && item.kind === 'action' && !(change === 'delete' && item.done)) {
    incoming[item.id] = change === 'complete' ? { ...item, done: true } : { ...item, dismissed: change === 'delete' };
  }
  return { ...day, blocks: day.blocks.map((block, bi) => ({ ...block, tasks: block.tasks.map((task, ti) => {
    if (!locals.has(`${bi}:${ti}`) || (change === 'delete' && task.done)) return task;
    return change === 'complete' ? { ...task, done: true } : { ...task, dismissed: change === 'delete' };
  }) })), record: { ...day.record, handoff: { ...day.record?.handoff, incoming } } };
}
export function planningDay(day, date) {
  return { ...day, blocks: (day.blocks || []).map(block => ({ ...block, tasks: block.tasks.filter(t => !t.dismissed && !isOSPrompt(t, block, date)) })),
    record: { ...day.record, handoff: { ...day.record?.handoff, incoming: Object.fromEntries(Object.entries(day.record?.handoff?.incoming || {}).filter(([, t]) => !t.dismissed)) } } };
}
