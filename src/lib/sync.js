import { checked, migrationRows } from './cloud.js';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function same(a, b) {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, i) => same(item, b[i]));
  if (object(a) && object(b)) return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => Object.hasOwn(b, key) && same(a[key], b[key]));
  return false;
}
const itemKey = value => object(value) ? value.id ?? value.stepKey ?? value.key ?? value.text : value;

// Only combine edits when their common base makes the result unambiguous.
export function mergeChanges(base, local, remote, path = []) {
  if (same(local, remote) || same(remote, base)) return { value: local, conflicts: [] };
  if (same(local, base)) return { value: remote, conflicts: [] };
  const objects = object(base) && object(local) && object(remote);
  const arrays = [base, local, remote].every(Array.isArray) && base.length === local.length && base.length === remote.length &&
    base.every((item, i) => itemKey(item) === itemKey(local[i]) && itemKey(item) === itemKey(remote[i]));
  if (objects || arrays) {
    const value = arrays ? [] : Object.create(null), conflicts = [];
    const keys = arrays ? base.map((_, i) => i) : new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
    for (const key of keys) {
      const merged = mergeChanges(base[key], local[key], remote[key], [...path, key]);
      if (merged.value !== undefined) value[key] = merged.value;
      conflicts.push(...merged.conflicts);
    }
    return { value, conflicts };
  }
  return { value: local, conflicts: [{ path, local, remote }] };
}

export function chooseValue(week, path, value) {
  if (!path.length) return structuredClone(value);
  const copy = structuredClone(week);
  let parent = copy;
  for (const key of path.slice(0, -1)) parent = parent[key];
  if (value === undefined) delete parent[path.at(-1)];
  else parent[path.at(-1)] = structuredClone(value);
  return copy;
}

export async function readPages(query, size = 500) {
  const rows = [];
  for (let page = 0; page < 100; page++) {
    const batch = await checked(query().range(page * size, (page + 1) * size - 1));
    rows.push(...batch);
    if (batch.length < size) return rows;
  }
  throw new Error('More than 50,000 records need loading. No records have been discarded.');
}

export function decodeWeeks(rows) {
  const weeks = {}, versions = {};
  for (const row of rows) {
    let parsed;
    try { parsed = JSON.parse(row.notes); } catch { continue; }
    if (parsed.format !== 'cdvrs-planner-v5' || !object(parsed.week?.days) || !Array.isArray(parsed.week.weeklySections)) continue;
    weeks[row.period_start] = parsed.week;
    versions[row.period_start] = { version: row.updated_at, week: parsed.week };
  }
  return { weeks, versions };
}

export class PlannerSync {
  constructor(client, userId, callbacks) {
    this.client = client; this.userId = userId; this.callbacks = callbacks;
    this.local = {}; this.base = {}; this.conflicts = []; this.busy = false; this.stopped = false; this.races = 0;
  }
  seed(rows, weeks) { this.base = decodeWeeks(rows).versions; this.local = weeks; }
  stop() { this.stopped = true; }
  edit(weeks) { this.local = weeks; }
  dirty() { return Object.entries(this.local).some(([wk, week]) => !same(week, this.base[wk]?.week)); }
  emit(status) { if (!this.stopped) this.callbacks.status(status, this.conflicts); }
  async snapshot() {
    const metadata = await readPages(() => this.client.from('planner_reflections').select('period_start,updated_at').eq('user_id', this.userId).eq('period', 'weekly').order('period_start'));
    const changed = metadata.filter(row => this.base[row.period_start]?.version !== row.updated_at).map(row => row.period_start);
    const fetched = new Map();
    for (let i = 0; i < changed.length; i += 100) {
      const rows = await readPages(() => this.client.from('planner_reflections').select('period_start,notes,updated_at').eq('user_id', this.userId).eq('period', 'weekly').in('period_start', changed.slice(i, i + 100)).order('period_start'));
      for (const row of rows) fetched.set(row.period_start, row);
    }
    return metadata.map(row => fetched.get(row.period_start) || { ...row, notes: JSON.stringify({ format: 'cdvrs-planner-v5', week: this.base[row.period_start]?.week }) });
  }
  async records() {
    const [tasks, projects] = await Promise.all([
      readPages(() => this.client.from('planner_tasks').select('*').eq('user_id', this.userId).order('id')),
      readPages(() => this.client.from('planner_projects').select('*').eq('user_id', this.userId).order('id')),
    ]);
    if (!this.stopped) this.callbacks.records(tasks, projects);
  }
  async pull(withRecords = true) {
    const { weeks, versions } = decodeWeeks(await this.snapshot());
    if (this.stopped) return;
    const local = { ...this.local }, conflicts = [];
    for (const [wk, remote] of Object.entries(weeks)) {
      if (this.local[wk] === undefined) { local[wk] = remote; this.base[wk] = versions[wk]; continue; }
      const result = mergeChanges(this.base[wk]?.week, this.local[wk], remote);
      local[wk] = result.value;
      if (result.conflicts.length) conflicts.push({ wk, remote, version: versions[wk].version, merged: result.value, fields: result.conflicts });
      else this.base[wk] = versions[wk];
    }
    for (const [wk, base] of Object.entries(this.base)) {
      if (weeks[wk] === undefined && base.week !== undefined && local[wk] !== undefined) {
        conflicts.push({ wk, remote: undefined, version: null, merged: local[wk],
          fields: [{ path: [], local: local[wk], remote: undefined }] });
      }
    }
    const changed = !same(this.local, local);
    this.local = local; this.conflicts = conflicts;
    if (changed) this.callbacks.weeks(local);
    if (withRecords) await this.records();
    this.emit(conflicts.length ? 'Choose how to resolve changes from another device' : this.dirty() ? 'Saving to cloud…' : 'Saved to cloud');
  }
  async flush() {
    if (this.stopped || this.busy) return;
    this.busy = true;
    let canContinue = false;
    try {
      this.emit('Checking cloud changes…');
      await this.pull(false);
      if (this.conflicts.length || this.stopped) { if (!this.stopped) await this.records(); return; }
      for (const wk of Object.keys(this.local)) {
        if (this.stopped) return;
        const week = structuredClone(this.local[wk]), base = this.base[wk];
        if (same(week, base?.week)) continue;
        this.emit('Saving to cloud…');
        const rows = await migrationRows({ [wk]: week }, this.userId);
        const previous = base?.week !== undefined ? await migrationRows({ [wk]: base.week }, this.userId) : { tasks: [] };
        const result = await checked(this.client.rpc('save_planner_week_v2', {
          p_week_start: wk, p_expected_version: base?.version ?? null, p_week: week,
          p_tasks: rows.tasks, p_nature: rows.nature, p_previous_ids: previous.tasks.map(t => t.id),
        }));
        if (this.stopped) return;
        this.base[wk] = { week, version: result.version };
      }
      await this.records();
      this.emit(this.dirty() ? 'Saving to cloud…' : 'Saved to cloud');
      this.races = 0;
      canContinue = true;
    } catch (e) {
      if (e.code === 'P0001' || e.code === '23505' || /changed on another device/.test(e.message)) {
        try {
          await this.pull(); this.races++;
          canContinue = this.races < 3;
          if (!canContinue && !this.conflicts.length) this.emit('Cloud changed repeatedly. Your changes are retained; retry shortly.');
        } catch { this.emit('Connection interrupted. Your changes are retained; retry when online.'); }
      } else this.emit(`Not saved: ${e.message}. Your changes are retained and will retry.`);
    } finally {
      this.busy = false;
      if (canContinue && !this.stopped && this.dirty() && !this.conflicts.length) queueMicrotask(() => this.flush());
    }
  }
  async resolve(choices) {
    const local = { ...this.local };
    for (const conflict of this.conflicts) {
      let week = conflict.merged;
      for (const field of conflict.fields) {
        const choice = choices[`${conflict.wk}:${JSON.stringify(field.path)}`];
        if (!['local', 'remote'].includes(choice)) throw new Error('Choose a value for every conflicting field.');
        week = chooseValue(week, field.path, field[choice]);
      }
      if (week === undefined) { delete local[conflict.wk]; delete this.base[conflict.wk]; }
      else { local[conflict.wk] = week; this.base[conflict.wk] = { week: conflict.remote, version: conflict.version }; }
    }
    this.local = local; this.conflicts = [];
    this.callbacks.weeks(local);
    await this.flush();
  }
}
