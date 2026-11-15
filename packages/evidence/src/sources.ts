/**
 * The public sources, and how each raw response becomes normalized rows.
 * Every source is free and needs no key or account, so anyone can re-run this.
 */
import type { ChainFacts, IntentsDay, L1Day, ProtocolAt, Snapshot } from "./types.js";
import { canonical, hashOf } from "./canonical.js";

export const SOURCES = {
  /** NearBlocks API v1 daily stats: every L1 row of a snapshot@1 run. Switched off on NEARBLOCKS_V1_OFF. */
  nearblocksDaily: "https://api.nearblocks.io/v1/charts",
  /** NearBlocks API v3: `/txn-stats`, `/address-stats`, `/block-stats` and `/price-stats` replace `/v1/charts`. */
  nearblocksV3: "https://api.nearblocks.io/v3",
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
/** The day NearBlocks switches API v1 off (https://api.nearblocks.io/api-docs/migration). */
export const NEARBLOCKS_V1_OFF = "2026-11-22";

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

/** The four NearBlocks API v3 daily endpoints that together replace `/v1/charts`. */
export const V3_ENDPOINTS = ["txn-stats", "address-stats", "block-stats", "price-stats"] as const;
export type V3Endpoint = (typeof V3_ENDPOINTS)[number];

/** A NEAR amount written as a decimal string ("1099.7401706679603245") → NEAR with 6 decimals, cut exactly like yoctoToNear6. */
export function nearToNear6(s: string): number {
  const m = /^(\d+)(?:\.(\d*))?$/.exec(String(s).trim());
  if (!m) throw new Error(`NearBlocks v3: not a NEAR amount: ${s}`);
  return Number(BigInt(m[1]!) * 1_000_000n + BigInt((m[2] ?? "").padEnd(6, "0").slice(0, 6))) / 1e6;
}

function v3Rows(raw: unknown, endpoint: V3Endpoint): Map<string, Record<string, unknown>> {
  const rows = (raw as { data?: unknown } | null)?.data;
  if (!Array.isArray(rows)) throw new Error(`NearBlocks v3 ${endpoint}: unexpected response (no data array)`);
  return new Map(rows.map((r: Record<string, unknown>) => [String(r.date).slice(0, 10), r]));
}

function count(v: unknown, what: string): number {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`NearBlocks v3: ${what} is not a count (${String(v)})`);
  return n;
}

/**
 * NearBlocks API v3 daily stats → L1 rows for every day after `after` through `through`, joined by date.
 * Transactions, supply and price are the same numbers v1 gave. `active` is `active_accounts − meta_accounts`
 * (see L1Day), and fees in USD are fee × that day's price, because v3 has no `txn_fee_usd`.
 * A day missing from any endpoint stops the run: we never fill a gap.
 */
export function normalizeNearblocksV3(raw: Record<V3Endpoint, unknown>, after: string, through: string): L1Day[] {
  const txns = v3Rows(raw["txn-stats"], "txn-stats");
  const addresses = v3Rows(raw["address-stats"], "address-stats");
  const blocks = v3Rows(raw["block-stats"], "block-stats");
  const prices = v3Rows(raw["price-stats"], "price-stats");
  const out: L1Day[] = [];
  for (let d = addDays(after, 1); d <= through; d = addDays(d, 1)) {
    const t = txns.get(d);
    const a = addresses.get(d);
    const b = blocks.get(d);
    const p = prices.get(d);
    if (!t || !a || !b || !p) {
      const missing = V3_ENDPOINTS.filter((_, i) => ![t, a, b, p][i]);
      throw new Error(`NearBlocks v3 has no ${missing.join(", ")} row for ${d} yet; try an earlier asOf`);
    }
    const feeNear = nearToNear6(String(t.txn_fee));
    const price = round(Number(p.near_price), 6);
    if (!(price > 0)) throw new Error(`NearBlocks v3: no NEAR price for ${d}`);
    out.push({
      d,
      txns: count(t.txns, `txns on ${d}`),
      active: count(a.active_accounts, `active_accounts on ${d}`) - count(a.meta_accounts, `meta_accounts on ${d}`),
      feeNear,
      feeUsd: round(feeNear * price, 2),
      supply: yoctoToNear(String(b.total_supply)),
      price,
    });
  }
  return out;
}

/** Whole days from `a` to `b`. */
export const dayDiff = (a: string, b: string): number => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000;

/** The most rows one v3 stats call returns. */
export const V3_MAX_LIMIT = 365;

/**
 * The v3 query strings that cover every day after `after` through `through`, asked on `today` (UTC).
 * A stats call returns the newest `limit` days, so one call per endpoint covers any range that starts within
 * the last year; older days are asked for one `date` at a time. Every 25 rows of `limit` costs one credit of the
 * keyless rate limit, so a daily run spends four credits.
 */
export function v3Queries(after: string, through: string, today: string): string[] {
  const limit = dayDiff(after, today) + 1;
  if (limit <= V3_MAX_LIMIT) return [`limit=${limit}`];
  const out: string[] = [];
  for (let d = addDays(after, 1); d <= through; d = addDays(d, 1)) out.push(`date=${d}`);
  return out;
}

/** NearBlocks API v3 daily stats for every day after `after` through `through`, normalized. Four calls a day's run. */
export async function fetchNearblocksV3(fetcher: Fetcher, after: string, through: string, today: string): Promise<L1Day[]> {
  const raw = {} as Record<V3Endpoint, { data: unknown[] }>;
  for (const e of V3_ENDPOINTS) {
    const data: unknown[] = [];
    for (const q of v3Queries(after, through, today)) {
      const body = await getJsonPatient(fetcher, `${SOURCES.nearblocksV3}/${e}?${q}`);
      if (!Array.isArray(body?.data)) throw new Error(`NearBlocks v3 ${e}: unexpected response (no data array)`);
      data.push(...body.data);
    }
    raw[e] = { data };
  }
  return normalizeNearblocksV3(raw, after, through);
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

class HttpError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
  ) {
    super(`${url} answered HTTP ${status}`);
  }
}

/** A source that answers 404 or 410 is gone; asking again will not help. */
const gone = (e: unknown) => e instanceof HttpError && (e.status === 404 || e.status === 410);

async function getJson(fetcher: Fetcher, url: string, init?: RequestInit, tries = 3): Promise<any> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetcher(url, init);
      if (!res.ok) throw new HttpError(url, res.status);
      return await res.json();
    } catch (e) {
      last = e;
      if (gone(e)) break;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

/** Thrown when NearBlocks API v1 no longer answers: snapshot@1 runs can't re-fetch their L1 rows after NEARBLOCKS_V1_OFF. */
export class NearblocksV1Gone extends Error {}

/**
 * Like getJson, but waits out NearBlocks' keyless rate limit: on HTTP 429 it waits for Retry-After (or 20 s, then
 * 40 s, then 60 s) before asking again.
 */
async function getJsonPatient(fetcher: Fetcher, url: string, tries = 4): Promise<any> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    let wait = 800 * (i + 1);
    try {
      const res = await fetcher(url);
      if (res.ok) return await res.json();
      last = new HttpError(url, res.status);
      if (res.status === 429) wait = (Number(res.headers?.get("retry-after")) || 20 * (i + 1)) * 1000;
    } catch (e) {
      last = e;
    }
    if (gone(last) || i === tries - 1) break;
    await new Promise((r) => setTimeout(r, wait));
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
  /**
   * The anchored snapshot to build on. Its L1 rows are kept exactly as they are (without `newAccounts`) and only
   * the days after its `asOf` are fetched, from NearBlocks API v3; the result is a snapshot@2 that names its base
   * by hash. Without a base every L1 row comes from NearBlocks API v1, which answers until NEARBLOCKS_V1_OFF.
   */
  base?: Snapshot;
  fetcher?: Fetcher;
  onProgress?: (step: string) => void;
  /** Today's UTC date (YYYY-MM-DD), which decides the v3 requests. Defaults to the clock. */
  today?: string;
}

/** A row as a snapshot@2 keeps it: NearBlocks API v3 has no new-accounts count. */
const v2Row = (r: L1Day): L1Day => ({ d: r.d, txns: r.txns, active: r.active, feeNear: r.feeNear, feeUsd: r.feeUsd, supply: r.supply, price: r.price });

async function fetchIntents(fetcher: Fetcher, asOf: string): Promise<IntentsDay[]> {
  const [vol, fees, rev] = await Promise.all([
    getJson(fetcher, SOURCES.intentsVolume),
    getJson(fetcher, SOURCES.intentsFees),
    getJson(fetcher, SOURCES.intentsRevenue),
  ]);
  const intents = normalizeIntents(vol, fees, rev, asOf);
  if (intents.at(-1)?.d !== asOf) throw new Error(`DefiLlama has no NEAR Intents row for ${asOf} yet; try an earlier asOf`);
  return intents;
}

/** Fetches every source and returns a normalized snapshot. */
export async function fetchSnapshot(opts: FetchOptions = {}): Promise<Snapshot> {
  const fetcher: Fetcher = opts.fetcher ?? ((u, i) => globalThis.fetch(u, i));
  const asOf = opts.asOf ?? settledDay();
  const say = opts.onProgress ?? (() => {});
  const { base } = opts;
  let l1: L1Day[];
  if (base) {
    if (base.asOf >= asOf) throw new Error(`the base snapshot ends on ${base.asOf}; a run built on it must end after that day, not on ${asOf}`);
    if (base.l1.at(-1)?.d !== base.asOf) throw new Error(`the base snapshot's L1 rows do not end on its asOf (${base.asOf})`);
    say(`NearBlocks API v3 daily stats after ${base.asOf} (earlier days from the ${base.asOf} snapshot)`);
    const fresh = await fetchNearblocksV3(fetcher, base.asOf, asOf, opts.today ?? new Date().toISOString().slice(0, 10));
    l1 = [...base.l1.map(v2Row), ...fresh];
  } else {
    say("NearBlocks API v1 daily stats");
    const nb = await getJson(fetcher, SOURCES.nearblocksDaily).catch((e) => {
      throw gone(e) ? new NearblocksV1Gone(`NearBlocks API v1 no longer answers (switched off on ${NEARBLOCKS_V1_OFF})`) : e;
    });
    l1 = normalizeNearblocks(nb, asOf);
    if (l1.at(-1)?.d !== asOf) throw new Error(`NearBlocks has no row for ${asOf} yet; try an earlier asOf`);
  }
  say("DefiLlama: NEAR Intents volume, fees, revenue");
  const intents = await fetchIntents(fetcher, asOf);
  say("NEAR archival RPC: supply, protocol inflation, buyback wallet");
  const chain = await fetchChainFacts(fetcher, opts.pinnedBlock);
  if (base) return { schema: "nearbreakeven/snapshot@2", asOf, l1Base: { asOf: base.asOf, sha256: await hashOf(base) }, l1, intents, chain };
  return { schema: "nearbreakeven/snapshot@1", asOf, l1, intents, chain };
}

export interface RefetchOptions {
  /** Reads the pinned snapshot of an earlier run (data/snapshots/<asOf>/snapshot.json). */
  loadBase: (asOf: string) => Promise<Snapshot>;
  fetcher?: Fetcher;
  onProgress?: (step: string) => void;
}

/**
 * Asks the live sources again for a pinned snapshot's day and block, building it the way it was built, for the
 * data check (`pnpm verify`, `pnpm drift`, the browser re-run). A snapshot@2 is rebuilt on its own base, whose
 * hash must still match. A snapshot@1 is rebuilt from NearBlocks API v1; once v1 is switched off its L1 rows are
 * taken from the pinned file instead, DefiLlama and the chain are still asked, and `notes` says so.
 */
export async function refetchLike(pinned: Snapshot, opts: RefetchOptions): Promise<{ fresh: Snapshot; notes: string[] }> {
  const same = { asOf: pinned.asOf, pinnedBlock: pinned.chain.block, fetcher: opts.fetcher, onProgress: opts.onProgress };
  if (pinned.schema === "nearbreakeven/snapshot@2") {
    const base = await opts.loadBase(pinned.l1Base.asOf);
    const sha = await hashOf(base);
    if (sha !== pinned.l1Base.sha256) throw new Error(`the ${pinned.l1Base.asOf} snapshot hashes to ${sha}, not to this run's base ${pinned.l1Base.sha256}`);
    return { fresh: await fetchSnapshot({ ...same, base }), notes: [] };
  }
  try {
    return { fresh: await fetchSnapshot(same), notes: [] };
  } catch (e) {
    if (!(e instanceof NearblocksV1Gone)) throw e;
    const fetcher: Fetcher = opts.fetcher ?? ((u, i) => globalThis.fetch(u, i));
    const say = opts.onProgress ?? (() => {});
    say("DefiLlama: NEAR Intents volume, fees, revenue");
    const intents = await fetchIntents(fetcher, pinned.asOf);
    say("NEAR archival RPC: supply, protocol inflation, buyback wallet");
    const chain = await fetchChainFacts(fetcher, pinned.chain.block);
    return {
      fresh: { ...pinned, intents, chain },
      notes: [`NearBlocks switched API v1 off on ${NEARBLOCKS_V1_OFF}, so this run's NearBlocks rows were not asked again; DefiLlama and the chain were.`],
    };
  }
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
