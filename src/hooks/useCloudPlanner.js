import { useEffect, useRef, useState } from 'react';
import { cloud, checked, migrationRows, importRows, normalizeLegacyWeeks } from '../lib/cloud';

export function useCloudPlanner(p) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [needsChoice, setNeedsChoice] = useState(false);
  const [status, setStatus] = useState('Sign in to save to cloud');
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [importReport, setImportReport] = useState('');
  const [savedVersion, setSavedVersion] = useState('');
  const [retry, setRetry] = useState(0);
  const baseline = useRef({});
  const identity = useRef(null);
  const working = useRef(false);
  const current = useRef(p.weeks);
  useEffect(() => { current.current = p.weeks; }, [p.weeks]);

  useEffect(() => {
    if (!cloud) return;
    const { data } = cloud.auth.onAuthStateChange((_event, session) => {
      const id = session?.user?.id || null;
      if (identity.current === id) return;
      identity.current = id;
      setUser(session?.user || null);
      setReady(false);
      setTasks([]);
      setProjects([]);
      baseline.current = {};
      setNeedsChoice(Boolean(id));
      setStatus(id ? 'Choose how to connect your saved data' : 'Sign in to save to cloud');
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function refresh() {
    if (!user) return;
    const [t, projects] = await Promise.all([
      checked(cloud.from('planner_tasks').select('*').eq('user_id', user.id).order('scheduled_date').limit(2000)),
      checked(cloud.from('planner_projects').select('*').eq('user_id', user.id).limit(500)),
    ]);
    setTasks(t); setProjects(projects);
  }

  async function activate(importLocal, stagedWeeks) {
    if (!user || working.current) return;
    working.current = true;
    const id = user.id;
    try {
      setStatus('Connecting saved Planner data…');
      let rows = await checked(cloud.from('planner_reflections').select('*').eq('user_id', id).eq('period', 'weekly').limit(2000));
      if (importLocal) {
        const existing = new Map(rows.map(row => [row.period_start, row.notes]));
        const source = normalizeLegacyWeeks(stagedWeeks || current.current);
        const missing = Object.fromEntries(Object.entries(source).filter(([wk, week]) => !existing.has(wk) || existing.get(wk) === JSON.stringify({ format: 'cdvrs-planner-v5', week })));
        await importRows(cloud, await migrationRows(missing, id));
        setImportReport(`${Object.keys(missing).length} weeks processed. ${Object.keys(source).length - Object.keys(missing).length} existing cloud weeks kept unchanged. Duplicate task and Nature rows were skipped.`);
        rows = await checked(cloud.from('planner_reflections').select('*').eq('user_id', id).eq('period', 'weekly').limit(2000));
      }
      const weeks = {}, base = {};
      for (const row of rows) {
        let parsed;
        try { parsed = JSON.parse(row.notes); } catch { continue; }
        if (parsed.format === 'cdvrs-planner-v5' && parsed.week?.days && Array.isArray(parsed.week.weeklySections)) {
          weeks[row.period_start] = parsed.week;
          base[row.period_start] = { version: row.updated_at, week: JSON.stringify(parsed.week) };
        }
      }
      if (identity.current !== id) return;
      baseline.current = base;
      p.setWeeks(weeks);
      setSavedVersion(JSON.stringify(weeks));
      await refresh();
      setNeedsChoice(false); setReady(true);
      localStorage.setItem('cdvrs_cloud_connection', JSON.stringify({ userId: id, weeks: JSON.stringify(weeks) }));
      setStatus('Saved to cloud');
    } catch (e) { setStatus(`Cloud connection failed: ${e.message}. Browser data is retained; retry is safe.`); }
    finally { working.current = false; }
  }

  useEffect(() => {
    if (!ready || !user) return;
    const id = user.id;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (working.current) { setRetry(n => n + 1); return; }
      working.current = true;
      try {
        for (const [wk, week] of Object.entries(p.weeks)) {
          if (cancelled || identity.current !== id) break;
          const serialized = JSON.stringify(week);
          const previous = baseline.current[wk];
          if (previous?.week === serialized) continue;
          setStatus('Saving to cloud…');
          const notes = JSON.stringify({ format: 'cdvrs-planner-v5', week });
          let version;
          if (previous) {
            const rows = await checked(cloud.from('planner_reflections').update({ notes, updated_at: new Date().toISOString() })
              .eq('user_id', id).eq('period', 'weekly').eq('period_start', wk).eq('updated_at', previous.version).select('id,updated_at'));
            if (!rows.length) throw new Error('This week changed in another tab or device. Download a backup, then reconnect before editing');
            version = rows[0].updated_at;
          } else {
            const row = await checked(cloud.from('planner_reflections').insert({ user_id: id, period: 'weekly', period_start: wk, notes }).select('updated_at').single());
            version = row.updated_at;
          }
          // Snapshot is saved first, preserving every OS field even if task sync fails.
          baseline.current[wk] = { version, week: null, oldWeek: previous?.week ?? previous?.oldWeek };
          const rows = await migrationRows({ [wk]: week }, id);
          const oldWeek = previous?.week ?? previous?.oldWeek;
          const old = oldWeek ? await migrationRows({ [wk]: JSON.parse(oldWeek) }, id) : null;
          const oldTasks = new Map(old?.tasks.map(t => [t.id, JSON.stringify(t)]) || []);
          const changedTasks = rows.tasks.filter(t => oldTasks.get(t.id) !== JSON.stringify(t));
          for (let i = 0; i < changedTasks.length; i += 100) {
            await checked(cloud.from('planner_tasks').upsert(changedTasks.slice(i, i + 100), { onConflict: 'id' }));
          }
          // Task removal is mirrored only for IDs from this week's previous snapshot.
          if (old) {
            const ids = new Set(rows.tasks.map(t => t.id));
            const removed = old.tasks.filter(t => !ids.has(t.id)).map(t => t.id);
            for (let i = 0; i < removed.length; i += 100) await checked(cloud.from('planner_tasks').update({ status: 'cancelled' }).eq('user_id', id).in('id', removed.slice(i, i + 100)));
          }
          const oldNature = new Map(old?.nature.map(n => [n.entry_date, JSON.stringify(n)]) || []);
          const changedNature = rows.nature.filter(n => oldNature.get(n.entry_date) !== JSON.stringify(n));
          if (changedNature.length) await checked(cloud.from('planner_nature_entries').upsert(changedNature, { onConflict: 'user_id,entry_date' }));
          baseline.current[wk] = { version, week: serialized };
        }
        if (!cancelled && identity.current === id) {
          await refresh(); setSavedVersion(JSON.stringify(p.weeks));
          localStorage.setItem('cdvrs_cloud_connection', JSON.stringify({ userId: id, weeks: JSON.stringify(p.weeks) }));
          setStatus('Saved to cloud');
        }
      } catch (e) { if (identity.current === id) setStatus(`Not fully saved: ${e.message}. Your browser copy is retained.`); }
      finally { working.current = false; }
    }, 650);
    return () => { cancelled = true; clearTimeout(timer); };
    // refresh uses the same authenticated identity captured by this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.weeks, ready, user, retry]);

  useEffect(() => {
    if (!user || !needsChoice) return;
    let remembered;
    try { remembered = JSON.parse(localStorage.getItem('cdvrs_cloud_connection')); } catch { return; }
    // Reconnect automatically only after prior consent and a fully saved cache.
    // Unsaved browser changes always return to the backup/confirmation screen.
    if (remembered?.userId === user.id && remembered.weeks === JSON.stringify(current.current)) void activate(false);
    // activate is deliberately keyed to identity; editing does not reload cloud.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const pending = ready && JSON.stringify(p.weeks) !== savedVersion;
  return { user, ready, needsChoice, status: pending && status === 'Saved to cloud' ? 'Saving to cloud…' : status, importReport, tasks, projects, activate, refresh,
    retry: () => setRetry(n => n + 1), reconnect: () => { setReady(false); setNeedsChoice(true); } };
}
