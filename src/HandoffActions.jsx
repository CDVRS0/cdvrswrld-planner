import { useState } from 'react';
import { cloud, checked } from './lib/cloud';
import { carryCandidates, handoffText, nextDay, weekKey } from './lib/handoff';
import { same } from './lib/sync';

export function IncomingHandoff({ day, dk, p, c }) {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const incoming = day.record?.handoff?.incoming || {};
  if (!Object.keys(incoming).length) return null;
  return <section className="dashboard-card"><span className="eyebrow">CARRIED INTO THIS DAY</span><h2>Your approved handoff</h2>
    <p>These are the items you chose to bring forward. Original day records and task dates stay intact.</p>
    {Object.values(incoming).map(item => {
      const task = item.taskId && c.tasks.find(t => t.id === item.taskId);
      const done = item.taskId ? task && ['done', 'cancelled'].includes(task.status) : item.done;
      return <label className="dashboard-task" key={item.id}><input type="checkbox" checked={Boolean(done)} disabled={!c.ready || busy || Boolean(item.taskId && !task)} onChange={async () => {
        setError(''); setBusy(true);
        try {
          if (item.taskId) {
            const rows = await checked(cloud.from('planner_tasks').update({ status: done ? 'todo' : 'done', updated_at: new Date().toISOString() }).eq('user_id', c.user.id).eq('id', item.taskId).eq('updated_at', task.updated_at).select('id'));
            if (!rows.length) throw new Error('That task changed. Refresh before trying again.');
            await c.refresh();
          } else p.updateDayRecord(dk, 'handoff', 'incoming', { ...incoming, [item.id]: { ...item, done: !item.done } });
        } catch (e) { setError(e.message); } finally { setBusy(false); }
      }} /><span>{task?.title || item.text}<small>From {item.sourceDate} · {item.taskId ? (task ? 'completes the existing cloud task' : 'original cloud task unavailable') : item.label}</small></span></label>;
    })}
    {error && <p role="alert">{error}</p>}
  </section>;
}

export default function HandoffActions({ day, dk, p, c }) {
  const [review, setReview] = useState(null), [selected, setSelected] = useState([]), [text, setText] = useState('');
  const [approved, setApproved] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [link, setLink] = useState('');
  const candidates = carryCandidates(day, dk, c.tasks), target = nextDay(dk);
  const incoming = p.weeks[weekKey(target)]?.days?.[target]?.record?.handoff?.incoming || {};
  const locked = !c.ready || busy || c.status !== 'Saved to cloud';
  function preview(mode) {
    setError(''); setNotice(''); setLink(''); setApproved(false);
    const items = candidates.filter(item => mode === 'ai' || !Object.hasOwn(incoming, item.id));
    const chosen = items.filter(item => item.kind === 'note').map(item => item.id);
    setSelected(chosen);
    setReview({ mode, items, source: structuredClone(day), requestId: crypto.randomUUID() });
    setText(handoffText(day, dk, items.filter(item => chosen.includes(item.id))));
  }
  async function save() {
    setError('');
    if (!approved || locked) return;
    if (!same(day, review.source)) { setError('This day changed since your preview. Close it and review again.'); return; }
    const fresh = carryCandidates(day, dk, c.tasks);
    const entries = review.items.filter(item => selected.includes(item.id));
    if (entries.some(item => !fresh.some(value => same(value, item)))) { setError('An unfinished item changed. Close this preview and review again.'); return; }
    if (review.mode === 'carry') {
      p.carryForward(target, entries); setReview(null); setNotice(`Approved for ${target}. Check the cloud save status before leaving.`); return;
    }
    setBusy(true);
    try {
      const { data: { session } } = await cloud.auth.getSession();
      if (!session) throw new Error('Sign in to send a handoff.');
      const response = await fetch('/api/organise', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ operation: 'handoff', approved: true, requestId: review.requestId, date: dk, text }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Handoff could not be saved. Retry this same preview safely.');
      setLink(result.url); setReview(null); setNotice('Handoff saved in a CDVRS AI conversation. Open it and ask your next question. Sign in with the same account if prompted.');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <section className="dashboard-card handoff-actions"><span className="eyebrow">NEXT STEPS · YOUR APPROVAL</span><h2>Carry your context forward</h2>
    <p>Choose unfinished actions and reminders for {target}, or send reviewed context to your existing CDVRS AI chat.</p>
    <div className="handoff-buttons"><button disabled={locked} onClick={() => preview('carry')}>Review tomorrow’s carry-forward</button><button disabled={locked} onClick={() => preview('ai')}>Review handoff to CDVRS AI</button></div>
    {c.ready && c.status !== 'Saved to cloud' && <p role="status">Finish saving to cloud before preparing a handoff.</p>}
    {review && <div className="handoff-review"><h3>{review.mode === 'carry' ? `Review items for ${target}` : 'Review what CDVRS AI will receive'}</h3>
      <p>{review.mode === 'carry' ? 'Only selected items are added to the next day’s handoff checklist. Existing notes are preserved; task dates and calendar events are unchanged.' : 'Selected items and the day context below will be saved as a message in a new CDVRS AI conversation. No AI response or Planner change runs automatically.'}</p>
      <div className="handoff-candidates">{review.items.map(item => <label className="dashboard-task" key={item.id}><input type="checkbox" checked={selected.includes(item.id)} disabled={busy} onChange={e => {
        const next = e.target.checked ? [...selected, item.id] : selected.filter(id => id !== item.id); setSelected(next); setApproved(false);
        setText(handoffText(review.source, dk, review.items.filter(value => next.includes(value.id))));
      }} /><span>{item.text}<small>{item.label} · {item.sourceDate}</small></span></label>)}</div>
      {!review.items.length && <p>No new unfinished items or reminders to carry forward.</p>}
      {review.mode === 'ai' && <label className="record-field"><span>Exact handoff message (editable)</span><textarea aria-label="Exact handoff message" className="handoff-message" maxLength={20000} disabled={busy} value={text} onChange={e => { setText(e.target.value); setApproved(false); }} /></label>}
      {review.mode === 'ai' && text.length > 20000 && <p role="alert">Shorten the handoff to 20,000 characters before sending ({text.length.toLocaleString()} currently).</p>}
      <label className="dashboard-task"><input type="checkbox" disabled={busy} checked={approved} onChange={e => setApproved(e.target.checked)} /><span>{review.mode === 'carry' ? `I approve saving these selected items to ${target}.` : 'I approve sending this message to my CDVRS AI conversation.'}</span></label>
      <div className="handoff-buttons"><button disabled={locked || !approved || (review.mode === 'carry' ? !selected.length : !text.trim()) || text.length > 20000} onClick={save}>{busy ? 'Saving handoff…' : review.mode === 'carry' ? 'Approve & save to tomorrow' : 'Approve & send to CDVRS AI'}</button><button disabled={busy} onClick={() => { setReview(null); setError(''); }}>Close preview</button></div>
    </div>}
    {notice && <p role="status">{notice}</p>}{link && <a href={link} target="_blank" rel="noopener noreferrer">Open handoff in CDVRS AI →</a>}{error && <p role="alert">{error}</p>}
  </section>;
}
