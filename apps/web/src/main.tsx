import { hashOf, type Results } from "@nearbreakeven/evidence";
import Lenis from "lenis";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { ErrorNote, Footer, Nav, Spinner, ToastProvider } from "./components/parts";
import { type Latest, loadPublished, useAsync } from "./lib/data";
import { RouterProvider, useRoute } from "./lib/router";
import { Evidence } from "./pages/Evidence";
import { Home } from "./pages/Home";
import { Thesis } from "./pages/Thesis";
import { Verify } from "./pages/Verify";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/app.css";

function useSmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ lerp: 0.12 });
    let raf = 0;
    const loop = (t: number) => {
      lenis.raf(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, []);
}

const TITLES: Record<string, string> = {
  "/": "NEAR Breakeven: when NEAR Intents pays for NEAR",
  "/evidence": "The evidence · NEAR Breakeven",
  "/thesis": "The thesis · NEAR Breakeven",
  "/verify": "Re-run and verify · NEAR Breakeven",
};

function Routes({ latest, results, resultsSha256 }: { latest: Latest; results: Results; resultsSha256: string }) {
  const { path } = useRoute();
  useEffect(() => {
    document.title = TITLES[path] ?? "Not found · NEAR Breakeven";
    if (!window.location.hash) window.scrollTo({ top: 0 });
  }, [path]);
  if (path === "/") return <Home results={results} />;
  if (path === "/evidence") return <Evidence results={results} latest={latest} />;
  if (path === "/thesis") return <Thesis results={results} resultsSha256={resultsSha256} />;
  if (path === "/verify") return <Verify latest={latest} />;
  return (
    <main className="page">
      <div className="wrap prose">
        <h1>No page here</h1>
        <p>
          The thesis lives at <a href="/">the home page</a>.
        </p>
      </div>
    </main>
  );
}

function App() {
  useSmoothScroll();
  const [state, retry] = useAsync(async () => {
    const { latest, results } = await loadPublished();
    return { latest, results, resultsSha256: await hashOf(results) };
  });
  return (
    <>
      <a className="skip" href="#content">
        Skip to content
      </a>
      <Nav />
      <div id="content">
        {state.status === "loading" && (
          <main className="page">
            <div className="wrap">
              <Spinner label="Loading the published run" />
            </div>
          </main>
        )}
        {state.status === "error" && (
          <main className="page">
            <div className="wrap">
              <ErrorNote message={`The published run did not load: ${state.error}`} onRetry={retry} />
            </div>
          </main>
        )}
        {state.status === "ready" && <Routes {...state.data} />}
      </div>
      <Footer results={state.status === "ready" ? state.data.results : undefined} />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </RouterProvider>
  </StrictMode>,
);
