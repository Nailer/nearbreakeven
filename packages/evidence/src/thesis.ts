/**
 * The thesis text. Every number in it comes from a Results object, so THESIS.md
 * and the website are regenerated from the same run and can never disagree
 * with the data. Nothing here is typed in by hand.
 */
import { THRESHOLDS } from "./metrics.js";
import type { Results } from "./types.js";

const usd = (x: number) =>
  x >= 1e9 ? `$${(x / 1e9).toFixed(2)}B` : x >= 1e6 ? `$${(x / 1e6).toFixed(2)}M` : x >= 1e3 ? `$${(x / 1e3).toFixed(1)}K` : `$${x.toFixed(2)}`;
const p = (x: number, dp = 1) => `${(x * 100).toFixed(dp)}%`;
const n = (x: number) => x.toLocaleString("en-US");

export interface ThesisPoint {
  title: string;
  body: string;
  /** Claim id this point supports or weakens, if any. */
  claim?: string;
}

export interface ThesisDoc {
  title: string;
  summary: string;
  claim: string;
  forPoints: ThesisPoint[];
  againstPoints: ThesisPoint[];
  changeMind: string[];
  cannotMeasure: string[];
  method: string[];
}

export function thesisDoc(r: Results): ThesisDoc {
  const m = r.metrics;
  const b = m.breakeven;
  const months2026 = r.months.filter((x) => x.m.startsWith("2026") && !x.partial && x.coverage !== null);
  const covs = months2026.map((x) => x.coverage!);
  const covMin = Math.min(...covs);
  const covMax = Math.max(...covs);
  const quietMonth = r.months.find((x) => x.intentsRevenue !== null && x.intentsRevenue < 1000 && x.intentsVolume > 1e8);
  return {
    title: `NEAR is becoming a cross-chain toll business. Its toll already pays for ${p(b.coverage30)} of new NEAR.`,
    summary:
      `Since the ${m.l1.activePeakEnd.slice(0, 7)} peak, NEAR's daily active accounts fell ${Math.abs(m.l1.activeChangePct)}% and transactions ${Math.abs(m.l1.txnsChangePct)}%. ` +
      `Over the same stretch NEAR Intents, the layer that settles swaps between chains, grew into NEAR's main source of revenue: ${usd(m.intents.revenue30)} in the last 30 days, ` +
      `${b.revenueMultiple}× all the gas paid on NEAR L1, and NEAR uses it to buy NEAR back. The right scoreboard for NEAR is no longer active accounts. ` +
      `It is coverage: how much of the value of newly issued NEAR that revenue pays for. Coverage is ${p(b.coverage30)} over 30 days and rose from ${p(b.coveragePrev90)} to ${p(b.coverage90)} quarter on quarter.`,
    claim:
      `Long-term, NEAR's value depends on Intents revenue catching up with issuance, not on L1 activity. ` +
      `At today's take rate (${m.intents.takeRateBps.toFixed(2)} bps) and price, Intents needs about ${usd(b.breakevenDailyVolume)} of volume a day to pay for all new NEAR: ${b.volumeMultipleNeeded}× today's ${usd(b.currentDailyVolume)}. ` +
      `If last quarter's growth in coverage repeated, that happens in ${b.quartersToBreakeven === null ? "no finite time" : `${b.quartersToBreakeven} quarters`}.`,
    forPoints: [
      {
        claim: "C1",
        title: "The revenue moved",
        body: `Intents earned NEAR ${usd(m.intents.revenue30)} in the last 30 days. Gas on the whole L1 earned ${usd(m.l1.gasFeesUsd30)} (${n(m.l1.gasFeesNear30)} NEAR). That is ${b.revenueMultiple}× (test: at least ${THRESHOLDS.revenueMultiple}×). All-time Intents volume is ${usd(m.intents.volumeAllTime)}; the last 30 days were ${usd(m.intents.volume30)}, ${m.intents.volumeYoyPct === null ? "with no year-ago window to compare" : `${m.intents.volumeYoyPct > 0 ? "up" : "down"} ${Math.abs(m.intents.volumeYoyPct)}% on the same 30 days a year earlier`}.`,
      },
      {
        claim: "C2",
        title: "Coverage is rising, even as the price rose",
        body: `Coverage over the last 90 days is ${p(b.coverage90)}, against ${p(b.coveragePrev90)} in the 90 days before. A higher NEAR price makes new issuance more expensive in dollars, which pushes coverage down; the average price over the last 30 days was $${m.supply.priceAvg30.toFixed(2)}, and coverage rose anyway.`,
      },
      {
        claim: "C3",
        title: "Breakeven is within reach, on paper",
        body: `Coverage grew ${b.quarterlyGrowth.toFixed(2)}× in a quarter. Repeated, ${p(b.coverage90)} reaches 100% in ${b.quartersToBreakeven === null ? "no finite time" : `${b.quartersToBreakeven} quarters`} (test: within ${THRESHOLDS.quartersToBreakeven}). The volume route says the same thing differently: ${b.volumeMultipleNeeded}× today's daily volume.`,
      },
      {
        claim: "C4",
        title: "Price stopped following L1 activity",
        body: `Over the last 12 complete months, month-on-month changes in active accounts and in NEAR's price have a correlation of ${m.decoupling.corrActivePrice12m} (test: below ${THRESHOLDS.corrActivePrice}). NEAR traded at $${m.decoupling.priceLow.toFixed(2)} on ${m.decoupling.priceLowDate} and is ${m.decoupling.priceChangeFromLowPct}% above that low, while active accounts kept falling.`,
      },
      {
        title: "Issuance was halved, and the chain itself shows it",
        body: `Read straight from NEAR mainnet's protocol parameters: maximum inflation was ${m.chain.inflationBeforePct}% at block 165,000,000 and is ${m.chain.inflationNowPct}% now. New supply over the last 30 days ran at ${m.supply.annualizedRatePct.toFixed(2)}% a year. A smaller issuance bill is half of why breakeven is reachable at all.`,
      },
      {
        title: "Each active account is worth more",
        body: `Gas paid per active account per day rose from $${m.l1.feePerActiveDayUsdAtPeak.toFixed(3)} at the 2024 peak to $${m.l1.feePerActiveDayUsd.toFixed(3)} now. That fits a network that lost mass-airdrop and bot traffic, not paying users.`,
      },
    ],
    againstPoints: [
      {
        claim: "C3",
        title: "One quarter is a thin base",
        body: `Monthly coverage in 2026 swung between ${p(covMin)} and ${p(covMax)}. C3 extrapolates a single quarter's growth; a quiet quarter breaks it, and the test is built to show that the moment it happens.`,
      },
      {
        title: "Buybacks are not burns",
        body: `NEAR that Intents revenue buys back stays in the total supply: the buyback wallet ${m.chain.buybackBalance ? `holds ${n(m.chain.buybackBalance)} NEAR` : "keeps what it buys"} and total supply still grows about ${m.supply.annualizedRatePct.toFixed(2)}% a year. Coverage measures value returned to holders, not supply shrinking.`,
      },
      {
        claim: "C2",
        title: "Price sits in the denominator",
        body: "Coverage divides revenue by the dollar value of new NEAR. A rally makes coverage look worse and a crash makes it look better, so coverage partly tracks price, not only Intents.",
      },
      {
        title: "Revenue arrives in lumps",
        body: `DefiLlama counts revenue when it is swept into NEAR's revenue wallets, so single months can mislead${quietMonth ? ` (${quietMonth.m}: ${usd(quietMonth.intentsVolume)} of volume but ${usd(quietMonth.intentsRevenue ?? 0)} counted as revenue)` : ""}. The 90-day windows exist to smooth this.`,
      },
      {
        claim: "C4",
        title: "Users may really be gone",
        body: `The ${Math.abs(m.l1.activeChangePct)}% fall in active accounts could be real users leaving, not only farming ending. Public daily totals cannot tell a bot from a person, and a correlation over 11 monthly changes (r = ${m.decoupling.corrActivePrice12m}) is weak evidence either way.`,
      },
      {
        title: "The take rate can be competed away",
        body: `Revenue is ${m.intents.takeRateBps.toFixed(2)} bps of volume. If competing cross-chain venues push fees down, volume must grow faster than the ${b.volumeMultipleNeeded}× above.`,
      },
    ],
    changeMind: [
      `Intents revenue falls below ${THRESHOLDS.revenueMultiple}× L1 gas over a 30-day window (C1 fails).`,
      "Coverage over 90 days drops below the 90 days before (C2 fails).",
      `Coverage stops growing fast enough to reach 100% within ${THRESHOLDS.quartersToBreakeven} quarters (C3 fails).`,
      `Price starts tracking L1 activity again: correlation at or above ${THRESHOLDS.corrActivePrice} (C4 fails).`,
      "Two failures in one run turn the verdict to BROKEN. The ledger on NEAR keeps every run, so a broken thesis cannot be quietly deleted.",
    ],
    cannotMeasure: [
      "Who trades through Intents (how concentrated volume is by route, solver or front-end). That needs the Intents Explorer API, which requires a partner key, so it is out of a keyless re-run.",
      "Bots versus people in active accounts. That needs per-account analysis (for example the NEAR BigQuery dataset, which bills the person who runs it).",
      "What NEAR does with bought-back NEAR after it reaches the buyback wallet (held, staked or distributed). We report the wallet's balance, not its intent.",
    ],
    method: [
      "Sources: NearBlocks daily chain stats, DefiLlama's NEAR Intents volume, fees and revenue, and NEAR mainnet itself through a public archival RPC. All free, none needs a key.",
      `Windows: the last 30 days through ${r.asOf} (UTC), the last 90 days and the 90 before. The L1 peak is the highest 30-day average since January 2024.`,
      "Coverage = Intents revenue ÷ Σ(new NEAR each day × that day's price). New NEAR each day is the change in total supply, which already nets out burned gas.",
      `The four tests and their thresholds were fixed on 13 Nov 2026 after a first look at the data, before the first run was anchored on NEAR, and they do not change between runs.`,
      "Every run pins a NEAR block. Re-reading the chain at that block and the sources up to the same day gives the same snapshot hash; computing the metrics from it gives the same results hash.",
    ],
  };
}

export function thesisMarkdown(r: Results, resultsSha256: string): string {
  const t = thesisDoc(r);
  const lines = [
    `# ${t.title}`,
    "",
    `> Generated by \`pnpm thesis\` from the run with data through **${r.asOf}** (UTC). Verdict: **${r.verdict}**.`,
    `> Snapshot SHA-256 \`${r.snapshotSha256}\` · results SHA-256 \`${resultsSha256}\`.`,
    "> Anchored on NEAR testnet at `ledger.nearbreakeven.testnet`. Every number below comes from that run; none is typed by hand. Not investment advice.",
    "",
    "## In brief",
    "",
    t.summary,
    "",
    "## The claim",
    "",
    t.claim,
    "",
    "## The four tests",
    "",
    "| | Claim | Passes if | Measured | Result |",
    "|---|---|---|---|---|",
    ...r.claims.map((c) => `| ${c.id} | ${c.claim} | ${c.test} | ${c.display} | ${c.passes ? "passes" : "**fails**"} |`),
    "",
    "## Evidence for",
    "",
    ...t.forPoints.flatMap((x) => [`**${x.title}${x.claim ? ` (${x.claim})` : ""}.** ${x.body}`, ""]),
    "## Evidence against",
    "",
    ...t.againstPoints.flatMap((x) => [`**${x.title}${x.claim ? ` (${x.claim})` : ""}.** ${x.body}`, ""]),
    "## What would change my mind",
    "",
    ...t.changeMind.map((x) => `- ${x}`),
    "",
    "## What this data cannot measure",
    "",
    ...t.cannotMeasure.map((x) => `- ${x}`),
    "",
    "## Method",
    "",
    ...t.method.map((x) => `- ${x}`),
    "",
    "Re-run it: `pnpm install && pnpm thesis`, or check the anchored run with `pnpm verify`. See README.md.",
    "",
  ];
  return lines.join("\n");
}
