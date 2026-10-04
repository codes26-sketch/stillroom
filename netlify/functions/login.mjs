import { createHash } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { issueSession, json, safePasswordMatch } from './lib/auth.mjs';
import { matchesPassword } from './lib/password.mjs';

export const config = { path: '/api/owner/login' };

export default async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) return json({ error: 'Owner access has not been configured in Netlify yet.' }, 503);

  const store = getStore({ name: 'stillroom-security', consistency: 'strong' });
  const savedPassword = await store.get('owner-password', { type: 'json', consistency: 'strong' });
  if (!savedPassword && !process.env.OWNER_PASSWORD) return json({ error: 'Owner access has not been configured in Netlify yet.' }, 503);
  const ip = request.headers.get('x-nf-client-connection-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const key = `login-${createHash('sha256').update(ip).digest('hex')}`;
  const now = Date.now();
  const attempts = await store.get(key, { type: 'json', consistency: 'strong' });
  if (attempts && attempts.resetAt > now && attempts.count >= 8) return json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
  const password = String(body.password || '');
  const accepted = savedPassword ? matchesPassword(password, savedPassword) : (process.env.OWNER_PASSWORD && safePasswordMatch(password, process.env.OWNER_PASSWORD));
  if (!password || !accepted) {
    const next = attempts && attempts.resetAt > now ? { count: attempts.count + 1, resetAt: attempts.resetAt } : { count: 1, resetAt: now + 15 * 60 * 1000 };
    await store.setJSON(key, next);
    return json({ error: 'The owner password was not accepted.' }, 401);
  }

  await store.delete(key);
  return json({ token: issueSession() });
};
