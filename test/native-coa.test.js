import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { preview } from '../src/adapter.js';
import { costFindings } from '../src/companion.js';
import { NATIVE_COA_PROFILE_ID, nativeCoaCsvHeaderOrder, stableLineId } from '../src/profile-native-coa.js';
import { previewNativeCoaCsv } from '../src/files.js';

const access = { tenantId: 'synthetic-tenant', projectId: 'synthetic-project' };
const now = new Date('2026-11-17T12:00:00Z');
const fixture = () => JSON.parse(readFileSync(new URL('../fixtures/native-coa-export.json', import.meta.url)));

test('provisional native COA JSON maps to fingerprinted snapshot with stable line ids', () => {
  const result = preview(fixture(), access, now);
  assert.equal(result.profile, NATIVE_COA_PROFILE_ID);
  assert.equal(result.profileCertification, 'provisional');
  assert.equal(result.rows[0].lineId, stableLineId('2100'));
  assert.equal(result.rows[0].vendorAccountCode, '2100');
  assert.equal(result.totals.estimatedFinalCost, 670000);
  assert.ok(result.warnings.includes('PROVISIONAL_NATIVE_PROFILE'));
  assert.ok(result.fingerprint.length === 64);
});

test('costFindings refuses funding deficit and flags descriptive cost questions', () => {
  const snapshot = preview(fixture(), access, now);
  const findings = costFindings(snapshot);
  assert.equal(findings.fundingDeficit, null);
  assert.equal(findings.fundingDeficitStatus, 'refused');
  assert.equal(findings.cashTimingDeficit, null);
  assert.equal(findings.fundingGap, findings.fundingDeficit);
  assert.equal(findings.fundingGapStatus, findings.fundingDeficitStatus);
  assert.equal(findings.cashTimingGap, findings.cashTimingDeficit);
  assert.ok(findings.findings.some(f => f.code === 'EFC_ABOVE_REVISED_BUDGET' && f.lineId === stableLineId('2100')));
  assert.ok(findings.findings.some(f => f.code === 'TOTAL_EFC_ABOVE_REVISED_BUDGET'));
});

test('native COA CSV uses fixed headers without user mapping', () => {
  const meta = fixture();
  const lines = [nativeCoaCsvHeaderOrder.join(',')];
  for (const row of meta.rows) {
    lines.push(nativeCoaCsvHeaderOrder.map(header => row[header]).join(','));
  }
  const buffer = Buffer.from(lines.join('\n'));
  delete meta.rows;
  delete meta.totals;
  meta.controlTotals = fixture().totals;
  const result = previewNativeCoaCsv(buffer, meta, access, now);
  assert.equal(result.profile, NATIVE_COA_PROFILE_ID);
  assert.equal(result.rows.length, 3);
  assert.equal(result.source.format, 'csv');
  assert.equal(result.source.columns.estimateToComplete, nativeCoaCsvHeaderOrder.indexOf('ETC') + 2);
});

test('rejects native profile without provisional certification', () => {
  const bad = fixture();
  bad.profileCertification = 'certified';
  assert.throws(() => preview(bad, access, now), /provisional/);
});

test('rejects native CSV when headers drift from provisional layout', () => {
  const meta = fixture();
  meta.controlTotals = fixture().totals;
  const buffer = Buffer.from('Account,Actuals\n2100,1.00\n');
  assert.throws(() => previewNativeCoaCsv(buffer, meta, access, now), /provisional export profile/);
});