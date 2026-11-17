import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const productionSources = [
  '../src/adapter.js',
  '../src/files.js',
  '../src/isolated-xlsx.js',
  '../src/cli.js',
];

test('production entrypoints do not export main-thread XLSX parsers', async () => {
  const files = await import('../src/files.js');
  assert.equal(files.previewXlsx, undefined);
  assert.equal(files.readXlsxTable, undefined);
  assert.doesNotMatch(JSON.stringify(Object.keys(files)), /xlsx/i);
});

for (const rel of productionSources) {
  test(`syntax-check ${rel}`, () => {
    const path = new URL(rel, import.meta.url);
    assert.ok(readFileSync(path).length > 0);
  });
}

test('isolated XLSX entry does not import ExcelJS on the host thread', async () => {
  const source = readFileSync(new URL('../src/isolated-xlsx.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /exceljs/i);
  const filesSource = readFileSync(new URL('../src/files.js', import.meta.url), 'utf8');
  assert.doesNotMatch(filesSource, /exceljs/i);
});