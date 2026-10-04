import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function passwordRecord(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(password), salt, 64);
  return { salt: salt.toString('base64'), hash: hash.toString('base64') };
}

export function matchesPassword(password, record) {
  if (!record?.salt || !record?.hash) return false;
  try {
    const salt = Buffer.from(record.salt, 'base64');
    const expected = Buffer.from(record.hash, 'base64');
    const actual = scryptSync(String(password), salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
