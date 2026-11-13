/**
 * The public sources, and how each raw response becomes normalized rows.
 * Every source is free and needs no key or account, so anyone can re-run this.
 */
import type { ChainFacts, IntentsDay, L1Day, ProtocolAt, Snapshot } from "./types.js";
import { canonical } from "./canonical.js";

export const SOURCES = {
  nearblocksDaily: "https://api.nearblocks.io/v1/charts",
  intentsVolume: "https://api.llama.fi/summary/dexs/near-intents?dataType=dailyVolume",
  intentsFees: "https://api.llama.fi/summary/fees/near-intents?dataType=dailyFees",
  intentsRevenue: "https://api.llama.fi/summary/fees/near-intents?dataType=dailyRevenue",
  archivalRpc: "https://archival-rpc.mainnet.fastnear.com",
} as const;

/** Where each source is documented, for the README and the dashboard. */
export const SOURCE_DOCS = {
  nearblocksDaily: "https://api.nearblocks.io/api-docs",
  defillama: "https://defillama.com/protocol/near-intents",
  archivalRpc: "https://docs.near.org/api/rpc/providers",
} as const;

/** First L1 day kept: covers the 2024 activity peak. */
export const L1_START = "2024-01-01";
/** A block from before the 2025 inflation change (protocol 79). */
export const BLOCK_BEFORE_INFLATION_CUT = 165_000_000;
export const BUYBACK_ACCOUNT = "buybacks.multisignature.near";

const YOCTO = 10n ** 24n;

export const round = (x: number, dp: number): number => {
  const f = 10 ** dp;
  const v = Math.round(x * f) / f;
  return Object.is(v, -0) ? 0 : v;
};

/** "123456789.000" (yocto, may carry a decimal tail) → bigint of the integer part. */
function yoctoInt(s: string): bigint {
  const int = String(s).split(".")[0] ?? "0";
  return BigInt(int === "" ? "0" : int);
}

/** Whole NEAR from a yocto string. */
export const yoctoToNear = (s: string): number => Number(yoctoInt(s) / YOCTO);

/** NEAR with 6 decimals from a yocto string, exact (integer arithmetic). */
export const yoctoToNear6 = (s: string): number => Number(yoctoInt(s) / 10n ** 18n) / 1e6;

export function addDays(d: string, n: number): string {
  const t = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** NearBlocks /v1/charts → L1 rows from L1_START through asOf. */
export function normalizeNearblocks(raw: any, asOf: string): L1Day[] {
  const rows: any[] = raw?.charts;
  if (!Array.isArray(rows)) throw new Error("NearBlocks: unexpected response (no charts array)");
  const out: L1Day[] = [];
  for (const r of rows) {
    const d = String(r.date).slice(0, 10);
    if (d < L1_START || d > asOf) continue;
    out.push({
      d,
      txns: Number(r.txns),
      active: Number(r.active_accounts),
      newAccounts: Number(r.new_accounts),
      feeNear: yoctoToNear6(r.txn_fee),
      feeUsd: round(Number(r.txn_fee_usd), 2),
      supply: yoctoToNear(r.total_supply),
      price: round(Number(r.near_price), 6),
    });
  }
  out.sort((a, b) => (a.d < b.d ? -1 : 1));
  return out;
}

function llamaDaily(raw: any, label: string): Map<string, number> {
  const chart: [number, number][] = raw?.totalDataChart;
  if (!Array.isArray(chart)) throw new Error(`DefiLlama ${label}: unexpected response (no totalDataChart)`);
  const m = new Map<string, number>();
  for (const [ts, v] of chart) m.set(new Date(ts * 1000).toISOString().slice(0, 10), round(Number(v), 2));
  return m;
}

/** DefiLlama volume, fees and revenue → Intents rows through asOf, joined by date. */
export function normalizeIntents(volumeRaw: any, feesRaw: any, revenueRaw: any, asOf: string): IntentsDay[] {
  const vol = llamaDaily(volumeRaw, "volume");
  const fees = llamaDaily(feesRaw, "fees");
  const rev = llamaDaily(revenueRaw, "revenue");
  return [...vol.keys()]
    .filter((d) => d <= asOf)
    .sort()
    .map((d) => ({ d, volume: vol.get(d)!, fees: fees.get(d) ?? null, revenue: rev.get(d) ?? null }));
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

async function getJson(fetcher: Fetcher, url: string, init?: RequestInit, tries = 3): Promise<any> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetcher(url, init);
      if (!res.ok) throw new Error(`${url} answered HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

async function rpc(fetcher: Fetcher, method: string, params: unknown): Promise<any> {
  const body = await getJson(fetcher, SOURCES.archivalRpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "nearbreakeven", method, params }),
  });
  if (body.error) throw new Error(`RPC ${method}: ${JSON.stringify(body.error).slice(0, 200)}`);
  return body.result;
}

async function protocolAt(fetcher: Fetcher, block: number): Promise<ProtocolAt> {
  const r = await rpc(fetcher, "EXPERIMENTAL_protocol_config", { block_id: block });
  return { block, protocolVersion: r.protocol_version, maxInflationRate: r.max_inflation_rate };
}

/**
 * Reads the chain facts. With `pinnedBlock` it re-reads the exact same block
 * (archival), so a re-run gets identical values; without it, it pins the
 * latest final block.
 */
export async function fetchChainFacts(fetcher: Fetcher, pinnedBlock?: number): Promise<ChainFacts> {
  const blockRef = pinnedBlock ? { block_id: pinnedBlock } : { finality: "final" };
  const block = await rpc(fetcher, "block", blockRef);
  const height: number = block.header.height;
  const [before, now, acct] = await Promise.all([
    protocolAt(fetcher, BLOCK_BEFORE_INFLATION_CUT),
    protocolAt(fetcher, height),
    rpc(fetcher, "query", { request_type: "view_account", block_id: height, account_id: BUYBACK_ACCOUNT }),
  ]);
  return {
    block: height,
    blockTime: new Date(Number(BigInt(block.header.timestamp_nanosec) / 1_000_000n)).toISOString(),
    totalSupply: yoctoToNear(block.header.total_supply),
    protocolBefore: before,
    protocolNow: now,
    buybackAccount: BUYBACK_ACCOUNT,
    buybackBalance: yoctoToNear(acct.amount),
  };
}

/**
 * Days a source keeps revising after the fact. DefiLlama fills in a day's NEAR
 * Intents fees and revenue over the following days (on 13 Nov 2026 it raised
 * 12 Nov fees from $16.6K to $257.5K), so a run pins a day only once it has
 * settled. See `pnpm drift`.
 */
export const SETTLE_DAYS = 3;

/** The newest UTC day that has had SETTLE_DAYS to settle. */
export function settledDay(now = new Date()): string {
  return addDays(now.toISOString().slice(0, 10), -SETTLE_DAYS);
}

export interface FetchOptions {
  /** Last day to include. Defaults to the newest settled day (UTC), see SETTLE_DAYS. */
  asOf?: string;
  /** Re-read the chain at this block instead of the latest one. */
  pinnedBlock?: number;
  fetcher?: Fetcher;
  onProgress?: (step: string) => void;
}

/** Fetches every source and returns a normalized snapshot. */
export async function fetchSnapshot(opts: FetchOptions = {}): Promise<Snapshot> {
  const fetcher: Fetcher = opts.fetcher ?? ((u, i) => globalThis.fetch(u, i));
  const asOf = opts.asOf ?? settledDay();
  const say = opts.onProgress ?? (() => {});
  say("NearBlocks daily stats");
  const nb = await getJson(fetcher, SOURCES.nearblocksDaily);
  say("DefiLlama: NEAR Intents volume, fees, revenue");
  const [vol, fees, rev] = await Promise.all([
    getJson(fetcher, SOURCES.intentsVolume),
    getJson(fetcher, SOURCES.intentsFees),
    getJson(fetcher, SOURCES.intentsRevenue),
  ]);
  say("NEAR archival RPC: supply, protocol inflation, buyback wallet");
  const chain = await fetchChainFacts(fetcher, opts.pinnedBlock);
  const l1 = normalizeNearblocks(nb, asOf);
  const intents = normalizeIntents(vol, fees, rev, asOf);
  if (l1.at(-1)?.d !== asOf) throw new Error(`NearBlocks has no row for ${asOf} yet; try an earlier asOf`);
  if (intents.at(-1)?.d !== asOf) throw new Error(`DefiLlama has no NEAR Intents row for ${asOf} yet; try an earlier asOf`);
  return { schema: "nearbreakeven/snapshot@1", asOf, l1, intents, chain };
}

/** One value a source changed after a snapshot was pinned. */
export interface Drift {
  source: "NearBlocks" | "DefiLlama" | "NEAR RPC";
  day: string;
  field: string;
  before: string;
  after: string;
}

const show = (v: unknown): string => (v === undefined ? "(missing)" : v === null ? "null" : String(v));

function diffRows<T extends { d: string }>(source: Drift["source"], a: T[], b: T[], out: Drift[]): void {
  const byDay = new Map(b.map((r) => [r.d, r] as const));
  const seen = new Set<string>();
  for (const ra of a) {
    seen.add(ra.d);
    const rb = byDay.get(ra.d);
    if (!rb) {
      out.push({ source, day: ra.d, field: "row", before: "present", after: "(missing)" });
      continue;
    }
    for (const k of Object.keys(ra) as (keyof T)[]) {
      if (k === "d") continue;
      if (ra[k] !== rb[k]) out.push({ source, day: ra.d, field: String(k), before: show(ra[k]), after: show(rb[k]) });
    }
  }
  for (const rb of b) if (!seen.has(rb.d)) out.push({ source, day: rb.d, field: "row", before: "(missing)", after: "present" });
}

/**
 * Lists every value that differs between a pinned snapshot and a fresh fetch of
 * the same day and block. An empty list means the snapshot hashes will match.
 */
export function diffSnapshots(pinned: Snapshot, fresh: Snapshot): Drift[] {
  const out: Drift[] = [];
  diffRows("NearBlocks", pinned.l1, fresh.l1, out);
  diffRows("DefiLlama", pinned.intents, fresh.intents, out);
  const a = canonical(pinned.chain);
  const b = canonical(fresh.chain);
  if (a !== b) out.push({ source: "NEAR RPC", day: pinned.asOf, field: "chain facts", before: a, after: b });
  return out;
}
