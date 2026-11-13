import type { Claim, Results } from "@nearbreakeven/evidence";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { ACCOUNTKIT, REPO, pct, usd } from "../lib/data";
import { Link, useRoute } from "../lib/router";

// ---------- the coverage tape (the one orchestrated moment) ----------

/**
 * The thesis in one picture. The full tape is the dollar value of NEAR minted
 * in the last 30 days; the green part is what NEAR Intents revenue paid for.
 * The line at the end of the tape is breakeven.
 */
export function Tape({ results, compact = false }: { results: Results; compact?: boolean }) {
  const b = results.metrics.breakeven;
  const s = results.metrics.supply;
  const share = Math.min(1, b.coverage30);
  const [fill, setFill] = useState(0);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => setFill(share), reduce ? 0 : 450);
    return () => clearTimeout(t);
  }, [share]);
  return (
    <div className={`tape${compact ? " tape--compact" : ""}`}>
      <div className="tape-track" role="img" aria-label={`Intents revenue paid for ${pct(b.coverage30)} of the value of NEAR minted in the last 30 days`}>
        <div className="tape-fill" style={{ width: `${fill * 100}%` }}>
          <span className="tape-fill-label">{pct(b.coverage30)}</span>
        </div>
        <div className="tape-end" />
      </div>
      <div className="tape-legend">
        <span>
          <i className="sw sw-revenue" /> Paid by NEAR Intents revenue <b>{usd(results.metrics.intents.revenue30)}</b>
        </span>
        <span>
          <i className="sw sw-issuance" /> Value of NEAR minted, last 30 days <b>{usd(s.issuanceUsd30)}</b>
        </span>
        <span className="tape-legend-end">Breakeven</span>
      </div>
    </div>
  );
}

// ---------- verdict ----------

export function VerdictMark({ verdict }: { verdict: string }) {
  const tone = verdict === "HOLDS" ? "pass" : verdict === "BROKEN" ? "fail" : "warn";
  const word = verdict === "HOLDS" ? "Holds" : verdict === "BROKEN" ? "Broken" : "Under pressure";
  return <span className={`verdict verdict--${tone}`}>{word}</span>;
}

export function ClaimList({ claims }: { claims: Claim[] }) {
  return (
    <ol className="claims">
      {claims.map((c) => (
        <li key={c.id} className={`claim ${c.passes ? "claim--pass" : "claim--fail"}`}>
          <span className="claim-id">{c.id}</span>
          <div className="claim-body">
            <p className="claim-text">{c.claim}</p>
            <p className="claim-test">
              Breaks if this stops being true: {c.test.charAt(0).toLowerCase() + c.test.slice(1)}
            </p>
          </div>
          <div className="claim-result">
            <span className="claim-value">{c.display}</span>
            <span className="claim-status">{c.passes ? "Passes" : "Fails"}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Hash({ value, label }: { value: string; label?: string }) {
  const toast = useToast();
  return (
    <button
      type="button"
      className="hash"
      title="Copy the full hash"
      onClick={() => navigator.clipboard?.writeText(value).then(() => toast(`${label ?? "Hash"} copied`))}
    >
      {value}
    </button>
  );
}

// ---------- toast ----------

const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string }[]>([]);
  const next = useRef(0);
  const push = useCallback((msg: string) => {
    const id = next.current++;
    setItems((xs) => [...xs, { id, msg }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="toast">
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------- chrome ----------

export function Logo() {
  return (
    <svg className="logo" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="8" className="logo-bg" />
      <rect x="7" y="18" width="18" height="5" rx="2.5" className="logo-issuance" />
      <rect x="7" y="18" width="7" height="5" rx="2.5" className="logo-revenue" />
      <path d="M25 9v17" className="logo-line" />
      <path d="M7 13.5 13 10l5 2.5 7-4" className="logo-curve" />
    </svg>
  );
}

const NAV = [
  { to: "/", label: "Thesis in brief" },
  { to: "/evidence", label: "Evidence" },
  { to: "/thesis", label: "Full thesis" },
  { to: "/verify", label: "Re-run and verify" },
];

export function Nav() {
  const { path } = useRoute();
  const [open, setOpen] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: close the menu on navigation
  useEffect(() => setOpen(false), [path]);
  return (
    <header className="nav">
      <div className="nav-inner">
        <Link to="/" className="brand" aria-label="NEAR Breakeven home">
          <Logo />
          <span>NEAR Breakeven</span>
        </Link>
        <button type="button" className="nav-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          Menu
        </button>
        <nav className={`nav-links${open ? " is-open" : ""}`} aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className="nav-link">
              {n.label}
            </Link>
          ))}
          <a className="nav-link nav-link--repo" href={REPO} target="_blank" rel="noreferrer">
            Code
          </a>
        </nav>
      </div>
    </header>
  );
}

export function Footer({ results }: { results?: Results }) {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <Link to="/" className="brand">
            <Logo />
            <span>NEAR Breakeven</span>
          </Link>
          <p>
            An evidence-first investment thesis for NEAR, built for the NEAR HACKATHON thesis track. Every number is rebuilt from public data
            and anchored on NEAR testnet. Not investment advice.
          </p>
        </div>
        <div>
          <h4>Data</h4>
          <a href="https://api.nearblocks.io/v1/charts" target="_blank" rel="noreferrer">
            NearBlocks daily stats
          </a>
          <a href="https://defillama.com/protocol/near-intents" target="_blank" rel="noreferrer">
            DefiLlama: NEAR Intents
          </a>
          <a href="https://docs.near.org/api/rpc/providers" target="_blank" rel="noreferrer">
            NEAR archival RPC
          </a>
          <a href="https://revenue.near.org" target="_blank" rel="noreferrer">
            revenue.near.org
          </a>
        </div>
        <div>
          <h4>Project</h4>
          <a href={REPO} target="_blank" rel="noreferrer">
            Source code
          </a>
          <Link to="/verify">Re-run it</Link>
          <a href="https://testnet.nearblocks.io/address/ledger.nearbreakeven.testnet" target="_blank" rel="noreferrer">
            Ledger contract
          </a>
          <a href={ACCOUNTKIT} target="_blank" rel="noreferrer">
            Also by us: AccountKit
          </a>
        </div>
      </div>
      {results && <p className="footer-asof">Published run uses data through {results.asOf} (UTC).</p>}
    </footer>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <output className="loading">
      <span className="spinner" aria-hidden="true" />
      {label}
    </output>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error" role="alert">
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="btn btn--quiet" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
