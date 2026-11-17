# Developer diary

## 2026-11-17 — Add synthetic GreenSlate cost snapshot preview and reconciliation

Started issue #58 in a dedicated private repository. Added a dependency-free read-only tabular adapter, explicit mappings, signed minor-unit reconciliation, source provenance, project boundary checks, revision comparison and a CLI. Added synthetic fixtures and negative tests because real export schemas and feed entitlements are unverified. Official sources support a file-first investigation and partner access discovery, not a claim of compatible live access.

Validation: `npm test` passes 20 tests covering reconciliation, credits, immutable previews, duplicate import detection, revision deltas, project and currency isolation, schema drift, invalid amounts/dates, overlapping rows, stale/partial data and conflict rejection. The CLI synthetic preview succeeds. No live account, vendor-export compatibility, authenticated host integration, deployment or retention service was tested. Native XLSX parsing and TakeAgent service wiring remain follow-up work.
