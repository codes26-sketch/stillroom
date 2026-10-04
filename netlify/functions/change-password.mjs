import { getStore } from '@netlify/blobs';
import { json, validSession } from './lib/auth.mjs';
import { passwordRecord } from './lib/password.mjs';

export const config = { path: '/api/owner/password' };

export default async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  if (!validSession(request)) return json({ error: 'Owner sign-in expired. Sign in again.' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
  const password = typeof body.password === 'string' ? body.password : '';
  if (!password || password.length > 256) return json({ error: 'Enter a new password from 1 to 256 characters.' }, 400);

  const store = getStore({ name: 'stillroom-security', consistency: 'strong' });
  await store.setJSON('owner-password', passwordRecord(password));
  return json({ message: 'Owner password updated.' });
};
