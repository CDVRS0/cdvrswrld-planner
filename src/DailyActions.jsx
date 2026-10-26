import { useState } from 'react';
import { updateCloudAction } from './lib/daily-cloud';
import { cloud } from './lib/cloud';
import { same } from './lib/sync';

export default function DailyActions({ model, day, dk, p, c }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [review, setReview] = useState(null), [selected, setSelected] = useState([]);
  const [approved, setApproved] = useState(false), [notice, setNotice] = useState('');
  const locked = busy || !c.ready || c.status !== 'Saved to cloud';
  const priorityKeys = model.priorities.map(t => t.key);
  function pin(task) {
    const next = priorityKeys.includes(task.key) ? priorityKeys.filter(k => k !== task.key) : [...priorityKeys, task.key];
    if (next.length > 3) return;
    p.updateDayRecord(dk, 'plan', 'priorityKeys', next);
  }
  function preview(items) {
    setReview({ day: structuredClone(day), items: structuredClone(items) });
    setSelected(items.map(t => t.key)); setApproved(false); setError(''); setNotice('');
  }
  async function change(items, action) {
    if (locked) return;
    setBusy(true); setError(''); setNotice('');
    try {
      if (action === 'delete' && (!review || !same(day, review.day) || items.some(t => !model.unfinished.some(fresh => same(t, fresh))))) {
        throw new Error('The day changed since this review. Cancel and review again.');
      }
      for (const item of items.filter(t => t.kind === 'cloud' || (t.taskId && action === 'complete'))) {
        const task = item.kind === 'cloud' ? item : item.linkedTask;
        if (!task) throw new Error('The original cloud task is unavailable. Refresh before completing it.');
        await updateCloudAction(cloud, c.user.id, task, { status: action === 'delete' ? 'cancelled' : action === 'restore' ? 'todo' : 'done' });
      }
      if (items.some(t => t.kind !== 'cloud')) p.changeDailyActions(dk, items.map(t => t.key), action);
      await c.refresh(); setReview(null);
      setNotice(action === 'delete' ? 'Removed from this day. Restore them below if needed. Check the cloud save status before leaving.' : action === 'restore' ? 'Action restored. Check the cloud save status before leaving.' : 'Action completed.');
    } catch (e) { setError(e.message); await c.refresh().catch(() => {}); }
    finally { setBusy(false); }
  }
  async function today(task) {
    if (locked) return;
    setBusy(true); setError('');
    try {
      if (task.kind === 'local') p.carryForward(dk, [{ id: task.incomingId, text: task.title, label: task.label, sourceDate: task.sourceDate, kind: 'action' }]);
      else { await updateCloudAction(cloud, c.user.id, task, { scheduled_date: dk }); await c.refresh(); }
    }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  function row(task, backlog = false) {
    const pinned = priorityKeys.includes(task.key);
    return <div className="daily-action-row" key={task.key}>
      <label><input type="checkbox" checked={false} disabled={locked} onChange={() => change([task], 'complete')} /><span>{task.title}<small>{task.label}{backlog && (task.sourceDate || task.scheduled_date || task.due_date) ? ` · ${task.sourceDate || task.scheduled_date || task.due_date}` : ''}</small></span></label>
      <div className="daily-action-tools">{backlog ? <button disabled={locked} onClick={() => today(task)}>Add to this day</button> : <button disabled={locked || (!pinned && priorityKeys.length === 3)} aria-label={`${pinned ? 'Unpin' : 'Prioritise'} ${task.title}`} aria-pressed={pinned} onClick={() => pin(task)}>{pinned ? 'Unpin' : 'Prioritise'}</button>}
      <>{!backlog && <button disabled={locked} aria-label={`Delete ${task.title}`} onClick={() => preview([task])}>Delete</button>}</></div>
    </div>;
  }
  return <section className="dashboard-card daily-focus"><span className="eyebrow">FOCUS FIRST · UP TO THREE</span><h2>Your priorities</h2>
    <p className="schedule-note">Choose what matters for {dk}. OS prompts stay in the daily flow and do not count as tasks.</p>
    <ol className="priority-slots">{[0, 1, 2].map(i => <li key={i}>{model.priorities[i] ? <><span>{model.priorities[i].title}</span><button disabled={locked} aria-label={`Unpin ${model.priorities[i].title}`} onClick={() => pin(model.priorities[i])}>Unpin</button></> : <span className="muted">Choose priority {i + 1} from your actions below</span>}</li>)}</ol>
    <h3>Actions for this day <span className="action-count">{model.unfinished.length}</span></h3>
    {!model.unfinished.length && <p className="schedule-note">A fresh start. Add an action below, or bring one in from your backlog.</p>}
    {model.unfinished.map(task => row(task))}
    {model.unfinished.length > 0 && <button className="fresh-day-button" disabled={locked} onClick={() => preview(model.unfinished)}>Start fresh · review unfinished actions</button>}
    {review && <div className="fresh-day-review" role="region" aria-label="Review unfinished actions to delete"><h3>Review actions to remove</h3>
      <p>Selected unfinished actions will be removed from your plan. You can restore them from Deleted actions. Completed work, OS prompts, notes, calendar events and other days stay in place.</p>
      {review.items.map(t => <label className="consent" key={t.key}><input type="checkbox" checked={selected.includes(t.key)} disabled={busy} onChange={e => { setSelected(v => e.target.checked ? [...v, t.key] : v.filter(k => k !== t.key)); setApproved(false); }} />{t.title}</label>)}
      <label className="consent"><input type="checkbox" checked={approved} disabled={busy} onChange={e => setApproved(e.target.checked)} />I approve removing these {selected.length} unfinished actions.</label>
      <div className="daily-action-tools"><button disabled={locked || !approved || !selected.length} onClick={() => change(review.items.filter(t => selected.includes(t.key)), 'delete')}>Remove selected actions</button><button disabled={busy} onClick={() => setReview(null)}>Cancel</button></div>
    </div>}
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
    {model.backlog.length > 0 && <details className="daily-backlog"><summary>Backlog · {model.backlog.length}</summary><p className="schedule-note">Earlier and unscheduled tasks. Add only what fits this day.</p>{model.backlog.map(task => row(task, true))}</details>}
    {model.deleted.length > 0 && <details><summary>Deleted actions · {model.deleted.length}</summary>{model.deleted.map(task => <div className="daily-action-row" key={task.key}><span>{task.title}</span><button disabled={locked} onClick={() => change([task], 'restore')}>Restore</button></div>)}</details>}
  </section>;
}
