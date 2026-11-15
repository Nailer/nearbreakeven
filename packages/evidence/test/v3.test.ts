import { describe, expect, it } from "vitest";
import { hashOf } from "../src/canonical.js";
import { computeResults } from "../src/metrics.js";
import {
  NEARBLOCKS_V1_OFF,
  SOURCES,
  diffSnapshots,
  fetchSnapshot,
  nearToNear6,
  normalizeNearblocksV3,
  refetchLike,
  v3Queries,
  yoctoToNear6,
} from "../src/sources.js";
import type { Snapshot, SnapshotV2 } from "../src/types.js";
import { fixture } from "./fixture.js";

/** Three real days from NearBlocks API v3 (fetched 15 Nov 2026), newest first as the API returns them. */
const real = {
  "txn-stats": {
    data: [
      { date: "2026-11-14", txn_fee: "1099.7401706679603245", txns: 894196 },
      { date: "2026-11-13", txn_fee: "1061.5193664463063139", txns: 1036324 },
      { date: "2026-11-12", txn_fee: "988.0718357402171916", txns: 891523 },
    ],
  },
  "address-stats": {
    data: [
      { date: "2026-11-14", active_accounts: 159100, meta_accounts: 81658 },
      { date: "2026-11-13", active_accounts: 196377, meta_accounts: 111415 },
      { date: "2026-11-12", active_accounts: 198167, meta_accounts: 112560 },
    ],
  },
  "block-stats": {
    data: [
      { date: "2026-11-14", total_supply: "1311726899546447774208916710047882" },
      { date: "2026-11-13", total_supply: "1311625144032720116407840772458244" },
      { date: "2026-11-12", total_supply: "1311549122982004139095931101595325" },
    ],
  },
  "price-stats": {
    data: [
      { date: "2026-11-14", near_price: "3.44622706" },
      { date: "2026-11-13", near_price: "3.41914019" },
      { date: "2026-11-12", near_price: "3.58539248" },
    ],
  },
};

/** What NearBlocks API v1 (/v1/charts) gave for the same days, already normalized the v1 way. */
const v1 = [
  { d: "2026-11-12", txns: 891523, active: 85370, feeNear: 988.071835, feeUsd: 3542.37, supply: 1311549122, price: 3.585392 },
  { d: "2026-11-13", txns: 1036324, active: 85595, feeNear: 1061.519366, feeUsd: 3627.71, supply: 1311625144, price: 3.41914 },
  { d: "2026-11-14", txns: 894196, active: 78197, feeNear: 1099.74017, feeUsd: 3787.4, supply: 1311726899, price: 3.446227 },
];

describe("NearBlocks API v3 units", () => {
  it("cuts a decimal NEAR amount to 6 decimals exactly like the v1 yocto path", () => {
    expect(nearToNear6("988.0718357402171916")).toBe(yoctoToNear6("988071835740217191600000000.00000000"));
    expect(nearToNear6("988.0718357402171916")).toBe(988.071835);
    expect(nearToNear6("5")).toBe(5);
    expect(nearToNear6("0.0000009")).toBe(0);
  });
  it("refuses what is not an amount", () => {
    expect(() => nearToNear6("-1")).toThrow(/not a NEAR amount/);
    expect(() => nearToNear6("1e3")).toThrow(/not a NEAR amount/);
  });
});

describe("NearBlocks API v3 normalization", () => {
  const rows = normalizeNearblocksV3(real, "2026-11-11", "2026-11-14");

  it("gives v1's transactions, supply, price and fees in NEAR on the same days", () => {
    expect(rows.map(({ d, txns, supply, price, feeNear }) => ({ d, txns, supply, price, feeNear }))).toEqual(
      v1.map(({ d, txns, supply, price, feeNear }) => ({ d, txns, supply, price, feeNear })),
    );
  });

  it("counts active accounts as active_accounts minus meta_accounts, within 1% of v1", () => {
    expect(rows.map((r) => r.active)).toEqual([198167 - 112560, 196377 - 111415, 159100 - 81658]);
    rows.forEach((r, i) => expect(Math.abs(r.active / v1[i]!.active - 1)).toBeLessThan(0.01));
  });

  it("prices fees as fee × that day's price, within 0.1% of v1's txn_fee_usd", () => {
    expect(rows.map((r) => r.feeUsd)).toEqual([3542.62, 3629.48, 3789.95]);
    rows.forEach((r, i) => expect(Math.abs(r.feeUsd / v1[i]!.feeUsd - 1)).toBeLessThan(0.001));
  });

  it("keeps only the days asked for, oldest first, with no new-accounts field", () => {
    const one = normalizeNearblocksV3(real, "2026-11-12", "2026-11-13");
    expect(one.map((r) => r.d)).toEqual(["2026-11-13"]);
    expect("newAccounts" in one[0]!).toBe(false);
  });

  it("stops on a day missing from any endpoint, naming it", () => {
    const gap = { ...real, "price-stats": { data: real["price-stats"].data.slice(1) } };
    expect(() => normalizeNearblocksV3(gap, "2026-11-11", "2026-11-14")).toThrow(/no price-stats row for 2026-11-14/);
    expect(() => normalizeNearblocksV3({ ...real, "block-stats": { error: "rate limited" } }, "2026-11-11", "2026-11-14")).toThrow(/no data array/);
  });
});

describe("v3 requests", () => {
  it("asks once per endpoint for the newest days when the range starts within a year", () => {
    expect(v3Queries("2026-11-15", "2026-11-16", "2026-11-19")).toEqual(["limit=5"]);
  });
  it("asks day by day for a range older than a year", () => {
    expect(v3Queries("2025-01-01", "2025-01-03", "2026-11-19")).toEqual(["date=2025-01-02", "date=2025-01-03"]);
  });
});

/**
 * A stand-in for every public source, serving the synthetic fixture's world: DefiLlama and the RPC agree with
 * the fixture, and NearBlocks v3 continues its L1 series for two more days.
 */
function world(opts: { v1Gone?: boolean } = {}) {
  const base = fixture();
  const urls: string[] = [];
  const ts = (d: string) => Date.parse(`${d}T00:00:00Z`) / 1000;
  const intents = [...base.intents, ...["2026-11-13", "2026-11-14"].map((d) => ({ d, volume: 1_000_000, fees: 300, revenue: 200 }))];
  const v3Day = (d: string, i: number) => ({
    "txn-stats": { date: d, txns: 1000, txn_fee: "5.0000009" },
    "address-stats": { date: d, active_accounts: 150, meta_accounts: 50 },
    "block-stats": { date: d, total_supply: `${1_000_400_000 + i * 1000}${"0".repeat(24)}` },
    "price-stats": { date: d, near_price: "2.00000000" },
  });
  // Newest first; 12 Nov is the base's own last day, which v3 must not replace.
  const v3 = [v3Day("2026-11-14", 2), v3Day("2026-11-13", 1), { ...v3Day("2026-11-12", 0), "txn-stats": { date: "2026-11-12", txns: 999_999, txn_fee: "1" } }];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const fetcher = async (url: string, init?: RequestInit): Promise<Response> => {
    urls.push(url);
    if (url === SOURCES.nearblocksDaily) return opts.v1Gone ? json({ message: "Gone" }, 410) : json({ message: "not in this world" }, 500);
    if (url.startsWith(SOURCES.nearblocksV3)) {
      const [path, query] = url.slice(SOURCES.nearblocksV3.length + 1).split("?") as [keyof ReturnType<typeof v3Day>, string];
      const date = /date=([\d-]+)/.exec(query)?.[1];
      return json({ data: v3.map((day) => day[path]).filter((r) => !date || r.date === date) });
    }
    if (url === SOURCES.intentsVolume) return json({ totalDataChart: intents.map((r) => [ts(r.d), r.volume]) });
    if (url === SOURCES.intentsFees) return json({ totalDataChart: intents.map((r) => [ts(r.d), r.fees]) });
    if (url === SOURCES.intentsRevenue) return json({ totalDataChart: intents.map((r) => [ts(r.d), r.revenue]) });
    if (url === SOURCES.archivalRpc) {
      const { method, params } = JSON.parse(String(init?.body));
      if (method === "block") return json({ result: { header: { height: 1, timestamp_nanosec: `${Date.parse("2026-11-13T00:00:00Z")}000000`, total_supply: `1000400000${"0".repeat(24)}` } } });
      if (method === "EXPERIMENTAL_protocol_config")
        return json({ result: params.block_id === 165_000_000 ? { protocol_version: 79, max_inflation_rate: [1, 20] } : { protocol_version: 81, max_inflation_rate: [1, 40] } });
      if (method === "query") return json({ result: { amount: `5${"0".repeat(24)}` } });
    }
    return json({ message: "unknown" }, 404);
  };
  return { base, fetcher, urls };
}

describe("a run built on the previous anchored snapshot", () => {
  it("keeps every earlier L1 row, adds the new days from v3 and names its base by hash", async () => {
    const { base, fetcher, urls } = world();
    const s = (await fetchSnapshot({ asOf: "2026-11-14", pinnedBlock: 1, base, fetcher, today: "2026-11-17" })) as SnapshotV2;
    expect(s.schema).toBe("nearbreakeven/snapshot@2");
    expect(s.l1Base).toEqual({ asOf: "2026-11-12", sha256: await hashOf(base) });
    expect(s.l1).toHaveLength(base.l1.length + 2);
    expect(s.l1.slice(0, base.l1.length)).toEqual(base.l1.map(({ newAccounts: _, ...r }) => r));
    expect(s.l1.slice(-2)).toEqual([
      { d: "2026-11-13", txns: 1000, active: 100, feeNear: 5, feeUsd: 10, supply: 1_000_401_000, price: 2 },
      { d: "2026-11-14", txns: 1000, active: 100, feeNear: 5, feeUsd: 10, supply: 1_000_402_000, price: 2 },
    ]);
    expect(s.l1.every((r) => !("newAccounts" in r))).toBe(true);
    expect(urls.filter((u) => u.includes("api.nearblocks.io"))).toEqual(
      ["txn-stats", "address-stats", "block-stats", "price-stats"].map((e) => `${SOURCES.nearblocksV3}/${e}?limit=6`),
    );
    const r = await computeResults(s);
    expect(r.metrics.supply.issuanceNear30).toBe(30_000);
  });

  it("must end after its base", async () => {
    const { base, fetcher } = world();
    await expect(fetchSnapshot({ asOf: base.asOf, base, fetcher })).rejects.toThrow(/must end after that day/);
  });
});

describe("the data check rebuilds a run the way it was built", () => {
  it("rebuilds a snapshot@2 on its own base and finds no drift when nothing changed", async () => {
    const { base, fetcher } = world();
    const pinned = await fetchSnapshot({ asOf: "2026-11-14", pinnedBlock: 1, base, fetcher, today: "2026-11-17" });
    const { fresh, notes } = await refetchLike(pinned, { loadBase: async () => base, fetcher });
    expect(notes).toEqual([]);
    expect(diffSnapshots(pinned, fresh)).toEqual([]);
    expect(await hashOf(fresh)).toBe(await hashOf(pinned));
  });

  it("refuses a base file that is not the one the run was built on", async () => {
    const { base, fetcher } = world();
    const pinned = await fetchSnapshot({ asOf: "2026-11-14", pinnedBlock: 1, base, fetcher, today: "2026-11-17" });
    const other: Snapshot = { ...base, l1: base.l1.map((r, i) => (i === 0 ? { ...r, txns: r.txns + 1 } : r)) };
    await expect(refetchLike(pinned, { loadBase: async () => other, fetcher })).rejects.toThrow(/not to this run's base/);
  });

  it(`still checks DefiLlama and the chain for a v1 run once v1 is off (${NEARBLOCKS_V1_OFF})`, async () => {
    const { base, fetcher, urls } = world({ v1Gone: true });
    const { fresh, notes } = await refetchLike(base, { loadBase: async () => base, fetcher });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/API v1 off on 2026-11-22/);
    expect(fresh.l1).toBe(base.l1);
    expect(diffSnapshots(base, fresh)).toEqual([]);
    expect(urls.filter((u) => u === SOURCES.nearblocksDaily)).toHaveLength(1);
    expect(urls).toContain(SOURCES.intentsRevenue);
    expect(urls).toContain(SOURCES.archivalRpc);
  });
});
