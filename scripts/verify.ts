/**
 * Re-runs an anchored run and checks it against NEAR. No keys needed:
 *
 *   pnpm verify                      # latest run, re-fetching every public source (live)
 *   pnpm verify --snapshot           # latest run, from the pinned snapshot in data/
 *   pnpm verify --run 0              # a specific run
 *   pnpm verify --attest you.testnet # also record the result on chain (0.01 NEAR, testnet key needed)
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
const fromSnapshot = process.argv.includes("--snapshot");
const runArg = arg("run");

const run = runArg === undefined ? await viewLedger<ChainRun | null>("latest_run") : await viewLedger<ChainRun | null>("get_run", { run_id: Number(runArg) });
if (!run) throw new Error("no run on the ledger yet");
console.log(`run #${run.id}  as of ${run.as_of}  verdict ${run.verdict}  (${LEDGER_CONTRACT})`);
console.log(`anchored  snapshot ${run.snapshot_sha256}\n          results  ${run.results_sha256}`);

let snapshot: Snapshot;
if (fromSnapshot) {
  const file = join(root, "data", "snapshots", run.as_of, "snapshot.json");
  if (!existsSync(file)) throw new Error(`${file} is missing`);
  snapshot = JSON.parse(readFileSync(file, "utf8"));
} else {
  snapshot = await fetchSnapshot({ asOf: run.as_of, pinnedBlock: run.source_block, onProgress: (s) => console.log(`fetching  ${s}`) });
}
const results = await computeResults(snapshot);
const resultsSha256 = await hashOf(results);
const snapOk = results.snapshotSha256 === run.snapshot_sha256;
const resOk = resultsSha256 === run.results_sha256;
console.log(`yours     snapshot ${results.snapshotSha256} ${snapOk ? "MATCH" : "DIFFERENT"}
          results  ${resultsSha256} ${resOk ? "MATCH" : "DIFFERENT"}
verdict   ${results.verdict}`);
if (!snapOk) console.log("A different snapshot means a source revised its history since the run; the anchored file in data/ is the pinned copy.");

const attester = arg("attest");
if (attester) {
  const sent = await call(
    attester,
    LEDGER_CONTRACT,
    "attest",
    { run_id: run.id, snapshot_sha256: results.snapshotSha256, results_sha256: resultsSha256, method: fromSnapshot ? "snapshot" : "live", note: arg("note") },
    ATTEST_DEPOSIT_YOCTO,
  );
  if (!sent.ok) {
    console.error(`attestation refused: ${sent.failure}\n${txUrl(sent.hash)}`);
    process.exit(1);
  }
  const att = sent.value as { results_matches: boolean };
  console.log(`attested as ${attester}: the contract recorded results_matches=${att.results_matches}\n${txUrl(sent.hash)}`);
}
process.exit(resOk ? 0 : 2);
