import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { createHash } from 'node:crypto';
import { previewCsv, limits } from '../src/files.js';
import { previewXlsx } from '../src/xlsx-internal.js';
const fixture = () => JSON.parse(readFileSync(new URL('../fixtures/synthetic-report.json', import.meta.url)));
const access = { tenantId: 'synthetic-tenant', projectId: 'synthetic-project' };
const now = new Date('2026-11-17');
function csv(r = fixture()) { const headers = Object.keys(r.rows[0]); return Buffer.from([headers, ...r.rows.map(row => headers.map(h => row[h]))].map(row => row.map(x => `"${x.replaceAll('"', '""')}"`).join(',')).join('\r\n')); }
async function xlsx(mutate = () => {}) { const r = fixture(), w = new ExcelJS.Workbook(), s = w.addWorksheet('Cost report'); const headers = Object.keys(r.rows[0]); s.addRow(headers); for (const row of r.rows) s.addRow(headers.map(h => row[h])); mutate(w, s); return Buffer.from(await w.xlsx.writeBuffer()); }
test('CSV preview reconciles with physical source rows', () => { const p = previewCsv(csv(), fixture(), access, now); assert.equal(p.totals.actuals, 29000); assert.equal(p.rows[1].sourceRow, 3); });
test('CSV preserves quoted text and leading zero account codes', () => { const r = fixture(); r.rows[0].account = '001,"A"'; assert.equal(previewCsv(csv(r), r, access, now).rows[0].account, '001,"A"'); });
test('CSV rejects duplicate headers, ragged records, malformed UTF8 and oversized data', () => { for (const buffer of [Buffer.from('x,x\n1,2'), Buffer.from('x,y\n1'), Buffer.from([0xff]), Buffer.alloc(limits.bytes + 1)]) assert.throws(() => previewCsv(buffer, fixture(), access, now)); });
test('XLSX selected sheet reconciles, excludes unrelated sheet and preserves row provenance', async () => { const b = await xlsx(w => w.addWorksheet('Unrelated').addRow(['not selected'])); const p = await previewXlsx(b, fixture(), access, { sheetName: 'Cost report', now }); assert.equal(p.rows[0].sourceRow, 2); assert.equal(p.totals.actuals, 29000); });
for (const [name, mutate] of [
  ['hidden sheet', (w,s) => { s.state = 'hidden'; }],
  ['hidden row', (w,s) => { s.getRow(2).hidden = true; }],
  ['hidden column', (w,s) => { s.getColumn(2).hidden = true; }],
  ['merged cells', (w,s) => { s.mergeCells('B2:C2'); }],
  ['formula cached value', (w,s) => { s.getCell('G2').value = { formula: '1+2', result: 3 }; }],
  ['numeric account identity', (w,s) => { s.getCell('B2').value = 123; }],
  ['numeric money cell', (w,s) => { s.getCell('G2').value = 300; }],
  ['extra sensitive column', (w,s) => { s.getCell('L1').value = 'Bank account'; s.getCell('L2').value = 'synthetic'; }],
]) test(`XLSX rejects ${name}`, async () => { const buffer = await xlsx(mutate); await assert.rejects(() => previewXlsx(buffer, fixture(), access, {sheetName:'Cost report',now})); });
test('XLSX requires explicit selection and rejects invalid archives', async () => { await assert.rejects(() => previewXlsx(Buffer.from('bad'), fixture(), access, {sheetName:'Cost report',now})); await assert.rejects(() => previewXlsx(Buffer.from('bad'), fixture(), access)); });
for (const name of ['xl/vbaProject.bin', 'xl/externalLinks/externalLink1.xml', 'xl/embeddings/object.bin']) test(`XLSX rejects archive feature ${name}`, async () => { const zip = await JSZip.loadAsync(await xlsx()); zip.file(name, 'synthetic'); const buffer = await zip.generateAsync({type:'nodebuffer'}); await assert.rejects(() => previewXlsx(buffer, fixture(), access, {sheetName:'Cost report',now}), /Unsafe/); });
test('XLSX rejects compressed expansion bomb before workbook parse', async () => { const zip = new JSZip(); zip.file('bomb.xml', 'x'.repeat(limits.expandedBytes + 1)); const buffer = await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}); assert.ok(buffer.length < limits.bytes); await assert.rejects(() => previewXlsx(buffer, fixture(), access, {sheetName:'Cost report',now}), /Unsafe/); });
test('XLSX rejects formulas in unselected sheets', async () => { const buffer = await xlsx(w => { w.addWorksheet('Unselected').getCell('A1').value = {formula:'1+1',result:2}; }); await assert.rejects(() => previewXlsx(buffer, fixture(), access, {sheetName:'Cost report',now}), /anywhere/); });
test('XLSX rejects defined names', async () => { const buffer = await xlsx(w => w.definedNames.add("'Cost report'!$A$1", 'NamedRange')); await assert.rejects(() => previewXlsx(buffer, fixture(), access, {sheetName:'Cost report',now}), /Defined names/); });
test('CSV provenance records exact bytes and reordered column positions', () => {
  const r = fixture(); r.rows = r.rows.map(row => Object.fromEntries(Object.entries(row).reverse()));
  const buffer = csv(r), result = previewCsv(buffer, r, access, now);
  assert.equal(result.source.format, 'csv'); assert.equal(result.source.sha256, createHash('sha256').update(buffer).digest('hex'));
  assert.equal(result.source.columns.estimatedFinalCost, 1); assert.equal(result.source.columns.project, 11);
  const changedBytes = previewCsv(Buffer.concat([buffer, Buffer.from('\r\n')]), r, access, now);
  assert.deepEqual(changedBytes.totals, result.totals); assert.notEqual(changedBytes.fingerprint, result.fingerprint);
});
test('XLSX sheet selections produce distinct identity without emitting unrelated content', async () => {
  const buffer = await xlsx((w, s) => { const other = w.addWorksheet('Second report'); s.eachRow(row => other.addRow(row.values)); w.addWorksheet('Unrelated').addRow(['DO_NOT_EMIT_UNSELECTED']); });
  const a = await previewXlsx(buffer, fixture(), access, {sheetName:'Cost report',now});
  const b = await previewXlsx(buffer, fixture(), access, {sheetName:'Second report',now});
  assert.equal(a.source.sheetName, 'Cost report'); assert.equal(b.source.sheetName, 'Second report');
  assert.equal(a.source.sha256, createHash('sha256').update(buffer).digest('hex'));
  assert.equal(a.source.columns.actuals, 7); assert.equal(a.rows[0].sourceRow, 2);
  assert.notEqual(a.fingerprint, b.fingerprint); assert.deepEqual(a.totals, b.totals);
  assert.doesNotMatch(JSON.stringify(a), /DO_NOT_EMIT_UNSELECTED|Unrelated/);
});
test('file-derived provenance overrides caller-supplied source metadata', () => {
  const r = fixture(); r.source = { format:'xlsx',sheetName:'fake',secret:'not emitted' };
  const result = previewCsv(csv(r), r, access, now);
  assert.equal(result.source.format, 'csv'); assert.equal(result.source.sheetName, undefined);
  assert.doesNotMatch(JSON.stringify(result), /not emitted|fake/);
});
