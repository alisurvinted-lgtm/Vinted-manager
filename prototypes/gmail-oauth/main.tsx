import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import config from "./config.json";
import { createProbe, isApproved, messages, type ProbeState } from "./session";
import { checkAccess, loadGoogle } from "./google";
import { readPreview } from "./preview";
import { PreviewPanel } from "./PreviewPanel";
import { currentMailMonth, type PreviewBatch } from "./preview-model";
import "./style.css";
function Prototype() {
  const [preview, setPreview] = useState<PreviewBatch | null>(null);
  const [month, setMonth] = useState(currentMailMonth());
  const [accepted, setAccepted] = useState(false);
  const [state, setState] = useState<ProbeState>();
  const [probe] = useState(() =>
    createProbe(config, {
      origin: location.origin,
      secure: isSecureContext,
      loadGoogle,
      checkAccess,
      notify: setState,
      readPreview,
      notifyPreview(batch, append) {
        setPreview((previous) =>
          batch && append && previous?.month === batch.month
            ? {
                ...batch,
                rows: [...previous.rows, ...batch.rows],
                examined: previous.examined + batch.examined,
                ignored: previous.ignored + batch.ignored,
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
    location.origin === config.expectedOrigin;
  useEffect(() => {
    const close = () => {
      probe.disconnect();
      setAccepted(false);
    };
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) close();
    };
    window.addEventListener("pagehide", close);
    window.addEventListener("pageshow", restore);
    return () => {
      window.removeEventListener("pagehide", close);
      window.removeEventListener("pageshow", restore);
      probe.disconnect();
    };
  }, [probe]);
  const standalone =
    matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return (
    <main>
      <p className="eyebrow">VINTED MANAGER · APERÇU PERSONNEL</p>
      <h1>Tester la connexion Gmail</h1>
      <p>
        Phase 2 : consultez vos notifications Vinted et préparez un aperçu à
        vérifier. Rien n’est enregistré et votre comptabilité reste inchangée.
      </p>
      <p className="mode">
        Mode d’ouverture : {standalone ? "application installée" : "navigateur"}
      </p>
      <p className="notice" role="status" aria-live="polite">
        {messages[current.notice]}
      </p>
      <label className="consent">
        <input
          type="checkbox"
          checked={accepted}
          disabled={!allowed || current.busy || current.connected}
          onChange={(e) => setAccepted(e.target.checked)}
        />
        <span>
          J’accepte l’accès Google en lecture seule à ma boîte et la lecture
          locale de mes notifications Vinted, uniquement à ma demande. Rien
          n’est conservé après fermeture.
        </span>
      </label>
      <div className="actions">
        <button
          disabled={!allowed || !accepted || current.busy || current.ready}
          onClick={() => void probe.prepare(accepted)}
        >
          Préparer le test
        </button>
        <button
          disabled={
            !allowed ||
            !accepted ||
            !current.ready ||
            current.busy ||
            current.connected
          }
          onClick={() => probe.connect(accepted)}
        >
          Se connecter à Google
        </button>
        <button
          disabled={!current.connected || current.busy}
          onClick={() => void probe.check()}
        >
          Vérifier l’accès Gmail
        </button>
        <button
          disabled={!allowed || (!current.connected && !current.busy)}
          onClick={() => {
            probe.disconnect();
            setAccepted(false);
          }}
        >
          Déconnecter ce test
        </button>
        <button
          disabled={!current.connected || current.busy}
          onClick={() => probe.revoke()}
        >
          Révoquer l’accès Google
        </button>
      </div>
      <section className="search-preview" aria-labelledby="search-title">
        <h2 id="search-title">Repérer mes notifications Vinted</h2>
        <p>
          Lecture limitée à @vinted.fr, hors spam et corbeille. Le contenu est
          chargé seulement si l’authentification de l’expéditeur est confirmée.
        </p>
        <label>
          Mois de réception des e-mails
          <input
            type="month"
            aria-label="Mois des notifications"
            min="2004-01"
            max={currentMailMonth()}
            value={month}
            disabled={current.busy}
            onChange={(e) => setMonth(e.target.value)}
          />
        </label>
        <button
          disabled={
            !current.connected ||
            current.busy ||
            !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
            month < "2004-01" ||
            month > currentMailMonth()
          }
          onClick={() => void probe.preview(month)}
        >
          Rechercher les notifications Vinted
        </button>
        <p className="preview-note">
          20 messages par lot, 200 au maximum. Une nouvelle recherche remplace
          uniquement l’aperçu temporaire. Les types, dates et prix manquants
          sont à compléter ; rien n’entre dans vos statistiques.
        </p>
      </section>
      {preview && (
        <PreviewPanel
          batch={preview}
          busy={current.busy}
          onMore={() => void probe.preview(preview.month, true)}
          onClear={() => probe.forgetPreview()}
          onChange={(row) =>
            setPreview((batch) =>
              batch
                ? {
                    ...batch,
                    rows: batch.rows.map((item) =>
                      item.id === row.id ? row : item,
                    ),
                  }
                : null,
            )
          }
        />
      )}
      <p>
        La déconnexion efface l’accès temporaire de ce test. La révocation
        retire aussi l’autorisation chez Google ; elle doit être confirmée par
        Google.
      </p>
      <a
        href="https://myaccount.google.com/connections"
        target="_blank"
        rel="noopener noreferrer"
      >
        Gérer ou retirer l’autorisation dans mon compte Google
      </a>
      <p className="footnote">
        La fenêtre Google s’ouvre uniquement depuis le bouton de connexion,
        après préparation. Les données de comptabilité restent disponibles dans
        votre application habituelle, sans changement.
      </p>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Prototype />);
