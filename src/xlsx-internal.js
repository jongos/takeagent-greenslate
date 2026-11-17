import ExcelJS from 'exceljs';
import yauzl from 'yauzl';
import { createHash } from 'node:crypto';
import { moneyFields } from './adapter.js';
import { buildTablePreview, limits } from './files.js';

const reject = message => { throw new Error(message); };
function bounded(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > limits.bytes) reject('Input byte limit');
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
  return buildTablePreview(records, sourceRows, metadata, access, now, { format: 'xlsx', sheetName, sha256: createHash('sha256').update(buffer).digest('hex') });
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
  const moneyHeaderSet = new Set(moneyHeaders);
  const records = [], sourceRows = [];
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    if (row.hidden) reject('Hidden rows unsupported');
    const values = [];
    for (let col = 1; col <= sheet.columnCount; col++) {
      if (sheet.getColumn(col).hidden) reject('Hidden columns unsupported');
      const value = row.getCell(col).value;
      const header = records[0]?.[col - 1];
      if (value === null) values.push('');
      else if (typeof value === 'string') values.push(value);
      else if (typeof value === 'number' && Number.isFinite(value)) {
        if (rowNumber > 1 && moneyHeaderSet.has(header)) reject('Numeric money cells unsupported; use formatted text');
        else if (rowNumber > 1) reject('Formula, link, date, error or rich text cell unsupported');
        else values.push(String(value));
      }
      else reject('Formula, link, date, error or rich text cell unsupported');
    }
    records.push(values); if (rowNumber > 1) sourceRows.push(rowNumber);
  });
  return { records, sourceRows };
}