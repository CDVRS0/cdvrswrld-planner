// The browser calls its own origin; provider credentials stay in CDVRS AI.
let previewAccess;
async function previewCookie(base) {
  if (!process.env.CDVRS_AI_PREVIEW_BYPASS) return '';
  if (previewAccess?.base === base && previewAccess.expires > Date.now()) return previewAccess.cookie;
  // A deployment-scoped share link establishes its Vercel cookie through GET.
  // Keep it server-side and scoped to this exact AI deployment.
  const url = new URL('/', base);
  url.searchParams.set('_vercel_share', process.env.CDVRS_AI_PREVIEW_BYPASS);
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10000) });
  const cookie = response.headers.getSetCookie().filter(c => c.startsWith('_vercel_jwt=')).map(c => c.split(';')[0]).join('; ');
  if (!cookie) throw new Error('Preview access could not be established');
  previewAccess = { base, cookie, expires: Date.now() + 15 * 60 * 1000 };
  return cookie;
}
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const authorization = req.headers.authorization;
  if (!/^Bearer [^\s]+$/.test(authorization || '')) return res.status(401).json({ error: 'Sign in to use CDVRS AI.' });
  if (!process.env.CDVRS_AI_URL) return res.status(503).json({ error: 'CDVRS AI Preview connection is not configured.' });
  const body = JSON.stringify(req.body);
  if (!body) return res.status(400).json({ error: 'A Planner request is required.' });
  if (body.length > 60000) return res.status(413).json({ error: 'Planner request is too large.' });
  try {
    const headers = { 'Content-Type': 'application/json', Authorization: authorization };
    const cookie = await previewCookie(process.env.CDVRS_AI_URL);
    if (cookie) headers.Cookie = cookie;
    const upstream = await fetch(new URL(req.body?.operation === 'handoff' ? '/api/planner/handoff' : '/api/planner/organise', process.env.CDVRS_AI_URL), {
      method: 'POST', headers, body, signal: AbortSignal.timeout(100000),
    });
    const data = await upstream.json();
    if (req.body?.operation === 'handoff' && upstream.ok && /^[0-9a-f-]{36}$/.test(data.conversationId || '')) {
      const url = new URL('/', process.env.CDVRS_AI_URL); url.searchParams.set('conversation', data.conversationId);
      data.url = url.toString();
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(upstream.status).json(data);
  } catch {
    return res.status(503).json({ error: 'CDVRS AI is unavailable. No tasks were changed.' });
  }
}
