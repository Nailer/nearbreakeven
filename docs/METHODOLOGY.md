# Methodology

How NEAR Breakeven turns public data into a verdict, step by step, so you can check any number by hand. The code is in [`packages/evidence/src`](../packages/evidence/src).

## 1. Sources

| Source | URL | What we take | Why this one |
|---|---|---|---|
| NearBlocks daily stats | `https://api.nearblocks.io/v1/charts` | `date`, `txns`, `active_accounts`, `new_accounts`, `txn_fee` (yoctoNEAR), `txn_fee_usd`, `total_supply` (yoctoNEAR), `near_price` | Free, no key, full daily history since 2020, CORS-enabled so browsers can re-run it |
| DefiLlama, NEAR Intents | `https://api.llama.fi/summary/dexs/near-intents?dataType=dailyVolume`, `.../fees/near-intents?dataType=dailyFees`, `...dailyRevenue` | Daily volume, gross fees, and revenue NEAR keeps | Free, no key. DefiLlama's methodology reconciles revenue with NEAR's revenue wallets and on-chain buyback (see revenue.near.org) |
| NEAR mainnet, archival RPC | `https://archival-rpc.mainnet.fastnear.com` | `block` header (`total_supply`, timestamp), `EXPERIMENTAL_protocol_config` (`max_inflation_rate`, `protocol_version`), `view_account` of `buybacks.multisignature.near` | Primary source: the chain itself, read at a pinned height so the answer never changes |

The track's suggested sources (NEAR BigQuery and the Intents Explorer API) need a Google Cloud bill or a partner JWT. We left them out on purpose so that every judge can re-run the whole thesis. What that costs us is listed in THESIS.md under "What this data cannot measure".

## 2. Normalization

- yoctoNEAR → NEAR with **integer** arithmetic (`BigInt`), never floats: supply in whole NEAR, fees with six decimals.
- Dollars rounded to cents, prices to six decimals.
- L1 rows from 2024-01-01 through `asOf`; Intents rows from the first day DefiLlama has through `asOf`. Volume starts on 2024-12-10, fees and revenue on 2025-05-10, and a missing value is `null`, never zero.
- Rows sorted by date. If either source has no row for `asOf`, the run stops: we never fill a gap.

## 3. Hashing

`canonical()` writes JSON with object keys sorted at every level and no whitespace, refuses `NaN`, `Infinity` and `undefined`, and writes `-0` as `0`. `sha256Hex()` uses WebCrypto, which is built into Node 22+ and every browser. The **snapshot hash** covers the normalized data. The **results hash** covers the full results object, which itself contains the snapshot hash, so a results hash pins both.

## 4. Metrics

All windows end on `asOf` and are counted in whole UTC days. `last N days` means `asOf − N < d ≤ asOf`.

| Metric | Definition |
|---|---|
| `activeAvg30`, `txnsAvg30` | Mean of the last 30 days |
| `activePeakAvg30` | Highest mean over any 30-day window since 2024-01-01 (reached in the window ending 2024-07-09) |
| `gasFeesUsd30` | Sum of `txn_fee_usd`, last 30 days |
| `feePerActiveDayUsd` | `gasFeesUsd30` ÷ Σ active accounts over the same days; same at the peak window |
| `issuanceNear30` | Σ over the last 30 days of (supply that day − supply the day before) |
| `issuanceUsd30` | Σ over the last 30 days of (supply change that day × price that day) |
| `annualizedRatePct` | `issuanceNear30` ÷ supply 30 days ago × 365/30 |
| `volume30`, `fees30`, `revenue30` | Sums over the last 30 days |
| `takeRateBps` | `revenue30` ÷ `volume30` × 10,000 |
| `revenueMultiple` | `revenue30` ÷ `gasFeesUsd30` |
| `coverage30` | `revenue30` ÷ `issuanceUsd30` |
| `coverage90`, `coveragePrev90` | Same over the last 90 days and the 90 days before |
| `quarterlyGrowth` | `coverage90` ÷ `coveragePrev90` |
| `quartersToBreakeven` | 0 if `coverage90` ≥ 1. If growth ≤ 1, `null` ("never at the current pace"). Otherwise the smallest q ≤ 40 with `coverage90 × growth^q ≥ 1`, computed by repeated multiplication |
| `breakevenDailyVolume` | (`issuanceUsd30` ÷ 30) ÷ (`revenue30` ÷ `volume30`) |
| `volumeMultipleNeeded` | `breakevenDailyVolume` ÷ (`volume30` ÷ 30) |
| `corrActivePrice12m` | Pearson r between the month-on-month % change of average active accounts and of average price, over the last 12 complete months (11 pairs) |
| `priceChangeFromLowPct` | Mean price of the last 7 days vs the lowest daily price in the last 365 days |
| `inflationBeforePct`, `inflationNowPct` | `max_inflation_rate` at block 165,000,000 (protocol 79) and at the pinned block |
| `supplyHeaderVsNearBlocksPct` | Total supply in the pinned block header vs NearBlocks' last row |

**Determinism.** The engine uses only +, −, ×, ÷ and `Math.sqrt`, which IEEE 754 makes exact and identical everywhere, then rounds each output to a fixed number of decimals. It never uses `Math.log`, `Math.pow` or `Date.now()`. That is why Chrome, Firefox, Safari and Node produce the same results hash.

## 5. Claims and verdict

| | Passes if | Threshold |
|---|---|---|
| C1 | `revenueMultiple` ≥ threshold | 5 |
| C2 | `coverage90` > `coveragePrev90` | — |
| C3 | `quartersToBreakeven` is not null and ≤ threshold | 8 |
| C4 | `corrActivePrice12m` < threshold | 0.3 |

Verdict: all pass → **HOLDS**; one fails → **UNDER PRESSURE**; two or more → **BROKEN**.

Thresholds were fixed on 13 Nov 2026, after a first look at the data and before the first run was anchored. They are deliberately not tuned per run.

## 6. What it is worth to NEAR

[`value.ts`](../packages/evidence/src/value.ts) prices the levers from the same results, with no new data: revenue per \$1M of volume (take rate × \$1M), coverage points per extra \$100M of daily volume and per extra basis point (extra daily revenue ÷ daily value of new NEAR), points lost per \$1 on price (at the value-weighted price new NEAR was minted at), and the yearly run rates (30-day sums × 365 ÷ 30). A test checks that the gap and the breakeven volume add back up to the thesis's own coverage and breakeven numbers.

## 7. Anchoring and attestations

See the contract: [`contract/src/lib.rs`](../contract/src/lib.rs). Runs are append-only with strictly increasing dates. Attestations carry the attester's two hashes; the contract computes `results_matches` and `snapshot_matches` itself.

## 8. Known sensitivities

- **Price.** Coverage uses the dollar value of issuance, so a price rally lowers coverage at constant revenue.
- **Revenue timing.** DefiLlama records revenue on sweep days; single months can be near zero (June 2025) or spike. 90-day windows are the basis for C2 and C3.
- **Source revisions.** DefiLlama keeps filling in a day's NEAR Intents fees and revenue for a few days (12 Nov 2026 fees went from \$16.6K to \$257.5K a day later). So a run pins a day only once it is `SETTLE_DAYS` (3) old, and `pnpm verify` keeps two answers apart: the code check (pinned file → anchored hashes) and the data check (every value the sources revised since, from `diffSnapshots`, with the verdict on today's data). `pnpm drift` prints the revisions alone. Run #0 was pinned before the settle rule; its five revised values move 30-day coverage from 15.66% to 15.71%.
