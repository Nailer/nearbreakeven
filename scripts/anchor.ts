/**
 * Anchors the latest run on NEAR (publisher only):
 *
 *   pnpm thesis && pnpm anchor
 *
 * Sends the snapshot hash, results hash, the four claims, the verdict and the
 * git commit to ledger.nearbreakeven.testnet. The contract refuses a run whose
 * date is not after the last one, so history is append-only.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LEDGER_CONTRACT, PUBLISHER, type Results, chainClaims, chainMetrics, hashOf, txUrl } from "@nearbreakeven/evidence";
import { call } from "./lib/signer.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const latest = JSON.parse(readFileSync(join(root, "data", "latest.json"), "utf8"));
const results: Results = JSON.parse(readFileSync(join(root, "data", latest.results), "utf8"));
const resultsSha256 = await hashOf(results);
if (resultsSha256 !== latest.resultsSha256) throw new Error("results.json does not match latest.json; run pnpm thesis again");

const code = execSync("git rev-parse --short=12 HEAD", { cwd: root }).toString().trim();
const args = {
  as_of: results.asOf,
  source_block: latest.block,
  snapshot_sha256: results.snapshotSha256,
  results_sha256: resultsSha256,
  verdict: results.verdict,
  claims: chainClaims(results),
  metrics: chainMetrics(results),
  code,
};
console.log(`anchoring run for ${args.as_of} (${args.verdict}) on ${LEDGER_CONTRACT} as ${PUBLISHER}`);
const sent = await call(PUBLISHER, LEDGER_CONTRACT, "publish_run", args, "0", "50000000000000");
if (!sent.ok) {
  console.error(`refused: ${sent.failure}\n${txUrl(sent.hash)}`);
  process.exit(1);
}
console.log(`run #${sent.value} anchored\n${txUrl(sent.hash)}`);
