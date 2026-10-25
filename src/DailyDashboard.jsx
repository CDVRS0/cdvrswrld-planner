import HandoffActions, { IncomingHandoff } from './HandoffActions';
import { useState } from 'react';
import { cloud, checked } from './lib/cloud';
import { busyIntervals, timeInZone, viewerZone, wallInstant } from './lib/calendar';
import { googleEventLink } from './lib/google-calendar';

export default function DailyDashboard({ day, dk, p, c, onContinue }) {
  const [question, setQuestion] = useState('Help me organise this day around my priorities and commitments.');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState([]);
  const [title, setTitle] = useState('');
  const zone = p.week.timeZone || viewerZone();
  const timeBlocks = day.record?.plan?.timeBlocks || [];
  const local = day.blocks.flatMap((b, bi) => b.tasks.map((t, ti) => ({ ...t, bi, ti, label: b.label, stage: b.stepKey })));
  const outstanding = local.filter(t => !t.done);
  const stageRank = { plan: 0, work: 1, creative: 2, social: 3 };
  const focus = [...outstanding].sort((a, b) => (stageRank[a.stage] ?? 4) - (stageRank[b.stage] ?? 4));
  const commitments = (day.record?.plan?.commitments || '').split('\n').map(line => line.match(/^([01]\d|2[0-3]):([0-5]\d)\s+(.+)$/)).filter(Boolean)
    .map(m => ({ time: `${m[1]}:${m[2]}`, title: m[3] })).sort((a, b) => a.time.localeCompare(b.time));
  const cloudTasks = c.tasks.filter(t => t.source !== 'migration' && !['done', 'cancelled'].includes(t.status));
  const due = cloudTasks.filter(t => (t.scheduled_date && t.scheduled_date <= dk) || (t.due_date && t.due_date <= dk));
  const earlier = c.tasks.filter(t => t.source === 'migration' && t.scheduled_date < dk && !['done', 'cancelled'].includes(t.status));
  const priorities = [...due].sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority]));

  async function organise() {
    setBusy(true); setError(''); setResult(null); setSaved([]);
    try {
      const { data: { session } } = await cloud.auth.getSession();
      if (!session) throw new Error('Sign in to use CDVRS AI.');
      const response = await fetch('/api/organise', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ message: question, date: dk, day, busy: busyIntervals(day, dk, zone), timeZone: zone }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'CDVRS AI could not respond.');
      setResult(data);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function apply(action) {
    setBusy(true); setError('');
    try {
      if (action.kind === 'time_block') {
        if (action.date !== dk) throw new Error('Open the proposed date before approving its time block.');
        const start = wallInstant(dk, action.start_time, zone), end = wallInstant(dk, action.end_time, zone);
        if (end <= start) throw new Error('The end time must be later on the same day.');
        const startMinute = Number(action.start_time.slice(0, 2)) * 60 + Number(action.start_time.slice(3));
        const endMinute = Number(action.end_time.slice(0, 2)) * 60 + Number(action.end_time.slice(3));
        const collision = busyIntervals(day, dk, zone).find(window => (!action.block_id || window.id !== action.block_id) && startMinute < window.end && endMinute > window.start);
        if (collision) throw new Error(`This block overlaps ${collision.title}. Ask for a different time.`);
        if (action.block_id && !timeBlocks.some(block => block.id === action.block_id)) throw new Error('That time block changed. Ask for a fresh proposal.');
        const block = { id: action.block_id || action.id, title: action.title, start_time: action.start_time, end_time: action.end_time, source: 'ai' };
        p.updateDayRecord(dk, 'plan', 'timeBlocks', [...timeBlocks.filter(b => b.id !== action.block_id), block]);
      } else if (action.task_id) {
        const original = c.tasks.find(t => t.id === action.task_id);
        if (!original || original.source === 'migration') throw new Error('This task is managed in the guided daily flow. Edit it there.');
        const rows = await checked(cloud.from('planner_tasks').update({ scheduled_date: action.date, updated_at: new Date().toISOString() })
          .eq('user_id', c.user.id).eq('id', action.task_id).eq('updated_at', original.updated_at).select('id'));
        if (!rows.length) throw new Error('Task changed on another device. Refresh before applying.');
      } else {
        await checked(cloud.from('planner_tasks').insert({ id: action.id, user_id: c.user.id, title: action.title, scheduled_date: action.date, priority: action.priority, source: 'ai' }));
      }
      setSaved(s => [...s, action.id]); await c.refresh();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function addTask(e) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      await checked(cloud.from('planner_tasks').insert({ user_id: c.user.id, title: title.trim(), scheduled_date: dk, source: 'manual' }));
      setTitle(''); await c.refresh();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <div className="dashboard">
    <section className="daily-hero"><span className="eyebrow">YOUR DAY, WITH INTENTION</span>
      <p>{new Date(`${dk}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      <h1>A little clarity.<br />Room to create.</h1>
      <p>{day.record?.plan?.objective || 'Set an intention, choose your priorities, and work through the day at your pace.'}</p>
      <div className="daily-metrics"><span><strong>{outstanding.length + due.length}</strong> outstanding</span><span><strong>{local.filter(t => t.done).length}</strong> complete</span><span><strong>{c.projects.filter(p => p.status === 'active').length}</strong> active projects</span></div>
      <button className="primary-action" onClick={onContinue}>Open daily flow →</button>
    </section>
    <IncomingHandoff day={day} dk={dk} p={p} c={c} />
    <div className="dashboard-columns"><section className="dashboard-card"><span className="eyebrow">FOCUS FIRST</span><h2>Priorities & outstanding</h2>
      {(day.record?.plan?.objective || day.record?.work?.firstAction) && <p className="focus-intention">{day.record?.work?.firstAction || day.record?.plan?.objective}</p>}
      {priorities.map(t => <label className="dashboard-task" key={t.id}><input type="checkbox" disabled={!c.ready || busy} checked={false} onChange={async () => {
        setBusy(true); try { await checked(cloud.from('planner_tasks').update({ status: 'done', updated_at: new Date().toISOString() }).eq('id', t.id).eq('user_id', c.user.id)); await c.refresh(); } catch (e) { setError(e.message); } finally { setBusy(false); }
      }} /><span>{t.title}<small>{t.priority} · {t.due_date && t.due_date < dk ? 'overdue' : 'cloud task'}</small></span></label>)}
      {focus.slice(0, 6).map(t => <label className="dashboard-task" key={`${t.bi}/${t.ti}`}><input type="checkbox" checked={false} disabled={!c.ready} onChange={() => p.toggleTask(dk, t.bi, t.ti)} /><span>{t.text}<small>{t.label}</small></span></label>)}
      {!outstanding.length && !priorities.length && <p>You’re clear for this day. Add your next action below.</p>}
      {outstanding.length > 6 && <button onClick={onContinue}>View all {outstanding.length} daily actions →</button>}
      <form onSubmit={addTask} className="mini-input-row"><input aria-label="New cloud task" value={title} maxLength={300} required onChange={e => setTitle(e.target.value)} placeholder="Add a priority…" /><button disabled={!c.ready || busy || !title.trim()}>Add</button></form>
      {cloudTasks.filter(t => !t.scheduled_date && !t.due_date).length > 0 && <details><summary>Unscheduled cloud tasks</summary>{cloudTasks.filter(t => !t.scheduled_date && !t.due_date).map(t => <p key={t.id}>{t.title}</p>)}</details>}
      {earlier.length > 0 && <details><summary>{earlier.length} earlier unfinished actions</summary>{earlier.slice(0, 15).map(t => <p key={t.id}>{t.scheduled_date} · {t.title}</p>)}<p>Open the original day in the daily flow to complete or edit these actions.</p></details>}
    </section>
    <section className="dashboard-card"><span className="eyebrow">A RHYTHM FOR YOUR DAY</span><h2>Visual schedule</h2><p className="schedule-note">Times shown in {zone}</p>
      {(day.calendarEvents || []).length > 0 && <><h3>Calendar commitments</h3><ul className="calendar-events">{day.calendarEvents.map(event => <li key={event.id}><strong>{event.allDay ? 'All day' : `${timeInZone(new Date(event.start), zone)}–${timeInZone(new Date(event.end), zone)}`}</strong> · {event.title}<small> · {event.provider === 'apple' ? 'Apple Calendar' : 'Google Calendar'}</small></li>)}</ul></>}
      {timeBlocks.length > 0 && <><h3>Approved time blocks</h3><div className="time-blocks">{timeBlocks.map(block => <div key={block.id}><strong>{block.start_time}–{block.end_time}</strong> · {block.title}
        <button disabled={!c.ready} onClick={() => { try {
          window.open(googleEventLink({ title: block.title, start: wallInstant(dk, block.start_time, zone), end: wallInstant(dk, block.end_time, zone) }), '_blank', 'noopener,noreferrer');
        } catch (e) { setError(e.message); } }}>Review in Google Calendar</button>
        <button disabled={!c.ready} onClick={() => p.updateDayRecord(dk, 'plan', 'timeBlocks', timeBlocks.filter(item => item.id !== block.id))}>Remove block</button>
      </div>)}</div><p className="schedule-note">Google opens an event draft. Save it there to add it to the Google calendar shown in Apple Calendar.</p></>}
      <label className="record-field"><span>Scheduled commitments</span><textarea aria-label="Scheduled commitments" disabled={!c.ready} value={day.record?.plan?.commitments || ''} onChange={e => p.updateDayRecord(dk, 'plan', 'commitments', e.target.value)} placeholder={'09:00 Client call\n14:00 Creative session'} /></label>
      <p className="schedule-note">One commitment per line: HH:MM followed by its name. Times are local to your day.</p>
      <ol className="timeline">{commitments.map((item, i) => <li key={`${item.time}/${i}`}><span className="timeline-time">{item.time}</span><div><strong>{item.title}</strong></div></li>)}</ol>
      <details open={!commitments.length}><summary>Daily OS flow</summary><ol className="timeline">{day.blocks.map((b, bi) => <li key={`${b.stepKey}/${bi}`}><span className="timeline-time">{b.time}</span><div><strong>{b.label}</strong><small>{b.tasks.filter(t => t.done).length}/{b.tasks.length} actions complete</small></div></li>)}</ol></details>
      {due.map(t => <p key={t.id} className="schedule-note">{dk} · {t.title}</p>)}
    </section></div>
    <HandoffActions day={day} dk={dk} p={p} c={c} />
    <section className="dashboard-card ai-card"><span className="eyebrow">CDVRS AI · YOU STAY IN CONTROL</span><h2>Make space for what matters.</h2><p>Ask for a practical plan using this day’s records, tasks and cloud projects. Suggestions stay here until you approve them.</p>
      <label className="record-field"><span>Your request</span><textarea aria-label="Your request" value={question} onChange={e => setQuestion(e.target.value)} maxLength={2000} /></label>
      <button disabled={!c.ready || busy || !question.trim()} onClick={organise}>{busy ? 'Working…' : 'Organise my day'}</button>
      {result && <div className="ai-result"><p style={{ whiteSpace: 'pre-wrap' }}>{result.summary}</p>{result.actions.map((a, i) => <article className="proposal" key={a.id}>
        <div><strong>{a.kind === 'time_block' ? (a.block_id ? 'Edit time block' : 'Plan time block') : a.task_id ? 'Move task' : 'Create task'}: {a.title}</strong>
          <p>{a.date} · {a.kind === 'time_block' ? `${a.start_time}–${a.end_time} (${zone})` : a.priority}</p><p>{a.reason}</p>
          {a.conflicts?.length > 0 && <p role="alert">Overlaps {a.conflicts.join(', ')}. Ask for a different time.</p>}</div>
        <button disabled={busy || saved.includes(a.id) || !c.ready || Boolean(a.conflicts?.length)} onClick={() => apply(a)}>{saved.includes(a.id) ? (a.kind === 'time_block' && c.status !== 'Saved to cloud' ? 'Pending cloud save' : 'Saved') : 'Approve & save'}</button>
        <button disabled={saved.includes(a.id)} onClick={() => setResult(r => ({ ...r, actions: r.actions.filter((_, index) => index !== i) }))}>Dismiss</button>
      </article>)}</div>}
      {error && <p role="alert">{error}</p>}
    </section>
  </div>;
}
