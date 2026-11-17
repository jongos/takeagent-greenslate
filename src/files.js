import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import yauzl from 'yauzl';
import { createHash } from 'node:crypto';
import { preview, moneyFields } from './adapter.js';

export const limits = Object.freeze({ bytes: 2 * 1024 * 1024, expandedBytes: 16 * 1024 * 1024, entries: 100, rows: 10001, columns: 32 });
const reject = message => { throw new Error(message); };
function bounded(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > limits.bytes) reject('Input byte limit');
}
function table(records, sourceRows, metadata, access, now, evidence) {
  if (records.length < 2 || records.length > limits.rows) reject('Input row limit');
  const [headers, ...values] = records;
  if (headers.length > limits.columns || headers.some(x => typeof x !== 'string' || !x || ['__proto__', 'constructor', 'prototype'].includes(x)) || new Set(headers).size !== headers.length) reject('Invalid or duplicate headers');
  const rows = values.map(row => {
    if (row.length !== headers.length) reject('Ragged table');
    return Object.fromEntries(headers.map((header, i) => [header, row[i]]));
  });
  const source = { ...evidence, headerRow: 1, columns: Object.fromEntries(Object.entries(metadata.mapping ?? {}).map(([field, header]) => [field, headers.indexOf(header) + 1])) };
  return preview({ ...metadata, rows, sourceRows, source }, access, now);
}

export function previewCsv(buffer, metadata, access, now) {
  bounded(buffer);
  const source = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  const records = parse(source, { bom: true, info: true, max_record_size: 8192, skip_empty_lines: false });
  // Source row means physical line on CSV; multiline cells end at this line.
  return table(records.map(x => x.record), records.slice(1).map(x => x.info.lines), metadata, access, now, { format: 'csv', sha256: createHash('sha256').update(buffer).digest('hex') });
}

async function checkArchive(buffer) {
  await new Promise((resolve, rejectPromise) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error) return rejectPromise(new Error('Invalid XLSX archive'));
      let bytes = 0, entries = 0; const names = new Set();
      const stop = () => { zip.close(); rejectPromise(new Error('Unsafe or oversized XLSX archive')); };
      zip.on('error', stop); zip.on('end', resolve);
      zip.on('entry', entry => {
        bytes += entry.uncompressedSize; entries++;
        if (entries > limits.entries || bytes > limits.expandedBytes || names.has(entry.fileName) || (entry.generalPurposeBitFlag & 1) || /vbaProject|externalLinks|embeddings|activeX/i.test(entry.fileName) || entry.fileName.includes('..') || entry.fileName.includes('\\') || entry.fileName.startsWith('/') || !/^(\[Content_Types\]\.xml|(?:_rels|docProps|xl)\/(?:.*(?:\.xml|\.rels|\/))?)$/.test(entry.fileName)) return stop();
        names.add(entry.fileName);
        // Validate actual inflated size, not only attacker-controlled directory fields.
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError) return stop();
          let actual = 0; const chunks = [];
          stream.on('error', stop);
          stream.on('data', chunk => { actual += chunk.length; if (actual > entry.uncompressedSize || actual > limits.expandedBytes) { stream.destroy(); stop(); } else chunks.push(chunk); });
          stream.on('end', () => { const xml = Buffer.concat(chunks).toString('utf8'); if (/<!DOCTYPE|<!ENTITY|macroEnabled|vbaProject|TargetMode\s*=\s*["']External["']/i.test(xml)) return stop(); zip.readEntry(); });
        });
      });
      zip.readEntry();
    });
  });
}

export async function previewXlsx(buffer, metadata, access, { sheetName, now } = {}) {
  const { records, sourceRows } = await readXlsxTable(buffer, { sheetName, moneyHeaders: moneyFields.map(field => metadata.mapping?.[field]) });
  return table(records, sourceRows, metadata, access, now, { format: 'xlsx', sheetName, sha256: createHash('sha256').update(buffer).digest('hex') });
}

export async function readXlsxTable(buffer, { sheetName, moneyHeaders = [] } = {}) {
  bounded(buffer);
  if (typeof sheetName !== 'string' || !sheetName) reject('Explicit worksheet selection required');
  await checkArchive(buffer);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  if (workbook.definedNames.model.length) reject('Defined names unsupported');
  for (const candidate of workbook.worksheets) {
    if (candidate.state !== 'visible') reject('Hidden worksheets unsupported');
    if (candidate.rowCount > limits.rows || candidate.columnCount > limits.columns) reject('Worksheet dimensions exceed limits');
    candidate.eachRow(row => row.eachCell(cell => { if (cell.value !== null && typeof cell.value === 'object') reject('Formula, link, date, error or rich text anywhere in workbook unsupported'); }));
  }
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet || sheet.state !== 'visible') reject('Selected worksheet unavailable or hidden');
  if (sheet.rowCount > limits.rows || sheet.columnCount > limits.columns) reject('Worksheet dimensions exceed limits');
  if (sheet.model.merges?.length) reject('Merged cells unsupported');
  const records = [], sourceRows = [];
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    if (row.hidden) reject('Hidden rows unsupported');
    const values = [];
    for (let col = 1; col <= sheet.columnCount; col++) {
      if (sheet.getColumn(col).hidden) reject('Hidden columns unsupported');
      const value = row.getCell(col).value;
      if (value === null) values.push('');
      else if (typeof value === 'string') values.push(value);
      else if (typeof value === 'number' && Number.isFinite(value) && rowNumber > 1 && moneyHeaders.includes(records[0]?.[col - 1])) values.push(String(value));
      else reject('Formula, link, date, error or rich text cell unsupported');
    }
    records.push(values); if (rowNumber > 1) sourceRows.push(rowNumber);
  });
  return { records, sourceRows };
}
