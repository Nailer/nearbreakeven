import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SETTLE_DAYS, diffSnapshots, settledDay } from "../src/sources.js";
import type { Snapshot } from "../src/types.js";

const pinned = JSON.parse(readFileSync(new URL("../../../data/snapshots/2026-11-12/snapshot.json", import.meta.url), "utf8")) as Snapshot;
const clone = (s: Snapshot): Snapshot => JSON.parse(JSON.stringify(s));

describe("settle delay", () => {
  it("pins a day only after it has had time to settle", () => {
    expect(SETTLE_DAYS).toBeGreaterThanOrEqual(2);
    expect(settledDay(new Date("2026-11-13T17:00:00Z"))).toBe("2026-11-10");
  });
});

describe("drift between a pinned snapshot and a fresh fetch", () => {
  it("is empty for identical data, whatever the key order", () => {
    const fresh = clone(pinned);
    fresh.chain = Object.fromEntries(Object.entries(fresh.chain).reverse()) as Snapshot["chain"];
    expect(diffSnapshots(pinned, fresh)).toEqual([]);
  });

  it("names each revised value with its source, day and field", () => {
    const fresh = clone(pinned);
    const last = fresh.intents.at(-1)!;
    last.fees = 257492;
    fresh.l1[0]!.txns += 1;
    const drift = diffSnapshots(pinned, fresh);
    expect(drift).toEqual([
      { source: "NearBlocks", day: pinned.l1[0]!.d, field: "txns", before: String(pinned.l1[0]!.txns), after: String(pinned.l1[0]!.txns + 1) },
      { source: "DefiLlama", day: "2026-11-12", field: "fees", before: String(pinned.intents.at(-1)!.fees), after: "257492" },
    ]);
  });

  it("reports rows that appear or disappear", () => {
    const fresh = clone(pinned);
    fresh.intents.shift();
    const drift = diffSnapshots(pinned, fresh);
    expect(drift).toHaveLength(1);
    expect(drift[0]).toMatchObject({ source: "DefiLlama", field: "row", after: "(missing)" });
  });
});
