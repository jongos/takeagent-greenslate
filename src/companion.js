import { moneyFields } from './fields.js';

/** Cost-only findings from a validated snapshot; never infers financing or payment timing. */
export function costFindings(snapshot) {
  const findings = [];
  for (const row of snapshot.rows) {
    if (row.estimatedFinalCost > row.revisedBudget) {
      findings.push({
        code: 'EFC_ABOVE_REVISED_BUDGET',
        lineId: row.lineId ?? `greenslate-account:${row.account}`,
        account: row.account,
        sourceRow: row.sourceRow,
        amount: row.estimatedFinalCost - row.revisedBudget,
        question: 'Review whether the separate finance plan covers the cost change.',
      });
    }
    if (row.actuals > row.estimatedFinalCost) {
      findings.push({
        code: 'ACTUALS_ABOVE_EFC',
        lineId: row.lineId ?? `greenslate-account:${row.account}`,
        account: row.account,
        sourceRow: row.sourceRow,
        question: 'Confirm actuals and EFC use the same reporting basis.',
      });
    }
    if (row.unpaidLiabilities > 0 && row.openCommitments > 0) {
      findings.push({
        code: 'LIABILITY_AND_COMMITMENT_PRESENT',
        lineId: row.lineId ?? `greenslate-account:${row.account}`,
        account: row.account,
        sourceRow: row.sourceRow,
        question: 'Confirm unpaid and PO commitment amounts do not double-count the same obligation.',
      });
    }
  }
  const totalEfcDelta = snapshot.totals.estimatedFinalCost - snapshot.totals.revisedBudget;
  if (totalEfcDelta > 0) {
    findings.push({
      code: 'TOTAL_EFC_ABOVE_REVISED_BUDGET',
      amount: totalEfcDelta,
      question: 'Totals show estimated final cost above revised budget; reconcile against the finance plan separately.',
    });
  }
  return {
    readOnly: true,
    findings,
    warnings: [...(snapshot.warnings ?? [])],
    amountUnit: snapshot.amountUnit,
    fundingGap: null,
    fundingGapStatus: 'refused',
    cashTimingGap: null,
    limitation: 'Financing availability and cash timing require separate commitment evidence and dated cash flows.',
  };
}

export function rowMoneyDigest(row) {
  return Object.fromEntries(moneyFields.map(field => [field, row[field]]));
}