# NearBlocks API v1 → v3

NearBlocks switches API v1 off on **22 Nov 2026** ([migration guide](https://api.nearblocks.io/api-docs/migration)). The thesis read its L1 days from `GET /v1/charts`; on this branch (`after-judging`) it reads API v3. How the numbers compare and why the method keeps the series is in [METHODOLOGY.md, section 9](METHODOLOGY.md#9-nearblocks-api-v1--v3).

## What changed

- **History from the pinned file.** v3's daily stats return at most the newest 365 days per call, while the thesis reads from 1 Jan 2024. So `fetchSnapshot({ base })` copies every L1 day up to the base's `asOf` from the previous anchored run's file and fetches only the newer days. The result is a `nearbreakeven/snapshot@2` that names its base by hash (`l1Base`), so each run points to the one before it, back to run #0.
- **Same series from new fields.** `normalizeNearblocksV3` joins `/txn-stats`, `/address-stats`, `/block-stats` and `/price-stats` by date. Active accounts are `active_accounts − meta_accounts`; gas in USD is `txn_fee` × that day's `near_price`. A day missing from any endpoint stops the run.
- **`pnpm thesis` finds its base itself:** the newest run anchored before the day, read from `data/snapshots/` and checked against its hash on NEAR. `--v1` builds every L1 row from v1 as run #0 was (until 22 Nov); `--dry-run` writes nothing.
- **The data check rebuilds a run the way it was built** (`refetchLike`, used by `pnpm verify`, `pnpm drift` and the browser re-run). A snapshot@1 run checked after 22 Nov keeps its NearBlocks rows, still asks DefiLlama and the chain, and says so.
- **Rate limit.** A daily run makes four v3 requests of one credit each. A 429 answer is waited out instead of failing the run.
- **Tests.** 14 new, 49 in the evidence package, including real v1 and v3 rows for 12 to 14 Nov. Run #0's anchored hashes still match.

## Checked live on 15 Nov 2026

- Over the 365 days both APIs serve, transactions, supply and price are identical, fees in NEAR are identical on 364 days, and active accounts agree within 1.4% on the median day.
- `pnpm thesis --as-of 2026-11-14 --dry-run` built on run #0's file: verdict HOLDS with the same four claim values as a build from v1 alone at the same block.

## Going live

The branch stays off `main` until the results (18 Nov). Once it is merged, the next daily run (03:30 UTC) is the first v3 run; the workflow needs no change. It has to be on `main` before 22 Nov, or the daily run stops at its first NearBlocks request.
