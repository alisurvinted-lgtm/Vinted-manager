import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import config from "./config.json";
import { createProbe, isApproved, messages, type ProbeState } from "./session";
import { checkAccess, loadGoogle } from "./google";
import "./style.css";
function Prototype() {
  const [accepted, setAccepted] = useState(false);
  const [state, setState] = useState<ProbeState>();
  const [probe] = useState(() =>
    createProbe(config, {
      origin: location.origin,
      secure: isSecureContext,
      loadGoogle,
      checkAccess,
      notify: setState,
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
    window.addEventListener("pagehide", close);
    return () => {
      window.removeEventListener("pagehide", close);
      probe.disconnect();
    };
  }, [probe]);
  const standalone =
    matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return (
    <main>
      <p className="eyebrow">VINTED MANAGER · TEST PERSONNEL</p>
      <h1>Tester la connexion Gmail</h1>
      <p>
        Ce prototype ne lit aucun e-mail, n’importe aucune transaction et ne
        consulte pas votre comptabilité.
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
          J’accepte de demander à Google la lecture de toute ma boîte Gmail pour
          ce test. Aucun message ne sera consulté.
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
