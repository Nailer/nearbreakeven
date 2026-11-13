# breakeven-ledger

The NEAR contract behind NEAR Breakeven. Deployed on testnet at
[`ledger.nearbreakeven.testnet`](https://testnet.nearblocks.io/address/ledger.nearbreakeven.testnet).

| Method | Who | What it does |
|---|---|---|
| `publish_run` | owner (`nearbreakeven.testnet`) | Anchors one run: data snapshot SHA-256, results SHA-256, the four claim results, the verdict, the git commit. Dates must strictly increase, so a past run can never be edited or replaced. |
| `attest` | anyone, with 0.01 NEAR for storage | Records the hashes the caller got when they re-ran a run. The contract compares them with the anchored ones and stores `results_matches` / `snapshot_matches`. One attestation per account per run. |
| `latest_run`, `get_run`, `list_runs`, `list_attestations`, `get_attestation`, `run_count`, `get_owner` | anyone (view) | Read the ledger. |

Every write emits a NEP-297 event (`EVENT_JSON:{"standard":"nearbreakeven",...}`).

```bash
cargo test                                   # 11 unit tests
cargo near build non-reproducible-wasm --locked --no-wasmopt
```

`--no-wasmopt`: Rust 1.87+ emits WebAssembly bulk-memory instructions, which
the bundled `wasm-opt` validator rejects; NEAR testnet accepts them (the
deployed contract is built this way).
