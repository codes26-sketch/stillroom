import { getStore } from '@netlify/blobs';
import { json, validSession } from './lib/auth.mjs';

export const config = { path: '/api/questions' };
const store = () => getStore({ name: 'stillroom-library', consistency: 'strong' });

export default async (request) => {
  if (request.method === 'GET') {
    const questions = await store().get('questions', { type: 'json', consistency: 'strong' }) || [];
    return json({ questions });
  }
  if (request.method !== 'PUT') return json({ error: 'Method not allowed.' }, 405);
  if (!validSession(request)) return json({ error: 'Owner sign-in expired. Sign in again.' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON.' }, 400); }
  if (!Array.isArray(body.questions) || body.questions.length > 5000) return json({ error: 'Question list is invalid or too large.' }, 400);
  const questions = [];
  for (const item of body.questions) {
    const question = typeof item.question === 'string' ? item.question : '';
    const answer = typeof item.answer === 'string' ? item.answer : '';
    if (!question.trim() || !answer.trim() || question.length > 500 || answer.length > 50000) return json({ error: 'Each entry needs a question (max 500 characters) and answer (max 50,000 characters).' }, 400);
    questions.push({ id: String(item.id || crypto.randomUUID()), question, answer, updatedAt: Number(item.updatedAt) || Date.now() });
  }
  if (Buffer.byteLength(JSON.stringify(questions), 'utf8') > 4 * 1024 * 1024) return json({ error: 'The collection is too large to publish in one update (maximum 4 MB).' }, 413);
  await store().setJSON('questions', questions);
  return json({ questions });
};
