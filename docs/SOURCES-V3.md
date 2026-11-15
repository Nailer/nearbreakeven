# NearBlocks API v1 is switched off on 22 Nov 2026

The thesis reads NearBlocks' daily chain stats from `GET /v1/charts` (`packages/evidence/src/sources.ts`). NearBlocks switches v1 off on **22 Nov 2026** ([migration guide](https://api.nearblocks.io/api-docs/migration)). From then on `pnpm thesis` and the daily run fail at the first fetch. `pnpm verify --snapshot` keeps working, because it uses the pinned file.

## What v3 changes (checked 15 Nov 2026)

| v1 `/v1/charts` field | v3 source | Same numbers? |
|---|---|---|
| `txns` | `/v3/txn-stats` → `txns` | Yes: 1,036,324 on 13 Nov in both |
| `total_supply` | `/v3/block-stats` → `total_supply` | To check |
| `txn_fee` (yocto) | `/v3/txn-stats` → `txn_fee` (decimal NEAR) | Unit changes |
| `txn_fee_usd` | none; `txn_fee` × `/v3/price-stats` → `near_price` | Derived |
| `near_price` | `/v3/price-stats` → `near_price` | To check |
| `active_accounts` | `/v3/address-stats` → `active_accounts` | **No.** 13 Nov: 85,595 in v1, 196,377 in v3 |
| `new_accounts` | none (v3 has `new_contracts` and `meta_accounts`) | Missing |

Each v3 stats call returns at most 365 days, while the thesis reads from 1 Jan 2024 (the L1 peak, and 13 months for C4's correlation).

## Plan

1. **History from the pinned snapshot.** Days already in an anchored snapshot never change, so a run takes every day up to the previous anchored run's `asOf` from that snapshot (hash-checked) and fetches only the newer days from v3. That also stays inside the 365-day limit.
2. **Active accounts: a stated break, not a silent one.** v3 counts about 2.3× more active accounts than v1 for the same day. The series is split at the switch-over day; the active-accounts change and C4 compare like with like (v1 with v1, v3 with v3), and METHODOLOGY.md says so.
3. **Fees in USD** become `txn_fee` × that day's `near_price`, checked against v1 on the overlapping days before the switch.
4. **New accounts** leave the snapshot (the thesis does not test them).
5. The first v3 run is anchored as usual. `pnpm drift` shows which values moved and what that does to the verdict.

This changes how future runs are built, not run #0: `pnpm verify --run 0` keeps matching from its pinned file.
