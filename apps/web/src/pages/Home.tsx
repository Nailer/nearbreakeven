import { LEDGER_CONTRACT, type Results, accountUrl, levers, thesisDoc } from "@nearbreakeven/evidence";
import { Calculator } from "../components/Calculator";
import { Chart } from "../components/Chart";
import { ClaimList, Tape, VerdictMark } from "../components/parts";
import { LedgerFeed } from "../components/LedgerFeed";
import { compact, dateLabel, loadLedger, monthLabel, shortHash, useAsync, usd } from "../lib/data";
import { Link } from "../lib/router";

function Figures({ rows, caption }: { rows: [string, string, string][]; caption: string }) {
  return (
    <table className="figs">
      <caption>{caption}</caption>
      <tbody>
        {rows.map(([k, v, d]) => (
          <tr key={k}>
            <th scope="row">{k}</th>
            <td>{v}</td>
            <td className="figs-d">{d}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The run, as NEAR has it: fills the hero's right side with the proof, read live from the ledger. */
function HeroReceipt({ results }: { results: Results }) {
  const [ledger] = useAsync(loadLedger, []);
  const run = ledger.status === "ready" ? ledger.data.runs[0] : undefined;
  return (
    <aside className="receipt-card" aria-label="This run on NEAR">
      <p className="receipt-card-head">
        <span className="ledger-live" aria-hidden="true" /> On NEAR testnet
      </p>
      <dl>
        <dt>Contract</dt>
        <dd>
          <a href={accountUrl(LEDGER_CONTRACT)} target="_blank" rel="noreferrer">
            {LEDGER_CONTRACT}
          </a>
        </dd>
        <dt>Run</dt>
        <dd>{run ? `#${run.id}, data through ${run.as_of}` : ledger.status === "error" ? "ledger unreachable" : "reading…"}</dd>
        <dt>Data hash</dt>
        <dd className="mono">{shortHash(results.snapshotSha256)}</dd>
        <dt>Mainnet block</dt>
        <dd>{run ? run.source_block.toLocaleString("en-US") : "…"}</dd>
        <dt>Re-runs</dt>
        <dd>{run ? `${run.attestations} recorded, ${run.matching} exact` : "…"}</dd>
      </dl>
      <Link to="/verify" className="receipt-card-cta">
        Re-run it yourself
      </Link>
    </aside>
  );
}

export function Home({ results }: { results: Results }) {
  const m = results.metrics;
  const doc = thesisDoc(results);
  const months = results.months.filter((x) => !x.partial);
  const since2024 = months;
  const sinceRevenue = months.filter((x) => x.intentsRevenue !== null);
  const l = levers(results);

  return (
    <main>
      <section className="hero">
        <div className="wrap">
          <p className="hero-status">
            <VerdictMark verdict={results.verdict} />
            <span>
              Data through {dateLabel(results.asOf)}, anchored on NEAR. <Link to="/verify">Check it yourself</Link>
            </span>
          </p>
          <div className="hero-grid">
            <div>
              <h1 className="hero-title">
                NEAR Intents now pays for <span className="num">{(m.breakeven.coverage30 * 100).toFixed(1)}%</span> of every new NEAR.
              </h1>
              <p className="lead">
                An investment thesis you can rebuild with one command and check against NEAR itself. Daily active accounts are down{" "}
                {Math.abs(m.l1.activeChangePct)}% from the peak. That stopped mattering: the money now comes from cross-chain swaps, and it is
                closing in on the cost of NEAR's own issuance.
              </p>
            </div>
            <HeroReceipt results={results} />
          </div>
          <Tape results={results} />
          <div className="actions">
            <Link to="/verify" className="btn btn--primary">
              Re-run it in your browser
            </Link>
            <Link to="/thesis" className="btn">
              Read the full thesis
            </Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap split">
          <div className="prose">
            <h2>The usage story ended. The price did not care.</h2>
            <p>
              At the July 2024 peak NEAR averaged {compact(m.l1.activePeakAvg30)} active accounts a day. The last 30 days averaged{" "}
              {compact(m.l1.activeAvg30)}. Over the last 12 months, month-to-month moves in activity and in price leaned, if anything, in
              opposite directions (r = {m.decoupling.corrActivePrice12m}). NEAR is up {m.decoupling.priceChangeFromLowPct}% from its{" "}
              {dateLabel(m.decoupling.priceLowDate)} low while activity kept sliding.
            </p>
            <Figures
              rows={[
                ["Active accounts a day", `${compact(m.l1.activePeakAvg30)} → ${compact(m.l1.activeAvg30)}`, `${m.l1.activeChangePct}%`],
                ["Transactions a day", `${compact(m.l1.txnsPeakAvg30)} → ${compact(m.l1.txnsAvg30)}`, `${m.l1.txnsChangePct}%`],
                [
                  "Gas paid per active account a day",
                  `$${m.l1.feePerActiveDayUsdAtPeak.toFixed(3)} → $${m.l1.feePerActiveDayUsd.toFixed(3)}`,
                  `${(m.l1.feePerActiveDayUsd / m.l1.feePerActiveDayUsdAtPeak).toFixed(1)}×`,
                ],
              ]}
              caption="2024 peak (30-day average) → last 30 days"
            />
            <p className="aside">Move across a chart to read any month.</p>
          </div>
          <div className="stack">
            <Chart
              ariaLabel="Average daily active accounts on NEAR per month"
              labels={since2024.map((x) => monthLabel(x.m))}
              series={[{ label: "Active accounts a day", color: "var(--ink-2)", values: since2024.map((x) => x.activeAvg) }]}
              format={compact}
              height={200}
            />
            <Chart
              ariaLabel="Average NEAR price per month"
              labels={since2024.map((x) => monthLabel(x.m))}
              series={[{ label: "NEAR price", color: "var(--issuance)", values: since2024.map((x) => x.priceAvg) }]}
              format={(v) => `$${v.toFixed(v < 10 ? 2 : 0)}`}
              height={200}
            />
          </div>
        </div>
      </section>

      <section className="section section--tint">
        <div className="wrap split split--flip">
          <div className="prose">
            <h2>The revenue moved to Intents.</h2>
            <p>
              NEAR Intents settles swaps between chains. Each swap pays a small fee, and NEAR keeps part of it and buys NEAR back. In the last
              30 days that came to {usd(m.intents.revenue30)}. Gas on the whole L1 came to {usd(m.l1.gasFeesUsd30)}:{" "}
              {m.breakeven.revenueMultiple}× less.
            </p>
            <p>
              Coverage is the scoreboard that follows: Intents revenue divided by the dollar value of the NEAR minted over the same 30 days. One
              hundred percent is breakeven.
            </p>
            <Figures
              rows={[
                ["Intents volume", usd(m.intents.volume30), m.intents.volumeYoyPct === null ? "" : `${m.intents.volumeYoyPct > 0 ? "+" : ""}${m.intents.volumeYoyPct}% a year`],
                ["Revenue NEAR keeps", usd(m.intents.revenue30), `${m.intents.takeRateBps.toFixed(2)} bps`],
                ["Value of new NEAR", usd(m.supply.issuanceUsd30), `${compact(m.supply.issuanceNear30)} NEAR`],
                ["Coverage", `${(m.breakeven.coverage30 * 100).toFixed(1)}%`, `90 days: ${(m.breakeven.coverage90 * 100).toFixed(1)}%`],
              ]}
              caption="Last 30 days"
            />
          </div>
          <div className="stack">
            <Chart
              ariaLabel="Monthly NEAR Intents revenue compared with NEAR L1 gas fees"
              labels={sinceRevenue.map((x) => monthLabel(x.m))}
              series={[
                { label: "Intents revenue", color: "var(--revenue)", kind: "bar", values: sinceRevenue.map((x) => x.intentsRevenue) },
                { label: "L1 gas fees", color: "var(--ink-3)", kind: "bar", values: sinceRevenue.map((x) => x.gasFeesUsd) },
              ]}
              format={(v) => usd(v, 1)}
              height={220}
            />
            <Chart
              ariaLabel="Coverage per month: Intents revenue as a share of the value of new NEAR"
              labels={sinceRevenue.map((x) => monthLabel(x.m))}
              series={[{ label: "Coverage", color: "var(--revenue)", values: sinceRevenue.map((x) => x.coverage) }]}
              format={(v) => `${Math.round(v * 100)}%`}
              reference={{ value: 1, label: "Breakeven, 100%" }}
              height={200}
            />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="prose">
            <h2>Four tests that can break it.</h2>
            <p>
              A thesis that cannot fail is an opinion. Each claim comes with a test fixed before the first run. One failure puts the thesis
              under pressure; two break it. Every run is checked again, from raw data.
            </p>
          </div>
          <ClaimList claims={results.claims} />
        </div>
      </section>

      <section className="section section--tint" id="calculator">
        <div className="wrap">
          <div className="prose">
            <h2>What would it take?</h2>
            <p>
              At today's numbers, Intents would need {usd(m.breakeven.breakevenDailyVolume)} of volume a day, {m.breakeven.volumeMultipleNeeded}×
              today, to pay for all new NEAR. Try your own.
            </p>
          </div>
          <Calculator results={results} />
        </div>
      </section>

      <section className="section">
        <div className="wrap worth">
          <div className="prose">
            <h2>Why NEAR should care.</h2>
            <p>
              At the last 30 days' pace, NEAR Intents earns NEAR {usd(l.revenueRunRateYear, 1)} a year against {usd(l.issuanceRunRateYear, 1)} of
              new NEAR. Investors, House of Stake voters and the Intents team all need to know which lever closes that gap, and they need a number
              they can check.
            </p>
            <Link to="/for-near" className="btn">
              What it is worth to NEAR
            </Link>
          </div>
          <dl className="worth-figs">
            <div>
              <dt>Each $1M swapped through Intents</dt>
              <dd>${l.revenuePerMillion.toFixed(0)} for NEAR</dd>
            </div>
            <div>
              <dt>Each extra $100M of volume a day</dt>
              <dd>+{l.per100mVolume.coveragePoints.toFixed(1)} points of coverage</dd>
            </div>
            <div>
              <dt>Each extra basis point NEAR keeps</dt>
              <dd>+{l.perBasisPoint.coveragePoints.toFixed(1)} points</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="section">
        <div className="wrap split">
          <div className="prose">
            <h2>Don't trust the chart. Re-run it.</h2>
            <ol className="steps">
              <li>
                <b>Pin the data.</b> Each run pins a NEAR block and a day, then fetches every source up to it. Three free public sources, no key,
                no account.
              </li>
              <li>
                <b>Hash it.</b> The data and the results are hashed. Same inputs, same code: same hashes, on any machine.
              </li>
              <li>
                <b>Anchor it on NEAR.</b> The hashes and the verdict go to a ledger contract that only appends. A bad run cannot be deleted
                later.
              </li>
              <li>
                <b>Anyone re-runs.</b> Your browser repeats the whole run. Sign with a NEAR wallet and the contract itself checks your hashes
                against the anchored ones.
              </li>
            </ol>
            <Link to="/verify" className="btn btn--primary">
              Re-run and verify
            </Link>
          </div>
          <LedgerFeed />
        </div>
      </section>

      <section className="section section--tint">
        <div className="wrap">
          <div className="prose">
            <h2>The best case against.</h2>
            <p>The thesis carries its counter-evidence with it. Three of the six points:</p>
          </div>
          <div className="against">
            {doc.againstPoints.slice(0, 3).map((a) => (
              <article key={a.title}>
                <h3>{a.title}</h3>
                <p>{a.body}</p>
              </article>
            ))}
          </div>
          <Link to="/thesis" className="btn">
            All the evidence against
          </Link>
        </div>
      </section>
    </main>
  );
}
