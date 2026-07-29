/**
 * The demo must not carry its own private copy of the downtime reason tree.
 * config/downtime-reasons.csv is the source of truth; demo/data/downtime-reasons.js
 * is generated from it. This test fails if the two ever drift.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toReasons, render } from '../scripts/build-demo-config.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('generated demo reason tree matches config/downtime-reasons.csv', () => {
  const csv = readFileSync(join(root, 'config', 'downtime-reasons.csv'), 'utf8');
  const generated = readFileSync(join(root, 'demo', 'data', 'downtime-reasons.js'), 'utf8');
  assert.equal(
    generated,
    render(toReasons(csv)),
    'demo/data/downtime-reasons.js is stale — run: node scripts/build-demo-config.mjs',
  );
});

test('every downtime reason declares an owner and a definition', () => {
  const reasons = toReasons(readFileSync(join(root, 'config', 'downtime-reasons.csv'), 'utf8'));
  assert.ok(reasons.length >= 8, 'the pilot calls for 8–12 downtime categories');
  assert.ok(reasons.length <= 12, 'more than 12 categories makes shop-floor selection slow');
  for (const reason of reasons) {
    assert.ok(reason.code, 'reason is missing a code');
    assert.ok(reason.label, `${reason.code} is missing a label`);
    assert.ok(reason.owner, `${reason.code} has no responsible group — blockers could not be routed`);
    assert.ok(reason.definition, `${reason.code} has no definition`);
  }
});

test('OTHER requires a note so uncoded time stays reviewable', () => {
  const reasons = toReasons(readFileSync(join(root, 'config', 'downtime-reasons.csv'), 'utf8'));
  const other = reasons.find((r) => r.code === 'OTHER');
  assert.ok(other, 'an OTHER category is required as a catch-all');
  assert.equal(other.noteRequired, true, 'OTHER must require a note');
});
