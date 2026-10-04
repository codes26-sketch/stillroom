import { createHmac, timingSafeEqual } from 'node:crypto';

export function issueSession() {
  const expires = Date.now() + 12 * 60 * 60 * 1000;
  const signature = createHmac('sha256', process.env.SESSION_SECRET).update(String(expires)).digest('base64url');
  return `${expires}.${signature}`;
}

export function validSession(request) {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) return false;
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  const [expiry, signature, extra] = token.split('.');
  if (!expiry || !signature || extra || !/^\d+$/.test(expiry) || Number(expiry) < Date.now()) return false;
  const expected = createHmac('sha256', process.env.SESSION_SECRET).update(expiry).digest();
  let actual;
  try { actual = Buffer.from(signature, 'base64url'); } catch { return false; }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

export function safePasswordMatch(input, expected) {
  const a = Buffer.from(String(input));
  const b = Buffer.from(String(expected));
  return a.length === b.length && timingSafeEqual(a, b);
}
