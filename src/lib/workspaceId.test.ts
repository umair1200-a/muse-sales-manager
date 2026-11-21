import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  emailToWorkspaceId,
  isValidWorkspaceEmail,
  normalizeWorkspaceEmail,
  sha256Hex,
} from './workspaceId.ts';

test('sha256Hex matches Node crypto SHA-256 output', () => {
  const samples = ['', 'abc', 'muse-workspace-v1:user@example.com', 'unicode-测试-email@domain.io'];
  for (const s of samples) {
    const expected = crypto.createHash('sha256').update(s, 'utf8').digest('hex');
    assert.equal(sha256Hex(s), expected);
  }
});

test('emailToWorkspaceId is deterministic, case-insensitive, and matches Firestore rule regex', () => {
  const id1 = emailToWorkspaceId('  Alice.Smith@Example.COM  ');
  const id2 = emailToWorkspaceId('alice.smith@example.com');
  assert.equal(id1, id2);
  assert.equal(id1.length, 43);
  assert.match(id1, /^ws_[0-9a-f]{40}$/);
});

test('different emails map to distinct isolated workspace IDs', () => {
  const idA = emailToWorkspaceId('alice@example.com');
  const idB = emailToWorkspaceId('bob@example.com');
  assert.notEqual(idA, idB);
});

test('isValidWorkspaceEmail and normalizeWorkspaceEmail reject malformed emails', () => {
  assert.equal(normalizeWorkspaceEmail('  Test@Domain.org '), 'test@domain.org');
  assert.equal(isValidWorkspaceEmail('valid@example.com'), true);
  assert.equal(isValidWorkspaceEmail('not-an-email'), false);
  assert.equal(isValidWorkspaceEmail(''), false);
  assert.throws(() => emailToWorkspaceId('bad-email'));
});
