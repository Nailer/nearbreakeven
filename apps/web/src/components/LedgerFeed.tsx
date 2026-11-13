import { LEDGER_CONTRACT, accountUrl } from "@nearbreakeven/evidence";
import { loadLedger, shortHash, useAsync } from "../lib/data";
import { ErrorNote, Spinner, VerdictMark } from "./parts";

const ago = (ns: number) => {
  const s = (Date.now() - ns / 1e6) / 1000;
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};

/** Live view of the ledger contract: the latest anchored run and who re-ran it. */
export function LedgerFeed({ refreshKey = 0 }: { refreshKey?: number }) {
  const [state, retry] = useAsync(loadLedger, [refreshKey]);
  return (
    <aside className="ledger" aria-label="Live from the NEAR ledger contract">
      <header className="ledger-head">
        <span className="ledger-live" aria-hidden="true" />
        Live from{" "}
        <a href={accountUrl(LEDGER_CONTRACT)} target="_blank" rel="noreferrer">
          {LEDGER_CONTRACT}
        </a>
      </header>
      {state.status === "loading" && <Spinner label="Reading the ledger on NEAR testnet" />}
      {state.status === "error" && <ErrorNote message={`Could not read the ledger: ${state.error}`} onRetry={retry} />}
      {state.status === "ready" &&
        (() => {
          const run = state.data.runs[0];
          if (!run) return <p className="muted">No run anchored yet.</p>;
          return (
            <>
              <div className="ledger-run">
                <div>
                  <span className="muted">Run #{run.id}, data through {run.as_of}</span>
                  <VerdictMark verdict={run.verdict} />
                </div>
                <dl>
                  <dt>Results hash</dt>
                  <dd className="mono">{shortHash(run.results_sha256)}</dd>
                  <dt>Anchored</dt>
                  <dd>
                    {ago(run.published_at_ns)}, testnet block {run.published_block.toLocaleString("en-US")}
                  </dd>
                  <dt>Re-runs</dt>
                  <dd>
                    {run.attestations} recorded, {run.matching} matched exactly
                  </dd>
                </dl>
              </div>
              <ul className="ledger-atts">
                {state.data.attestations.length === 0 && <li className="muted">Nobody has re-run this one yet. Be the first.</li>}
                {state.data.attestations.map((a) => (
                  <li key={`${a.run_id}-${a.by}`}>
                    <span className={`dot ${a.results_matches ? "dot--pass" : "dot--fail"}`} aria-hidden="true" />
                    <a href={accountUrl(a.by)} target="_blank" rel="noreferrer">
                      {a.by}
                    </a>
                    <span className="muted">
                      {a.results_matches ? "matched" : "got different numbers"}, {a.method === "live" ? "fresh fetch" : "pinned file"}, {ago(a.at_ns)}
                    </span>
                    {a.note && <q>{a.note}</q>}
                  </li>
                ))}
              </ul>
            </>
          );
        })()}
    </aside>
  );
}
