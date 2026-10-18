import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { URL } from 'node:url';

test('packaged icon has a small intrinsic size and retains the supplied artwork', () => {
  const svg = fs.readFileSync(new URL('../addon/content/icons/icon.svg', import.meta.url), 'utf8');
  const root = svg.match(/<svg\b[^>]*>/)?.[0];
  assert.match(root, /width="16"/);
  assert.match(root, /height="16"/);
  assert.match(root, /viewBox="0 0 48 48"/);
  assert.match(svg, /id="putong-icon-grad"/);
});

test('toolbar sizing is scoped to the toolbar image, not shared icon resources', () => {
  const css = fs.readFileSync(new URL('../addon/content/zoteroPane.css', import.meta.url), 'utf8');
  assert.match(css, /#zotero-tb-imt \.toolbarbutton-icon/);
  assert.match(css, /width: 20px/);
  assert.match(css, /height: 20px/);
});
