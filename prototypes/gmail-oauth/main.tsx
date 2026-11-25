import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import config from "./config.json";
import { createProbe, isApproved, messages, type ProbeState } from "./session";
import { loadGoogle, checkAccess } from "./google";
import { readPreview } from "./preview";
import { currentMailMonth, type PreviewBatch } from "./preview-model";
import { proposalSelection } from "./transfer";
import { sourceKey } from "./identifiers";
import "./style.css";
type Context = {
  nonce: string;
  knownSourceKeys: string[];
  progress: { period: string; pageToken: string | null }[];
};
function Reader() {
  const [accepted, setAccepted] = useState(false),
    [state, setState] = useState<ProbeState>(),
    [month, setMonth] = useState(currentMailMonth()),
    [historical, setHistorical] = useState(false),
    [context, setContext] = useState<Context | null>(null),
    [preview, setPreview] = useState<PreviewBatch | null>(null),
    [running, setRunning] = useState(false),
    [interrupted, setInterrupted] = useState(false),
    [rawText, setRawText] = useState("");
  const contextRef = useRef(context),
    historicalRef = useRef(historical),
    previewRef = useRef(preview),
    monthRef = useRef(month),
    pending = useRef(false),
    scan = useRef(0),
    mailText = useRef(new Map<string, string>()),
    root = useRef<HTMLElement>(null);
  contextRef.current = context;
  historicalRef.current = historical;
  previewRef.current = preview;
  monthRef.current = month;
  const [probe] = useState(() =>
    createProbe(config, {
      origin: location.origin,
      secure: isSecureContext,
      loadGoogle,
      checkAccess,
      notify: setState,
      readPreview,
      previewContext: () => {
        const ctx = contextRef.current;
        const p = !historicalRef.current
          ? ctx?.progress.find((p) => p.period === monthRef.current)
          : undefined;
        return {
          knownSourceKeys: ctx?.knownSourceKeys,
          pageToken: p?.pageToken ?? undefined,
          period: p?.period,
        };
      },
      notifyPreview(batch, append) {
        setPreview((previous) =>
          batch && append && previous?.month === batch.month
            ? {
                ...batch,
                rows: [...previous.rows, ...batch.rows],
                examined: previous.examined + batch.examined,
                ignored: previous.ignored + batch.ignored,
                alreadyKnown:
                  (previous.alreadyKnown ?? 0) + (batch.alreadyKnown ?? 0),
              }
            : batch,
        );
      },
    }),
  );
  const current = state ?? probe.snapshot();
  const allowed =
    isApproved(config) &&
    isSecureContext &&
    location.origin === config.expectedOrigin &&
    !!context;
  const send = (data: Record<string, unknown>) => {
    const ctx = contextRef.current;
    if (ctx && window.parent !== window)
      window.parent.postMessage(
        { ...data, nonce: ctx.nonce, version: 2 },
        config.expectedOrigin,
      );
  };
  async function synchronize() {
    if (running || !contextRef.current) return;
    const attempt = ++scan.current;
    setRunning(true);
    setInterrupted(false);
    setRawText("");
    mailText.current.clear();
    try {
      let append = false;
      for (let page = 0; page < 10; page++) {
        const batch = await probe.preview(monthRef.current, append);
        if (attempt !== scan.current) return;
        if (!batch) {
          setInterrupted(true);
          return;
        }
        if (!batch.nextPageToken || batch.limited) break;
        append = true;
      }
    } finally {
      if (attempt === scan.current) setRunning(false);
    }
  }
  async function start() {
    if (!allowed || !accepted || current.busy || running) return;
    if (!current.ready) {
      await probe.prepare(true);
      return;
    }
    if (!current.connected) {
      pending.current = true;
      probe.connect(true);
    } else void synchronize();
  }
  useEffect(() => {
    if (current.notice === "connected" && pending.current) {
      pending.current = false;
      void synchronize();
    }
    if (
      [
        "failed",
        "denied",
        "popup",
        "scope",
        "expired",
        "disconnected",
        "revoked",
        "revokeFailed",
        "revoking",
        "previewFailed",
      ].includes(current.notice)
    ) {
      pending.current = false;
      scan.current++;
      setRunning(false);
      setPreview(null);
      setRawText("");
      mailText.current.clear();
    }
    send({
      type: "vm:gmail-authorization",
      active: current.notice === "authorizing",
    });
  }, [current.notice]);
  useEffect(() => {
    const close = () => {
      scan.current++;
      pending.current = false;
      probe.disconnect();
      setPreview(null);
      setContext(null);
      setAccepted(false);
      setRawText("");
      mailText.current.clear();
    };
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== config.expectedOrigin ||
        event.source !== window.parent ||
        window.parent === window
      )
        return;
      const d = event.data;
      if (!d || typeof d !== "object" || d.version !== 2) return;
      if (
        d.type === "vm:gmail-session" &&
        typeof d.nonce === "string" &&
        /^[a-f0-9-]{36}$/.test(d.nonce) &&
        Array.isArray(d.knownSourceKeys) &&
        d.knownSourceKeys.length <= 10000 &&
        d.knownSourceKeys.every(
          (v: unknown) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v),
        ) &&
        Array.isArray(d.progress) &&
        d.progress.length <= 600
      ) {
        const valid = d.progress.every(
          (p: unknown) =>
            p &&
            typeof p === "object" &&
            typeof (p as { period?: unknown }).period === "string" &&
            ((p as { pageToken?: unknown }).pageToken === null ||
              typeof (p as { pageToken?: unknown }).pageToken === "string"),
        );
        if (valid)
          setContext({
            nonce: d.nonce,
            knownSourceKeys: d.knownSourceKeys,
            progress: d.progress,
          });
      } else if (
        d.nonce === contextRef.current?.nonce &&
        d.type === "vm:gmail-detail" &&
        typeof d.sourceKey === "string"
      )
        setRawText(
          mailText.current.get(d.sourceKey) ??
            "Le texte de cette notification n’est plus en mémoire. Consultez Gmail si nécessaire.",
        );
      else if (
        d.nonce === contextRef.current?.nonce &&
        d.type === "vm:gmail-close-detail"
      )
        setRawText("");
      else if (
        d.nonce === contextRef.current?.nonce &&
        d.type === "vm:gmail-lock"
      )
        close();
    };
    window.addEventListener("message", receive);
    window.addEventListener("pagehide", close);
    const restore = (e: PageTransitionEvent) => {
      if (e.persisted) close();
    };
    window.addEventListener("pageshow", restore);
    Object.defineProperty(window, "closeVintedGmail", {
      value: close,
      configurable: true,
    });
    if (window.parent !== window) {
      document.body.classList.add("embedded");
      window.parent.postMessage(
        { type: "vm:gmail-hello", version: 2 },
        config.expectedOrigin,
      );
    }
    return () => {
      close();
      window.removeEventListener("message", receive);
      window.removeEventListener("pagehide", close);
      window.removeEventListener("pageshow", restore);
      Reflect.deleteProperty(window, "closeVintedGmail");
    };
  }, [probe]);
  useEffect(() => {
    let alive = true;
    if (!preview) {
      send({ type: "vm:gmail-clear" });
      return;
    }
    void (async () => {
      const items = await proposalSelection(preview.rows);
      if (!alive || previewRef.current !== preview) return;
      for (const row of preview.rows) {
        if (row.authenticated)
          mailText.current.set(await sourceKey(row.id), row.text);
      }
      if (!alive) return;
      send({
        type: "vm:gmail-proposals",
        items,
        stats: {
          period: preview.month,
          examined: preview.examined,
          known: preview.alreadyKnown ?? 0,
          ignored: preview.ignored,
          unverified: preview.rows.filter((r) => !r.authenticated).length,
          complete: preview.complete === true && !running && !interrupted,
          nextPageToken: preview.nextPageToken,
          limited: preview.limited,
          running,
          interrupted,
        },
      });
    })().catch(() => {
      if (alive) {
        setInterrupted(true);
        send({ type: "vm:gmail-analysis-error" });
      }
    });
    return () => {
      alive = false;
    };
  }, [preview, running, interrupted, context?.nonce]);
  useEffect(() => {
    if (!context) return;
    const element = root.current!;
    const post = () =>
      send({
        type: "vm:gmail-height",
        height: Math.min(
          20000,
          Math.max(180, Math.ceil(element.getBoundingClientRect().height) + 16),
        ),
      });
    const observer = new ResizeObserver(post);
    observer.observe(element);
    post();
    const activity = (e: Event) => {
      if (e.isTrusted) send({ type: "vm:gmail-activity" });
    };
    for (const name of ["pointerdown", "keydown", "touchstart"])
      window.addEventListener(name, activity, { passive: true });
    return () => {
      observer.disconnect();
      for (const name of ["pointerdown", "keydown", "touchstart"])
        window.removeEventListener(name, activity);
    };
  }, [context?.nonce]);
  const standby = !context && window.parent === window;
  return (
    <main ref={root} className="sync-reader">
      <h1>Synchroniser Gmail</h1>
      {standby ? (
        <>
          <p>
            Ouvrez votre application Vinted Manager habituelle et déverrouillez
            votre espace pour synchroniser.
          </p>
          <a href="/Vinted-manager/" target="_top">
            Ouvrir Vinted Manager
          </a>
        </>
      ) : (
        <>
          <label className="reader-consent">
            <input
              type="checkbox"
              checked={accepted}
              disabled={
                !allowed || current.busy || running || current.connected
              }
              onChange={(e) => {
                setAccepted(e.target.checked);
                if (e.target.checked) void probe.prepare(true);
              }}
            />
            <span>
              J’autorise la lecture des notifications Vinted. L’autorisation
              Google couvre techniquement toute ma boîte ; le traitement reste
              local.
            </span>
          </label>
          <div className="reader-controls">
            <label>
              Période
              <input
                type="month"
                aria-label="Mois des notifications"
                min="2004-01"
                max={currentMailMonth()}
                value={month}
                disabled={current.busy || running}
                onChange={(e) => setMonth(e.target.value)}
              />
            </label>
            <label>
              Recherche
              <select
                aria-label="Mode de synchronisation"
                value={historical ? "historical" : "incremental"}
                disabled={current.busy || running}
                onChange={(e) => setHistorical(e.target.value === "historical")}
              >
                <option value="incremental">Nouveaux messages / reprise</option>
                <option value="historical">
                  Historique depuis le début du mois
                </option>
              </select>
            </label>
          </div>
          <button
            disabled={
              !allowed ||
              !accepted ||
              current.busy ||
              running ||
              !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
              month < "2004-01" ||
              month > currentMailMonth()
            }
            onClick={() => void start()}
          >
            {running
              ? "Analyse locale en cours…"
              : !current.ready
                ? "Préparer la connexion"
                : "Synchroniser Gmail"}
          </button>
          <p className="reader-status" role="status">
            {running
              ? "Lecture paginée des notifications Vinted…"
              : interrupted
                ? "Synchronisation interrompue. Aucun lot incomplet n’est annoncé comme terminé. Reconnectez-vous puis relancez."
                : preview?.limited
                  ? "Lot plafonné à 200 messages. Validez ce lot ; la prochaine synchronisation reprendra la suite."
                  : preview?.complete
                    ? "Période entièrement parcourue. Vérifiez le résumé avant validation."
                    : messages[current.notice]}
          </p>
          {preview && (
            <p className="reader-counts">
              {preview.examined} messages examinés · {preview.alreadyKnown ?? 0}{" "}
              déjà connus · {preview.ignored} notifications écartées
            </p>
          )}
          <details className="reader-access">
            <summary>Connexion et révocation</summary>
            <div className="actions">
              <button
                disabled={!current.connected || current.busy}
                onClick={() => void probe.check()}
              >
                Vérifier l’accès Gmail
              </button>
              <button
                disabled={!current.connected && !current.busy}
                onClick={() => {
                  probe.disconnect();
                  setAccepted(false);
                }}
              >
                Déconnecter
              </button>
              <button
                disabled={!current.connected || current.busy}
                onClick={() => probe.revoke()}
              >
                Révoquer l’accès Google
              </button>
            </div>
            <a
              href="https://myaccount.google.com/connections"
              target="_blank"
              rel="noopener noreferrer"
            >
              Gérer les autorisations dans Google
            </a>
            <p>
              La déconnexion abandonne le jeton local ; la révocation retire
              aussi l’autorisation chez Google.
            </p>
          </details>
          {rawText && (
            <section className="reader-message">
              <button onClick={() => setRawText("")}>
                Masquer le texte du message
              </button>
              <pre>{rawText}</pre>
              <p>
                Texte uniquement, sans image distante ni contenu exécutable.
              </p>
            </section>
          )}
        </>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Reader />);
