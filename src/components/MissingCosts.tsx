import { useState, type FormEvent } from "react";
import type { Article } from "../lib/model";
import { completePurchasePrice } from "../lib/db";
import { parseMoney } from "../lib/accounting";
import { ErrorMessage } from "./ui";
export function MissingCosts({ articles }: { articles: Article[] }) {
  const missing = articles.filter((a) => a.purchasePrice === null);
  if (!missing.length) return null;
  return (
    <details className="panel missing-costs">
      <summary>{missing.length} prix d’achat à compléter</summary>
      <p>
        Les encaissements sont déjà comptés. Les bénéfices correspondants
        restent indéterminés ; un prix manquant ne vaut jamais zéro.
      </p>
      {missing.slice(0, 20).map((a) => (
        <PurchaseCostForm key={a.id} article={a} />
      ))}
      {missing.length > 20 && (
        <p>
          Les vingt premiers articles sont affichés. Complétez-les pour voir la
          suite.
        </p>
      )}
    </details>
  );
}
export function PurchaseCostForm({
  article,
  onSaved,
}: {
  article: Article;
  onSaved?: () => void;
}) {
  const [value, setValue] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await completePurchasePrice(article.id, parseMoney(value));
      onSaved?.();
    } catch {
      setError(
        "Enregistrement impossible. Vérifiez le montant et rechargez la fiche si ce prix a déjà été complété.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="missing-cost-row" onSubmit={submit}>
      <strong>{article.name}</strong>
      <span>
        {article.status === "sold"
          ? `Vente ${article.saleDate ?? ""}`
          : "Stock"}
        {article.archived ? " · historique conservé" : ""}
      </span>
      <div>
        <label>
          <span className="sr-only">Coût TTC de {article.name}</span>
          <input
            aria-label={`Coût TTC de ${article.name}`}
            inputMode="decimal"
            required
            placeholder="Achat TTC (€)"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={busy}
          />
        </label>
        <button className="button secondary" disabled={busy}>
          {busy ? "…" : "Compléter"}
        </button>
      </div>
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </form>
  );
}
