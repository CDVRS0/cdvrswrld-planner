import { useEffect, useRef, useState } from 'react';
import { cloud } from './lib/cloud';
import { readDataLines } from './lib/stream';
import { carryCandidates, handoffText } from './lib/handoff';

const names = { nature: 'Nature', plan: 'Daily Planning', work: 'Work', social: 'Social', creative: 'Creative', reading: 'Reading', bible: 'Bible Study', handoff: 'Handoff', review: 'Evening Review' };
export default function AgentChat({ day, dk, section, p, c }) {
  const [question, setQuestion] = useState(day.record?.[section]?.ask || '');
  const [messages, setMessages] = useState([]), [answer, setAnswer] = useState(''), [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [needsReload, setNeedsReload] = useState(false);
  const [review, setReview] = useState(null), [approved, setApproved] = useState(false);
  const active = useRef(null), mounted = useRef(true), historyRequest = useRef(null);
  const currentHandoff = section === 'handoff' ? handoffText(day, dk, carryCandidates(day, dk, c.tasks)) : '';
  const locked = !c.ready || c.status !== 'Saved to cloud' || !c.version;
  async function request(body, signal) {
    const { data: { session } } = await cloud.auth.getSession();
    if (!session) throw new Error('Sign in to use CDVRS AI.');
    return fetch('/api/agent', { method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ date: dk, section, ...body }) });
  }
  async function load(signal) {
    await Promise.resolve();
    if (!mounted.current || signal?.aborted) return;
    setLoading(true); setError('');
    try {
      const response = await request({ operation: 'history' }, signal), data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load saved chat.');
      if (!mounted.current || signal?.aborted) return;
      setMessages(data.messages || []); setNeedsReload(false); setAnswer(''); setStatus('Saved chat loaded');
    } catch (e) { if (mounted.current && !signal?.aborted) { setError(e.message); setNeedsReload(true); } }
    finally { if (mounted.current && !signal?.aborted) setLoading(false); }
  }
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController(); historyRequest.current = controller;
    const timer = c.ready ? setTimeout(() => { void load(controller.signal); }, 0) : null;
    return () => { clearTimeout(timer); mounted.current = false; controller.abort(); active.current?.abort(); };
    // History loads once for this owned day/section. Current context is read afresh on every send.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.ready, dk, section, c.user?.id]);

  async function send(prompt = question) {
    if (locked || busy || loading || needsReload || !prompt.trim()) return;
    if (section === 'handoff' && (!approved || !review || review.initialText !== currentHandoff)) {
      setApproved(false); setError('Review and approve the current Handoff context before sending.'); return;
    }
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setError(''); setAnswer(''); setStatus('Connecting to CDVRS AI…');
    let accumulated = '', finished = false;
    try {
      const response = await request({ operation: 'send', message: prompt.trim(), requestId: crypto.randomUUID(), expectedVersion: c.version,
        ...(section === 'handoff' ? { contextApproved: true, reviewedContext: review.text } : {}) }, AbortSignal.any([controller.signal, AbortSignal.timeout(115000)]));
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'Could not start chat.'); }
      if (!response.headers.get('content-type')?.includes('text/event-stream')) {
        const data = await response.json(); if (!data.cached) throw new Error('Unexpected chat response. Reload saved chat.');
        await load(controller.signal); finished = true; return;
      }
      if (!response.body) throw new Error('No reply stream. Reload saved chat.');
      for await (const line of readDataLines(response.body, true, controller.signal)) {
        if (!mounted.current || controller.signal.aborted) break;
        const event = JSON.parse(line);
        if (event.type === 'saved') { setMessages(items => [...items, { id: event.userId, role: 'user', content: event.content }]); if (prompt.trim() === question.trim()) { setQuestion(''); p.updateDayRecord(dk, section, 'ask', ''); } }
        else if (event.type === 'status') setStatus(event.message);
        else if (event.type === 'delta') { accumulated += event.text; setAnswer(accumulated); setStatus('CDVRS AI is replying…'); }
        else if (event.type === 'done') { setMessages(items => [...items, { id: crypto.randomUUID(), role: 'assistant', content: event.message }]); setAnswer(''); setStatus('Conversation saved to cloud'); finished = true; }
        else if (event.type === 'error') throw new Error(event.error);
      }
      if (!finished && !controller.signal.aborted) throw new Error('Reply interrupted. Reload saved chat before asking again.');
    } catch (e) {
      if (mounted.current && !controller.signal.aborted) { setError(e.message); setNeedsReload(true); setStatus('Reload saved chat to check what was saved.'); }
    } finally { if (mounted.current) setBusy(false); active.current = null; }
  }
  return <section className="agent-chat" aria-label={`${names[section]} chat`}>
    <span className="eyebrow">CDVRS AI · {dk}</span><h3>Chat with your {names[section]} Agent</h3>
    <p>{section === 'handoff' ? 'Review the exact Planner context, then continue the conversation here.' : `Ask what to do in ${names[section]} for this day. Sending shares this section’s saved tasks and notes, energy, main objective, carried items and calendar commitments with CDVRS AI.`}</p>
    <p className="schedule-note">Messages and replies save to cloud. Suggestions do not change tasks or schedules; use the Planner’s approval controls to save a change. Each day and section has its own chat.</p>
    {!c.version && c.ready && <button type="button" onClick={p.ensureWeek}>Save this day to cloud for chat</button>}
    {section === 'handoff' && <div className="chat-context-review"><button type="button" disabled={locked || busy} onClick={() => { setReview({ text: currentHandoff, initialText: currentHandoff }); setApproved(false); setError(''); }}>Review context for this chat</button>
      {review && <><label className="record-field"><span>Context shared with Handoff chat</span><textarea aria-label="Context shared with Handoff chat" maxLength={20000} disabled={busy} value={review.text} onChange={e => { setReview(r => ({ ...r, text: e.target.value })); setApproved(false); }} /></label>
        {review.text.length > 20000 && <p role="alert">Shorten the context to 20,000 characters.</p>}
        <label className="dashboard-task"><input type="checkbox" checked={approved} disabled={busy || !review.text.trim() || review.text.length > 20000} onChange={e => setApproved(e.target.checked)} /><span>I approve sharing this context with my Handoff chat.</span></label>
        {(review.initialText !== currentHandoff) && <p role="alert">Your Planner changed. Review context again before sending.</p>}</>}
    </div>}
    <div className="agent-chat-history" role="log" aria-label={`${names[section]} conversation`}>
      {!messages.length && !loading && <p>No messages yet. Ask for the next useful action.</p>}
      {messages.map(message => { const [main, context] = message.content.split('\n\nAPPROVED HANDOFF CONTEXT:\n'); return <article key={message.id} className={`agent-message ${message.role}`}><strong>{message.role === 'assistant' ? 'CDVRS AI' : 'You'}</strong><p>{main}</p>{context && <details><summary>Approved context shared with this message</summary><p>{context}</p></details>}</article>; })}
      {answer && <article className="agent-message assistant"><strong>CDVRS AI · replying</strong><p>{answer}</p></article>}
    </div>
    {messages.length >= 40 && <p className="schedule-note">Showing the latest 40 saved messages.</p>}
    <form onSubmit={e => { e.preventDefault(); void send(); }}><label className="record-field"><span>{section === 'handoff' ? 'Ask CDVRS AI about this handoff' : `Ask the ${names[section]} Agent`}</span><textarea aria-label={`Ask the ${names[section]} Agent`} value={question} maxLength={8000} disabled={busy} onChange={e => { setQuestion(e.target.value); p.updateDayRecord(dk, section, 'ask', e.target.value); }} placeholder="What should I focus on here today?" /></label>
      <div className="handoff-buttons"><button type="submit" disabled={locked || busy || loading || needsReload || !question.trim() || section === 'handoff' && !approved}>{busy ? 'Replying…' : 'Send to CDVRS AI'}</button>
        <button type="button" disabled={locked || busy || loading || needsReload || section === 'handoff' && !approved} onClick={() => void send('Read my unfinished tasks and notes for this section today. Suggest the next three useful actions, respecting my energy and commitments.')}>Suggest what to do here today</button>
        <button type="button" disabled={!c.ready || busy || loading} onClick={() => { historyRequest.current?.abort(); const controller = new AbortController(); historyRequest.current = controller; void load(controller.signal); }}>Reload saved chat</button></div>
    </form>
    <p role="status">{c.ready && c.status !== 'Saved to cloud' ? 'Saving your question and Planner records…' : loading ? 'Loading saved chat…' : status}</p>{error && <p role="alert">{error}</p>}
  </section>;
}
