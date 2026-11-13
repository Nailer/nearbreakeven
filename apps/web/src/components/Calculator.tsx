import type { Results } from "@nearbreakeven/evidence";
import { useId, useState } from "react";
import { pct, usd } from "../lib/data";

/**
 * "What would it take?" Move volume, take rate and price; issuance is fixed by
 * the protocol (last 30 days' new NEAR per day), so the rest is arithmetic.
 */
export function Calculator({ results }: { results: Results }) {
  const m = results.metrics;
  const today = {
    volume: Math.round(m.breakeven.currentDailyVolume / 1e6),
    bps: Math.round(m.intents.takeRateBps * 100) / 100,
    price: Math.round(m.supply.priceAvg30 * 100) / 100,
  };
  const [volume, setVolume] = useState(today.volume);
  const [bps, setBps] = useState(today.bps);
  const [price, setPrice] = useState(today.price);
  const mintedPerDay = m.supply.issuanceNear30 / 30;
  const cost = mintedPerDay * price;
  const revenue = volume * 1e6 * (bps / 10_000);
  const coverage = revenue / cost;
  const needed = cost / (bps / 10_000);
  const ids = { v: useId(), b: useId(), p: useId() };
  const isToday = volume === today.volume && bps === today.bps && price === today.price;

  return (
    <div className="calc">
      <div className="calc-controls">
        <label htmlFor={ids.v}>
          <span>NEAR Intents volume a day</span>
          <b>{usd(volume * 1e6, 0)}</b>
        </label>
        <input id={ids.v} type="range" min={25} max={2000} step={5} value={volume} onChange={(e) => setVolume(+e.target.value)} />
        <label htmlFor={ids.b}>
          <span>Share of volume NEAR keeps as revenue</span>
          <b>{bps.toFixed(2)} bps</b>
        </label>
        <input id={ids.b} type="range" min={1} max={12} step={0.05} value={bps} onChange={(e) => setBps(+e.target.value)} />
        <label htmlFor={ids.p}>
          <span>NEAR price</span>
          <b>${price.toFixed(2)}</b>
        </label>
        <input id={ids.p} type="range" min={0.5} max={20} step={0.05} value={price} onChange={(e) => setPrice(+e.target.value)} />
        <button
          type="button"
          className="btn btn--quiet"
          disabled={isToday}
          onClick={() => {
            setVolume(today.volume);
            setBps(today.bps);
            setPrice(today.price);
          }}
        >
          Back to today's numbers
        </button>
      </div>
      <div className="calc-out" aria-live="polite">
        <p className="calc-big">
          <span className={coverage >= 1 ? "is-over" : undefined}>{pct(coverage, 0)}</span> of new NEAR paid for
        </p>
        <div className="tape tape--compact">
          <div className="tape-track">
            <div className="tape-fill tape-fill--live" style={{ width: `${Math.min(1, coverage) * 100}%` }} />
            <div className="tape-end" />
          </div>
        </div>
        <dl className="calc-facts">
          <div>
            <dt>Revenue a day</dt>
            <dd>{usd(revenue)}</dd>
          </div>
          <div>
            <dt>New NEAR a day, at this price</dt>
            <dd>
              {usd(cost)} <small>({Math.round(mintedPerDay).toLocaleString("en-US")} NEAR)</small>
            </dd>
          </div>
          <div>
            <dt>Volume needed to break even</dt>
            <dd>{usd(needed)} a day</dd>
          </div>
        </dl>
        <p className="calc-note">
          New NEAR per day is fixed by the protocol (2.5% a year since October 2025), so price and fees are the only levers. A higher price
          makes breakeven harder.
        </p>
      </div>
    </div>
  );
}
