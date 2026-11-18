import { parse } from 'csv-parse/sync';
import { createHash } from 'node:crypto';
import { preview } from './adapter.js';
import { NATIVE_COA_PROFILE_ID, nativeCoaHeaders, nativeCoaReportFromTable } from './profile-native-coa.js';

export const limits = Object.freeze({ bytes: 2 * 1024 * 1024, expandedBytes: 16 * 1024 * 1024, entries: 100, rows: 10001, columns: 32 });
const reject = message => { throw new Error(message); };
const injectionPrefix = /^\s*[=+\-@\t\r]/;
function bounded(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > limits.bytes) reject('Input byte limit');
}

export function buildTablePreview(records, sourceRows, metadata, access, now, evidence) {
  if (records.length < 2 || records.length > limits.rows) reject('Input row limit');
  const [headers, ...values] = records;
  if (headers.length > limits.columns || headers.some(x => typeof x !== 'string' || !x || injectionPrefix.test(x) || ['__proto__', 'constructor', 'prototype'].includes(x)) || new Set(headers).size !== headers.length) reject('Invalid or duplicate headers');
  const rows = values.map(row => {
    if (row.length !== headers.length) reject('Ragged table');
    return Object.fromEntries(headers.map((header, i) => [header, row[i]]));
  });
  const { source: _ignored, ...meta } = metadata;
  const verifiedSource = { ...evidence, headerRow: 1, columns: Object.fromEntries(Object.entries(metadata.mapping ?? {}).map(([field, header]) => [field, headers.indexOf(header) + 1])) };
  return preview({ ...meta, rows, sourceRows }, access, now, { verifiedSource });
}

export function previewCsv(buffer, metadata, access, now) {
  bounded(buffer);
  const source = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  const records = parse(source, { bom: true, info: true, max_record_size: 8192, skip_empty_lines: false });
  // Source row means physical line on CSV; multiline cells end at this line.
  return buildTablePreview(records.map(x => x.record), records.slice(1).map(x => x.info.lines), metadata, access, now, { format: 'csv', sha256: createHash('sha256').update(buffer).digest('hex') });
}

/** Parse a provisional GreenSlate Chart of Accounts CSV export without a user-defined column mapping. */
export function previewNativeCoaCsv(buffer, metadata, access, now) {
  if (metadata.profile !== NATIVE_COA_PROFILE_ID) reject('Native COA CSV requires the provisional native profile');
  if (metadata.profileCertification !== 'provisional' || metadata.nativeExportAttestedComplete !== true) reject('Native export scope and provisional certification must be attested');
  bounded(buffer);
  const source = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  const records = parse(source, { bom: true, max_record_size: 8192, skip_empty_lines: true });
  const table = records.map(row => row.record ?? row);
  const [headers, ...values] = table;
  const augmented = [['Project', ...headers], ...values.map(cells => [metadata.sourceProjectId, ...cells])];
  const report = nativeCoaReportFromTable(augmented, metadata);
  const augmentedHeaders = augmented[0];
  const verifiedSource = {
    format: 'csv',
    sha256: createHash('sha256').update(buffer).digest('hex'),
    headerRow: 1,
    columns: Object.fromEntries(Object.entries(nativeCoaHeaders).map(([field, header]) => [field, augmentedHeaders.indexOf(header) + 1])),
  };
  return preview(report, access, now, { verifiedSource });
}