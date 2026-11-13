# Deployment

## The site (Vercel)

The site is static. It loads the newest run from this repository (`data/latest.json` on `main`) and falls back to the copy bundled at build time.

```bash
cd apps/web
pnpm build:vercel                 # vite build → .vercel/output (Build Output API v3)
vercel deploy --prebuilt --prod   # https://nearbreakeven.vercel.app
```

No environment variables are needed.

## The contract (NEAR testnet)

```bash
cd contract
cargo test
cargo near build non-reproducible-wasm --locked --no-wasmopt
near contract deploy ledger.nearbreakeven.testnet use-file target/near/breakeven_ledger.wasm \
  with-init-call new json-args '{"owner":"nearbreakeven.testnet"}' \
  prepaid-gas '30 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-legacy-keychain send
```

Upgrading the code later keeps every stored run and attestation (the state layout must not change):

```bash
near contract deploy ledger.nearbreakeven.testnet use-file target/near/breakeven_ledger.wasm \
  without-init-call network-config testnet sign-with-legacy-keychain send
pnpm ledger    # prints the run count and the latest run, read back from NEAR
```

`--no-wasmopt`: Rust 1.87+ emits WebAssembly bulk-memory instructions that the bundled `wasm-opt` validator rejects. NEAR testnet accepts them.

Accounts: `nearbreakeven.testnet` (publisher, owner), `ledger.nearbreakeven.testnet` (contract), `rerun.nearbreakeven.testnet` (command-line attester for the demo). All were funded from the public testnet faucet.

## Runs

```bash
pnpm thesis    # build the run for the newest settled day (3 days back)
pnpm anchor    # publish it (owner key)
```

The [daily workflow](../.github/workflows/daily-run.yml) does both at 03:30 UTC, then commits the data. It needs the repository secret `NEAR_KEYS` holding the publisher's testnet key.
