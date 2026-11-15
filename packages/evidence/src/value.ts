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

/**
 * HSP-029, approved by House of Stake on 2 Nov 2026 (99.9% of voting veNEAR):
 * NEAR's maximum yearly issuance moves from 2.5% to 1.6% over 24 months,
 * after a 14-day Security Council veto window and a 90-day grace period.
 * It is not in the protocol yet, so it is a scenario on the anchored run, not
 * a measurement: at the run's revenue and price, what does the lower issuance
 * do to coverage and to the volume needed for breakeven?
 * Source: https://cointelegraph.com/news/near-sinks-7-proposal-cut-annual-token-issuance-passes
 */
export const HSP_029 = {
  id: "HSP-029",
  approvedOn: "2026-11-02",
  fromPct: 2.5,
  toPct: 1.6,
  rampMonths: 24,
  /** Veto window plus grace period before the first reduction. */
  delayDays: 14 + 90,
} as const;

export interface IssuanceCutScenario {
  /** Issuance after the ramp, as a share of today's (1.6 / today's rate). */
  issuanceFactor: number;
  coverageNowPct: number;
  coverageAfterPct: number;
  volumeMultipleNow: number;
  volumeMultipleAfter: number;
  /** Earliest date the reduction can start, and when the ramp ends. */
  startsFrom: string;
  fullBy: string;
}

const addDaysIso = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export function issuanceCutScenario(r: Results): IssuanceCutScenario {
  const m = r.metrics;
  // Today's protocol cap, read from the chain at the run's block; the cut is applied to issuance in proportion.
  const nowPct = m.chain.inflationNowPct;
  const factor = HSP_029.toPct / nowPct;
  const startsFrom = addDaysIso(HSP_029.approvedOn, HSP_029.delayDays);
  const fullBy = addDaysIso(startsFrom, Math.round(HSP_029.rampMonths * 30.44));
  return {
    issuanceFactor: round(factor, 3),
    coverageNowPct: round(m.breakeven.coverage30 * 100, 2),
    coverageAfterPct: round((m.breakeven.coverage30 / factor) * 100, 2),
    volumeMultipleNow: m.breakeven.volumeMultipleNeeded,
    volumeMultipleAfter: round(m.breakeven.volumeMultipleNeeded * factor, 2),
    startsFrom,
    fullBy,
  };
}
