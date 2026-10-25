// The browser calls its own origin; provider credentials stay in CDVRS AI.
let previewAccess;
export async function previewCookie(base) {
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
