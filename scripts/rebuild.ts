/**
 * One command rebuilds every number from raw public data:
 *
 *   pnpm thesis                 # pins the newest settled day (UTC, SETTLE_DAYS back) and the latest NEAR block
 *   pnpm thesis --as-of 2026-11-14 --dry-run   # compute and print, write nothing
 *   pnpm thesis --as-of 2026-11-12 --block 224351751 --v1   # every L1 row from NearBlocks API v1, as run #0 was built (until 22 Nov 2026)
 *   pnpm thesis --from-snapshot data/snapshots/2026-11-12/snapshot.json   # offline
 *
 * L1 history comes from the pinned file of the newest run anchored before the day, checked against the hash NEAR
 * holds for it; only the days after it are fetched, from NearBlocks API v3 (docs/SOURCES-V3.md). With no run
 * anchored before the day, or with --v1, every L1 row comes from NearBlocks API v1.
 *
 * Writes data/snapshots/<asOf>/{snapshot,results}.json, data/latest.json and THESIS.md,
 * and copies them to apps/web/public/data for the dashboard.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type ChainRun,
  NearblocksV1Gone,
  type Snapshot,
  canonical,
  computeResults,
  fetchSnapshot,
  hashOf,
  settledDay,
  thesisMarkdown,
  viewLedger,
} from "@nearbreakeven/evidence";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const dryRun = process.argv.includes("--dry-run");

/**
 * The pinned file of the newest run anchored before `asOf`, checked against the hash NEAR holds for it. A run
 * whose file is not in data/ (anchored, but its commit not pulled yet) is skipped for the run before it.
 */
async function anchoredBase(asOf: string): Promise<Snapshot | undefined> {
  const runs = await viewLedger<ChainRun[]>("list_runs", { limit: 100 });
  for (const run of runs.filter((r) => r.as_of < asOf)) {
    const file = join(root, "data", "snapshots", run.as_of, "snapshot.json");
    if (!existsSync(file)) {
      console.log(`note      run #${run.id} (${run.as_of}) is anchored but ${file} is missing; using the run before it`);
      continue;
    }
    const base = JSON.parse(readFileSync(file, "utf8")) as Snapshot;
    const sha = await hashOf(base);
    if (sha !== run.snapshot_sha256) throw new Error(`${file} hashes to ${sha}, but run #${run.id} anchored ${run.snapshot_sha256}`);
    console.log(`history   L1 rows through ${run.as_of} from run #${run.id}'s pinned file (same hash as on NEAR)`);
    return base;
  }
  return undefined;
}

const fromFile = arg("from-snapshot");
let snapshot: Snapshot;
if (fromFile) {
  snapshot = JSON.parse(readFileSync(fromFile, "utf8"));
  console.log(`snapshot  read from ${fromFile}`);
} else {
  const asOf = arg("as-of") ?? settledDay();
  const block = arg("block");
  const base = process.argv.includes("--v1") ? undefined : await anchoredBase(asOf);
  try {
    snapshot = await fetchSnapshot({
      asOf,
      pinnedBlock: block ? Number(block) : undefined,
      base,
      onProgress: (s) => console.log(`fetching  ${s}`),
    });
  } catch (e) {
    if (!(e instanceof NearblocksV1Gone)) throw e;
    console.error(
      `${e.message}. Nothing is anchored before ${asOf} to build on, so this day can only be recomputed from its pinned file:\n  pnpm thesis --from-snapshot data/snapshots/${asOf}/snapshot.json --dry-run`,
    );
    process.exit(1);
  }
}

const results = await computeResults(snapshot);
const resultsSha256 = await hashOf(results);

if (!dryRun) {
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
  // Never replace the published run with an older day: a re-run for an earlier day (for example with fewer
  // settled days on a different date) writes its snapshot and results, and leaves THESIS.md and latest.json alone.
  const latestFile = join(root, "data", "latest.json");
  const published = existsSync(latestFile) ? (JSON.parse(readFileSync(latestFile, "utf8")) as { asOf: string }).asOf : "";
  const publish = snapshot.asOf >= published || process.argv.includes("--publish");
  if (publish) {
    writeFileSync(latestFile, `${JSON.stringify(latest, null, 2)}\n`);
    writeFileSync(join(root, "THESIS.md"), thesisMarkdown(results, resultsSha256));
  } else {
    console.log(
      `note      this run is for ${snapshot.asOf}, older than the published run (${published}); THESIS.md and data/latest.json are unchanged (pass --publish to replace them)`,
    );
  }

  const pub = join(root, "apps", "web", "public", "data", "snapshots", snapshot.asOf);
  mkdirSync(pub, { recursive: true });
  copyFileSync(join(dir, "snapshot.json"), join(pub, "snapshot.json"));
  copyFileSync(join(dir, "results.json"), join(pub, "results.json"));
  if (publish) copyFileSync(latestFile, join(root, "apps", "web", "public", "data", "latest.json"));
}

const m = results.metrics;
const l1From =
  snapshot.schema === "nearbreakeven/snapshot@2"
    ? `through ${snapshot.l1Base.asOf} from that run's pinned file, then NearBlocks API v3`
    : "NearBlocks API v1";
console.log(`
as of     ${snapshot.asOf}   NEAR block ${snapshot.chain.block}
L1 rows   ${l1From}
snapshot  sha256 ${results.snapshotSha256}
results   sha256 ${resultsSha256}
verdict   ${results.verdict}
${results.claims.map((c) => `  ${c.passes ? "PASS" : "FAIL"} ${c.id} ${c.claim}\n         ${c.display}`).join("\n")}
coverage  ${(m.breakeven.coverage30 * 100).toFixed(1)}% of new issuance paid by Intents revenue (30 days)
breakeven ${m.breakeven.volumeMultipleNeeded}× today's Intents volume${dryRun ? "\ndry run   nothing was written" : ""}`);
