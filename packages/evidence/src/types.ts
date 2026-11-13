/** One day of NEAR L1 activity (NearBlocks daily stats, normalized). */
export interface L1Day {
  /** UTC date, YYYY-MM-DD. */
  d: string;
  /** Transactions that day. */
  txns: number;
  /** Accounts that signed or received a transaction that day. */
  active: number;
  /** Accounts created that day. */
  newAccounts: number;
  /** Gas fees paid that day, in NEAR (6 decimals). */
  feeNear: number;
  /** Gas fees paid that day, in USD (2 decimals). */
  feeUsd: number;
  /** Total NEAR supply at the end of the day, whole NEAR. */
  supply: number;
  /** NEAR price in USD that day (6 decimals). */
  price: number;
}

/** One day of NEAR Intents (DefiLlama, normalized). Fees and revenue start later than volume. */
export interface IntentsDay {
  d: string;
  /** Swap volume, USD. */
  volume: number;
  /** Gross fees charged on swaps, USD (protocol + front-end fees). */
  fees: number | null;
  /** Revenue NEAR keeps, USD: what is swept to its revenue wallets and buys NEAR back. */
  revenue: number | null;
}

/** NEAR protocol parameters read from an archival node at a fixed block. */
export interface ProtocolAt {
  block: number;
  protocolVersion: number;
  /** Maximum yearly inflation as a fraction [numerator, denominator]. */
  maxInflationRate: [number, number];
}

/** Facts read directly from NEAR mainnet at pinned block heights (archival RPC). */
export interface ChainFacts {
  /** The block every "now" fact below was read at. */
  block: number;
  /** Block timestamp, ISO UTC. */
  blockTime: string;
  /** Total supply from the block header, whole NEAR. */
  totalSupply: number;
  /** Protocol parameters before and after the 2025 inflation change. */
  protocolBefore: ProtocolAt;
  protocolNow: ProtocolAt;
  /** NEAR held by the Intents buyback wallet at `block`, whole NEAR. */
  buybackAccount: string;
  buybackBalance: number;
}

/** Everything the metrics are computed from. Its hash is what gets anchored on NEAR. */
export interface Snapshot {
  schema: "nearbreakeven/snapshot@1";
  /** Last full UTC day included. */
  asOf: string;
  l1: L1Day[];
  intents: IntentsDay[];
  chain: ChainFacts;
}

export interface Claim {
  id: "C1" | "C2" | "C3" | "C4";
  /** The claim in one plain sentence. */
  claim: string;
  /** The test, written so anyone can check it by hand. */
  test: string;
  /** The measured value the test uses. */
  value: number | null;
  /** How the value is displayed. */
  display: string;
  passes: boolean;
}

export type Verdict = "HOLDS" | "UNDER PRESSURE" | "BROKEN";

export interface MonthRow {
  /** YYYY-MM */
  m: string;
  /** True when the month is not complete in this snapshot. */
  partial: boolean;
  activeAvg: number;
  txnsAvg: number;
  gasFeesUsd: number;
  priceAvg: number;
  intentsVolume: number;
  intentsRevenue: number | null;
  issuanceNear: number;
  issuanceUsd: number;
  /** Intents revenue / value of new NEAR issued that month. Null before revenue data starts. */
  coverage: number | null;
}

export interface Metrics {
  l1: {
    activeAvg30: number;
    activePeakAvg30: number;
    activePeakEnd: string;
    activeChangePct: number;
    txnsAvg30: number;
    txnsPeakAvg30: number;
    txnsChangePct: number;
    gasFeesUsd30: number;
    gasFeesNear30: number;
    feePerActiveDayUsd: number;
    feePerActiveDayUsdAtPeak: number;
  };
  intents: {
    volume30: number;
    volumeYoyPct: number | null;
    fees30: number;
    revenue30: number;
    takeRateBps: number;
    volumeAllTime: number;
    revenueAllTime: number;
  };
  supply: {
    issuanceNear30: number;
    issuanceUsd30: number;
    annualizedRatePct: number;
    priceAvg30: number;
  };
  breakeven: {
    /** Intents revenue / L1 gas fees, both last 30 days. */
    revenueMultiple: number;
    coverage30: number;
    coverage90: number;
    coveragePrev90: number;
    /** coverage90 / coveragePrev90. */
    quarterlyGrowth: number;
    /** Quarters until coverage reaches 100% if the last quarter's growth repeats. Null if coverage is not growing. */
    quartersToBreakeven: number | null;
    /** Daily Intents volume at which revenue would pay for all new issuance, at today's take rate and price. */
    breakevenDailyVolume: number;
    currentDailyVolume: number;
    volumeMultipleNeeded: number;
  };
  decoupling: {
    /** Pearson correlation of month-on-month % change in active accounts vs price, last 12 complete months. */
    corrActivePrice12m: number;
    priceChangeFromLowPct: number;
    priceLow: number;
    priceLowDate: string;
  };
  chain: {
    inflationBeforePct: number;
    inflationNowPct: number;
    supplyHeaderVsNearBlocksPct: number;
    buybackBalance: number;
  };
}

export interface Results {
  schema: "nearbreakeven/results@1";
  asOf: string;
  snapshotSha256: string;
  metrics: Metrics;
  claims: Claim[];
  verdict: Verdict;
  months: MonthRow[];
}
