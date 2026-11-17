import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { preview, compare, moneyFields } from '../src/adapter.js';
const fixture = () => JSON.parse(readFileSync(new URL('../fixtures/synthetic-report.json', import.meta.url)));
const access = { tenantId: 'synthetic-tenant', projectId: 'synthetic-project' };
const run = report => preview(report, access, new Date('2026-11-17T12:00:00Z'));
test('signed account data reconciles with provenance and preserves input', () => {
  const input = fixture(), before = structuredClone(input), result = run(input);
  assert.equal(result.totals.actuals, 29000); assert.equal(result.rows[1].actuals, -1000);
  assert.equal(result.rows[1].sourceRow, 2); assert.equal(result.readOnly, true); assert.deepEqual(input, before);
  assert.ok(result.warnings.includes('COSTS_ARE_NOT_FINANCING_EVIDENCE'));
});
test('identical snapshots are idempotent across import timestamps', () => {
  const a = run(fixture()), b = preview(fixture(), access, new Date('2026-11-18'));
  assert.deepEqual(compare(a, b, access), { duplicate: true, deltas: {} });
});
test('revision comparisons preserve original and signed delta', () => {
  const input = fixture(), previous = run(input);
  input.revision = '2'; input.rows[0].actuals = '350'; input.totals.actuals = '340';
  const result = compare(previous, run(input), access);
  assert.equal(result.deltas.actuals, 5000); assert.equal(previous.totals.actuals, 29000);
});
for (const [name, mutate] of [
  ['tenant boundary', r => { r.tenantId = 'other'; }],
  ['project boundary', r => { r.projectId = 'other'; }],
  ['mixed source projects', r => { r.rows[1].project = 'other'; }],
  ['mixed currencies', r => { r.rows[1].currency = 'EUR'; }],
  ['sensitive extra column', r => { r.rows[1].bankAccount = 'synthetic'; }],
  ['formula amount', r => { r.rows[1].actuals = '=1+2'; }],
  ['missing fields', r => { delete r.rows[0].actuals; }],
  ['duplicate accounts', r => { r.rows[1].account = r.rows[0].account; }],
  ['subtotal double count', r => { r.rows[1].account = '1000'; }],
  ['unreconciled totals', r => { r.totals.actuals = '999'; }],
  ['ambiguous liabilities', r => { r.actualsBasis = 'unknown'; }],
  ['invalid date', r => { r.asOf = '2026-02-30'; }],
  ['unknown profile', r => { r.profile = 'vendor-live'; }],
  ['mapping collision', r => { r.mapping.actuals = 'originalBudget'; }],
  ['decimal precision', r => { r.rows[0].actuals = '3.001'; }],
]) test(`rejects ${name}`, () => { const r = fixture(); mutate(r); assert.throws(() => run(r)); });
test('stale partial reports remain visibly qualified', () => {
  const r = fixture(); r.asOf = '2026-01-01'; r.complete = false;
  assert.ok(run(r).warnings.includes('STALE_REPORT')); assert.ok(run(r).warnings.includes('PARTIAL_REPORT'));
});
test('revision conflict and cross-tenant comparison rejected', () => {
  const a = run(fixture()), r = fixture(); r.rows[0].actuals = '301'; r.totals.actuals = '291';
  assert.throws(() => compare(a, run(r), access), /Revision conflict/);
  assert.throws(() => compare(a, a, { ...access, tenantId: 'other' }), /access mismatch/);
});

function uniformReport(amount, revision) {
  const r = fixture(); r.revision = revision; r.rows = r.rows.slice(0, 1);
  for (const field of moneyFields) r.rows[0][field] = r.totals[field] = amount;
  return run(r);
}
test('opposite-signed validated snapshots reject unsafe deltas in both directions', () => {
  const negative = uniformReport('-45035996273704.96', '1'), positive = uniformReport('45035996273704.97', '2');
  assert.throws(() => compare(negative, positive, access), /delta exceeds safe range/);
  assert.throws(() => compare(positive, negative, access), /delta exceeds safe range/);
});
test('maximum supported signed deltas remain exact', () => {
  const zero = uniformReport('0', '1'), max = uniformReport('90071992547409.91', '2');
  assert.equal(compare(zero, max, access).deltas.actuals, Number.MAX_SAFE_INTEGER);
  assert.equal(compare(max, zero, access).deltas.actuals, -Number.MAX_SAFE_INTEGER);
});
for (const [before, after] of [[true, false], [false, true]]) test(`completeness ${before} to ${after} requires a new revision`, () => {
  const input = fixture(); input.complete = before; const previous = run(input);
  input.complete = after; const changed = run(input);
  assert.equal(previous.complete, before); assert.equal(changed.complete, after);
  assert.notEqual(previous.fingerprint, changed.fingerprint);
  assert.throws(() => compare(previous, changed, access), /Revision conflict/);
  input.revision = '2'; const result = compare(previous, run(input), access);
  assert.equal(result.duplicate, false); assert.ok(Object.values(result.deltas).every(value => value === 0));
});
test('identical partial reports still deduplicate', () => {
  const r = fixture(); r.complete = false;
  assert.equal(compare(run(r), run(r), access).duplicate, true);
});
test('JSON preview rejects client-forged source provenance', () => {
  const r = fixture();
  r.source = {
    format: 'csv',
    sha256: 'f'.repeat(64),
    headerRow: 1,
    columns: Object.fromEntries(moneyFields.map((field, i) => [field, i + 1])),
  };
  assert.throws(() => run(r), /not trusted/);
});
test('accounting amount strings parse without float coercion', () => {
  const r = fixture();
  r.rows[0].actuals = '(10.00)';
  r.rows[1].actuals = '1,234.56';
  r.totals.actuals = '1,224.56';
  const result = run(r);
  assert.equal(result.rows[0].actuals, -1000);
  assert.equal(result.rows[1].actuals, 123456);
});
for (const value of ['5,25', '1,0,0', '12,34']) {
  test(`rejects invalid amount grouping ${JSON.stringify(value)}`, () => {
    const r = fixture();
    r.rows[0].actuals = value;
    assert.throws(() => run(r), /Decimal comma|thousands grouping|explicit decimal/);
  });
}
test('compare accepts snapshots with jsonb-style key reordering', () => {
  const valid = run(fixture());
  const reorderDeep = value => {
    if (Array.isArray(value)) return value.map(reorderDeep);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value).sort().reverse().map(key => [key, reorderDeep(value[key])]));
    }
    return value;
  };
  const { fingerprint, importedAt, readOnly, warnings, ...canonical } = valid;
  const reshaped = { ...reorderDeep(canonical), fingerprint, importedAt, readOnly, warnings };
  assert.equal(compare(valid, reshaped, access).duplicate, true);
});
for (const value of ['=CMD|x', '+cmd', '@evil', '\t=1+1']) {
  test(`rejects formula-prefixed account ${JSON.stringify(value)}`, () => {
    const r = fixture();
    r.rows[0].account = value;
    assert.throws(() => run(r), /Invalid account/);
  });
}
test('compare rejects forged fingerprint with tampered totals', () => {
  const valid = run(fixture());
  const tampered = structuredClone(valid);
  tampered.totals.actuals = 0;
  assert.throws(() => compare(valid, tampered, access), /fingerprint mismatch|totals do not reconcile/);
});
test('compare rejects mismatched totals even when fingerprint is copied', () => {
  const valid = run(fixture());
  const tampered = structuredClone(valid);
  tampered.totals.actuals = valid.totals.actuals - 100;
  tampered.fingerprint = valid.fingerprint;
  assert.throws(() => compare(valid, tampered, access), /fingerprint mismatch|totals do not reconcile/);
});
