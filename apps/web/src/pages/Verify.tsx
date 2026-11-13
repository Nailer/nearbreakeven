import {
  type ChainAttestation,
  type ChainRun,
  LEDGER_CONTRACT,
  type Results,
  computeResults,
  fetchSnapshot,
  hashOf,
  txUrl,
  viewLedger,
} from "@nearbreakeven/evidence";
import { useEffect, useState } from "react";
import { Hash, useToast, VerdictMark } from "../components/parts";
import { LedgerFeed } from "../components/LedgerFeed";
import { type Latest, loadPinnedSnapshot } from "../lib/data";
import { WALLETS } from "../lib/wallets";

/** The wallet libraries are large; load them only on this page, when needed. */
const walletLib = () => import("../lib/wallet");

type Method = "live" | "snapshot";
type Step = { label: string; state: "todo" | "doing" | "done" | "failed"; detail?: string };

interface Outcome {
  run: ChainRun;
  method: Method;
  snapshotSha256: string;
  resultsSha256: string;
  results: Results;
  seconds: number;
}

const START: Step[] = [
  { label: "Read the anchored run from NEAR", state: "todo" },
  { label: "Get the data", state: "todo" },
  { label: "Recompute every metric and claim", state: "todo" },
  { label: "Compare hashes", state: "todo" },
];

export function Verify({ latest }: { latest: Latest }) {
  const toast = useToast();
  const [method, setMethod] = useState<Method>("live");
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
      set(1, { state: "doing", detail: method === "live" ? "Starting" : "Downloading the pinned snapshot" });
      const snapshot =
        method === "live"
          ? await fetchSnapshot({ asOf: chainRun.as_of, pinnedBlock: chainRun.source_block, onProgress: (s) => set(1, { detail: s }) })
          : await loadPinnedSnapshot(chainRun.as_of === latest.asOf ? latest : { ...latest, snapshot: `snapshots/${chainRun.as_of}/snapshot.json` });
      set(1, {
        state: "done",
        detail: `${snapshot.l1.length} days of NEAR L1, ${snapshot.intents.length} days of Intents, chain read at block ${snapshot.chain.block.toLocaleString("en-US")}`,
      });

      i = 2;
      set(2, { state: "doing" });
      const results = await computeResults(snapshot);
      const resultsSha256 = await hashOf(results);
      set(2, { state: "done", detail: `Verdict: ${results.verdict}` });

      i = 3;
      const snapOk = results.snapshotSha256 === chainRun.snapshot_sha256;
      const resOk = resultsSha256 === chainRun.results_sha256;
      set(3, { state: resOk ? "done" : "failed", detail: resOk ? "Your results match the anchored run exactly" : "Your results differ from the anchored run" });
      if (!snapOk && method === "live") toast("A source revised its history since the run. Try the pinned file to separate data from code.");
      setOutcome({ run: chainRun, method, snapshotSha256: results.snapshotSha256, resultsSha256, results, seconds: (performance.now() - t0) / 1000 });
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
        method: outcome.method,
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
              Your browser fetches the same public data, recomputes every number and compares its hashes with the ones anchored on NEAR. Nothing
              comes from our server. It takes about ten seconds.
            </p>
          </div>

          <fieldset className="choice">
            <legend>Where the data comes from</legend>
            <label className={method === "live" ? "is-on" : undefined}>
              <input type="radio" name="method" checked={method === "live"} onChange={() => setMethod("live")} />
              <span>
                <b>Fetch every source again</b>
                NearBlocks, DefiLlama and NEAR's archival RPC, read at the pinned block. Proves the data and the code.
              </span>
            </label>
            <label className={method === "snapshot" ? "is-on" : undefined}>
              <input type="radio" name="method" checked={method === "snapshot"} onChange={() => setMethod("snapshot")} />
              <span>
                <b>Use the pinned snapshot</b>
                The exact data file the run used. Proves the code alone, even if a source changes its history later.
              </span>
            </label>
          </fieldset>

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
              <h2>{resOk ? "Same numbers, to the last byte." : "Different numbers."}</h2>
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
pnpm verify            # re-fetch and compare
pnpm thesis            # rebuild everything for yesterday`}
              </code>
            </pre>
          </div>
        </div>
      </div>
    </main>
  );
}
