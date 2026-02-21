import test from 'node:test';
import assert from 'node:assert/strict';

const loadStateAuthService = async () => {
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/db';
  process.env.JWT_SECRET = process.env.JWT_SECRET || '0123456789abcdef0123456789abcdef';
  const module = await import('./state-auth.service.js');
  return module;
};

test('issueStateWriteToken and verifyStateWriteToken keep version payload', async () => {
  const { issueStateWriteToken, verifyStateWriteToken } = await loadStateAuthService();
  const token = issueStateWriteToken({
    version: '2026-02-21T10:00:00.000Z',
    actorUserId: 'user-1',
  });

  const payload = verifyStateWriteToken({
    token,
  });

  assert.equal(payload.ver, '2026-02-21T10:00:00.000Z');
  assert.equal(payload.sub, 'user-1');
});

test('verifyStateWriteToken rejects malformed token', async () => {
  const { verifyStateWriteToken } = await loadStateAuthService();
  assert.throws(() => verifyStateWriteToken({ token: 'not-a-valid-jwt' }), /inválido|expirado/i);
});
