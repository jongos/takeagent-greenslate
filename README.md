# TakeAgent GreenSlate integration spike

Private, read-only development for [TakeAgent issue #58](https://github.com/jongos/takeagent/issues/58). This is a working synthetic tabular adapter and reconciliation prototype, not a verified GreenSlate connector or supported vendor Excel export importer.

## Run

Node 22 or later; no runtime dependencies.

```sh
npm test
npm run preview -- fixtures/synthetic-report.json synthetic-tenant synthetic-project
```

The preview accepts a JSON file containing explicitly selected table rows, a one-to-one column mapping, report metadata and separately supplied source totals. The canonical output retains original/revised budget, paid actuals, unpaid liabilities, remaining commitments, ETC and EFC separately. Amounts are integer minor units; credits are preserved. No aggregate cost is inferred by adding potentially overlapping fields. Import identity excludes the import timestamp. Revision comparison does not mutate either report or any finance plan.

## Support and boundaries

| Input | Status |
| --- | --- |
| `synthetic-greenslate-tabular-v1` JSON selected rows | Tested prototype |
| Native GreenSlate XLSX, CSV, PDF, GL layouts | Not yet supported or vendor-validated |
| API/SFTP feeds | Disabled; no connection implementation |
| USD, EUR, GBP, CAD, AUD | Single currency per report, two decimals, no FX conversion |

Only approved mapped columns are accepted. Extra columns, mixed projects/currencies, duplicate accounts, header/detail overlap, invalid dates, ambiguous cost bases and unreconciled totals are rejected. Parent account references preserve hierarchy, but header/subtotal records must be removed explicitly before import. Location and episode dimensions are not implemented; multiple records for one account fail rather than silently aggregate. Every source monetary column and total is required in this bounded profile; missing data is never assumed to be zero. Reports older than 30 days and reports not explicitly complete are qualified.

The caller must authenticate the user and derive `access` server-side. CLI arguments are developer inputs, not authentication. This library has no persistence, logs, network calls, secrets or source mutation. Disconnect/deletion of stored data is consequently not implemented; the eventual host must enforce those controls. Output contains selected report data: run only against synthetic inputs during development. Untrusted strings are data and must be escaped by any future UI. Preview is not explicit authorization to apply changes.

## Verified sources and next gates

Reviewed November 17, 2026: [GreenSlate integrations](https://greenslate.com/integrations) describes API/SFTP and a partner route. [Chart of accounts documentation](https://support.greenslate.com/how-to-use-the-chart-of-accounts) describes account hierarchy, project filtering and PDF/Excel exports. Neither establishes the precise report schema used here. The fixture is invented for development.

Next: obtain a vendor-approved synthetic export and documented version; add bounded XLSX parsing through TakeAgent's existing document services and a guided mapping preview; validate accounting definitions, location/episode dimensions, source totals and missing fields; integrate authenticated host access and retention/deletion; verify API entitlement and scoped feed terms before any live pilot. The parent TakeAgent repository remains unchanged and no deployment occurred. Cost data does not establish committed financing, cash timing or collateral collectibility.
