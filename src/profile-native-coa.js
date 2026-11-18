import { moneyFields } from './fields.js';

/** Provisional native Chart of Accounts Excel export; not vendor-certified. */
export const NATIVE_COA_PROFILE_ID = 'greenslate-coa-excel-export-provisional-v1';

export const nativeCoaHeaders = Object.freeze({
  project: 'Project',
  account: 'Account',
  parentAccount: 'Header Account',
  currency: 'Currency',
  originalBudget: 'Budget',
  revisedBudget: 'Revised Budget',
  actuals: 'Actuals',
  unpaidLiabilities: 'Unpaid',
  openCommitments: 'PO Commit',
  estimateToComplete: 'ETC',
  estimatedFinalCost: 'EFC',
});

const fail = message => { throw new Error(message); };

export function stableLineId(account) {
  return `greenslate-account:${account}`;
}

function assertNativeMoneyHeaders_present(row) {
  for (const field of moneyFields) {
    const header = nativeCoaHeaders[field];
    if (!(header in row)) fail(`Missing native column: ${header}`);
  }
}

/** Normalize a user-attested native COA payload into the tabular preview contract (native row keys retained). */
export function normalizeNativeCoaReport(report) {
  if (report.profile !== NATIVE_COA_PROFILE_ID) fail('Unsupported native profile');
  if (report.profileCertification !== 'provisional') fail('Native profile certification must be provisional until vendor attestation');
  if (report.nativeExportAttestedComplete !== true && report.complete !== true) fail('Native export must be attested complete for the selected scope');
  const mapping = Object.fromEntries(Object.entries(nativeCoaHeaders).map(([field, header]) => [field, header]));
  const complete = report.nativeExportAttestedComplete === true || report.complete === true;
  const rows = report.rows.map((nativeRow, index) => {
    assertNativeMoneyHeaders_present(nativeRow);
    if (!(nativeCoaHeaders.account in nativeRow) || !(nativeCoaHeaders.parentAccount in nativeRow) || !(nativeCoaHeaders.currency in nativeRow)) {
      fail('Missing native account hierarchy columns');
    }
    return {
      ...nativeRow,
      [nativeCoaHeaders.project]: nativeRow[nativeCoaHeaders.project] ?? report.sourceProjectId,
    };
  });
  const totals = {};
  for (const field of moneyFields) {
    const header = nativeCoaHeaders[field];
    if (!(header in report.totals)) fail(`Missing native control total: ${header}`);
    totals[field] = report.totals[header];
  }
  return {
    ...report,
    profile: NATIVE_COA_PROFILE_ID,
    complete,
    actualsBasis: 'paid-only',
    commitmentsBasis: 'remaining-excludes-unpaid-liabilities',
    mapping,
    rows,
    totals,
    nativeColumnMap: nativeCoaHeaders,
    profileCertification: 'provisional',
    sourceRows: report.sourceRows ?? rows.map((_, index) => index + 1),
  };
}

/** CSV fixture/order for the provisional profile (Project is host-injected when absent from vendor files). */
export const nativeCoaCsvHeaderOrder = Object.freeze([
  'Account',
  'Header Account',
  'Currency',
  'Budget',
  'Revised Budget',
  'Actuals',
  'Unpaid',
  'PO Commit',
  'ETC',
  'EFC',
]);

export function assertNativeCoaCsvHeaders(headers) {
  if (headers.length !== nativeCoaCsvHeaderOrder.length || headers.some((header, index) => header !== nativeCoaCsvHeaderOrder[index])) {
    fail('Native COA CSV headers do not match the provisional export profile; obtain a user-attested sample to confirm column order and labels');
  }
}

/** Build a normalized native report from parsed CSV records plus host metadata and control totals. */
export function nativeCoaReportFromTable(records, metadata) {
  if (records.length < 2) fail('Native COA CSV requires a header and detail rows');
  const [headers, ...values] = records;
  const vendorHeaders = headers[0] === nativeCoaHeaders.project ? headers.slice(1) : headers;
  assertNativeCoaCsvHeaders(vendorHeaders);
  const rows = values.map(cells => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])));
  const totals = metadata.controlTotals;
  if (!totals) fail('Native COA CSV requires separately supplied control totals');
  return normalizeNativeCoaReport({
    ...metadata,
    profile: NATIVE_COA_PROFILE_ID,
    profileCertification: 'provisional',
    rows,
    totals,
    sourceRows: values.map((_, index) => index + 2),
  });
}