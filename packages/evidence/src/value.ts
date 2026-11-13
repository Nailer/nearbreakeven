/**
 * What the run means in money for NEAR: the levers that move coverage and what
 * each is worth. Pure arithmetic on a run's results, so every figure on the
 * "For NEAR" page traces back to the anchored results hash.
 */
import { round } from "./sources.js";
import type { Results } from "./types.js";

export interface Levers {
  /** Intents revenue over the last 30 days, scaled to a year. */
  revenueRunRateYear: number;
  /** Value of new NEAR over the last 30 days, scaled to a year. */
  issuanceRunRateYear: number;
  /** What NEAR keeps from each $1M of Intents volume, USD. */
  revenuePerMillion: number;
  /** Daily revenue and percentage points of coverage from each extra $100M of daily volume. */
  per100mVolume: { revenuePerDay: number; coveragePoints: number };
  /** Daily revenue and percentage points of coverage from each extra basis point of take rate, on today's volume. */
  perBasisPoint: { revenuePerDay: number; coveragePoints: number };
  /** Extra dollars of daily issuance cost for each $1 on NEAR's price (new NEAR per day), and the coverage points that costs. */
  perDollarOfPrice: { costPerDay: number; coveragePoints: number };
  /** Coverage points gained if issuance were halved again (coverage doubles). */
  halvedIssuance: { savedPerYear: number; coveragePoints: number };
  /** Daily and yearly shortfall between the value of new NEAR and Intents revenue. */
  gapPerDay: number;
  gapPerYear: number;
}

export function levers(r: Results): Levers {
  const m = r.metrics;
  const take = m.intents.takeRateBps / 10_000;
  const costPerDay = m.supply.issuanceUsd30 / 30;
  const revenuePerDay = m.intents.revenue30 / 30;
  const per100m = 100e6 * take;
  const perBp = m.breakeven.currentDailyVolume / 10_000;
  const coverage = m.intents.revenue30 / m.supply.issuanceUsd30;
  /** The value-weighted price the 30 days of new NEAR were minted at. */
  const price = m.supply.issuanceUsd30 / m.supply.issuanceNear30;
  return {
    revenueRunRateYear: round((m.intents.revenue30 * 365) / 30, 0),
    issuanceRunRateYear: round((m.supply.issuanceUsd30 * 365) / 30, 0),
    revenuePerMillion: round(1e6 * take, 2),
    per100mVolume: { revenuePerDay: round(per100m, 0), coveragePoints: round((per100m / costPerDay) * 100, 2) },
    perBasisPoint: { revenuePerDay: round(perBp, 0), coveragePoints: round((perBp / costPerDay) * 100, 2) },
    perDollarOfPrice: {
      costPerDay: round(m.supply.issuanceNear30 / 30, 0),
      coveragePoints: round((coverage * price) / (price + 1) * 100 - coverage * 100, 2),
    },
    halvedIssuance: { savedPerYear: round((m.supply.issuanceUsd30 * 365) / 30 / 2, 0), coveragePoints: round(coverage * 100, 2) },
    gapPerDay: round(costPerDay - revenuePerDay, 0),
    gapPerYear: round(((costPerDay - revenuePerDay) * 365), 0),
  };
}
