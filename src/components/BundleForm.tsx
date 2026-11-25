import { useState, type FormEvent } from "react";
import type { Article } from "../lib/model";
import { splitBundle } from "../lib/bundles";
import { money, parseMoney } from "../lib/accounting";
import { ErrorMessage, Modal } from "./ui";
export function BundleForm({
  article,
  onClose,
  onSaved,
}: {
  article: Article;
  onClose: () => void;
  onSaved: () => void;
}) {
  const boost = article.fees
      .filter((f) => f.type === "Boost Vinted")
      .reduce((s, f) => s + f.amount, 0),
    cleaning = article.fees
      .filter((f) => f.type === "Nettoyage")
      .reduce((s, f) => s + f.amount, 0);
  const [parts, setParts] = useState(() =>
    Array.from(
      {
        length: Math.max(
          2,
          article.quantity ?? article.bundleItems?.length ?? 2,
        ),
      },
      (_, index) => ({
        name: article.bundleItems?.[index]?.name ?? "",
        cost: "",
        boost: "",
        cleaning: "",
      }),
    ),
  );
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (
      !window.confirm(
        "Confirmer cette répartition ? Le coût total et les frais du lot seront conservés, sans nouvelle dépense d’achat.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await splitBundle(
        article.id,
        parts.map((p) => ({
          name: p.name,
          cost: parseMoney(p.cost),
          boost: boost ? parseMoney(p.boost) : 0,
          cleaning: cleaning ? parseMoney(p.cleaning) : 0,
        })),
        article.updatedAt,
      );
      onSaved();
    } catch {
      setError(
        "La répartition est refusée. Les sommes doivent correspondre exactement au coût et aux frais du lot ; aucune donnée n’a été modifiée.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Répartir le coût du lot"
      subtitle={article.name}
      onClose={onClose}
      closeDisabled={busy}
    >
      <p>
        Coût total à répartir : <strong>{money(article.purchasePrice)}</strong>.
        Aucun prix individuel n’est calculé automatiquement.
      </p>
      {article.purchasePrice === null ? (
        <ErrorMessage>
          Complétez d’abord le coût total du lot dans la fiche de l’article.
        </ErrorMessage>
      ) : (
        <form onSubmit={submit}>
          {parts.map((p, index) => (
            <fieldset className="bundle-part" key={index}>
              <legend>Article {index + 1}</legend>
              {(
                [
                  ["name", "Nom"],
                  ["cost", "Coût TTC (€)"],
                  ...(boost ? [["boost", "Boost à attribuer (€)"]] : []),
                  ...(cleaning
                    ? [["cleaning", "Nettoyage à attribuer (€)"]]
                    : []),
                ] as [keyof typeof p, string][]
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    aria-label={`${label} ${index + 1}`}
                    required
                    maxLength={key === "name" ? 120 : 14}
                    inputMode={key === "name" ? "text" : "decimal"}
                    value={p[key]}
                    disabled={busy}
                    onChange={(e) =>
                      setParts((all) =>
                        all.map((v, i) =>
                          i === index ? { ...v, [key]: e.target.value } : v,
                        ),
                      )
                    }
                  />
                </label>
              ))}
            </fieldset>
          ))}
          <p className="field-help">
            Boost à répartir : {money(boost)} · Nettoyage : {money(cleaning)}.
            Les dates d’achat restent celles du lot.
          </p>
          {error && <ErrorMessage>{error}</ErrorMessage>}
          <button className="button primary" disabled={busy}>
            {busy ? "Enregistrement…" : "Confirmer la répartition"}
          </button>
        </form>
      )}
    </Modal>
  );
}
