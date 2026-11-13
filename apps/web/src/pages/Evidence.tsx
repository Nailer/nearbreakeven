import { BLOCK_BEFORE_INFLATION_CUT, type Results, SOURCES, type Snapshot } from "@nearbreakeven/evidence";
import type { ReactNode } from "react";
import { Chart, type Series } from "../components/Chart";
import { Hash, Spinner } from "../components/parts";
import { type Latest, compact, loadPinnedSnapshot, mainnetAccountUrl, monthLabel, num, REPO, useAsync, usd } from "../lib/data";

function Figure(props: { title: string; says: string; how: ReactNode; source: ReactNode; code: string; children: ReactNode }) {
  return (
    <article className="figure">
      <header>
        <h2>{props.title}</h2>
        <p>{props.says}</p>
      </header>
      {props.children}
      <dl className="figure-meta">
        <div>
          <dt>How it is computed</dt>
          <dd>{props.how}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>{props.source}</dd>
        </div>
        <div>
          <dt>Code</dt>
          <dd>
            <a href={`${REPO}/blob/main/${props.code}`} target="_blank" rel="noreferrer">
              {props.code}
            </a>
          </dd>
        </div>
      </dl>
    </article>
  );
}

const ext = (href: string, label: string) => (
  <a href={href} target="_blank" rel="noreferrer">
    {label}
  </a>
);

export function Evidence({ results, latest }: { results: Results; latest: Latest }) {
  const m = results.metrics;
  const months = results.months.filter((x) => !x.partial);
  const labels = months.map((x) => monthLabel(x.m));
  const rev = months.filter((x) => x.intentsRevenue !== null);
  const cutIndex = months.findIndex((x) => x.m === "2025-11");
  const [snap] = useAsync<Snapshot>(() => loadPinnedSnapshot(latest), [latest.snapshot]);
  const line = (label: string, color: string, values: (number | null)[], extra: Partial<Series> = {}): Series => ({ label, color, values, ...extra });

  return (
    <main className="page">
      <div className="wrap">
        <div className="prose">
          <h1>The evidence</h1>
          <p className="lead">
            Every chart on this site, the sentence it supports, how it is computed and where the data comes from. Full months only; data
            through {results.asOf}. The whole page is rebuilt by <code>pnpm thesis</code>.
          </p>
        </div>

        <div className="figures">
          <Figure
            title="Active accounts fell 97% from the peak"
            says={`From ${compact(m.l1.activePeakAvg30)} a day (30 days to ${m.l1.activePeakEnd}) to ${compact(m.l1.activeAvg30)} a day in the last 30 days.`}
            how="Monthly average of NearBlocks' daily active accounts. The peak is the highest 30-day average since January 2024."
            source={ext(SOURCES.nearblocksDaily, "NearBlocks /v1/charts, field active_accounts")}
            code="packages/evidence/src/metrics.ts"
          >
            <Chart ariaLabel="Active accounts per day, monthly average" labels={labels} series={[line("Active accounts a day", "var(--ink-2)", months.map((x) => x.activeAvg))]} format={compact} />
          </Figure>

          <Figure
            title="Transactions fell with them"
            says={`${compact(m.l1.txnsAvg30)} a day in the last 30 days, ${Math.abs(m.l1.txnsChangePct)}% below the highest 30-day average.`}
            how="Monthly average of daily transactions."
            source={ext(SOURCES.nearblocksDaily, "NearBlocks /v1/charts, field txns")}
            code="packages/evidence/src/metrics.ts"
          >
            <Chart ariaLabel="Transactions per day, monthly average" labels={labels} series={[line("Transactions a day", "var(--ink-2)", months.map((x) => x.txnsAvg))]} format={compact} />
          </Figure>

          <Figure
            title="The price did not follow activity"
            says={`Correlation of month-on-month changes in active accounts and price over the last 12 complete months: r = ${m.decoupling.corrActivePrice12m}.`}
            how="Pearson correlation of the monthly % change in average active accounts against the monthly % change in average price, over the last 12 complete months."
            source={ext(SOURCES.nearblocksDaily, "NearBlocks /v1/charts, field near_price")}
            code="packages/evidence/src/metrics.ts"
          >
            <Chart ariaLabel="NEAR price, monthly average" labels={labels} series={[line("NEAR price", "var(--issuance)", months.map((x) => x.priceAvg))]} format={(v) => `$${v.toFixed(2)}`} />
          </Figure>

          <Figure
            title="Intents earns far more than L1 gas"
            says={`Last 30 days: ${usd(m.intents.revenue30)} of Intents revenue against ${usd(m.l1.gasFeesUsd30)} of L1 gas, ${m.breakeven.revenueMultiple}×.`}
            how="Monthly sums. Intents revenue is DefiLlama's dailyRevenue for NEAR Intents (what NEAR keeps after partner payouts); gas is NearBlocks' txn_fee_usd."
            source={
              <>
                {ext(SOURCES.intentsRevenue, "DefiLlama near-intents dailyRevenue")}, {ext(SOURCES.nearblocksDaily, "NearBlocks txn_fee_usd")}
              </>
            }
            code="packages/evidence/src/metrics.ts"
          >
            <Chart
              ariaLabel="Monthly Intents revenue and L1 gas fees"
              labels={rev.map((x) => monthLabel(x.m))}
              series={[
                line("Intents revenue", "var(--revenue)", rev.map((x) => x.intentsRevenue), { kind: "bar" }),
                line("L1 gas fees", "var(--ink-3)", rev.map((x) => x.gasFeesUsd), { kind: "bar" }),
              ]}
              format={(v) => usd(v, 1)}
            />
          </Figure>

          <Figure
            title="Intents volume keeps growing"
            says={`${usd(m.intents.volume30)} in the last 30 days${m.intents.volumeYoyPct === null ? "" : `, ${m.intents.volumeYoyPct}% more than the same 30 days a year earlier`}. ${usd(m.intents.volumeAllTime)} all time.`}
            how="Monthly sum of DefiLlama's daily NEAR Intents volume."
            source={ext(SOURCES.intentsVolume, "DefiLlama near-intents dailyVolume")}
            code="packages/evidence/src/metrics.ts"
          >
            <Chart
              ariaLabel="Monthly NEAR Intents volume"
              labels={months.filter((x) => x.intentsVolume > 0).map((x) => monthLabel(x.m))}
              series={[line("Intents volume", "var(--revenue)", months.filter((x) => x.intentsVolume > 0).map((x) => x.intentsVolume), { kind: "bar" })]}
              format={(v) => usd(v, 1)}
            />
          </Figure>

          <Figure
            title="Issuance was halved in November 2025"
            says={`About ${compact(m.supply.issuanceNear30)} new NEAR in the last 30 days, ${m.supply.annualizedRatePct.toFixed(2)}% a year. Before the cut, about twice that.`}
            how="Monthly sum of the day-on-day change in total supply. It already nets out burned gas."
            source={ext(SOURCES.nearblocksDaily, "NearBlocks /v1/charts, field total_supply")}
            code="packages/evidence/src/metrics.ts"
          >
            <Chart
              ariaLabel="New NEAR issued per month"
              labels={labels}
              series={[line("New NEAR", "var(--issuance)", months.map((x) => x.issuanceNear), { kind: "bar" })]}
              format={compact}
              marker={cutIndex >= 0 ? { index: cutIndex, label: "Inflation 5% → 2.5%" } : undefined}
            />
          </Figure>

          <Figure
            title="Coverage: the share of new NEAR that Intents pays for"
            says={`${(m.breakeven.coverage30 * 100).toFixed(1)}% over the last 30 days; ${(m.breakeven.coverage90 * 100).toFixed(1)}% over 90 days against ${(m.breakeven.coveragePrev90 * 100).toFixed(1)}% the 90 days before.`}
            how="Monthly Intents revenue ÷ Σ(new NEAR each day × that day's price)."
            source="Both series above."
            code="packages/evidence/src/metrics.ts"
          >
            <Chart
              ariaLabel="Coverage per month"
              labels={rev.map((x) => monthLabel(x.m))}
              series={[line("Coverage", "var(--revenue)", rev.map((x) => x.coverage))]}
              format={(v) => `${Math.round(v * 100)}%`}
              reference={{ value: 1, label: "Breakeven" }}
            />
          </Figure>
        </div>

        <section className="facts">
          <div className="prose">
            <h2>Read from NEAR mainnet itself</h2>
            <p>
              These do not come from an aggregator. The re-run reads them from a public archival node at a pinned block, so anyone gets the
              same values.
            </p>
          </div>
          <table className="facts-table">
            <tbody>
              <tr>
                <th>Maximum inflation before the cut</th>
                <td>
                  {m.chain.inflationBeforePct}% <span className="muted">at block {num(BLOCK_BEFORE_INFLATION_CUT)}, protocol {snap.status === "ready" ? snap.data.chain.protocolBefore.protocolVersion : "…"}</span>
                </td>
              </tr>
              <tr>
                <th>Maximum inflation now</th>
                <td>
                  {m.chain.inflationNowPct}% <span className="muted">at block {num(latest.block)}, protocol {snap.status === "ready" ? snap.data.chain.protocolNow.protocolVersion : "…"}</span>
                </td>
              </tr>
              <tr>
                <th>Total supply, block header vs NearBlocks</th>
                <td>
                  {m.chain.supplyHeaderVsNearBlocksPct}% apart{" "}
                  <span className="muted">({snap.status === "ready" ? `${num(snap.data.chain.totalSupply)} NEAR on chain` : "…"}), so the aggregator agrees with the chain</span>
                </td>
              </tr>
              <tr>
                <th>Intents buyback wallet</th>
                <td>
                  {num(m.chain.buybackBalance)} NEAR in{" "}
                  <a href={mainnetAccountUrl("buybacks.multisignature.near")} target="_blank" rel="noreferrer">
                    buybacks.multisignature.near
                  </a>
                </td>
              </tr>
              <tr>
                <th>Data snapshot hash</th>
                <td>
                  <Hash value={results.snapshotSha256} label="Snapshot hash" />
                </td>
              </tr>
            </tbody>
          </table>
          {snap.status === "loading" && <Spinner label="Loading the pinned snapshot" />}
          <p className="muted">
            Download the exact data:{" "}
            <a href={`/data/${latest.snapshot}`} download>
              snapshot.json
            </a>{" "}
            ·{" "}
            <a href={`/data/${latest.results}`} download>
              results.json
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}
