# Changelog

## 0.2.0 · 13 Nov 2026 (afternoon)

Found by auditing the project against the hackathon rules and the thesis track prompt, then re-running it from a clean clone.

- **Verify no longer depends on the sources standing still.** A fresh `pnpm verify` of run #0 printed DIFFERENT: DefiLlama had revised five NEAR Intents values for 8 to 12 Nov after the run was pinned (12 Nov fees \$16.6K → \$257.5K). Verify now runs a code check from the pinned file (exit code, on-chain `results_matches`) and a separate data check that lists every revised value and the verdict on today's data. `pnpm drift` prints the revisions alone. Same flow in the browser.
- **Runs pin settled days only** (`SETTLE_DAYS = 3`).
- **Contract refunds deposits above 0.01 NEAR.** Upgraded on testnet without re-init; state kept. SECURITY.md now says who can upgrade the contract.
- **For NEAR page and `levers()`:** what NEAR earns per \$1M swapped, what volume, take rate, issuance and price do to coverage, who the tracker serves, the business model, and the JSON data feed.
- Calculator starts at the run's exact numbers; claims read "Test: …"; the inflation cut is dated end of October 2025 (the evidence page said November); chart axes use round steps.
- README: removed two claims nobody can check ("no other L1…", "no public dashboard…"); added value, business model and data sections.

## 0.1.0 · 13 Nov 2026

- Evidence engine (`@nearbreakeven/evidence`): keyless sources (NearBlocks, DefiLlama, NEAR archival RPC), exact normalization, canonical SHA-256, deterministic metrics, four claims with fixed thresholds, generated thesis text.
- `pnpm thesis`, `pnpm verify`, `pnpm anchor`.
- `breakeven-ledger` contract on NEAR testnet: append-only runs, attestations checked on chain, NEP-297 events.
- Run #0 (data through 2026-11-12) anchored: verdict HOLDS. Re-run from a clean fetch attested with `results_matches: true`.
- Site at nearbreakeven.vercel.app: thesis in brief, evidence, full thesis, in-browser re-run and wallet attestation.
- CI (lint, tests, typecheck, build, reproduce the anchored run, contract tests) and a daily run that anchors and commits each new day.
