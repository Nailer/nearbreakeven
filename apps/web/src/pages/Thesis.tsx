import { type Results, thesisDoc } from "@nearbreakeven/evidence";
import { ClaimList, Hash, Tape, VerdictMark } from "../components/parts";
import { dateLabel } from "../lib/data";
import { Link } from "../lib/router";

export function Thesis({ results, resultsSha256 }: { results: Results; resultsSha256: string }) {
  const t = thesisDoc(results);
  return (
    <main className="page">
      <article className="wrap article">
        <p className="hero-status">
          <VerdictMark verdict={results.verdict} />
          <span>Data through {dateLabel(results.asOf)}. Every number on this page is computed by the run; none is typed by hand.</span>
        </p>
        <h1>{t.title}</h1>
        <p className="lead">{t.summary}</p>
        <Tape results={results} compact />

        <h2>The claim</h2>
        <p>{t.claim}</p>

        <h2>The four tests</h2>
        <ClaimList claims={results.claims} />

        <h2>Evidence for</h2>
        {t.forPoints.map((p) => (
          <section key={p.title} className="point">
            <h3>
              {p.title}
              {p.claim && <span className="point-claim">{p.claim}</span>}
            </h3>
            <p>{p.body}</p>
          </section>
        ))}

        <h2>Evidence against</h2>
        {t.againstPoints.map((p) => (
          <section key={p.title} className="point point--against">
            <h3>
              {p.title}
              {p.claim && <span className="point-claim">{p.claim}</span>}
            </h3>
            <p>{p.body}</p>
          </section>
        ))}

        <h2>What would change my mind</h2>
        <ul>
          {t.changeMind.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>

        <h2>What this data cannot measure</h2>
        <ul>
          {t.cannotMeasure.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>

        <h2>Method</h2>
        <ul>
          {t.method.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        <p className="muted">
          Results hash <Hash value={resultsSha256} label="Results hash" />
        </p>
        <div className="actions">
          <Link to="/verify" className="btn btn--primary">
            Re-run it in your browser
          </Link>
          <Link to="/evidence" className="btn">
            See every chart and its source
          </Link>
        </div>
        <p className="disclaimer">This is research for a hackathon, not investment advice.</p>
      </article>
    </main>
  );
}
