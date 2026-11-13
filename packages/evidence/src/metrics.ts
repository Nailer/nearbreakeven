/**
 * Every number in the thesis, computed from a snapshot. Pure and
 * deterministic: no clock, no network, no randomness, only + - * / and sqrt,
 * then rounded, so any machine gets the same results and the same hash.
 */
import { hashOf } from "./canonical.js";
import { addDays, round } from "./sources.js";
import type { Claim, IntentsDay, L1Day, Metrics, MonthRow, Results, Snapshot, Verdict } from "./types.js";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const avg = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
const pct = (now: number, then: number) => (then === 0 ? 0 : (now / then - 1) * 100);

/** Rows with end-days < d <= end. */
function windowOf<T extends { d: string }>(rows: T[], end: string, days: number): T[] {
  const start = addDays(end, -days);
  return rows.filter((r) => r.d > start && r.d <= end);
}

function requireFull<T>(rows: T[], days: number, what: string): T[] {
  if (rows.length !== days) throw new Error(`${what}: expected ${days} days of data, found ${rows.length}`);
  return rows;
}

/** Value of newly issued NEAR over the window: each day's supply increase at that day's price. */
function issuance(l1: L1Day[], end: string, days: number) {
  const byDate = new Map(l1.map((r) => [r.d, r]));
  let near = 0;
  let usd = 0;
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(end, -i);
    const today = byDate.get(d);
    const prev = byDate.get(addDays(d, -1));
    if (!today || !prev) throw new Error(`supply: missing day ${!today ? d : addDays(d, -1)}`);
    const minted = today.supply - prev.supply;
    near += minted;
    usd += minted * today.price;
  }
  return { near, usd };
}

function revenueOf(rows: IntentsDay[], what: string): number {
  if (rows.some((r) => r.revenue === null)) throw new Error(`${what}: revenue data does not cover the window`);
  return sum(rows.map((r) => r.revenue!));
}

function pearson(xs: number[], ys: number[]): number {
  const mx = avg(xs);
  const my = avg(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return sxx === 0 || syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy);
}

/** Calendar-month rows from the first L1 month through asOf. */
export function monthly(s: Snapshot): MonthRow[] {
  const months = [...new Set(s.l1.map((r) => r.d.slice(0, 7)))].sort();
  const lastDayOfMonth = (m: string) => addDays(`${nextMonth(m)}-01`, -1);
  const intentsByMonth = new Map<string, IntentsDay[]>();
  for (const r of s.intents) intentsByMonth.set(r.d.slice(0, 7), [...(intentsByMonth.get(r.d.slice(0, 7)) ?? []), r]);
  const byDate = new Map(s.l1.map((r) => [r.d, r]));
  return months.map((m) => {
    const days = s.l1.filter((r) => r.d.startsWith(m));
    const it = intentsByMonth.get(m) ?? [];
    let issuanceNear = 0;
    let issuanceUsd = 0;
    for (const r of days) {
      const prev = byDate.get(addDays(r.d, -1));
      if (!prev) continue;
      issuanceNear += r.supply - prev.supply;
      issuanceUsd += (r.supply - prev.supply) * r.price;
    }
    const hasRevenue = it.length > 0 && it.every((r) => r.revenue !== null);
    const intentsRevenue = hasRevenue ? round(sum(it.map((r) => r.revenue!)), 0) : null;
    return {
      m,
      partial: lastDayOfMonth(m) > s.asOf,
      activeAvg: round(avg(days.map((r) => r.active)), 0),
      txnsAvg: round(avg(days.map((r) => r.txns)), 0),
      gasFeesUsd: round(sum(days.map((r) => r.feeUsd)), 0),
      priceAvg: round(avg(days.map((r) => r.price)), 4),
      intentsVolume: round(sum(it.map((r) => r.volume)), 0),
      intentsRevenue,
      issuanceNear: round(issuanceNear, 0),
      issuanceUsd: round(issuanceUsd, 0),
      coverage: intentsRevenue !== null && issuanceUsd > 0 ? round(intentsRevenue / issuanceUsd, 4) : null,
    };
  });
}

function nextMonth(m: string): string {
  const y = +m.slice(0, 4);
  const mo = +m.slice(5, 7);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
}

/** Thresholds were fixed on 13 Nov 2026, before the first anchored run, and never change between runs. */
export const THRESHOLDS = {
  revenueMultiple: 5,
  quartersToBreakeven: 8,
  corrActivePrice: 0.3,
} as const;

export function computeMetrics(s: Snapshot): Metrics {
  const end = s.asOf;
  const l1_30 = requireFull(windowOf(s.l1, end, 30), 30, "L1 last 30 days");
  const it30 = requireFull(windowOf(s.intents, end, 30), 30, "Intents last 30 days");
  const it90 = requireFull(windowOf(s.intents, end, 90), 90, "Intents last 90 days");
  const itPrev90 = requireFull(windowOf(s.intents, addDays(end, -90), 90), 90, "Intents previous 90 days");

  // Peak 30-day averages over the whole L1 series.
  let peakActive = { v: 0, end: s.l1[0]!.d };
  let peakTxns = 0;
  for (let i = 29; i < s.l1.length; i++) {
    const w = s.l1.slice(i - 29, i + 1);
    const a = avg(w.map((r) => r.active));
    const t = avg(w.map((r) => r.txns));
    if (a > peakActive.v) peakActive = { v: a, end: s.l1[i]!.d };
    if (t > peakTxns) peakTxns = t;
  }
  const peakWindow = windowOf(s.l1, peakActive.end, 30);

  const activeAvg30 = avg(l1_30.map((r) => r.active));
  const txnsAvg30 = avg(l1_30.map((r) => r.txns));
  const gasFeesUsd30 = sum(l1_30.map((r) => r.feeUsd));
  const gasFeesNear30 = sum(l1_30.map((r) => r.feeNear));
  const feePerActiveDayUsd = gasFeesUsd30 / sum(l1_30.map((r) => r.active));
  const feePerActiveDayUsdAtPeak = sum(peakWindow.map((r) => r.feeUsd)) / sum(peakWindow.map((r) => r.active));

  const volume30 = sum(it30.map((r) => r.volume));
  const fees30 = sum(it30.map((r) => r.fees ?? 0));
  const revenue30 = revenueOf(it30, "Intents last 30 days");
  const lastYear = windowOf(s.intents, addDays(end, -365), 30);
  const volumeYoyPct = lastYear.length === 30 ? pct(volume30, sum(lastYear.map((r) => r.volume))) : null;

  const iss30 = issuance(s.l1, end, 30);
  const iss90 = issuance(s.l1, end, 90);
  const issPrev90 = issuance(s.l1, addDays(end, -90), 90);
  const supplyStart = s.l1.find((r) => r.d === addDays(end, -30))!.supply;

  const coverage30 = revenue30 / iss30.usd;
  const coverage90 = revenueOf(it90, "Intents last 90 days") / iss90.usd;
  const coveragePrev90 = revenueOf(itPrev90, "Intents previous 90 days") / issPrev90.usd;
  const quarterlyGrowth = coverage90 / coveragePrev90;
  let quartersToBreakeven: number | null = null;
  if (coverage90 >= 1) quartersToBreakeven = 0;
  else if (quarterlyGrowth > 1) {
    let c = coverage90;
    for (let q = 1; q <= 40; q++) {
      c *= quarterlyGrowth;
      if (c >= 1) {
        quartersToBreakeven = q;
        break;
      }
    }
  }
  const takeRate = revenue30 / volume30;
  const currentDailyVolume = volume30 / 30;
  const breakevenDailyVolume = iss30.usd / 30 / takeRate;

  // Decoupling: last 12 complete months.
  const months = monthly(s).filter((m) => !m.partial);
  const last13 = months.slice(-13);
  const dActive: number[] = [];
  const dPrice: number[] = [];
  for (let i = 1; i < last13.length; i++) {
    dActive.push(pct(last13[i]!.activeAvg, last13[i - 1]!.activeAvg));
    dPrice.push(pct(last13[i]!.priceAvg, last13[i - 1]!.priceAvg));
  }
  const yearAgo = addDays(end, -365);
  let low = { p: Number.POSITIVE_INFINITY, d: end };
  for (const r of s.l1) if (r.d > yearAgo && r.price > 0 && r.price < low.p) low = { p: r.price, d: r.d };
  const priceNow = avg(l1_30.slice(-7).map((r) => r.price));

  const frac = ([n, d]: [number, number]) => (n / d) * 100;
  const nbSupplyAtEnd = s.l1.at(-1)!.supply;

  return {
    l1: {
      activeAvg30: round(activeAvg30, 0),
      activePeakAvg30: round(peakActive.v, 0),
      activePeakEnd: peakActive.end,
      activeChangePct: round(pct(activeAvg30, peakActive.v), 1),
      txnsAvg30: round(txnsAvg30, 0),
      txnsPeakAvg30: round(peakTxns, 0),
      txnsChangePct: round(pct(txnsAvg30, peakTxns), 1),
      gasFeesUsd30: round(gasFeesUsd30, 0),
      gasFeesNear30: round(gasFeesNear30, 2),
      feePerActiveDayUsd: round(feePerActiveDayUsd, 5),
      feePerActiveDayUsdAtPeak: round(feePerActiveDayUsdAtPeak, 5),
    },
    intents: {
      volume30: round(volume30, 0),
      volumeYoyPct: volumeYoyPct === null ? null : round(volumeYoyPct, 1),
      fees30: round(fees30, 0),
      revenue30: round(revenue30, 0),
      takeRateBps: round(takeRate * 10_000, 3),
      volumeAllTime: round(sum(s.intents.map((r) => r.volume)), 0),
      revenueAllTime: round(sum(s.intents.map((r) => r.revenue ?? 0)), 0),
    },
    supply: {
      issuanceNear30: round(iss30.near, 0),
      issuanceUsd30: round(iss30.usd, 0),
      annualizedRatePct: round((iss30.near / supplyStart) * (365 / 30) * 100, 3),
      priceAvg30: round(avg(l1_30.map((r) => r.price)), 4),
    },
    breakeven: {
      revenueMultiple: round(revenue30 / gasFeesUsd30, 2),
      coverage30: round(coverage30, 4),
      coverage90: round(coverage90, 4),
      coveragePrev90: round(coveragePrev90, 4),
      quarterlyGrowth: round(quarterlyGrowth, 4),
      quartersToBreakeven,
      breakevenDailyVolume: round(breakevenDailyVolume, 0),
      currentDailyVolume: round(currentDailyVolume, 0),
      volumeMultipleNeeded: round(breakevenDailyVolume / currentDailyVolume, 2),
    },
    decoupling: {
      corrActivePrice12m: round(pearson(dActive, dPrice), 3),
      priceChangeFromLowPct: round(pct(priceNow, low.p), 1),
      priceLow: low.p,
      priceLowDate: low.d,
    },
    chain: {
      inflationBeforePct: round(frac(s.chain.protocolBefore.maxInflationRate), 3),
      inflationNowPct: round(frac(s.chain.protocolNow.maxInflationRate), 3),
      supplyHeaderVsNearBlocksPct: round(pct(s.chain.totalSupply, nbSupplyAtEnd), 3),
      buybackBalance: s.chain.buybackBalance,
    },
  };
}

const usd = (x: number) =>
  x >= 1e9 ? `$${round(x / 1e9, 2)}B` : x >= 1e6 ? `$${round(x / 1e6, 2)}M` : x >= 1e3 ? `$${round(x / 1e3, 1)}K` : `$${round(x, 0)}`;
export const formatUsd = usd;

/** The four claims and the tests that can break them. */
export function evaluateClaims(m: Metrics): Claim[] {
  const b = m.breakeven;
  return [
    {
      id: "C1",
      claim: "NEAR's revenue engine has moved from L1 gas to NEAR Intents.",
      test: `Intents revenue over the last 30 days is at least ${THRESHOLDS.revenueMultiple}× the gas fees paid on NEAR L1 over the same days.`,
      value: b.revenueMultiple,
      display: `${b.revenueMultiple}× (${usd(m.intents.revenue30)} vs ${usd(m.l1.gasFeesUsd30)})`,
      passes: b.revenueMultiple >= THRESHOLDS.revenueMultiple,
    },
    {
      id: "C2",
      claim: "Intents revenue is covering a growing share of NEAR's new issuance.",
      test: "Coverage (Intents revenue ÷ USD value of newly issued NEAR) over the last 90 days is higher than over the 90 days before.",
      value: b.coverage90,
      display: `${round(b.coverage90 * 100, 1)}% vs ${round(b.coveragePrev90 * 100, 1)}%`,
      passes: b.coverage90 > b.coveragePrev90,
    },
    {
      id: "C3",
      claim: "At the current pace, Intents revenue pays for all new issuance within two years.",
      test: `If the last quarter's coverage growth repeats each quarter, coverage reaches 100% within ${THRESHOLDS.quartersToBreakeven} quarters.`,
      value: b.quartersToBreakeven,
      display: b.quartersToBreakeven === null ? "never at the current pace" : `${b.quartersToBreakeven} quarters`,
      passes: b.quartersToBreakeven !== null && b.quartersToBreakeven <= THRESHOLDS.quartersToBreakeven,
    },
    {
      id: "C4",
      claim: "NEAR's price no longer follows L1 activity, so daily active accounts are the wrong scoreboard.",
      test: `Correlation between month-on-month changes in active accounts and in price, over the last 12 complete months, is below ${THRESHOLDS.corrActivePrice}.`,
      value: m.decoupling.corrActivePrice12m,
      display: `r = ${m.decoupling.corrActivePrice12m}`,
      passes: m.decoupling.corrActivePrice12m < THRESHOLDS.corrActivePrice,
    },
  ];
}

export function verdictOf(claims: Claim[]): Verdict {
  const failed = claims.filter((c) => !c.passes).length;
  return failed === 0 ? "HOLDS" : failed === 1 ? "UNDER PRESSURE" : "BROKEN";
}

/** Snapshot → results, with the snapshot hash inside so the two stay linked. */
export async function computeResults(s: Snapshot): Promise<Results> {
  const metrics = computeMetrics(s);
  const claims = evaluateClaims(metrics);
  return {
    schema: "nearbreakeven/results@1",
    asOf: s.asOf,
    snapshotSha256: await hashOf(s),
    metrics,
    claims,
    verdict: verdictOf(claims),
    months: monthly(s),
  };
}
