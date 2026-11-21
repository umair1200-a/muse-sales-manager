import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rules = fs.readFileSync('firestore.rules', 'utf8');

test('firestore.rules includes default-deny global catch-all', () => {
  assert.match(rules, /match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
});

test('firestore.rules contains no hardcoded admin email restriction', () => {
  assert.doesNotMatch(rules, /tilawateq492@gmail\.com/i);
  assert.doesNotMatch(rules, /tilawatequran492@gmail\.com/i);
  assert.doesNotMatch(rules, /isVerifiedAdminEmail/);
});

test('firestore.rules isolates data under non-listable SHA-256 workspaces', () => {
  assert.match(rules, /match \/workspaces\/\{workspaceId\}/);
  assert.match(rules, /workspaceId\.matches\('\^ws_\[0-9a-f\]\{40\}\$'\)/);
  assert.match(rules, /allow list: if false;/);
});

test('firestore.rules enforces strict ID regex and bounds on account volume & warranty duration', () => {
  assert.match(rules, /id\.matches\('\^\[a-zA-Z0-9_\\\\-\]\+\$'\)/);
  assert.match(rules, /accountVolumeBillions >= 1 && data\.accountVolumeBillions <= 31/);
  assert.match(rules, /warrantyDurationDays >= 1 && data\.warrantyDurationDays <= 25/);
});

test('firestore.rules enforces workspace-scoped relational exists() checks on sales and replacements', () => {
  assert.match(
    rules,
    /exists\(\/databases\/\$\(database\)\/documents\/workspaces\/\$\(workspaceId\)\/clients\/\$\(incoming\(\)\.clientId\)\)/
  );
  assert.match(
    rules,
    /exists\(\/databases\/\$\(database\)\/documents\/workspaces\/\$\(workspaceId\)\/sales\/\$\(incoming\(\)\.originalSaleId\)\)/
  );
});

test('firestore.rules enforces strict keys().hasOnly and affectedKeys().hasOnly', () => {
  assert.match(rules, /data\.keys\(\)\.hasOnly\(/);
  assert.match(rules, /affectedKeys\(\)\.hasOnly\(/);
});
