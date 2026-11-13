# Changelog

## 0.1.0 · 13 Nov 2026

- Evidence engine (`@nearbreakeven/evidence`): keyless sources (NearBlocks, DefiLlama, NEAR archival RPC), exact normalization, canonical SHA-256, deterministic metrics, four claims with fixed thresholds, generated thesis text.
- `pnpm thesis`, `pnpm verify`, `pnpm anchor`.
- `breakeven-ledger` contract on NEAR testnet: append-only runs, attestations checked on chain, NEP-297 events.
- Run #0 (data through 2026-11-12) anchored: verdict HOLDS. Re-run from a clean fetch attested with `results_matches: true`.
- Site at nearbreakeven.vercel.app: thesis in brief, evidence, full thesis, in-browser re-run and wallet attestation.
- CI (lint, tests, typecheck, build, reproduce the anchored run, contract tests) and a daily run that anchors and commits each new day.
