import { getVercelOidcToken } from '@vercel/oidc';

// Provider credentials stay in CDVRS AI; caller identity stays with Supabase.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const authorization = req.headers.authorization;
  if (!/^Bearer [^\s]+$/.test(authorization || '')) return res.status(401).json({ error: 'Sign in to use CDVRS AI.' });
  if (!process.env.CDVRS_AI_URL) return res.status(503).json({ error: 'CDVRS AI Preview connection is not configured.' });
  const body = JSON.stringify(req.body);
  if (!body) return res.status(400).json({ error: 'A Planner request is required.' });
  if (body.length > 60000) return res.status(413).json({ error: 'Planner request is too large.' });
  let stage = 'preview-identity';
  try {
    const oidcToken = await getVercelOidcToken();
    const headers = { 'Content-Type': 'application/json', Authorization: authorization,
      'x-vercel-trusted-oidc-idp-token': oidcToken };
    stage = 'ai-request';
    const upstream = await fetch(new URL('/api/planner/organise', process.env.CDVRS_AI_URL), {
      method: 'POST', headers, body, signal: AbortSignal.timeout(100000),
    });
    res.setHeader('Cache-Control', 'no-store');
    // Platform access failures must not be mistaken for model failures.
    if (!upstream.ok && !upstream.headers.get('content-type')?.includes('application/json')) {
      return res.status(503).json({ error: 'The protected AI Preview connection is unavailable. No tasks were changed.' });
    }
    const data = await upstream.json();
    if (upstream.status === 401 && typeof data.error !== 'string') {
      return res.status(503).json({ error: 'The AI Preview needs the Planner Preview Trusted Sources rule. No tasks were changed.' });
    }
    return res.status(upstream.status).json(data);
  } catch (error) {
    console.error('Planner AI connection failed', { stage, name: error?.name });
    return res.status(503).json({ error: 'CDVRS AI is unavailable. No tasks were changed.' });
  }
}
