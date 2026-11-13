import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hashOf } from "../src/canonical.js";
import { THRESHOLDS, computeMetrics, computeResults, evaluateClaims, verdictOf } from "../src/metrics.js";
import { fixture } from "./fixture.js";

describe("metrics on a hand-checkable fixture", () => {
  const m = computeMetrics(fixture());

  it("values new issuance at each day's price", () => {
    expect(m.supply.issuanceNear30).toBe(30_000);
    expect(m.supply.issuanceUsd30).toBe(60_000);
  });
  it("computes coverage, its growth and the breakeven point", () => {
    // 30 days: revenue 30 × $200 = $6,000 against $60,000 issued → 10%.
    expect(m.breakeven.coverage30).toBe(0.1);
    // 90 days vs the 90 before: $18,000 vs $9,000 against $180,000 each.
    expect(m.breakeven.coverage90).toBe(0.1);
    expect(m.breakeven.coveragePrev90).toBe(0.05);
    expect(m.breakeven.quarterlyGrowth).toBe(2);
    // 10% → 20% → 40% → 80% → 160%: four quarters.
    expect(m.breakeven.quartersToBreakeven).toBe(4);
    // Take rate 2 bps; $2,000/day issued needs $10M/day of volume, 10× today.
    expect(m.intents.takeRateBps).toBe(2);
    expect(m.breakeven.breakevenDailyVolume).toBe(10_000_000);
    expect(m.breakeven.volumeMultipleNeeded).toBe(10);
  });
  it("compares Intents revenue with L1 gas", () => {
    expect(m.breakeven.revenueMultiple).toBe(20);
  });
  it("reads inflation straight from the protocol parameters", () => {
    expect(m.chain.inflationBeforePct).toBe(5);
    expect(m.chain.inflationNowPct).toBe(2.5);
  });
});

describe("claims and verdict", () => {
  it("holds when every test passes", () => {
    const claims = evaluateClaims(computeMetrics(fixture()));
    expect(claims.map((c) => c.passes)).toEqual([true, true, true, true]);
    expect(verdictOf(claims)).toBe("HOLDS");
  });
  it("breaks C2 and C3 when coverage stops growing", () => {
    const claims = evaluateClaims(computeMetrics(fixture({ revenueLast90: 100 })));
    expect(claims.find((c) => c.id === "C2")!.passes).toBe(false);
    const c3 = claims.find((c) => c.id === "C3")!;
    expect(c3.value).toBeNull();
    expect(c3.passes).toBe(false);
    expect(verdictOf(claims)).toBe("BROKEN");
  });
  it("breaks C1 when Intents revenue is under the gas threshold", () => {
    const claims = evaluateClaims(computeMetrics(fixture({ revenueLast90: 40 })));
    expect(claims.find((c) => c.id === "C1")!.passes).toBe(40 / 10 >= THRESHOLDS.revenueMultiple);
  });
  it("refuses a window with missing days instead of guessing", () => {
    const s = fixture();
    s.intents.splice(s.intents.length - 5, 1);
    expect(() => computeMetrics(s)).toThrow(/expected 30 days/);
  });
});

describe("the anchored run", () => {
  it("is reproduced byte for byte from the pinned snapshot (run #0, 2026-11-12)", async () => {
    const file = join(__dirname, "..", "..", "..", "data", "snapshots", "2026-11-12", "snapshot.json");
    const results = await computeResults(JSON.parse(readFileSync(file, "utf8")));
    expect(results.snapshotSha256).toBe("784a00b915b0fd20b1c06abc6f826408f68e367b1d8dec7f23d247548c053be3");
    expect(await hashOf(results)).toBe("7ef91d4c95a119a3a5c081e768d14fc66ef97029d356c76d5761043b6357f179");
  });
});
