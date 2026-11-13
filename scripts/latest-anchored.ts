/** Prints the as_of date of the latest run anchored on the ledger (empty if none). Used by the daily workflow. */
import { type ChainRun, viewLedger } from "@nearbreakeven/evidence";

const run = await viewLedger<ChainRun | null>("latest_run");
console.log(run ? run.as_of : "");
