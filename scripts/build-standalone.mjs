#!/usr/bin/env node
/**
 * Bundles demo/ into a single self-contained HTML file.
 *
 * Why this exists: the repository is private, so GitHub Pages is not available,
 * and "clone the repo and open demo/index.html" is a poor ask for a manager who
 * has ten minutes. One file can be attached to a calendar invite, dropped on a
 * shared drive, or opened from a USB stick on a shop terminal with no network.
 *
 *   node scripts/build-standalone.mjs                 -> demo/standalone.html
 *   node scripts/build-standalone.mjs --fragment out.html
 *
 * --fragment emits the same page without the <!doctype>/<html>/<head>/<body>
 * wrapper, for hosts that supply their own document shell.
 *
 * The bundle is byte-for-byte the same application — this script inlines
 * assets, it never rewrites behaviour.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const demo = join(root, 'demo');

/** A closing script tag inside JS text would end the inline block early. */
const safeForInlineScript = (js) => js.replace(/<\/script>/gi, '<\\/script>');

function bundle() {
  let html = readFileSync(join(demo, 'index.html'), 'utf8');

  html = html.replace(/[ \t]*<link rel="stylesheet" href="([^"]+)">/g, (_match, href) => {
    const css = readFileSync(join(demo, href), 'utf8');
    return `<style>\n${css}</style>`;
  });

  html = html.replace(/[ \t]*<script src="([^"]+)"><\/script>/g, (_match, src) => {
    const js = readFileSync(join(demo, src), 'utf8');
    return `<script>\n/* ${src} */\n${safeForInlineScript(js)}</script>`;
  });

  if (/<(link|script)[^>]+(href|src)=/.test(html)) {
    throw new Error('An external reference survived bundling; the output would not be self-contained.');
  }
  return html;
}

/** Strips the document wrapper, keeping title, styles, body content and scripts. */
function toFragment(html) {
  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? 'Machinist Transparency';
  const styles = [...html.matchAll(/<style>[\s\S]*?<\/style>/gi)].map((m) => m[0]).join('\n');
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? '';
  return `<title>${title}</title>\n${styles}\n${body.trim()}\n`;
}

const html = bundle();
const fragmentIndex = process.argv.indexOf('--fragment');

if (fragmentIndex !== -1) {
  const out = process.argv[fragmentIndex + 1];
  if (!out) throw new Error('--fragment requires an output path');
  writeFileSync(out, toFragment(html));
  console.log(`Wrote fragment to ${out} (${(toFragment(html).length / 1024).toFixed(0)} KB)`);
} else {
  const out = join(demo, 'standalone.html');
  const banner = '<!-- GENERATED FILE — build with: node scripts/build-standalone.mjs -->\n';
  writeFileSync(out, html.replace(/^<!doctype html>\n/i, `<!doctype html>\n${banner}`));
  console.log(`Wrote demo/standalone.html (${(html.length / 1024).toFixed(0)} KB, no external assets)`);
}
