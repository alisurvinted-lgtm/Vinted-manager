import { useState } from "react";
import { Check, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import type { Article } from "../lib/model";
import {
  contribution,
  feeTotal,
  money,
  profit,
  rateLabel,
} from "../lib/accounting";
import { deleteArticle, saveArticle } from "../lib/db";
import { ArticleIcon, ErrorMessage, Modal, Status } from "./ui";
export const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
export function ArticleDetail({
  article,
  rate,
  onClose,
  onEdit,
  onSaved,
}: {
  article: Article;
  rate: number;
  onClose: () => void;
  onEdit: (action?: "sell" | "fees") => void;
  onSaved: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sold = article.status === "sold";
  async function action(kind: "delete" | "restock") {
    if (
      !window.confirm(
        kind === "delete"
          ? `Supprimer « ${article.name} » ? Cette suppression est définitive.`
          : "Repasser cet article en stock ? Son prix et sa date de vente seront effacés.",
      )
    )
      return;
    setBusy(true);
    try {
      if (kind === "delete") await deleteArticle(article.id);
      else
        await saveArticle(
          { ...article, status: "stock", saleDate: null, salePrice: null },
          article.id,
        );
      onSaved(
        kind === "delete" ? "Article supprimé." : "Article remis en stock.",
      );
    } catch {
      setError("L’opération a échoué. Vos données n’ont pas été modifiées.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Fiche de l’article" onClose={onClose}>
      <div className="detail-heading">
        <ArticleIcon category={article.category} />
        <div>
          <h3>{article.name}</h3>
          <p>
            {article.genre} · {article.category}
          </p>
        </div>
        <Status sold={sold} />
      </div>
      <dl className="detail-list">
        <div>
          <dt>Date d’achat</dt>
          <dd>{dateLabel(article.purchaseDate)}</dd>
        </div>
        <div>
          <dt>Prix d’achat TTC</dt>
          <dd>{money(article.purchasePrice)}</dd>
        </div>
        {sold && (
          <>
            <div>
              <dt>Date de vente</dt>
              <dd>{dateLabel(article.saleDate!)}</dd>
            </div>
            <div>
              <dt>Prix de vente</dt>
              <dd>{money(article.salePrice!)}</dd>
            </div>
          </>
        )}
        <div className="detail-divider">
          <dt>Frais supplémentaires</dt>
          <dd>{money(feeTotal(article))}</dd>
        </div>
        {article.fees.map((f) => (
          <div className="detail-sub" key={f.id}>
            <dt>{f.type}</dt>
            <dd>{money(f.amount)}</dd>
          </div>
        ))}
        {sold && (
          <div className="detail-divider">
            <dt>Cotisations estimées ({rateLabel(rate)} %)</dt>
            <dd>{money(contribution(article.salePrice!, rate))}</dd>
          </div>
        )}
      </dl>
      {sold && (
        <div className="profit-preview">
          <span>Bénéfice net estimé</span>
          <strong
            className={profit(article, rate) < 0 ? "negative" : "positive"}
          >
            {money(profit(article, rate))}
          </strong>
        </div>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
      <div className="detail-actions">
        {!sold && (
          <button className="button primary" onClick={() => onEdit("sell")}>
            <Check size={18} /> Marquer comme vendu
          </button>
        )}
        <button className="button secondary" onClick={() => onEdit()}>
          <Pencil size={17} /> Modifier l’article
        </button>
        <button className="button secondary" onClick={() => onEdit("fees")}>
          <Plus size={17} /> Ajouter un frais
        </button>
        {sold && (
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => action("restock")}
          >
            <RotateCcw size={17} /> Repasser en stock
          </button>
        )}
        <button
          className="button danger-subtle"
          disabled={busy}
          onClick={() => action("delete")}
        >
          <Trash2 size={17} /> Supprimer l’article
        </button>
      </div>
    </Modal>
  );
}
