import { aiAccessHeaders } from '../server/ai-access.js';
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!/^Bearer [^\s]+$/.test(req.headers.authorization || '')) return res.status(401).json({ error: 'Sign in to use section chat.' });
  if (!process.env.CDVRS_AI_URL) return res.status(503).json({ error: 'CDVRS AI Preview connection is not configured.' });
  const body = JSON.stringify(req.body);
  if (!body || body.length > 60000) return res.status(413).json({ error: 'Chat request is too large.' });
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 110000);
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });
  try {
    const headers = { 'Content-Type': 'application/json', Authorization: req.headers.authorization, Accept: 'text/event-stream' };
    Object.assign(headers, await aiAccessHeaders(process.env.CDVRS_AI_URL));
    const upstream = await fetch(new URL('/api/planner/chat', process.env.CDVRS_AI_URL), { method: 'POST', headers, body, signal: controller.signal });
    res.setHeader('Cache-Control', 'no-store, no-transform');
    if (!upstream.headers.get('content-type')?.includes('text/event-stream')) return res.status(upstream.status).json(await upstream.json());
    res.status(upstream.status); res.setHeader('Content-Type', 'text/event-stream; charset=utf-8'); res.setHeader('X-Accel-Buffering', 'no'); res.flushHeaders();
    if (!upstream.body) throw new Error('Missing response stream');
    for await (const chunk of upstream.body) {
      if (controller.signal.aborted) break;
      res.write(chunk);
    }
    res.end();
  } catch {
    if (res.headersSent) { if (!res.destroyed) res.end(); }
    else res.status(503).json({ error: 'Section chat is unavailable. Your Planner records were not changed.' });
  } finally { clearTimeout(timer); }
}
