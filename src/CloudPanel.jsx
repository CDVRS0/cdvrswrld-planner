import { useState } from 'react';
import { cloud, downloadBackup } from './lib/cloud';

export default function CloudPanel({ c, p }) {
  const [error, setError] = useState('');
  const [backup, setBackup] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [upload, setUpload] = useState(null);
  const raw = JSON.stringify({ weeks: p.weeks });
  const hasBrowser = Object.keys(p.weeks).length > 0;
  const hasLocal = hasBrowser || Boolean(upload);
  const backedUp = !hasBrowser || backup === raw;
  async function signIn(e) {
    e.preventDefault(); setBusy(true); setError('');
    const form = new FormData(e.currentTarget);
    try {
      const { error } = await cloud.auth.signInWithPassword({ email: form.get('email'), password: form.get('password') });
      if (error) throw error;
      e.target.reset();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <section className="cloud-panel" aria-label="Cloud connection">
    <div className="cloud-heading"><div><span className="eyebrow">CLOUD SAVE · ACROSS YOUR DEVICES</span><p role="status">{c.status}</p></div>
      <div className="cloud-actions"><button onClick={() => { try { downloadBackup(); setBackup(raw); setError(''); } catch (err) { setError(err.message); } }}>Download browser backup</button>
        {c.ready && <><button onClick={c.retry}>Retry save</button><button onClick={c.reconnect}>Reconnect</button></>}
        {c.user && <button onClick={async () => { if (window.confirm('Sign out? Check that the status says Saved to cloud first. Unsaved browser data stays on this device.')) await cloud.auth.signOut(); }}>Sign out</button>}</div></div>
    {!cloud && <p>Cloud configuration is missing. Browser records remain readable. Configure the Preview Supabase URL and publishable key to enable saving.</p>}
    {cloud && !c.user && <form className="signin-form" onSubmit={signIn}>
      <label>Email<input type="email" name="email" autoComplete="username" required /></label>
      <label>Password<input type="password" name="password" autoComplete="current-password" required /></label>
      <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in to cloud'}</button>
      <span>Use your CDVRS AI account. Sign in to edit and save.</span>
    </form>}
    {c.needsChoice && <div className="migration-choice">
      <h3>Connect your Planner</h3>
      <p>Signed in as {c.user?.email}.</p>
      <p>{hasLocal ? `${Object.keys(upload || p.weeks).length} saved weeks found. Download a backup of any browser records before continuing. Import adds missing records only; existing cloud weeks and entries win on conflicts. ` : 'No saved browser weeks found. Connect to load your cloud Planner. '}
        Every OS field and checklist is preserved inside weekly cloud records. New edits save automatically after connecting.</p>
      <label className="record-field"><span>Import a Planner backup from another browser or the original Planner</span><input type="file" accept="application/json,.json" onChange={async e => {
        try {
          const file = e.target.files[0];
          if (!file) return;
          if (file.size > 5000000) throw new Error('Choose a backup under 5 MB.');
          const parsed = JSON.parse(await file.text());
          if (!parsed.weeks || Array.isArray(parsed.weeks) || typeof parsed.weeks !== 'object' || !Object.entries(parsed.weeks).every(([wk, w]) => /^\d{4}-\d{2}-\d{2}$/.test(wk) && w?.days && Array.isArray(w.weeklySections) && Object.values(w.days).every(d => Array.isArray(d.blocks) && d.blocks.every(b => Array.isArray(b.tasks))))) throw new Error('This is not a valid Planner v5 backup.');
          setUpload(parsed.weeks); setConfirmed(false); setError('');
        } catch (err) { setUpload(null); setError(err.message); }
      }} /></label>
      <p>Preview addresses have separate browser storage. A backup file is needed to bring records from the original Planner.</p>
      <p>Older British Summer Time records may have dates stored one day early. Import corrects those legacy date keys while preserving their contents and your original backup. Conflicting week mappings stop for review.</p>
      <label className="consent"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I have checked my backup and approve {hasLocal ? 'importing missing records or loading cloud records into this browser' : 'connecting this browser to my cloud Planner'}.</label>
      <div className="cloud-actions">{hasLocal && <button disabled={!confirmed || !backedUp} onClick={() => c.activate(true, upload)}>Import missing browser records & connect</button>}
        <button disabled={!confirmed || !backedUp} onClick={() => c.activate(false)}>Load cloud Planner</button></div>
    </div>}
    {error && <p role="alert">{error}</p>}
    {c.importReport && <p>{c.importReport}</p>}
  </section>;
}
