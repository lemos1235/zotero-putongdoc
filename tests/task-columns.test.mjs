import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { URL } from 'node:url';
import { loader } from './helpers.mjs';

const load = loader({}, { 'src/utils/locale.ts': { getString: (key) => key } });
const { getTaskColumns, TASK_TABLE_MIN_WIDTH } = load('src/modules/translate/task-columns.ts');

test('all task columns have readable, resizable widths', () => {
  const columns = getTaskColumns();
  assert.equal(columns.length, 5);
  const keys = columns.map((column) => column.dataKey);
  for (const removed of [
    'attachmentFilename',
    'extractBackend',
    'translateMode',
    'pdfId',
    'status',
  ]) {
    assert.ok(!keys.includes(removed));
  }
  const item = columns.find((column) => column.dataKey === 'parentItemTitle');
  assert.equal(item.width, 320);
  assert.equal(item.minWidth, 240);
  assert.equal(item.flex, 3);
  for (const column of columns) {
    assert.ok(column.minWidth >= 90);
    assert.ok(column.width >= column.minWidth);
    assert.equal(column.fixedWidth, false);
  }
  assert.equal(
    TASK_TABLE_MIN_WIDTH,
    columns.reduce((sum, column) => sum + column.minWidth, 0),
  );
  assert.ok(columns.find((column) => column.dataKey === 'error').minWidth >= 240);
  assert.ok(columns.find((column) => column.dataKey === 'stage').minWidth >= 140);
});

test('task list keeps the widened title and task progress without the UUID column', () => {
  const keys = Array.from(getTaskColumns(), (column) => column.dataKey);
  assert.deepEqual(keys, ['parentItemTitle', 'targetLanguage', 'stage', 'progress', 'error']);
});

test('task viewport supports horizontal overflow rather than squeezing columns', () => {
  const xhtml = fs.readFileSync(
    new URL('../addon/content/taskManager.xhtml', import.meta.url),
    'utf8',
  );
  assert.match(xhtml, /#table-container\s*\{[^}]*overflow: auto/s);
  assert.match(xhtml, /#manager-table\s*\{[^}]*min-width: var\(--task-table-min-width/s);
  const manager = fs.readFileSync(
    new URL('../src/modules/translate/task-manager.ts', import.meta.url),
    'utf8',
  );
  assert.ok(manager.includes('width=1200,height=640'));
  assert.ok(manager.includes("cell.setAttribute('title', cell.textContent || '')"));
});
