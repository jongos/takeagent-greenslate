# Developer diary

## 2026-11-18 — Provisional native Chart of Accounts export profile

Added `greenslate-coa-excel-export-provisional-v1` with documented column map, synthetic fixture, `previewNativeCoaCsv`, stable `lineId` cross-walk keys, and `costFindings` with refused funding deficit. Layout is explicitly provisional pending user-attested vendor samples; see `docs/native-coa-export-profile.md` and `PROVENANCE.md`.

## 2026-11-17 — Add synthetic GreenSlate cost snapshot preview and reconciliation

Started issue #58 in this dedicated repository. Added a dependency-free read-only tabular adapter, explicit mappings, signed minor-unit reconciliation, source provenance, project boundary checks, revision comparison and a CLI. Added synthetic fixtures and negative tests because real export schemas and feed entitlements are unverified. Official sources support a file-first investigation and partner access discovery, not a claim of compatible live access.

Validation: `npm test` passes 20 tests covering reconciliation, credits, immutable previews, duplicate import detection, revision deltas, project and currency isolation, schema drift, invalid amounts/dates, overlapping rows, stale/partial data and conflict rejection. The CLI synthetic preview succeeds. No live account, vendor-export compatibility, authenticated host integration, deployment or retention service was tested. Native XLSX parsing and TakeAgent service wiring remain follow-up work.

## 2026-11-17 — Add bounded development file readers and host integration contract

Advanced the adapter with mapped CSV import and experimental XLSX selected-sheet extraction, preserving source rows and exact signed reconciliation. Added archive limits and active-content rejection, workbook-wide formula/object checks, hidden-sheet/selected hidden-row checks and explicit source identifiers. Added machine-readable development manifest, host security/data contract and vendor/user/engineering blocker ownership. No native vendor export profile was verified; XLSX remains synthetic-only pending process isolation because parser memory/CPU is not fully bounded by file size.

Validation: 38 tests pass locally, including generated synthetic XLSX, CSV quoting, schema drift, hidden cells, formulas on selected/unselected sheets, defined names, macro/external/embedded content and compressed expansion rejection. `npm audit --audit-level=moderate` reports zero vulnerabilities after pinning ExcelJS UUID override 11.1.1. Initial local test runner needed elevated child-process permissions in one sandboxed environment. CI now installs the lockfile and runs tests/audit. No deployment or live source access occurred. Host authentication, guided mapping, retention, vendor profiles and isolated runtime remain open.

## 2026-11-17 - Isolate XLSX previews with worker limits and fail-closed cleanup

Added the host-facing fixed-worker XLSX entry with input/metadata caps, five-second wall-clock deadline, V8 old/young heap and stack limits, response caps on both sides, redacted errors and awaited termination on success, failure or timeout. Updated the manifest and host contract to require the isolated entry rather than direct parser invocation. This advances an engineering gate without requiring vendor access. Vendor format validation remains open; native allocations and process RSS are not covered by V8 resource limits, so deployment memory/concurrency controls are still required.

Validation: 47 tests pass, including actual workbook parsing in a worker, malformed archive redaction, pre-start bounds, worker-side and receiver-side oversized response handling, a busy-loop timeout, worker crash, premature exit and refusal to raise hard limits. No live import or deployment performed. Hosted CI result is checked after the push rather than asserted here.

## 2026-11-17 - Fix revision precision, completeness identity and file provenance

Addressed audit issues #1-3. Revision differences now use BigInt before returning a safe Number, rejecting overflow instead of losing a minor unit. Canonical completeness participates in snapshot identity so partial/complete changes require a reviewed revision. CSV/XLSX readers derive input hashes and column positions; XLSX retains the selected worksheet. File-derived metadata overrides caller source claims and only allowlisted provenance reaches the snapshot. Documentation requires a new reviewed baseline for older fingerprints. Corrected a prior heading's encoding without changing its recorded outcome.

Validation: all 55 tests pass, including opposite-sign overflow, maximum exact deltas, both completeness transitions, identical partial idempotency, reordered CSV columns, changed source bytes, distinct worksheets with identical values, unselected-content exclusion and provenance through the isolated worker. The existing tenant, currency, totals, formula, archive, timeout and response-limit tests remain green. No host application changes, live vendor access or deployment occurred in this commit.



## 2026-11-17 - Document corrected snapshot identity contract

Documented completeness and source provenance as identity inputs, exact delta rejection, and the requirement to establish a reviewed baseline for older snapshots. Normalized diary line endings after the prior encoding repair; historical outcomes are unchanged. Validation: reviewed documentation against the 55 passing regression tests; no source, deployment or live vendor changes in this documentation commit.

## 2026-11-17 — Harden compare(), provenance, money parsing, and XLSX boundaries (#5–#10)

Addressed the six open defect issues with regression tests and CI lint. `compare()` recomputes fingerprints and reconciles row totals before duplicate or delta logic. JSON `preview()` rejects forged `source`; file readers attach provenance via `verifiedSource` only. Main-thread XLSX parsing moved to `src/xlsx-internal.js` and is no longer exported from `files.js`. Identifier and header fields reject formula-prefix injection; `money()` accepts parenthesized credits and comma grouping while XLSX rejects numeric money cells. CI runs `npm run lint` and `test/boundary.test.js` guards host-thread ExcelJS imports.

Validation: 70/70 tests pass with `npm run lint`, `npm test` and `npm audit --audit-level=moderate`. No live vendor access, host deployment or credential use. Parallel open PR #11 carries the same core fix set on a different branch; coordinator should merge one.

## 2026-11-17 — Tighten amount grouping and canonical fingerprint hashing

PR #12 review: `money()` now accepts commas only as US thousands separators (`1,234.56`) and rejects decimal commas and malformed groupings (`5,25`, `1,0,0`, `12,34`). Fingerprints use sorted-key canonical JSON so jsonb round-trip key order does not break `compare()` integrity checks; documented that the digest detects field inconsistency, not whole-record forgery.

Validation: expanded adapter regressions; full suite passes with lint and moderate audit locally.

## 2026-11-17 — Record current optional host release

Added `docs/host-release-status.md` linking the deployed TakeAgent CSV/Excel release and explaining the division between shared host file handling and this adapter. Preserved optional installation, no-new-configuration behavior and vendor-access limitations. Refetched origin and verified the existing adapter source was already synchronized. The complete repository suite passed 55/55 tests. This commit changes documentation only; no adapter or deployment change is claimed.

## 2026-11-18 — Prepare repository for public release

Ran gitleaks and TruffleHog across all branches and tags, plus manual pattern greps on the working tree and history. No credentials or private keys were found. Scrubbed outsider-facing README visibility wording, generalized one sandbox-specific diary note, and added npm package description and repository metadata. LICENSE selection remains an owner decision. No adapter behavior changes.

Validation: `npm run lint`, `npm test`, and `npm audit --audit-level=moderate` pass locally (74 tests). Historical commits still contain the prior README "Private," label and the original sandbox diary wording; those are documentary only and required no credential rotation.

## 2026-11-18 — Adopt the MediaHedge License

Added the proprietary `LICENSE` (MediaHedge License v1.0), set `package.json` / lockfile `license` to `SEE LICENSE IN LICENSE`, and documented terms in the README. Third-party dependency license metadata in `package-lock.json` is unchanged. Validation: `npm run lint`, `npm test`, and `npm audit --audit-level=moderate` pass locally. No adapter or runtime code changes.
