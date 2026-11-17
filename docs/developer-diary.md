# Developer diary

## 2026-11-17 â€” Add synthetic GreenSlate cost snapshot preview and reconciliation

Started issue #58 in a dedicated private repository. Added a dependency-free read-only tabular adapter, explicit mappings, signed minor-unit reconciliation, source provenance, project boundary checks, revision comparison and a CLI. Added synthetic fixtures and negative tests because real export schemas and feed entitlements are unverified. Official sources support a file-first investigation and partner access discovery, not a claim of compatible live access.

Validation: `npm test` passes 20 tests covering reconciliation, credits, immutable previews, duplicate import detection, revision deltas, project and currency isolation, schema drift, invalid amounts/dates, overlapping rows, stale/partial data and conflict rejection. The CLI synthetic preview succeeds. No live account, vendor-export compatibility, authenticated host integration, deployment or retention service was tested. Native XLSX parsing and TakeAgent service wiring remain follow-up work.

## 2026-11-17 — Add bounded development file readers and host integration contract

Advanced the adapter with mapped CSV import and experimental XLSX selected-sheet extraction, preserving source rows and exact signed reconciliation. Added archive limits and active-content rejection, workbook-wide formula/object checks, hidden-sheet/selected hidden-row checks and explicit source identifiers. Added machine-readable development manifest, host security/data contract and vendor/user/engineering blocker ownership. No native vendor export profile was verified; XLSX remains synthetic-only pending process isolation because parser memory/CPU is not fully bounded by file size.

Validation: 38 tests pass locally, including generated synthetic XLSX, CSV quoting, schema drift, hidden cells, formulas on selected/unselected sheets, defined names, macro/external/embedded content and compressed expansion rejection. `npm audit --audit-level=moderate` reports zero vulnerabilities after pinning ExcelJS UUID override 11.1.1. Initial local test runner needed Windows sandbox child-process escalation. CI now installs the lockfile and runs tests/audit. No deployment or live source access occurred. Host authentication, guided mapping, retention, vendor profiles and isolated runtime remain open.
