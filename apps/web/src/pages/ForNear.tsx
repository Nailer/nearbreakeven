import { LEDGER_CONTRACT, type Results, levers } from "@nearbreakeven/evidence";
import { compact, pct, usd } from "../lib/data";

const RAW = "https://raw.githubusercontent.com/Nailer/nearbreakeven/main/data";

/** One station on the money path. */
function Station({ k, v, d }: { k: string; v: string; d: string }) {
  return (
    <div className="flow-station">
      <span className="flow-k">{k}</span>
      <b className="flow-v">{v}</b>
      <span className="flow-d">{d}</span>
    </div>
  );
}

/**
 * Why NEAR should care, and how the project pays for itself. Every figure is
 * computed from the published run's results (see packages/evidence/src/value.ts).
 */
export function ForNear({ results }: { results: Results }) {
  const m = results.metrics;
  const l = levers(results);
  const cov = m.breakeven.coverage30;
  const gapPts = (1 - cov) * 100;
  const rows = [
    {
      lever: "Intents volume",
      move: "+$100M a day",
      effect: `${usd(l.per100mVolume.revenuePerDay, 1)} a day more for NEAR`,
      pts: l.per100mVolume.coveragePoints,
      note: `Today: ${usd(m.breakeven.currentDailyVolume, 2)} a day. Each $1M of volume leaves NEAR $${l.revenuePerMillion.toFixed(0)}.`,
    },
    {
      lever: "Take rate",
      move: "+1 basis point",
      effect: `${usd(l.perBasisPoint.revenuePerDay, 1)} a day more for NEAR`,
      pts: l.perBasisPoint.coveragePoints,
      note: `Today: ${m.intents.takeRateBps.toFixed(2)} bps of volume. Competitors can push this down as easily as up.`,
    },
    {
      lever: "Issuance",
      move: "Halved again",
      effect: `${usd(l.halvedIssuance.savedPerYear, 1)} a year less to pay for`,
      pts: l.halvedIssuance.coveragePoints,
      note: `It was halved once already, in October 2025 (${m.chain.inflationBeforePct}% → ${m.chain.inflationNowPct}% maximum). A governance decision, not a forecast.`,
    },
    {
      lever: "NEAR price",
      move: "+$1",
      effect: `${usd(l.perDollarOfPrice.costPerDay, 1)} a day more issuance to pay for`,
      pts: l.perDollarOfPrice.coveragePoints,
      note: "A rally makes breakeven harder: new NEAR costs more dollars while revenue stays in dollars.",
    },
  ];

  return (
    <main className="page">
      <div className="wrap">
        <div className="prose">
          <h1>What this is worth to NEAR</h1>
          <p className="lead">
            NEAR's case to investors used to rest on users, and that number fell {Math.abs(m.l1.activeChangePct)}%. The money did not: at the last
            30 days' pace, NEAR Intents earns NEAR {usd(l.revenueRunRateYear, 1)} a year. NEAR Breakeven turns that into one number anyone can check
            and shows which lever moves it.
          </p>
        </div>

        <section className="value-block" aria-labelledby="path-h">
          <h2 id="path-h">Where NEAR's money comes from now</h2>
          <div className="flow" role="img" aria-label="Money path: cross-chain swaps pay a fee, NEAR keeps part of it as revenue and buys NEAR back">
            <Station k="Swaps between chains" v={usd(m.intents.volume30, 2)} d="through NEAR Intents, last 30 days" />
            <span className="flow-link" aria-hidden="true" />
            <Station k="NEAR keeps" v={`${m.intents.takeRateBps.toFixed(2)} bps`} d={`$${l.revenuePerMillion.toFixed(0)} of every $1M swapped`} />
            <span className="flow-link" aria-hidden="true" />
            <Station k="Revenue" v={usd(m.intents.revenue30, 2)} d={`${usd(l.revenueRunRateYear, 1)} a year at this pace`} />
            <span className="flow-link" aria-hidden="true" />
            <Station k="Bought back" v={`${compact(m.chain.buybackBalance)} NEAR`} d="held by buybacks.multisignature.near" />
          </div>
          <div className="flow-against">
            <span className="flow-against-bar" style={{ ["--cov" as string]: `${Math.min(1, cov) * 100}%` }} aria-hidden="true" />
            <p>
              Set against <b>{usd(m.supply.issuanceUsd30, 2)}</b> of new NEAR minted in the same 30 days ({usd(l.issuanceRunRateYear, 1)} a year).
              Revenue covers <b>{pct(cov)}</b> of it; the gap is {usd(l.gapPerDay, 1)} a day.
            </p>
          </div>
        </section>

        <section className="value-block" aria-labelledby="levers-h">
          <h2 id="levers-h">The levers, priced</h2>
          <p className="muted value-intro">
            What each change would do to coverage on its own, with everything else at today's values. Breakeven needs {gapPts.toFixed(1)} more
            points. Arithmetic on the anchored run, not a forecast.
          </p>
          <table className="levers">
            <thead>
              <tr>
                <th scope="col">Lever</th>
                <th scope="col">Change</th>
                <th scope="col">Effect</th>
                <th scope="col">Coverage</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.lever}>
                  <th scope="row">
                    {r.lever}
                    <span>{r.note}</span>
                  </th>
                  <td>{r.move}</td>
                  <td>{r.effect}</td>
                  <td>
                    <span className={`lever-pts ${r.pts < 0 ? "is-down" : ""}`}>
                      {r.pts > 0 ? "+" : "−"}
                      {Math.abs(r.pts).toFixed(1)} pts
                    </span>
                    <span className="lever-bar" aria-hidden="true">
                      <i className={r.pts < 0 ? "is-down" : undefined} style={{ width: `${Math.min(100, (Math.abs(r.pts) / gapPts) * 100)}%` }} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="aside">
            Bars are drawn against the {gapPts.toFixed(1)} points still missing. <a href="/#calculator">Combine them in the calculator</a>.
          </p>
        </section>

        <section className="value-block" aria-labelledby="who-h">
          <h2 id="who-h">Who it is for</h2>
          <dl className="who">
            <div>
              <dt>Investors and funds</dt>
              <dd>
                A NEAR thesis they can audit in seconds instead of trusting. Due diligence on NEAR gets cheaper, and the headline number tracks the
                money instead of a falling user count.
              </dd>
            </div>
            <div>
              <dt>House of Stake and veNEAR voters</dt>
              <dd>
                Inflation, fee split and buyback votes get a public, falsifiable scoreboard. The levers above say what a proposal is worth in
                coverage points before anyone votes.
              </dd>
            </div>
            <div>
              <dt>NEAR Intents, its solvers and front-ends</dt>
              <dd>The metric they move, tracked every day, with the run that produced it anchored on NEAR.</dd>
            </div>
            <div>
              <dt>Analysts, DAOs and journalists</dt>
              <dd>
                The pattern, reusable: pin the data, hash it, anchor it, let anyone re-run it. Cite a figure by its run and block, and any reader
                can reproduce it later.
              </dd>
            </div>
          </dl>
        </section>

        <section className="value-block" aria-labelledby="model-h">
          <h2 id="model-h">How it pays for itself</h2>
          <p className="muted value-intro">
            The tracker stays free. Paid products sit on top of it, and every one of them settles on NEAR. Prices for the planned rows are not set,
            and nothing here is a revenue forecast.
          </p>
          <table className="model">
            <thead>
              <tr>
                <th scope="col">What</th>
                <th scope="col">Who pays</th>
                <th scope="col">What NEAR gets</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">The NEAR thesis, the dashboard and the data feed</th>
                <td>Nobody. A public good, funded by ecosystem grants (House of Stake, NEAR Foundation)</td>
                <td>An investment case for NEAR that anyone can check</td>
                <td>
                  <span className="status status--live">Live</span>
                </td>
              </tr>
              <tr>
                <th scope="row">Attestations on the ledger</th>
                <td>Each attester, 0.01 NEAR for their own storage</td>
                <td>Transactions and NEAR locked for storage; costs us nothing per user</td>
                <td>
                  <span className="status status--live">Live on testnet</span>
                </td>
              </tr>
              <tr>
                <th scope="row">Evidence ledger for other theses</th>
                <td>Funds, DAOs and research desks anchor their own claims and kill criteria on NEAR mainnet, per anchored run, in NEAR</td>
                <td>Mainnet transactions, NEAR locked for storage, NEAR bought to pay</td>
                <td>
                  <span className="status">Planned</span>
                </td>
              </tr>
              <tr>
                <th scope="row">Claim alerts</th>
                <td>Subscribers, when a claim flips or coverage crosses a level, paying from any chain through NEAR Intents</td>
                <td>Every subscription payment pays NEAR's Intents fee: the product adds to the metric it tracks</td>
                <td>
                  <span className="status">Planned</span>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="value-block" aria-labelledby="data-h">
          <h2 id="data-h">Use the data</h2>
          <p className="muted value-intro">
            Every run is plain JSON with a stable schema (<code>{results.schema}</code>). Wallets, dashboards and bots can read it today, free and
            without a key. The ledger is the trustless copy.
          </p>
          <div className="cli cli--wide">
            <pre>
              <code>
                {`# newest run: day, block, both hashes, verdict
curl ${RAW}/latest.json

# every metric, claim and month of that run
curl ${RAW}/snapshots/${results.asOf}/results.json

# the same run, straight from NEAR
near contract call-function as-read-only ${LEDGER_CONTRACT} latest_run json-args {} network-config testnet now`}
              </code>
            </pre>
          </div>
        </section>
      </div>
    </main>
  );
}
