/**
 * Shows exactly which rows of a pinned snapshot the public sources have revised since.
 *
 *   pnpm drift                 # the latest snapshot in data/
 *   pnpm drift --as-of 2026-11-12
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Snapshot, diffSnapshots, fetchSnapshot } from "@nearbreakeven/evidence";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const i = process.argv.indexOf("--as-of");
const latest = JSON.parse(readFileSync(join(root, "data", "latest.json"), "utf8")) as { asOf: string };
const asOf = i > 0 ? process.argv[i + 1] : latest.asOf;
const pinned = JSON.parse(readFileSync(join(root, "data", "snapshots", asOf, "snapshot.json"), "utf8")) as Snapshot;
const fresh = await fetchSnapshot({ asOf, pinnedBlock: pinned.chain.block });
const changes = diffSnapshots(pinned, fresh);
if (changes.length === 0) {
  console.log(`no drift: every source still returns the pinned data for ${asOf}`);
} else {
  console.log(`${changes.length} value(s) revised by the sources since the ${asOf} snapshot:`);
  for (const c of changes) console.log(`  ${c.source.padEnd(10)} ${c.day}  ${c.field.padEnd(14)} ${c.before} → ${c.after}`);
}
