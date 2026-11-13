import { addDays } from "../src/sources.js";
import type { Snapshot } from "../src/types.js";

/**
 * A synthetic snapshot with round numbers, so every metric can be checked by hand:
 * 400 days, supply +1,000 NEAR/day at $2, gas $10/day, 100 active accounts/day,
 * Intents $1M volume/day and revenue $100/day, except the last 90 days where
 * revenue doubles to $200/day.
 */
export function fixture(overrides: { revenueLast90?: number; activeLast30?: number } = {}): Snapshot {
  const asOf = "2026-11-12";
  const days = 400;
  const l1 = [];
  const intents = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(asOf, -i);
    l1.push({ d, txns: 1000, active: i < 30 ? (overrides.activeLast30 ?? 100) : 100, newAccounts: 1, feeNear: 5, feeUsd: 10, supply: 1_000_000_000 + (days - i) * 1000, price: 2 });
    intents.push({ d, volume: 1_000_000, fees: 300, revenue: i < 90 ? (overrides.revenueLast90 ?? 200) : 100 });
  }
  return {
    schema: "nearbreakeven/snapshot@1",
    asOf,
    l1,
    intents,
    chain: {
      block: 1,
      blockTime: "2026-11-13T00:00:00.000Z",
      totalSupply: 1_000_400_000,
      protocolBefore: { block: 165_000_000, protocolVersion: 79, maxInflationRate: [1, 20] },
      protocolNow: { block: 1, protocolVersion: 81, maxInflationRate: [1, 40] },
      buybackAccount: "buybacks.multisignature.near",
      buybackBalance: 5,
    },
  };
}
