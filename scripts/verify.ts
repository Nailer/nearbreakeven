/**
 * Re-runs an anchored run and checks it against NEAR. No keys needed:
 *
 *   pnpm verify                      # latest run: code check from the pinned file, then a data check against the live sources
 *   pnpm verify --snapshot           # code check only (no network except the ledger read)
 *   pnpm verify --run 0              # a specific run
 *   pnpm verify --attest you.testnet # also record the result on chain (0.01 NEAR, testnet key needed)
 *
 * Two separate questions, two separate answers:
 *   1. Code: does the pinned data file hash to the anchored data hash, and does
 *      today's code turn it into exactly the anchored results? (exit code 0 / 2)
 *   2. Data: do the public sources still return that same data? Sources revise
 *      recent days; every revised value is listed, with what it does to the verdict.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ATTEST_DEPOSIT_YOCTO,
  type ChainRun,
  LEDGER_CONTRACT,
  type Snapshot,
  computeResults,
  diffSnapshots,
  fetchSnapshot,
  hashOf,
  txUrl,
  viewLedger,
} from "@nearbreakeven/evidence";
import { call } from "./lib/signer.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const codeOnly = process.argv.includes("--snapshot");
const runArg = arg("run");
const mark = (ok: boolean) => (ok ? "MATCH" : "DIFFERENT");

const run = runArg === undefined ? await viewLedger<ChainRun | null>("latest_run") : await viewLedger<ChainRun | null>("get_run", { run_id: Number(runArg) });
if (!run) throw new Error("no run on the ledger yet");
console.log(`run #${run.id}  as of ${run.as_of}  verdict ${run.verdict}  (${LEDGER_CONTRACT})`);
console.log(`anchored  data     ${run.snapshot_sha256}\n          results  ${run.results_sha256}\n`);

// 1. Code check, from the pinned file.
const file = join(root, "data", "snapshots", run.as_of, "snapshot.json");
if (!existsSync(file)) throw new Error(`${file} is missing; pull the repository again`);
const pinned = JSON.parse(readFileSync(file, "utf8")) as Snapshot;
const results = await computeResults(pinned);
const resultsSha256 = await hashOf(results);
const fileOk = results.snapshotSha256 === run.snapshot_sha256;
const codeOk = resultsSha256 === run.results_sha256;
console.log("1. code check: pinned data file → today's code");
console.log(`   data     ${results.snapshotSha256} ${mark(fileOk)}`);
console.log(`   results  ${resultsSha256} ${mark(codeOk)}`);
console.log(`   verdict  ${results.verdict}\n`);

// 2. Data check, against the live sources at the same day and block.
let liveClean = false;
if (!codeOnly) {
  console.log("2. data check: the public sources today, same day, same NEAR block");
  const fresh = await fetchSnapshot({ asOf: run.as_of, pinnedBlock: run.source_block, onProgress: (s) => console.log(`   fetching ${s}`) });
  const drift = diffSnapshots(pinned, fresh);
  liveClean = drift.length === 0;
  if (liveClean) {
    console.log("   no drift: every source still returns the pinned data, so a live re-run gives the same hashes");
  } else {
    const live = await computeResults(fresh);
    const before = results.metrics.breakeven.coverage30;
    const after = live.metrics.breakeven.coverage30;
    console.log(`   ${drift.length} value(s) revised by the sources since the run was pinned:`);
    for (const c of drift) console.log(`     ${c.source.padEnd(10)} ${c.day}  ${c.field.padEnd(8)} ${c.before} → ${c.after}`);
    console.log(`   on today's data: verdict ${live.verdict}, 30-day coverage ${(after * 100).toFixed(2)}% (anchored ${(before * 100).toFixed(2)}%)`);
    console.log("   The anchored run keeps the data it was computed from; data/ holds that exact file.");
  }
  console.log("");
}

console.log(
  codeOk && fileOk
    ? "Reproduced: the anchored data file and today's code give the anchored results, byte for byte."
    : "NOT reproduced: see the DIFFERENT lines above.",
);

const attester = arg("attest");
if (attester) {
  const sent = await call(
    attester,
    LEDGER_CONTRACT,
    "attest",
    { run_id: run.id, snapshot_sha256: results.snapshotSha256, results_sha256: resultsSha256, method: liveClean ? "live" : "snapshot", note: arg("note") },
    ATTEST_DEPOSIT_YOCTO,
  );
  if (!sent.ok) {
    console.error(`attestation refused: ${sent.failure}\n${txUrl(sent.hash)}`);
    process.exit(1);
  }
  const att = sent.value as { results_matches: boolean };
  console.log(`attested as ${attester}: the contract recorded results_matches=${att.results_matches}\n${txUrl(sent.hash)}`);
}
process.exit(codeOk && fileOk ? 0 : 2);
