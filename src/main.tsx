import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type InstallStatus = {
  ready: boolean;
  resources: { d1: boolean; kv: boolean; r2: boolean };
  signingKey: { configured: boolean; source: string };
};

function App() {
  const [status, setStatus] = useState<InstallStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function check() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/v1/install/status", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Installation check failed.");
      setStatus(payload.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Installation check failed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void check(); }, []);

  const title = window.location.pathname.startsWith("/install")
    ? "Install DevOne License Server."
    : "Your license server is ready.";

  return (
    <div className="app">
      <header>
        <div className="brand">
          <b>D</b>
          <div><strong>DevOne</strong><span>License Server</span></div>
        </div>
        <small>● Cloudflare deployment</small>
      </header>
      <main>
        <p className="eyebrow">DEVONE CMS 2.0 · PHASE 5</p>
        <h1>{title}</h1>
        <p className="lead">
          Deploy once, then use this installer to verify the Cloudflare resources and initialize
          the server-side signing key. No D1, KV, or R2 IDs are entered in the browser.
        </p>
        <div className="panel">
          <div className="panel-head">
            <div><span className="step">INSTALLATION CHECK</span><h2>Infrastructure</h2></div>
            <button onClick={() => void check()} disabled={loading}>{loading ? "Checking…" : "Run check"}</button>
          </div>
          {error && <div className="error">{error}</div>}
          <div className="checks">
            {status && Object.entries(status.resources).map(([name, ready]) => (
              <div className="check" key={name}>
                <span className={ready ? "dot ok" : "dot"} />
                <div><strong>{name.toUpperCase()}</strong><small>{ready ? "Available" : "Not available yet"}</small></div>
              </div>
            ))}
            {status && <div className="check"><span className="dot ok" /><div><strong>SIGNING KEY</strong><small>{status.signingKey.source}</small></div></div>}
          </div>
          {status && (
            <div className={status.ready ? "ready" : "not-ready"}>
              <strong>{status.ready ? "Installation foundation complete" : "Waiting for deployment resources"}</strong>
              <p>{status.ready
                ? "D1 migrations, KV, R2, and the server-side signing key are available. The license authority is ready for the next admin phase."
                : "The Worker is online, but one or more resources or migrations are not ready. Check the deployment workflow and run this check again."}</p>
            </div>
          )}
        </div>
        <section>
          <article><i>01</i><h3>Deploy</h3><p>Wrangler provisions the declared D1, KV, and R2 bindings automatically during deployment.</p></article>
          <article><i>02</i><h3>Initialize</h3><p>The installer verifies migrations and creates the persistent server-side signing key when one is not supplied as a Worker secret.</p></article>
          <article><i>03</i><h3>Continue</h3><p>Phase 5.1 will add the authenticated administrator UI for issuing, revoking, and inspecting licenses.</p></article>
        </section>
      </main>
      <footer>Developer One — Build. Manage. Evolve.</footer>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
