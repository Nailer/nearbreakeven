import { describe, expect, it } from "vitest";
import { addDays, normalizeIntents, normalizeNearblocks, round, yoctoToNear, yoctoToNear6 } from "../src/sources.js";

describe("units", () => {
  it("converts yoctoNEAR exactly, ignoring decimal tails", () => {
    expect(yoctoToNear("1311549122982004139095931101595325")).toBe(1311549122);
    expect(yoctoToNear6("988071835740217191600000000.00000000")).toBe(988.071835);
  });
  it("rounds without producing -0", () => {
    expect(round(-0.0001, 2)).toBe(0);
    expect(round(1.005, 1)).toBe(1);
  });
  it("adds days across months and leap years", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("NearBlocks normalization", () => {
  const raw = {
    charts: [
      { date: "2023-12-31T00:00:00.000Z", txns: "1", active_accounts: "1", new_accounts: "1", txn_fee: "0", txn_fee_usd: "0", total_supply: "0", near_price: "1" },
      { date: "2024-01-02T00:00:00.000Z", txns: "20", active_accounts: "7", new_accounts: "2", txn_fee: "2000000000000000000000000.5", txn_fee_usd: "7.126", total_supply: "1200000000000000000000000000000000", near_price: "3.1234567" },
      { date: "2024-01-01T00:00:00.000Z", txns: "10", active_accounts: "5", new_accounts: "1", txn_fee: "1000000000000000000000000", txn_fee_usd: "3.5", total_supply: "1100000000000000000000000000000000", near_price: "3" },
      { date: "2024-01-03T00:00:00.000Z", txns: "30", active_accounts: "9", new_accounts: "3", txn_fee: "0", txn_fee_usd: "0", total_supply: "0", near_price: "3" },
    ],
  };
  it("keeps the window, sorts by date and converts units", () => {
    const rows = normalizeNearblocks(raw, "2024-01-02");
    expect(rows.map((r) => r.d)).toEqual(["2024-01-01", "2024-01-02"]);
    expect(rows[1]).toEqual({ d: "2024-01-02", txns: 20, active: 7, newAccounts: 2, feeNear: 2, feeUsd: 7.13, supply: 1_200_000_000, price: 3.123457 });
  });
  it("fails loudly on an unexpected response", () => {
    expect(() => normalizeNearblocks({ error: "rate limited" }, "2024-01-02")).toThrow(/no charts array/);
  });
});

describe("DefiLlama normalization", () => {
  const ts = (d: string) => Date.parse(`${d}T00:00:00Z`) / 1000;
  it("joins volume, fees and revenue by date, with nulls before fees exist", () => {
    const vol = { totalDataChart: [[ts("2025-05-09"), 100.123], [ts("2025-05-10"), 200], [ts("2025-05-11"), 300]] };
    const fees = { totalDataChart: [[ts("2025-05-10"), 2]] };
    const rev = { totalDataChart: [[ts("2025-05-10"), 0.5]] };
    expect(normalizeIntents(vol, fees, rev, "2025-05-10")).toEqual([
      { d: "2025-05-09", volume: 100.12, fees: null, revenue: null },
      { d: "2025-05-10", volume: 200, fees: 2, revenue: 0.5 },
    ]);
  });
  it("fails loudly on an unexpected response", () => {
    expect(() => normalizeIntents({}, {}, {}, "2025-05-10")).toThrow(/totalDataChart/);
  });
});
