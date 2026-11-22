# TakeAgent host release status

GreenSlate is an optional, independently installed skill at https://takeagent.ai/skills.

CSV and values-only XLSX file previews are available through the TakeAgent website and authorized agent file preview tools. Users inspect the worksheet/header row, review column mappings and report details, and confirm scope before reconciliation. They do not prepare JSON or new configuration files.

Shared website and agent file handling lives in the [TakeAgent integrations platform](https://takeagent.ai/integrations), not as a duplicate implementation in this adapter repository. GreenSlate wiring and release notes are published at https://takeagent.ai/integrations/greenslate.

No vendor API credentials, new environment variables or database migration are required for this host release. Existing agent authorization, plan and usage rules apply. Skills remain off until explicitly added and removable independently. Selected-file previews do not automatically synchronize vendor accounts, establish financing, persist uploaded reports or alter saved finance plans. Native export certification and direct API access remain subject to the repository's documented vendor blockers.

Validation recorded on 2026-11-17: this repository's complete suite passed 55/55 tests. Host validation passed 394 tests, TypeScript, optimized production build, privacy scan and GitHub CI. Production browser checks reconciled CSV and XLSX for Saturation, GreenSlate and EP, then restored the original zero installations. Authenticated host MCP transport tests cover the file workflows and revocation; this is not a claim that every external agent client or vendor API was exercised. No emails were sent.