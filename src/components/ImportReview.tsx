import { useState } from "react";
import type { ImportRecord } from "../../protocols/gmail-transfer";
import { resolveReview } from "../lib/gmail-import";
import { money } from "../lib/accounting";
import { ErrorMessage } from "./ui";
const labels = {
  incomplete: "Transaction incomplète",
  sale_announced: "Vente annoncée",
  sale_final: "Vente finalisée",
  purchase: "Achat confirmé",
  purchase_final: "Achat finalisé",
  cancellation: "Annulation",
  refund: "Remboursement",
};
export function ImportReview({
  records,
  onReview,
}: {
  records: ImportRecord[];
  onReview: (id: string) => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!records.length) return null;
  return (
    <section className="panel import-review">
      <h2>{records.length} notification(s) à vérifier</h2>
      <p>
        Ces notifications n’affectent ni le chiffre d’affaires ni le stock. Pour
        une annulation ou un remboursement, utilisez l’examen dédié avant de
        confirmer la correction. Classer une notification ne change aucun
        montant.
      </p>
      {records.slice(0, 20).map((r) => (
        <div className="gmail-review-card" key={r.id}>
          <strong>{r.name}</strong>
          {
            <button className="text-button" onClick={() => onReview(r.id)}>
              Compléter / examiner
            </button>
          }
          <p>
            {labels[r.kind]} · {r.date ?? "Date inconnue"} ·{" "}
            {r.amount === null ? "Montant inconnu" : money(r.amount)}
          </p>
          <button
            className="button secondary"
            disabled={busy}
            onClick={async () => {
              if (
                !window.confirm(
                  "Classer cette notification comme vérifiée, sans changer les articles ni les chiffres ?",
                )
              )
                return;
              setBusy(true);
              setError("");
              try {
                await resolveReview(r.id);
              } catch {
                setError(
                  "Impossible de classer cette notification. Réessayez.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Classer sans effet comptable
          </button>
        </div>
      ))}
      {records.length > 20 && (
        <p>
          Les 20 premières notifications sont affichées. Classez-les pour voir
          la suite.
        </p>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </section>
  );
}
