import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeResults } from "../src/metrics.js";
import type { Snapshot } from "../src/types.js";
import { levers } from "../src/value.js";

const snap = JSON.parse(readFileSync(new URL("../../../data/snapshots/2026-11-12/snapshot.json", import.meta.url), "utf8")) as Snapshot;

describe("levers for NEAR, from anchored run #0", async () => {
  const r = await computeResults(snap);
  const l = levers(r);
  const m = r.metrics;

  it("adds up to the coverage the thesis reports", () => {
    // Closing the daily gap exactly is breakeven.
    const coverageFromGap = 1 - l.gapPerDay / (m.supply.issuanceUsd30 / 30);
    expect(coverageFromGap).toBeCloseTo(m.breakeven.coverage30, 3);
    // Volume needed: today's volume plus the gap paid at today's take rate.
    const needed = m.breakeven.currentDailyVolume + (l.gapPerDay / l.per100mVolume.revenuePerDay) * 100e6;
    expect(needed / m.breakeven.breakevenDailyVolume).toBeCloseTo(1, 3);
  });

  it("prices each lever", () => {
    expect(l.revenuePerMillion).toBeCloseTo(m.intents.takeRateBps * 100, 1);
    expect(l.per100mVolume.coveragePoints).toBeGreaterThan(0);
    expect(l.perBasisPoint.revenuePerDay).toBe(Math.round(m.breakeven.currentDailyVolume / 10_000));
    expect(l.revenueRunRateYear).toBeLessThan(l.issuanceRunRateYear);
  });
});
