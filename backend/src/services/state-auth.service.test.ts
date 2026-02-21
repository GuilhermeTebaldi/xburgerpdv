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
    ipAddress: '127.0.0.1',
    userAgent: 'jest-agent',
  });

  const payload = verifyStateWriteToken({
    token,
    ipAddress: '127.0.0.1',
    userAgent: 'jest-agent',
  });

  assert.equal(payload.ver, '2026-02-21T10:00:00.000Z');
  assert.equal(payload.sub, 'user-1');
});

test('verifyStateWriteToken rejects token with mismatched ip', async () => {
  const { issueStateWriteToken, verifyStateWriteToken } = await loadStateAuthService();
  const token = issueStateWriteToken({
    version: 'v1',
    ipAddress: '10.0.0.1',
    userAgent: 'agent',
  });

  assert.throws(
    () =>
      verifyStateWriteToken({
        token,
        ipAddress: '10.0.0.2',
        userAgent: 'agent',
      }),
    /inválido para este IP/i
  );
});
