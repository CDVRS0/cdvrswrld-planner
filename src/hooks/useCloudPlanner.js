import { useEffect, useRef, useState } from 'react';
import { cloud, migrationRows, importRows, normalizeLegacyWeeks } from '../lib/cloud';
import { PlannerSync, decodeWeeks, readPages, same } from '../lib/sync';

export function useCloudPlanner(p) {
  const [user, setUser] = useState(null);
  const [connected, setConnected] = useState(false);
  const [needsChoice, setNeedsChoice] = useState(false);
  const [status, setStatus] = useState('Sign in to save to cloud');
  const [tasks, setTasks] = useState([]), [projects, setProjects] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [importReport, setImportReport] = useState('');
  const [savedWeeks, setSavedWeeks] = useState({});
  const [versions, setVersions] = useState({});
  const identity = useRef(null), engine = useRef(null), current = useRef(p.weeks), connecting = useRef(false);
  useEffect(() => { current.current = p.weeks; }, [p.weeks]);

  useEffect(() => {
    if (!cloud) return;
    const { data } = cloud.auth.onAuthStateChange((_event, session) => {
      const id = session?.user?.id || null;
      if (identity.current === id) return;
      identity.current = id; engine.current?.stop(); engine.current = null;
      setUser(session?.user || null); setVersions({}); setConnected(false); setTasks([]); setProjects([]); setConflicts([]);
      setNeedsChoice(Boolean(id)); setStatus(id ? 'Choose how to connect your saved data' : 'Sign in to save to cloud');
    });
    return () => { data.subscription.unsubscribe(); engine.current?.stop(); };
  }, []);

  async function refresh() { await engine.current?.records(); }

  async function activate(importLocal, stagedWeeks) {
    if (!user || connecting.current) return;
    connecting.current = true;
    const id = user.id;
    try {
      setStatus('Connecting saved Planner data…');
      let rows = await readPages(() => cloud.from('planner_reflections').select('id,period_start,notes,updated_at').eq('user_id', id).eq('period', 'weekly').order('period_start'));
      if (importLocal) {
        const existing = new Map(rows.map(row => [row.period_start, row.notes]));
        const source = normalizeLegacyWeeks(stagedWeeks || current.current);
        const missing = Object.fromEntries(Object.entries(source).filter(([wk, week]) => {
          if (!existing.has(wk)) return true;
          try { return same(JSON.parse(existing.get(wk)).week, week); } catch { return false; }
        }));
        await importRows(cloud, await migrationRows(missing, id));
        setImportReport(`${Object.keys(missing).length} weeks processed. ${Object.keys(source).length - Object.keys(missing).length} existing cloud weeks kept unchanged.`);
        rows = await readPages(() => cloud.from('planner_reflections').select('id,period_start,notes,updated_at').eq('user_id', id).eq('period', 'weekly').order('period_start'));
      }
      if (identity.current !== id) return;
      const { weeks } = decodeWeeks(rows);
      const sync = new PlannerSync(cloud, id, {
        weeks: value => { if (identity.current === id) { current.current = value; p.setWeeks(value); } },
        records: (t, projects) => { if (identity.current === id) { setTasks(t); setProjects(projects); } },
        status: (value, collisions) => {
          if (identity.current !== id) return;
          setStatus(value); setConflicts([...collisions]);
          if (value === 'Saved to cloud') {
            setVersions(Object.fromEntries(Object.entries(sync.base).map(([key, entry]) => [key, entry.version])));
            const serialized = JSON.stringify(sync.local);
            setSavedWeeks(structuredClone(sync.local));
            localStorage.setItem('cdvrs_cloud_connection', JSON.stringify({ userId: id, weeks: serialized }));
          }
        },
      });
      engine.current?.stop(); engine.current = sync; sync.seed(rows, weeks);
      current.current = weeks; p.setWeeks(weeks);
      await sync.records();
      setNeedsChoice(false); setConnected(true); sync.emit('Saved to cloud');
    } catch (e) { setStatus(`Cloud connection failed: ${e.message}. Browser data is retained; retry is safe.`); }
    finally { connecting.current = false; }
  }

  useEffect(() => {
    if (!connected || !engine.current) return;
    engine.current.edit(p.weeks);
    if (!engine.current.dirty() || engine.current.conflicts.length) return;
    const timer = setTimeout(() => engine.current?.flush(), 650);
    return () => clearTimeout(timer);
  }, [p.weeks, connected]);

  useEffect(() => {
    if (!connected || !user) return;
    let timer;
    const schedule = () => { clearTimeout(timer); timer = setTimeout(() => engine.current?.flush(), 250); };
    const online = () => schedule();
    const visible = () => { if (document.visibilityState === 'visible') schedule(); };
    const interval = setInterval(() => { if (navigator.onLine && document.visibilityState === 'visible') schedule(); }, 60000);
    window.addEventListener('online', online); document.addEventListener('visibilitychange', visible);
    window.addEventListener('focus', visible);
    const channel = cloud.channel(`planner:${user.id}`);
    for (const table of ['planner_reflections', 'planner_tasks', 'planner_projects']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `user_id=eq.${user.id}` }, schedule);
    }
    channel.subscribe(state => { if (state === 'SUBSCRIBED') schedule(); });
    return () => {
      clearTimeout(timer); clearInterval(interval); window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', visible); window.removeEventListener('focus', visible);
      void cloud.removeChannel(channel);
    };
  }, [connected, user]);

  useEffect(() => {
    if (!user || !needsChoice) return;
    let remembered;
    try { remembered = JSON.parse(localStorage.getItem('cdvrs_cloud_connection')); } catch { return; }
    if (remembered?.userId === user.id) {
      try {
        if (same(JSON.parse(remembered.weeks), current.current)) {
          const timer = setTimeout(() => { void activate(false); }, 0);
          return () => clearTimeout(timer);
        }
      } catch { /* Keep the confirmation screen for an unreadable cache. */ }
    }
    // Saved-cache reconnection is keyed to account identity, not ongoing edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const pending = connected && !same(p.weeks, savedWeeks);
  return { user, ready: connected && !conflicts.length, needsChoice, conflicts,
    status: pending && status === 'Saved to cloud' ? 'Saving to cloud…' : status,
    importReport, tasks, projects, activate, refresh, version: versions[p.wk] || null,
    resolve: choices => engine.current?.resolve(choices),
    retry: () => engine.current?.flush(),
    reconnect: () => { engine.current?.stop(); setConnected(false); setNeedsChoice(true); },
  };
}
