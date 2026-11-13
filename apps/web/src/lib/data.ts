import type { ChainAttestation, ChainRun, Results, Snapshot } from "@nearbreakeven/evidence";
import { viewLedger } from "@nearbreakeven/evidence";
import { useEffect, useState } from "react";

export interface Latest {
  asOf: string;
  block: number;
  snapshotSha256: string;
  resultsSha256: string;
  verdict: string;
  snapshot: string;
  results: string;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${path} answered HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

let bundle: Promise<{ latest: Latest; results: Results }> | null = null;

/** The published run that ships with the site (data/latest.json and its results). */
export function loadPublished() {
  bundle ??= getJson<Latest>("/data/latest.json").then(async (latest) => ({ latest, results: await getJson<Results>(`/data/${latest.results}`) }));
  return bundle;
}

export function loadPinnedSnapshot(latest: Latest) {
  return getJson<Snapshot>(`/data/${latest.snapshot}`);
}

export async function loadLedger(): Promise<{ runs: ChainRun[]; attestations: ChainAttestation[] }> {
  const runs = await viewLedger<ChainRun[]>("list_runs", { limit: 20 });
  const latest = runs[0];
  const attestations = latest ? await viewLedger<ChainAttestation[]>("list_attestations", { run_id: latest.id, limit: 50 }) : [];
  return { runs, attestations };
}

export type Async<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "error"; error: string };

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): [Async<T>, () => void] {
  const [state, setState] = useState<Async<T>>({ status: "loading" });
  const [tick, setTick] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: callers pass their own deps
  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    fn().then(
      (data) => live && setState({ status: "ready", data }),
      (e) => live && setState({ status: "error", error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, [...deps, tick]);
  return [state, () => setTick((t) => t + 1)];
}

// ---------- formatting ----------

export function usd(x: number, digits = 2): string {
  const a = Math.abs(x);
  if (a >= 1e9) return `$${(x / 1e9).toFixed(digits)}B`;
  if (a >= 1e6) return `$${(x / 1e6).toFixed(digits)}M`;
  if (a >= 1e3) return `$${(x / 1e3).toFixed(digits === 2 ? 1 : digits)}K`;
  return `$${x.toFixed(a < 1 ? 4 : 0)}`;
}

export const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;
export const num = (x: number) => x.toLocaleString("en-US");
export const compact = (x: number) =>
  Math.abs(x) >= 1e6 ? `${(x / 1e6).toFixed(2)}M` : Math.abs(x) >= 1e3 ? `${(x / 1e3).toFixed(1)}K` : x.toFixed(0);
export const shortHash = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthLabel = (m: string) => `${MONTHS[+m.slice(5, 7) - 1]} ${m.slice(2, 4)}`;
export const dateLabel = (d: string) => `${+d.slice(8, 10)} ${MONTHS[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;

export const mainnetBlockUrl = (h: number) => `https://nearblocks.io/blocks/${h}`;
export const mainnetAccountUrl = (a: string) => `https://nearblocks.io/address/${a}`;
export const REPO = "https://github.com/Nailer/nearbreakeven";
export const ACCOUNTKIT = "https://github.com/Nailer/accountkit";
