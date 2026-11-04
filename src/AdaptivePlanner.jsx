import { useMemo, useState } from 'react';
import { cloud } from './lib/cloud';
import { busyIntervals } from './lib/calendar.js';
import { adaptiveCandidates, adaptiveFingerprint, approvedAdaptivePlan, validateAdaptive, earliestToday } from './lib/adaptive.js';

export default function AdaptivePlanner({ day, dk, p, c, model, zone }) {
  const plan = day.record?.plan || {};
  const [request, setRequest] = useState(plan.adaptive?.request || '');
  const [bounds, setBounds] = useState({ start_time: '', end_time: '' });
  const [weekly, setWeekly] = useState(false);
  const [result, setResult] = useState(null);
  const [basis, setBasis] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [approved, setApproved] = useState(false);
  const [notice, setNotice] = useState('');
  const candidates = useMemo(() => adaptiveCandidates(model, p.week, weekly, day), [model, p.week, weekly, day]);
  const fixed = busyIntervals({ ...day, record: { ...day.record, plan: { ...plan, adaptive: null, timeBlocks: (plan.timeBlocks || []).filter(block => block.locked) } } }, dk, zone);
  const fingerprint = adaptiveFingerprint(day, candidates, fixed, zone) + JSON.stringify({ request, bounds, weekly });
  const stale = Boolean(result?.proposal && basis !== fingerprint);
  const ready = c.ready && c.status === 'Saved to cloud';
  const invalidate = () => { setResult(null); setApproved(false); setNotice(''); };
  async function ask(event) {
    event.preventDefault(); setBusy(true); setError(''); setResult(null); setApproved(false); setNotice('');
    const startBasis = fingerprint;
    try {
      const { data: { session } } = await cloud.auth.getSession();
      if (!session) throw new Error('Sign in to adapt your day.');
      const response = await fetch('/api/organise', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({
        operation: 'adapt', date: dk, message: request, expectedVersion: c.version, candidates, fixed, bounds, timeZone: zone,
        currentSchedule: plan.timeBlocks || [], context: { nature: day.record?.nature, objective: plan.objective, priorityKeys: plan.priorityKeys, previousDay: p.week.days?.[dk]?.record?.handoff?.incoming },
      }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'CEED could not revise this day.');
      if (data.proposal) validateAdaptive(data.proposal, { candidates, fixed, bounds });
      setBasis(startBasis); setResult(data);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  function save() {
    setError('');
    try {
      if (!ready || stale || !approved) throw new Error('Wait for cloud sync and review a fresh proposal before approving.');
      const proposal = validateAdaptive(result.proposal, { candidates, fixed, bounds, earliest: earliestToday(dk, zone) });
      p.replaceDayPlan(dk, approvedAdaptivePlan(plan, proposal, request, crypto.randomUUID()));
      setResult(null); setApproved(false); setNotice('Revised plan approved.');
    } catch (e) { setError(e.message); }
  }
  function editTime(index, field, value) {
    setApproved(false); setResult(current => ({ ...current, proposal: { ...current.proposal, sessions: current.proposal.sessions.map((session, i) => i === index ? { ...session, [field]: value } : session) } }));
  }
  const shown = result?.proposal || plan.adaptive;
  return <section className="dashboard-card adaptive-planner" aria-label="Adapt my day">
    <span className="eyebrow">CEED · A PLAN THAT FITS YOUR LIFE</span>
    <h2>My day has changed.</h2><p>Work, a late start, travel or less energy? Tell CEED what’s different. Review a realistic plan before it changes.</p>
    <form onSubmit={ask}>
      <label className="record-field"><span>What does CEED need to work around?</span><textarea required maxLength={2000} value={request} onChange={e => { setRequest(e.target.value); invalidate(); }} placeholder="I wake at 14:00. I work 16:00–18:00, with 30 minutes travel each way. Keep tonight light and fit in the most useful tasks." /></label>
      <div className="adaptive-presets">{[['Late start', 'I wake at 14:00 today. Help me choose a realistic amount of work, with breaks.'], ['Working today', 'I’m working today. Ask me for any shift or travel times you need, then rework my day.'], ['Travelling', 'I’m going to London today. Ask me about travel times and which tasks I can do away from home.']].map(([label, text]) => <button type="button" key={label} onClick={() => { setRequest(text); invalidate(); }}>{label}</button>)}</div>
      <div className="adaptive-hours"><label>Earliest planning time <input type="time" value={bounds.start_time} onChange={e => { setBounds({ ...bounds, start_time: e.target.value }); invalidate(); }} /></label><label>Finish planning by <input type="time" value={bounds.end_time} onChange={e => { setBounds({ ...bounds, end_time: e.target.value }); invalidate(); }} /></label></div>
      <p className="schedule-note">Optional · {zone}. Include work, commute and travel times in your message. CEED asks when times are unclear.</p>
      <label className="adaptive-check"><input type="checkbox" checked={weekly} onChange={e => { setWeekly(e.target.checked); invalidate(); }} /> Also consider unfinished Weekly OS items</label>
      <p className="schedule-note">{candidates.length} items to consider (up to 80 per request). Remaining items stay untouched. Calendar events, commitments and locked blocks stay fixed. Tasks left unscheduled remain in your task lists; their dates and completion state stay as they are.</p>
      <button className="primary-action" disabled={!ready || busy || !request.trim()}>{busy ? 'CEED is reworking your day…' : 'Rework my day'}</button>
      {!c.ready && <p className="schedule-note">Sign in and connect your cloud Planner to use this.</p>}
    </form>
    {result?.clarification && <div className="adaptive-question" role="status"><strong>CEED needs one detail</strong><p>{result.clarification}</p><p>Add the answer to your message above, then try again.</p></div>}
    {shown && <div className="adaptive-review"><span className="eyebrow">{result?.proposal ? 'PROPOSED · NOT SAVED' : 'YOUR APPROVED PLAN'}</span><h3>{shown.start_time}–{shown.end_time} · {zone}</h3><p>{shown.summary}</p>
      {shown.assumptions && <p className="schedule-note">Planning assumptions: {shown.assumptions}</p>}
      {shown.unavailable.length > 0 && <div><h4>Work, travel & unavailable time</h4>{shown.unavailable.map((item, i) => <p key={i}>{item.start_time}–{item.end_time} · {item.title}</p>)}</div>}
      {shown.priorityKeys.length > 0 && <div><h4>Main priorities</h4><ol>{shown.priorityKeys.map(key => <li key={key}>{shown.sessions.find(s => s.key === key)?.title || candidates.find(task => task.key === key)?.title || 'Task updated'}</li>)}</ol></div>}
      <div className="adaptive-comparison">{result?.proposal && <div><h4>Before · flexible schedule</h4>{!(plan.timeBlocks || []).filter(b => !b.locked).length && <p>No flexible blocks yet.</p>}{(plan.timeBlocks || []).filter(b => !b.locked).map(b => <p key={b.id}>{b.start_time}–{b.end_time} · {b.title}</p>)}</div>}
      <div><h4>{result?.proposal ? 'After · proposed schedule' : 'Planned sessions'}</h4>{!shown.sessions.length && <p>No additional work fits. Leave room to rest.</p>}<ol className="adaptive-timeline">{shown.sessions.map((item, i) => <li key={`${item.key}:${i}`}><strong>{item.title}</strong>{result?.proposal ? <div className="adaptive-hours"><input aria-label={`Start ${item.title}`} type="time" value={item.start_time} onChange={e => editTime(i, 'start_time', e.target.value)} /><span>–</span><input aria-label={`End ${item.title}`} type="time" value={item.end_time} onChange={e => editTime(i, 'end_time', e.target.value)} /></div> : <p>{item.start_time}–{item.end_time}</p>}<p>{item.reason}</p></li>)}</ol></div></div>
      {shown.later.length > 0 && <details open><summary>Left unscheduled · {shown.later.length}</summary><ul>{shown.later.map(item => <li key={item.key}><strong>{item.title}</strong><p>{item.reason}</p></li>)}</ul></details>}
      {result?.proposal && <><label className="adaptive-check"><input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)} /> I’ve reviewed these hours and approve replacing this day’s flexible schedule.</label>{stale && <p role="alert">Your tasks or schedule changed. Ask CEED for a fresh proposal.</p>}<div className="adaptive-presets"><button disabled={!ready || busy || stale || !approved} onClick={save}>Approve revised day & save</button><button onClick={invalidate}>Discard proposal</button></div></>}
      {!result && plan.adaptive?.previous && <button disabled={!ready} onClick={() => { const previous = plan.adaptive.previous; p.replaceDayPlan(dk, { ...plan, ...previous }); setNotice('Previous schedule restored.'); }}>Undo last replan</button>}
    </div>}
    {notice && <p role="status">{notice} {c.status}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
