#!/usr/bin/env node
/**
 * Generates demo/data/downtime-reasons.js from config/downtime-reasons.csv.
 *
 * The browser demo runs from file:// so it cannot fetch() the CSV directly.
 * This script is the bridge: the CSV stays the single source of truth for the
 * reason tree, its owners and its note requirements, and the demo consumes a
 * generated JavaScript mirror of it.
 *
 * Run after editing config/downtime-reasons.csv:
 *     node scripts/build-demo-config.mjs
 *
 * tests/config-sync.test.mjs fails the build if the two ever drift.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSV = join(root, 'config', 'downtime-reasons.csv');
const OUT = join(root, 'demo', 'data', 'downtime-reasons.js');

/** Minimal RFC4180-ish parser: handles quoted fields containing commas. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else { quoted = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); field = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
    } else if (c !== '\r') {
      field += c;
    }
  }
  row.push(field);
  if (row.some((v) => v.trim() !== '')) rows.push(row);

  const [header, ...body] = rows;
  return body.map((cells) => Object.fromEntries(header.map((h, i) => [h.trim(), (cells[i] ?? '').trim()])));
}

export function toReasons(csvText) {
  return parseCsv(csvText).map((r) => ({
    code: r.code,
    label: r.label,
    noteRequired: r.note_required === 'true',
    owner: r.default_owner,
    definition: r.definition,
  }));
}

export function render(reasons) {
  return `// GENERATED FILE — do not edit by hand.
// Source: config/downtime-reasons.csv
// Regenerate: node scripts/build-demo-config.mjs
// Verified in CI by tests/config-sync.test.mjs
window.DOWNTIME_REASONS = ${JSON.stringify(reasons, null, 2)};
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const reasons = toReasons(readFileSync(CSV, 'utf8'));
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, render(reasons));
  console.log(`Wrote ${reasons.length} downtime reasons to demo/data/downtime-reasons.js`);
}
