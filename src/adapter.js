import { createHash } from 'node:crypto';
import { moneyFields, SYNTHETIC_TABULAR_PROFILE_ID } from './fields.js';
import { NATIVE_COA_PROFILE_ID, nativeCoaHeaders, normalizeNativeCoaReport } from './profile-native-coa.js';

export { moneyFields } from './fields.js';
const required = ['project', 'account', 'parentAccount', 'currency', ...moneyFields];
const fail = message => { throw new Error(message); };
const text = value => typeof value === 'string' && value.trim().length > 0;
const injectionPrefix = /^\s*[=+\-@\t\r]/;
function safeIdentifier(value, label) {
  if (!text(value) || injectionPrefix.test(value)) fail(`Invalid ${label}`);
  return value;
}
function date(value) {
  if (!text(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail('Invalid reporting date');
  return Date.parse(value);
}
// Integer minor units avoid silent floating-point reconciliation drift.
function money(value) {
  if (typeof value !== 'string') fail('Amounts must be explicit decimal strings with at most two places');
  let raw = value.trim();
  let negative = false;
  if (/^\(.*\)$/.test(raw)) {
    negative = true;
    raw = raw.slice(1, -1).trim();
  } else if (raw.startsWith('-')) {
    negative = true;
    raw = raw.slice(1).trim();
  }
  let digits;
  if (raw.includes(',')) {
    if (/^\d+,\d{1,2}$/.test(raw)) fail('Decimal comma amounts are not supported; use a dot decimal separator');
    if (!/^\d{1,3}(,\d{3})*(\.\d{1,2})?$/.test(raw)) fail('Invalid amount thousands grouping');
    digits = raw.replace(/,/g, '');
  } else if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    fail('Amounts must be explicit decimal strings with at most two places');
  } else {
    digits = raw;
  }
  const [whole, fraction = ''] = digits.split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(result)) fail('Amount exceeds safe range');
  return negative ? -result : result;
}

function sourceProvenance(source) {
  if (source === undefined) return undefined;
  if (!source || !['csv', 'xlsx'].includes(source.format) || !/^[a-f0-9]{64}$/.test(source.sha256) || source.headerRow !== 1) fail('Invalid source provenance');
  if (Object.keys(source).some(key => !['format', 'sha256', 'headerRow', 'sheetName', 'columns'].includes(key))) fail('Unexpected source provenance');
  if (source.format === 'xlsx' ? !text(source.sheetName) || source.sheetName.length > 128 : source.sheetName !== undefined) fail('Invalid source worksheet');
  if (!source.columns || Object.keys(source.columns).length !== required.length || required.some(field => !Number.isInteger(source.columns[field]) || source.columns[field] < 1 || source.columns[field] > 32) || new Set(Object.values(source.columns)).size !== required.length) fail('Invalid source columns');
  return { format: source.format, sha256: source.sha256, headerRow: 1, ...(source.format === 'xlsx' ? { sheetName: source.sheetName } : {}), columns: Object.fromEntries(required.map(field => [field, source.columns[field]])) };
}

export function buildCanonicalSnapshot(report, rows, totals, source) {
  return { tenantId: report.tenantId, projectId: report.projectId, sourceApplication: 'GreenSlate', profile: report.profile, sourceProjectId: report.sourceProjectId, revision: report.revision, asOf: report.asOf, periodBasis: report.periodBasis, currency: report.currency, fxBasis: report.fxBasis, sourceFile: report.sourceFile, complete: report.complete === true, ...(source ? { source } : {}), amountUnit: 'minor-units', rows, totals };
}

function canonicalStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(',')}}`;
}

// Stable digest over sorted-key JSON; detects inconsistency between fingerprint and canonical fields, not hostile forgery of an entire stored record.
export function fingerprintCanonical(snapshot) {
  return createHash('sha256').update(canonicalStringify(snapshot)).digest('hex');
}

function assertTrustedSnapshot(snapshot) {
  if (!snapshot || snapshot.sourceApplication !== 'GreenSlate' || snapshot.amountUnit !== 'minor-units' || !Array.isArray(snapshot.rows) || !snapshot.totals) fail('Invalid snapshot');
  const { fingerprint, importedAt, readOnly, warnings, ...rest } = snapshot;
  const expectedFingerprint = fingerprintCanonical(rest);
  if (typeof fingerprint !== 'string' || fingerprint !== expectedFingerprint) fail('Snapshot fingerprint mismatch');
  const totals = Object.fromEntries(moneyFields.map(field => [field, 0]));
  for (const row of snapshot.rows) {
    for (const field of moneyFields) {
      if (!Number.isSafeInteger(row[field])) fail('Invalid snapshot amount');
      totals[field] += row[field];
      if (!Number.isSafeInteger(totals[field])) fail('Total exceeds safe range');
    }
  }
  for (const field of moneyFields) {
    if (totals[field] !== snapshot.totals[field]) fail(`Snapshot totals do not reconcile: ${field}`);
  }
}

const supportedProfiles = new Set([SYNTHETIC_TABULAR_PROFILE_ID, NATIVE_COA_PROFILE_ID]);

export function preview(report, access, now = new Date(), { verifiedSource } = {}) {
  if (report.source !== undefined) fail('Client-supplied source provenance is not trusted');
  if (!access || !text(access.tenantId) || !text(access.projectId) || access.tenantId !== report.tenantId || access.projectId !== report.projectId) fail('Project access mismatch');
  if (!supportedProfiles.has(report.profile)) fail('Unsupported profile; vendor export version not verified');
  if (report.profile === NATIVE_COA_PROFILE_ID && nativeCoaHeaders.originalBudget in (report.totals ?? {})) {
    report = normalizeNativeCoaReport(report);
  }
  for (const field of ['sourceProjectId', 'revision', 'periodBasis', 'fxBasis', 'sourceFile']) if (!text(report[field])) fail(`Missing metadata: ${field}`);
  if (report.actualsBasis !== 'paid-only' || report.commitmentsBasis !== 'remaining-excludes-unpaid-liabilities') fail('Ambiguous cost overlap basis');
  if (!['USD', 'EUR', 'GBP', 'CAD', 'AUD'].includes(report.currency)) fail('Unsupported currency or decimal precision');
  const asOf = date(report.asOf);
  if (!Number.isFinite(now.getTime()) || asOf > now.getTime()) fail('Invalid or future as-of date');
  if (!report.mapping || required.some(field => !text(report.mapping[field])) || new Set(required.map(field => report.mapping[field])).size !== required.length) fail('Explicit unique field mapping required');
  if (Object.keys(report.mapping).some(field => !required.includes(field))) fail('Unknown mapped field');
  if (!Array.isArray(report.rows) || report.rows.length === 0 || report.rows.length > 10000) fail('Empty or oversized report');
  const allowedColumns = new Set(Object.values(report.mapping));
  const totals = Object.fromEntries(moneyFields.map(field => [field, 0]));
  const accounts = new Set();
  const rows = report.rows.map((input, index) => {
    if (!input || Object.keys(input).length !== allowedColumns.size || Object.keys(input).some(key => !allowedColumns.has(key))) fail('Schema drift or sensitive/unmapped columns; select only approved columns');
    const get = field => input[report.mapping[field]];
    if (get('project') !== report.sourceProjectId || get('currency') !== report.currency) fail('Mixed project or currency');
    safeIdentifier(get('account'), 'account');
    if (typeof get('parentAccount') !== 'string' || (get('parentAccount') && injectionPrefix.test(get('parentAccount')))) fail('Invalid account hierarchy');
    if (accounts.has(get('account'))) fail('Duplicate account or subtotal overlap');
    accounts.add(get('account'));
    const sourceRow = report.sourceRows?.[index] ?? index + 1;
    if (!Number.isSafeInteger(sourceRow) || sourceRow < 1) fail('Invalid source row');
    const row = {
      account: get('account'),
      parentAccount: get('parentAccount'),
      sourceRow,
      lineId: `greenslate-account:${get('account')}`,
      vendorAccountCode: get('account'),
    };
    for (const field of moneyFields) {
      row[field] = money(get(field));
      totals[field] += row[field];
      if (!Number.isSafeInteger(totals[field])) fail('Total exceeds safe range');
    }
    return row;
  });
  for (const row of rows) if (row.parentAccount && accounts.has(row.parentAccount)) fail('Header/subtotal rows cannot overlap detail rows');
  for (const field of moneyFields) if (money(report.totals?.[field]) !== totals[field]) fail(`Source total does not reconcile: ${field}`);
  const source = sourceProvenance(verifiedSource);
  const snapshot = buildCanonicalSnapshot(report, rows, totals, source);
  const fingerprint = fingerprintCanonical(snapshot);
  const profileWarnings = report.profile === NATIVE_COA_PROFILE_ID
    ? ['PROVISIONAL_NATIVE_PROFILE', 'NATIVE_LAYOUT_REQUIRES_USER_ATTESTATION', 'COSTS_ARE_NOT_FINANCING_EVIDENCE']
    : ['SYNTHETIC_PROFILE_ONLY', 'COSTS_ARE_NOT_FINANCING_EVIDENCE'];
  return {
    ...snapshot,
    ...(report.profile === NATIVE_COA_PROFILE_ID ? {
      profileCertification: 'provisional',
      nativeColumnMap: report.nativeColumnMap,
    } : {}),
    fingerprint,
    importedAt: now.toISOString(),
    readOnly: true,
    warnings: [
      ...(now.getTime() - asOf > 30 * 86400000 ? ['STALE_REPORT'] : []),
      ...(report.complete === true ? [] : ['PARTIAL_REPORT']),
      ...profileWarnings,
    ],
  };
}

export function compare(previous, next, access) {
  for (const snapshot of [previous, next]) {
    if (snapshot.tenantId !== access.tenantId || snapshot.projectId !== access.projectId) fail('Project access mismatch');
    assertTrustedSnapshot(snapshot);
  }
  for (const field of ['sourceProjectId', 'currency', 'periodBasis', 'fxBasis', 'profile']) if (previous[field] !== next[field]) fail(`Incompatible snapshot: ${field}`);
  if (previous.fingerprint === next.fingerprint) return { duplicate: true, deltas: {} };
  if (previous.revision === next.revision) fail('Revision conflict');
  if (date(next.asOf) < date(previous.asOf)) fail('Older report cannot replace newer report');
  const deltas = Object.fromEntries(moneyFields.map(field => {
    if (!Number.isSafeInteger(next.totals[field]) || !Number.isSafeInteger(previous.totals[field])) fail('Invalid snapshot amount');
    const difference = BigInt(next.totals[field]) - BigInt(previous.totals[field]);
    if (difference > BigInt(Number.MAX_SAFE_INTEGER) || difference < -BigInt(Number.MAX_SAFE_INTEGER)) fail('Revision delta exceeds safe range');
    return [field, Number(difference)];
  }));
  return { duplicate: false, deltas };
}