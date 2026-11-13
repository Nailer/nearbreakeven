import {
  type ChainAttestation,
  type ChainRun,
  type Drift,
  LEDGER_CONTRACT,
  type Results,
  computeResults,
  diffSnapshots,
  fetchSnapshot,
  hashOf,
  txUrl,
  viewLedger,
} from "@nearbreakeven/evidence";
import { useEffect, useState } from "react";
import { Hash, useToast, VerdictMark } from "../components/parts";
import { LedgerFeed } from "../components/LedgerFeed";
import { type Latest, loadPinnedSnapshot, pct } from "../lib/data";
import { WALLETS } from "../lib/wallets";

/** The wallet libraries are large; load them only on this page, when needed. */
const walletLib = () => import("../lib/wallet");

type Step = { label: string; state: "todo" | "doing" | "done" | "failed"; detail?: string };

/** What the public sources say today about the same day and block. */
type DataCheck = { state: "clean" } | { state: "drift"; drift: Drift[]; live: Results } | { state: "unreachable"; error: string };

interface Outcome {
  run: ChainRun;
  snapshotSha256: string;
  resultsSha256: string;
  results: Results;
  data: DataCheck;
  seconds: number;
}

const START: Step[] = [
  { label: "Read the anchored run from NEAR", state: "todo" },
  { label: "Hash the pinned data file", state: "todo" },
  { label: "Recompute every metric and claim", state: "todo" },
  { label: "Ask every public source again", state: "todo" },
];

export function Verify({ latest }: { latest: Latest }) {
  const toast = useToast();
  const [steps, setSteps] = useState<Step[]>(START);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [mine, setMine] = useState<ChainAttestation | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [feedKey, setFeedKey] = useState(0);

  useEffect(() => {
    walletLib()
      .then((w) => w.connectedAccount())
      .then(setAccount, () => setAccount(null));
  }, []);

  useEffect(() => {
    if (!account || !outcome) return setMine(null);
    viewLedger<ChainAttestation | null>("get_attestation", { run_id: outcome.run.id, account_id: account }).then(setMine, () => setMine(null));
  }, [account, outcome]);

  const set = (i: number, patch: Partial<Step>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function run() {
    setRunning(true);
    setError(null);
    setOutcome(null);
    setTxHash(null);
    setSteps(START);
    const t0 = performance.now();
    let i = 0;
    try {
      set(0, { state: "doing" });
      const chainRun = await viewLedger<ChainRun | null>("latest_run");
      if (!chainRun) throw new Error("No run is anchored on the ledger yet.");
      set(0, { state: "done", detail: `Run #${chainRun.id}, data through ${chainRun.as_of}, mainnet block ${chainRun.source_block.toLocaleString("en-US")}` });

      i = 1;
      set(1, { state: "doing", detail: "Downloading the exact file the run was computed from" });
      const pinned = await loadPinnedSnapshot(chainRun.as_of === latest.asOf ? latest : { ...latest, snapshot: `snapshots/${chainRun.as_of}/snapshot.json` });
      i = 2;
      set(2, { state: "doing" });
      const results = await computeResults(pinned);
      const resultsSha256 = await hashOf(results);
      const snapOk = results.snapshotSha256 === chainRun.snapshot_sha256;
      const resOk = resultsSha256 === chainRun.results_sha256;
      set(1, {
        state: snapOk ? "done" : "failed",
        detail: `${pinned.l1.length} days of NEAR L1, ${pinned.intents.length} days of Intents. ${snapOk ? "Same hash as the one on NEAR" : "Its hash differs from the one on NEAR"}`,
      });
      set(2, {
        state: resOk ? "done" : "failed",
        detail: resOk ? `Same results hash as the one on NEAR. Verdict: ${results.verdict}` : "Your results differ from the anchored run",
      });

      i = 3;
      set(3, { state: "doing", detail: "Starting" });
      let data: DataCheck;
      try {
        const fresh = await fetchSnapshot({ asOf: chainRun.as_of, pinnedBlock: chainRun.source_block, onProgress: (s) => set(3, { detail: s }) });
        const drift = diffSnapshots(pinned, fresh);
        data = drift.length === 0 ? { state: "clean" } : { state: "drift", drift, live: await computeResults(fresh) };
        set(3, {
          state: "done",
          detail:
            drift.length === 0
              ? "The sources still return exactly the pinned data"
              : `${drift.length} value${drift.length === 1 ? "" : "s"} revised by the sources since the run; listed below`,
        });
      } catch (e) {
        data = { state: "unreachable", error: e instanceof Error ? e.message : String(e) };
        set(3, { state: "failed", detail: "A source did not answer. The code check above still stands" });
      }
      setOutcome({ run: chainRun, snapshotSha256: results.snapshotSha256, resultsSha256, results, data, seconds: (performance.now() - t0) / 1000 });
    } catch (e) {
      set(i, { state: "failed" });
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  async function onConnect(id: string, label: string) {
    setBusy(id);
    try {
      const a = await (await walletLib()).connect(id);
      setAccount(a);
      toast(`Connected ${a}`);
    } catch (e) {
      toast(`${label} did not connect: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  async function onAttest() {
    if (!outcome) return;
    setBusy("attest");
    try {
      const { hash, attestation } = await (await walletLib()).attest({
        run_id: outcome.run.id,
        snapshot_sha256: outcome.snapshotSha256,
        results_sha256: outcome.resultsSha256,
        method: outcome.data.state === "clean" ? "live" : "snapshot",
        note: note.trim() || undefined,
      });
      setTxHash(hash);
      if (attestation) setMine(attestation);
      setFeedKey((k) => k + 1);
      toast(attestation?.results_matches ? "Recorded on NEAR: your re-run matched" : "Recorded on NEAR");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const resOk = outcome && outcome.resultsSha256 === outcome.run.results_sha256;
  const snapOk = outcome && outcome.snapshotSha256 === outcome.run.snapshot_sha256;

  return (
    <main className="page">
      <div className="wrap split split--wide">
        <div>
          <div className="prose">
            <h1>Re-run the thesis</h1>
            <p className="lead">
              Your browser checks two things in a few seconds. Code: the pinned data file still hashes to the hash on NEAR, and this code turns it
              into exactly the anchored results. Data: NearBlocks, DefiLlama and NEAR's archival node still return that same data today. Nothing
              comes from our server.
            </p>
          </div>



          <button type="button" className="btn btn--primary btn--big" onClick={run} disabled={running}>
            {running ? "Re-running…" : outcome ? "Run it again" : "Start the re-run"}
          </button>

          <ol className="runlog" aria-live="polite">
            {steps.map((s) => (
              <li key={s.label} className={`runlog-${s.state}`}>
                <span className="runlog-mark" aria-hidden="true" />
                <div>
                  <b>{s.label}</b>
                  {s.detail && <span>{s.detail}</span>}
                </div>
              </li>
            ))}
          </ol>

          {error && (
            <div className="error" role="alert">
              <p>The re-run stopped: {error}</p>
              <p className="muted">A public source may be rate-limiting. Wait a minute and run it again, or use the pinned snapshot.</p>
            </div>
          )}

          {outcome && (
            <section className={`compare ${resOk ? "compare--ok" : "compare--bad"}`} aria-label="Hash comparison">
              <h2>{resOk && snapOk ? "Same numbers, to the last byte." : "Different numbers."}</h2>
              <p className="muted">
                Finished in {outcome.seconds.toFixed(1)} s. Your verdict: <VerdictMark verdict={outcome.results.verdict} />
              </p>
              <table>
                <thead>
                  <tr>
                    <th />
                    <th>Anchored on NEAR</th>
                    <th>Your re-run</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th>Data</th>
                    <td>
                      <Hash value={outcome.run.snapshot_sha256} label="Anchored data hash" />
                    </td>
                    <td>
                      <Hash value={outcome.snapshotSha256} label="Your data hash" />
                      <em className={snapOk ? "ok" : "bad"}>{snapOk ? "Match" : "Different"}</em>
                    </td>
                  </tr>
                  <tr>
                    <th>Results</th>
                    <td>
                      <Hash value={outcome.run.results_sha256} label="Anchored results hash" />
                    </td>
                    <td>
                      <Hash value={outcome.resultsSha256} label="Your results hash" />
                      <em className={resOk ? "ok" : "bad"}>{resOk ? "Match" : "Different"}</em>
                    </td>
                  </tr>
                </tbody>
              </table>

              <DataCheckNote run={outcome.run} results={outcome.results} data={outcome.data} />

              <div className="attest">
                <h3>Put your re-run on the record</h3>
                <p>
                  Send your hashes to <code>{LEDGER_CONTRACT}</code>. The contract compares them with the anchored run and stores the result
                  under your account. NEAR testnet, 0.01 test NEAR for storage.
                </p>
                {!account && (
                  <div className="wallets">
                    {WALLETS.map((w) => (
                      <button key={w.id} type="button" className="wallet" disabled={busy !== null} onClick={() => onConnect(w.id, w.label)}>
                        <b>{busy === w.id ? "Opening…" : w.label}</b>
                        <span>{w.kind}</span>
                      </button>
                    ))}
                  </div>
                )}
                {account && !mine && (
                  <div className="attest-form">
                    <p>
                      Signed in as <b>{account}</b>{" "}
                      <button type="button" className="link" onClick={() => walletLib().then((w) => w.disconnect()).then(() => setAccount(null))}>
                        Switch account
                      </button>
                    </p>
                    <label>
                      <span>Note, optional (140 characters)</span>
                      <input value={note} maxLength={140} onChange={(e) => setNote(e.target.value)} placeholder="Re-ran it from my laptop" />
                    </label>
                    <button type="button" className="btn btn--primary" disabled={busy !== null} onClick={onAttest}>
                      {busy === "attest" ? "Waiting for your wallet…" : "Record my re-run on NEAR"}
                    </button>
                  </div>
                )}
                {account && mine && (
                  <div className={`receipt ${mine.results_matches ? "receipt--ok" : "receipt--bad"}`}>
                    <p>
                      <b>{mine.by}</b> re-ran run #{mine.run_id}. The contract recorded{" "}
                      <b>{mine.results_matches ? "a match" : "different results"}</b> at testnet block {mine.block.toLocaleString("en-US")}.
                    </p>
                    {txHash && (
                      <a className="btn" href={txUrl(txHash)} target="_blank" rel="noreferrer">
                        See the transaction on NearBlocks
                      </a>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
        <div className="sticky">
          <LedgerFeed refreshKey={feedKey} />
          <div className="cli">
            <h3>Prefer a terminal?</h3>
            <pre>
              <code>
                {`git clone https://github.com/Nailer/nearbreakeven
cd nearbreakeven && pnpm install
pnpm verify            # code check + data check
pnpm thesis            # rebuild from raw data`}
              </code>
            </pre>
          </div>
        </div>
      </div>
    </main>
  );
}

const DOLLARS = new Set(["volume", "fees", "revenue", "feeUsd", "price"]);
/** A revised value as it reads best: dollars for money fields, an ellipsis for long blobs. */
const cell = (field: string, v: string) =>
  v.length > 24 ? "…" : DOLLARS.has(field) && Number.isFinite(Number(v)) ? `$${Number(v).toLocaleString("en-US")}` : v;

/** The second check: have the public sources changed the data since the run was pinned? */
function DataCheckNote({ run, results, data }: { run: ChainRun; results: Results; data: DataCheck }) {
  if (data.state === "clean") {
    return (
      <div className="datacheck datacheck--clean">
        <h3>The sources agree too</h3>
        <p>
          NearBlocks, DefiLlama and NEAR's archival node still return exactly the data pinned on {run.as_of}, so a fully live re-run gives the same
          hashes.
        </p>
      </div>
    );
  }
  if (data.state === "unreachable") {
    return (
      <div className="datacheck">
        <h3>Could not ask the sources again</h3>
        <p className="muted">{data.error}. Public APIs rate-limit now and then; run it again in a minute.</p>
      </div>
    );
  }
  const before = results.metrics.breakeven.coverage30;
  const after = data.live.metrics.breakeven.coverage30;
  return (
    <div className="datacheck datacheck--drift">
      <h3>The sources have revised {data.drift.length === 1 ? "one value" : `${data.drift.length} values`} since the run</h3>
      <p>
        Aggregators keep filling in recent days after the fact. The anchored run keeps the data it was computed from; this is what changed since. On
        today's data the verdict is <b>{data.live.verdict}</b> and 30-day coverage is <b>{pct(after, 2)}</b> (anchored {pct(before, 2)}).
      </p>
      <table>
        <thead>
          <tr>
            <th>Source</th>
            <th>Day</th>
            <th>Field</th>
            <th>Pinned</th>
            <th>Today</th>
          </tr>
        </thead>
        <tbody>
          {data.drift.slice(0, 12).map((d) => (
            <tr key={`${d.source}-${d.day}-${d.field}`}>
              <td>{d.source}</td>
              <td>{d.day}</td>
              <td>{d.field}</td>
              <td className="mono">{cell(d.field, d.before)}</td>
              <td className="mono">{cell(d.field, d.after)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.drift.length > 12 && <p className="muted">And {data.drift.length - 12} more. `pnpm drift` lists them all.</p>}
    </div>
  );
}
