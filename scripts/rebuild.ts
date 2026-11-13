/**
 * One command rebuilds every number from raw public data:
 *
 *   pnpm thesis                 # pins yesterday (UTC) and the latest NEAR block
 *   pnpm thesis --as-of 2026-11-12 --block 224351406   # re-run a pinned run exactly
 *   pnpm thesis --from-snapshot data/snapshots/2026-11-12/snapshot.json   # offline
 *
 * Writes data/snapshots/<asOf>/{snapshot,results}.json, data/latest.json and THESIS.md,
 * and copies them to apps/web/public/data for the dashboard.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonical, computeResults, fetchSnapshot, hashOf, type Snapshot, thesisMarkdown } from "@nearbreakeven/evidence";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

const fromFile = arg("from-snapshot");
let snapshot: Snapshot;
if (fromFile) {
  snapshot = JSON.parse(readFileSync(fromFile, "utf8"));
  console.log(`snapshot  read from ${fromFile}`);
} else {
  const block = arg("block");
  snapshot = await fetchSnapshot({
    asOf: arg("as-of"),
    pinnedBlock: block ? Number(block) : undefined,
    onProgress: (s) => console.log(`fetching  ${s}`),
  });
}

const results = await computeResults(snapshot);
const resultsSha256 = await hashOf(results);
const dir = join(root, "data", "snapshots", snapshot.asOf);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "snapshot.json"), `${canonical(snapshot)}\n`);
writeFileSync(join(dir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
const latest = {
  asOf: snapshot.asOf,
  block: snapshot.chain.block,
  snapshotSha256: results.snapshotSha256,
  resultsSha256,
  verdict: results.verdict,
  snapshot: `snapshots/${snapshot.asOf}/snapshot.json`,
  results: `snapshots/${snapshot.asOf}/results.json`,
};
writeFileSync(join(root, "data", "latest.json"), `${JSON.stringify(latest, null, 2)}\n`);
writeFileSync(join(root, "THESIS.md"), thesisMarkdown(results, resultsSha256));

const pub = join(root, "apps", "web", "public", "data", "snapshots", snapshot.asOf);
mkdirSync(pub, { recursive: true });
copyFileSync(join(dir, "snapshot.json"), join(pub, "snapshot.json"));
copyFileSync(join(dir, "results.json"), join(pub, "results.json"));
copyFileSync(join(root, "data", "latest.json"), join(root, "apps", "web", "public", "data", "latest.json"));

const m = results.metrics;
console.log(`
as of     ${snapshot.asOf}   NEAR block ${snapshot.chain.block}
snapshot  sha256 ${results.snapshotSha256}
results   sha256 ${resultsSha256}
verdict   ${results.verdict}
${results.claims.map((c) => `  ${c.passes ? "PASS" : "FAIL"} ${c.id} ${c.claim}\n         ${c.display}`).join("\n")}
coverage  ${(m.breakeven.coverage30 * 100).toFixed(1)}% of new issuance paid by Intents revenue (30 days)
breakeven ${m.breakeven.volumeMultipleNeeded}× today's Intents volume`);
