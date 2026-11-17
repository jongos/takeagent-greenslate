import { createHash } from 'node:crypto';

export const moneyFields = ['originalBudget', 'revisedBudget', 'actuals', 'unpaidLiabilities', 'openCommitments', 'estimateToComplete', 'estimatedFinalCost'];
const required = ['project', 'account', 'parentAccount', 'currency', ...moneyFields];
const fail = message => { throw new Error(message); };
const text = value => typeof value === 'string' && value.trim().length > 0;
function date(value) {
  if (!text(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail('Invalid reporting date');
  return Date.parse(value);
}
// Integer minor units avoid silent floating-point reconciliation drift.
function money(value) {
  if (typeof value !== 'string' || !/^-?\d+(\.\d{1,2})?$/.test(value)) fail('Amounts must be explicit decimal strings with at most two places');
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = value.replace('-', '').split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(result)) fail('Amount exceeds safe range');
  return negative ? -result : result;
}

export function preview(report, access, now = new Date()) {
  if (!access || !text(access.tenantId) || !text(access.projectId) || access.tenantId !== report.tenantId || access.projectId !== report.projectId) fail('Project access mismatch');
  if (report.profile !== 'synthetic-greenslate-tabular-v1') fail('Unsupported profile; vendor export version not verified');
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
    if (!text(get('account')) || typeof get('parentAccount') !== 'string') fail('Invalid account hierarchy');
    if (accounts.has(get('account'))) fail('Duplicate account or subtotal overlap');
    accounts.add(get('account'));
    const sourceRow = report.sourceRows?.[index] ?? index + 1;
    if (!Number.isSafeInteger(sourceRow) || sourceRow < 1) fail('Invalid source row');
    const row = { account: get('account'), parentAccount: get('parentAccount'), sourceRow };
    for (const field of moneyFields) {
      row[field] = money(get(field));
      totals[field] += row[field];
      if (!Number.isSafeInteger(totals[field])) fail('Total exceeds safe range');
    }
    return row;
  });
  for (const row of rows) if (row.parentAccount && accounts.has(row.parentAccount)) fail('Header/subtotal rows cannot overlap detail rows');
  for (const field of moneyFields) if (money(report.totals?.[field]) !== totals[field]) fail(`Source total does not reconcile: ${field}`);
  const snapshot = { tenantId: report.tenantId, projectId: report.projectId, sourceApplication: 'GreenSlate', profile: report.profile, sourceProjectId: report.sourceProjectId, revision: report.revision, asOf: report.asOf, periodBasis: report.periodBasis, currency: report.currency, fxBasis: report.fxBasis, sourceFile: report.sourceFile, amountUnit: 'minor-units', rows, totals };
  const fingerprint = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  return { ...snapshot, fingerprint, importedAt: now.toISOString(), readOnly: true, warnings: [...(now.getTime() - asOf > 30 * 86400000 ? ['STALE_REPORT'] : []), ...(report.complete === true ? [] : ['PARTIAL_REPORT']), 'SYNTHETIC_PROFILE_ONLY', 'COSTS_ARE_NOT_FINANCING_EVIDENCE'] };
}

export function compare(previous, next, access) {
  for (const snapshot of [previous, next]) if (snapshot.tenantId !== access.tenantId || snapshot.projectId !== access.projectId) fail('Project access mismatch');
  for (const field of ['sourceProjectId', 'currency', 'periodBasis', 'fxBasis', 'profile']) if (previous[field] !== next[field]) fail(`Incompatible snapshot: ${field}`);
  if (previous.fingerprint === next.fingerprint) return { duplicate: true, deltas: {} };
  if (previous.revision === next.revision) fail('Revision conflict');
  if (date(next.asOf) < date(previous.asOf)) fail('Older report cannot replace newer report');
  return { duplicate: false, deltas: Object.fromEntries(moneyFields.map(field => [field, next.totals[field] - previous.totals[field]])) };
}
