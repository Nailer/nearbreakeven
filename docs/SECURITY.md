# Security

## Scope

NEAR Breakeven is research software. The ledger contract runs on NEAR **testnet**; it holds no value beyond the storage deposits attestations pay. The site is static and has no backend.

## Keys

- No private key is in this repository, ever. `.env`, `.env.local` and `.vercel` are git-ignored.
- Scripts that sign (`pnpm anchor`, `pnpm verify --attest`) read keys from `NEAR_KEYS` (JSON `{"account.testnet": "ed25519:..."}`) or from the NEAR CLI keychain in `~/.near-credentials/testnet/`.
- The daily GitHub Action holds the publisher's testnet key as the repository secret `NEAR_KEYS`. It can only publish runs to the ledger; it controls nothing else.
- The site never sees a key. Wallets (Meteor, Intear, HERE, Sender) sign in their own windows; the site only asks them to call `attest` on the ledger with 0.01 testnet NEAR.

## Contract

| Risk | Handling |
|---|---|
| Someone rewrites history | `publish_run` is owner-only and requires a date strictly after the last run. There is no edit or delete method. |
| Fake "it matched" claims | The attester submits hashes; the contract decides `results_matches` and `snapshot_matches` by comparing them with the anchored run. |
| Spam attestations | One attestation per account per run, and each must attach 0.01 NEAR to pay its own storage. Notes are capped at 140 characters. |
| Malformed input | Hashes must be 64 lowercase hex characters, dates `YYYY-MM-DD`, verdicts one of three values, exactly four claims, at most 40 metrics. |

## Data integrity

- A run stops instead of guessing when a source is missing a day.
- Every run pins a mainnet block; chain facts are read at that block from an archival node.
- The snapshot hash detects any later revision by a source. The pinned snapshot files in `data/snapshots/` let anyone separate "the data changed" from "the code changed".

## Reporting

Open an issue on GitHub. For anything sensitive, contact the maintainer through the GitHub profile first.
