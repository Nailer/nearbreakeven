/**
 * The on-chain side: where runs are anchored, how to read them, and the exact
 * arguments a publish or an attestation sends. Works in Node and the browser.
 */
import type { Results } from "./types.js";

export const NETWORK = "testnet" as const;
export const LEDGER_CONTRACT = "ledger.nearbreakeven.testnet";
export const PUBLISHER = "nearbreakeven.testnet";
export const TESTNET_RPC = "https://rpc.testnet.fastnear.com";
export const EXPLORER = "https://testnet.nearblocks.io";
/** 0.01 NEAR in yoctoNEAR: what `attest` must attach for its storage. */
export const ATTEST_DEPOSIT_YOCTO = "10000000000000000000000";
export const CALL_GAS = "30000000000000";

export interface ChainClaim {
  id: string;
  passes: boolean;
  value: string;
}

export interface ChainRun {
  id: number;
  as_of: string;
  source_block: number;
  snapshot_sha256: string;
  results_sha256: string;
  verdict: string;
  claims: ChainClaim[];
  metrics: { key: string; value: string }[];
  code: string;
  published_at_ns: number;
  published_block: number;
  attestations: number;
  matching: number;
}

export interface ChainAttestation {
  run_id: number;
  by: string;
  snapshot_sha256: string;
  results_sha256: string;
  snapshot_matches: boolean;
  results_matches: boolean;
  method: "snapshot" | "live";
  note: string;
  at_ns: number;
  block: number;
}

/** Calls a view method on the ledger through public testnet RPC. No key needed. */
export async function viewLedger<T>(method: string, args: Record<string, unknown> = {}, rpcUrl = TESTNET_RPC): Promise<T> {
  const argsBase64 = btoa(JSON.stringify(args));
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "nearbreakeven",
      method: "query",
      params: { request_type: "call_function", finality: "final", account_id: LEDGER_CONTRACT, method_name: method, args_base64: argsBase64 },
    }),
  });
  if (!res.ok) throw new Error(`testnet RPC answered HTTP ${res.status}`);
  const body = await res.json();
  if (body.error || body.result?.error) throw new Error(`view ${method}: ${JSON.stringify(body.error ?? body.result.error).slice(0, 200)}`);
  return JSON.parse(new TextDecoder().decode(new Uint8Array(body.result.result))) as T;
}

/** The headline metrics stored on chain with each run (strings, so nothing is lost to floats). */
export function chainMetrics(r: Results): { key: string; value: string }[] {
  const m = r.metrics;
  const rows: [string, number | string | null][] = [
    ["coverage30", m.breakeven.coverage30],
    ["coverage90", m.breakeven.coverage90],
    ["coveragePrev90", m.breakeven.coveragePrev90],
    ["revenueMultiple", m.breakeven.revenueMultiple],
    ["quartersToBreakeven", m.breakeven.quartersToBreakeven],
    ["breakevenDailyVolumeUsd", m.breakeven.breakevenDailyVolume],
    ["volumeMultipleNeeded", m.breakeven.volumeMultipleNeeded],
    ["intentsRevenue30Usd", m.intents.revenue30],
    ["intentsVolume30Usd", m.intents.volume30],
    ["l1GasFees30Usd", m.l1.gasFeesUsd30],
    ["issuance30Usd", m.supply.issuanceUsd30],
    ["activeAccountsChangePct", m.l1.activeChangePct],
    ["corrActivePrice12m", m.decoupling.corrActivePrice12m],
    ["inflationNowPct", m.chain.inflationNowPct],
  ];
  return rows.map(([key, v]) => ({ key, value: v === null ? "null" : String(v) }));
}

export function chainClaims(r: Results): ChainClaim[] {
  return r.claims.map((c) => ({ id: c.id, passes: c.passes, value: c.value === null ? "null" : String(c.value) }));
}

export const txUrl = (hash: string) => `${EXPLORER}/txns/${hash}`;
export const accountUrl = (id: string) => `${EXPLORER}/address/${id}`;
