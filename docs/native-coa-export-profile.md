# GreenSlate Chart of Accounts export profile (provisional)

**Profile id:** `greenslate-coa-excel-export-provisional-v1`  
**Certification:** `provisional` — not vendor-certified. TakeAgent must not describe this layout as an approved GreenSlate schema.

## Public sources reviewed

| Topic | Reference | What it establishes |
| --- | --- | --- |
| COA UI and export actions | [How to: Use the Chart of Accounts](https://support.greenslate.com/how-to-use-the-chart-of-accounts) | Chart of Accounts supports hierarchy, filters, and **Export** to PDF (current page) or **Excel (all pages)**. UI options include uncommitted POs, negative ETC/EFC, and sub-accounts. |
| Cost report measures | [How to: Make Cost Report Changes](https://support.greenslate.com/how-to-make-cost-report-changes) | In-product cost reporting uses **Budget**, **ETC**, and **EFC** (linked), with optional **Approved Overage** and location/episode dimensions. |
| Dashboard vocabulary | [GreenSlate production dashboard](https://greenslate.com/production-dashboard) | Slate-level summaries reference actual cost, PO commit, budget, ETC, and variance. |

None of the public material lists exact Excel header strings, column order, control-total rows, or whether original versus revised budget appear as separate columns in the COA export.

## Provisional native column map

The adapter accepts only the following header labels in file order for CSV entry (Excel mapped flow uses the same labels):

| TakeAgent normalized field | Provisional native header | Notes |
| --- | --- | --- |
| `account` | `Account` | Stable `lineId` = `greenslate-account:<Account>` |
| `parentAccount` | `Header Account` | Parent/header code from hierarchy UI |
| `currency` | `Currency` | Single currency per report; no FX |
| `originalBudget` | `Budget` | Labeled from cost-report docs; separate original history not verified |
| `revisedBudget` | `Revised Budget` | **Unverified** separate column name |
| `actuals` | `Actuals` | `actualsBasis`: paid-only (assumption) |
| `unpaidLiabilities` | `Unpaid` | **Unverified** label for unpaid obligations |
| `openCommitments` | `PO Commit` | From dashboard “PO commit” vocabulary |
| `estimateToComplete` | `ETC` | Documented measure |
| `estimatedFinalCost` | `EFC` | Documented measure |

`Project` is not part of the provisional vendor file order. The host injects `sourceProjectId` into each row during normalization when the column is absent.

## Overlap bases (assumptions)

- `actualsBasis`: `paid-only`
- `commitmentsBasis`: `remaining-excludes-unpaid-liabilities`

These match the development synthetic profile and remain assumptions until GreenSlate confirms export definitions.

## What a user-attested sample must confirm

1. Exact Excel/CSV header text and column order (including whether `Revised Budget`, `Unpaid`, and `PO Commit` labels match).
2. Whether exports include header/subtotal rows that must be stripped before import.
3. Paid actuals versus unpaid liabilities versus open PO commitment definitions and overlap rules.
4. Location/episode columns and whether amounts must be split before import.
5. Presence and format of footer control totals.

Until then, hosts must set `profileCertification: "provisional"` and `nativeExportAttestedComplete: true` only when the user attests the upload is a complete export for the selected scope.

## Funding boundary

`costFindings()` returns descriptive cost questions only. `fundingDeficit` is always `null` with `fundingDeficitStatus: "refused"`; `cashTimingDeficit` is always `null`. Deprecated compatibility keys `fundingGap`, `fundingGapStatus`, and `cashTimingGap` mirror those values. Plan impact belongs in host finance plan review after user-approved mapping.

## Topsheet cross-walk (future)

Each detail row exposes:

- `lineId` — stable TakeAgent key (`greenslate-account:<account>`)
- `vendorAccountCode` — verbatim account code string

TakeAgent topsheet taxonomy ids (above-the-line, below-the-line, fringes, contingency, completion-bond, insurance, errors-omissions, completion-delivery, financing-cost, reserve, unclassified) are **not** assigned in this adapter.