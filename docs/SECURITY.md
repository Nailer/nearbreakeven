# Security

## Scope

NEAR Breakeven is research software. The ledger contract runs on NEAR **testnet**; it holds no value beyond the storage deposits attestations pay. The site is static and has no backend.

## Keys

- No private key is in this repository, ever. `.env`, `.env.local` and `.vercel` are git-ignored.
- Scripts that sign (`pnpm anchor`, `pnpm verify --attest`) read keys from `NEAR_KEYS` (JSON `{"account.testnet": "ed25519:..."}`) or from the NEAR CLI keychain in `~/.near-credentials/testnet/`.
- The daily GitHub Action holds the publisher's testnet key (`nearbreakeven.testnet`) as the repository secret `NEAR_KEYS`. On the ledger it can only publish runs; it cannot deploy code to `ledger.nearbreakeven.testnet`, which has its own, separate key.
- The site never sees a key. Wallets (Meteor, Intear, HERE, Sender) sign in their own windows; the site only asks them to call `attest` on the ledger with 0.01 testnet NEAR.

## Contract

| Risk | Handling |
|---|---|
| Someone rewrites history | `publish_run` is owner-only and requires a date strictly after the last run. There is no edit or delete method. |
| Fake "it matched" claims | The attester submits hashes; the contract decides `results_matches` and `snapshot_matches` by comparing them with the anchored run. |
| Spam attestations | One attestation per account per run, and each must attach 0.01 NEAR to pay its own storage. Anything attached above 0.01 NEAR is refunded in the same call. Notes are capped at 140 characters. |
| The owner swaps the contract code | Possible today, and stated here rather than hidden: `ledger.nearbreakeven.testnet` still has one full-access key (held offline by the maintainer, not in CI, not the publisher key). Code upgrades keep the stored runs. The one upgrade so far, on 13 Nov 2026, added the refund above ([transaction](https://testnet.nearblocks.io/txns/5aPe4rf55FmLbA11n7AKJT5ar8GjSt83XdeLkJ1bUWXs)); its code hash is `EGf2Smjkpio5r9Y3mK4URt4d7yuiKfLkFCXoC3uSeesP`, the output of `cargo near build non-reproducible-wasm --locked --no-wasmopt` on this commit. For a mainnet ledger the plan is to delete that key after the final deploy (or hand it to a DAO), so append-only becomes a property of the chain, not of our restraint. |
| Malformed input | Hashes must be 64 lowercase hex characters, dates `YYYY-MM-DD`, verdicts one of three values, exactly four claims, at most 40 metrics. |

## Data integrity

- A run stops instead of guessing when a source is missing a day.
- Every run pins a mainnet block; chain facts are read at that block from an archival node.
- A run pins a day only after `SETTLE_DAYS` (3), because DefiLlama keeps filling in recent days. Run #0 was pinned before this rule and its last two days have since been revised (12 Nov fees $16.6K → $257.5K, revenue +$3.7K); `pnpm drift` lists every change. The effect on the thesis is 15.66% → 15.71% coverage, verdict unchanged.
- The snapshot hash detects any later revision by a source. The pinned snapshot files in `data/snapshots/` let anyone separate "the data changed" from "the code changed", and `pnpm verify` reports the two separately.

## Reporting

Open an issue on GitHub. For anything sensitive, contact the maintainer through the GitHub profile first.
