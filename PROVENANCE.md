# Vendor provenance pin (TakeAgent host)

This file records what the TakeAgent host should vendor from `jongos/takeagent-greenslate` for build brief item 6 (native exports).

| Field | Value |
| --- | --- |
| Canonical repository | https://github.com/jongos/takeagent-greenslate |
| Integration id | `greenslate` |
| Native export profile | `greenslate-coa-excel-export-provisional-v1` |
| Profile certification | `provisional` |
| Development / mapped profile | `synthetic-greenslate-tabular-v1` |
| Package entry (preview) | `src/adapter.js` → `preview` |
| Cost findings (no funding deficit) | `src/companion.js` → `costFindings` |
| Native CSV entry | `src/files.js` → `previewNativeCoaCsv` |
| Stable row cross-walk key | `lineId` (`greenslate-account:<account>`) |
| Host contract | `docs/host-contract.md` |
| Column documentation | `docs/native-coa-export-profile.md` |
| Certified fixture (synthetic) | `fixtures/native-coa-export.json` |

Pin by commit SHA after merge; do not claim vendor certification until GreenSlate attests the export layout documented in `docs/native-coa-export-profile.md`.