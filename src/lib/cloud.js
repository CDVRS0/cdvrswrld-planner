import { createClient } from '@supabase/supabase-js';

export const cloud = import.meta.env?.VITE_SUPABASE_URL && import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY
  ? createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
  : null;

export async function checked(query) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export function normalizeLegacyWeeks(weeks) {
  const result = {};
  const nextDate = key => {
    const d = new Date(`${key}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  };
  for (const [key, week] of Object.entries(weeks)) {
    // v5 used UTC keys for local midnight. During British Summer Time its
    // Monday weeks and every day key were stored one calendar day early.
    const shifted = new Date(`${key}T12:00:00Z`).getUTCDay() === 0;
    const wk = shifted ? nextDate(key) : key;
    if (result[wk]) throw new Error(`Two browser weeks map to ${wk}. Keep the backup and review these weeks before importing`);
    result[wk] = shifted ? { ...week, migrationOriginalWeekKey: key,
      days: Object.fromEntries(Object.entries(week.days).map(([dk, day]) => [nextDate(dk), day])) } : week;
  }
  return result;
}

export function downloadBackup() {
  const raw = localStorage.getItem('cdvrs_planner_v5');
  if (!raw) throw new Error('No saved browser data to back up yet.');
  JSON.parse(raw);
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `cdvrs-planner-backup-${new Date().toISOString().replaceAll(':', '-')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return raw;
}

// Stable per account + source location + content, so retries never overwrite rows.
export async function sourceId(userId, path) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${userId}:${path}`)));
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const s = [...bytes.slice(0, 16)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

export async function migrationRows(weeks, userId) {
  const tasks = [], nature = [], reflections = [];
  for (const [wk, week] of Object.entries(weeks)) {
    // Keep every OS field, weekly checklist, and schedule in the existing weekly
    // reflection notes column. Existing cloud reflections are always skipped.
    reflections.push({ user_id: userId, period: 'weekly', period_start: wk,
      notes: JSON.stringify({ format: 'cdvrs-planner-v5', week }) });
    for (const [dk, day] of Object.entries(week.days || {})) {
      const n = day.record?.nature || {};
      nature.push({ user_id: userId, entry_date: dk, feeling: n.feeling || '', energy: n.energy || '',
        mind: n.mind || '', physical: n.physical || '', intention: n.intention || '', notes: JSON.stringify(n) });
      for (const [bi, block] of (day.blocks || []).entries()) {
        for (const [ti, task] of (block.tasks || []).entries()) {
          if (!task.text?.trim()) continue;
          tasks.push({ id: await sourceId(userId, `${wk}/${dk}/${bi}/${ti}/${task.text}`), user_id: userId,
            title: task.text, category: block.stepKey || 'personal', status: task.done ? 'done' : 'todo',
            scheduled_date: dk, source: 'migration', description: `${block.time} · ${block.label}` });
        }
      }
    }
  }
  return { tasks, nature, reflections };
}

export async function importRows(client, rows) {
  // Chunked, retry-safe inserts. A partial failure is reported, never rolled back
  // by deleting records; rerunning skips the already imported source IDs.
  for (const [key, table, conflict] of [
    ['reflections', 'planner_reflections', 'user_id,period,period_start'],
    ['nature', 'planner_nature_entries', 'user_id,entry_date'],
    ['tasks', 'planner_tasks', 'id'],
  ]) {
    for (let i = 0; i < rows[key].length; i += 100) {
      await checked(client.from(table).upsert(rows[key].slice(i, i + 100), { onConflict: conflict, ignoreDuplicates: true }));
    }
  }
}
