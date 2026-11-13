/** Prints the latest anchored run and its re-run counts, read from NEAR. */
import { type ChainRun, LEDGER_CONTRACT, viewLedger } from "@nearbreakeven/evidence";

const count = await viewLedger<number>("run_count");
const run = await viewLedger<ChainRun | null>("latest_run");
console.log(`${LEDGER_CONTRACT}: ${count} run(s)`);
if (run) console.log(`latest #${run.id}  as of ${run.as_of}  ${run.verdict}  re-runs ${run.attestations}, matched ${run.matching}`);
