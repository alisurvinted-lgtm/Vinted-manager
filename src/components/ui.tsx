import { useEffect, useRef, type ReactNode } from "react";
import { ArrowUpRight, Plus, Shirt, X } from "lucide-react";
import type { Article } from "../lib/model";
import { money, profit, amountClass } from "../lib/accounting";

export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
  closeDisabled = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  closeDisabled?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = previous;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "modal-wide" : ""}`}
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!closeDisabled) onClose();
      }}
      onClick={(e) => {
        if (!closeDisabled && e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-header">
        <div>
          <h2 id="modal-title">{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button
          className="icon-button"
          aria-label="Fermer"
          onClick={onClose}
          disabled={closeDisabled}
        >
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function AddButton({
  onClick,
  compact = false,
}: {
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      className={`button primary add-button ${compact ? "compact" : ""}`}
      onClick={onClick}
    >
      <Plus size={19} />
      <span>Ajouter un article</span>
    </button>
  );
}
export function EmptyState({
  title,
  text,
  onAdd,
  small = false,
}: {
  title: string;
  text: string;
  onAdd?: () => void;
  small?: boolean;
}) {
  return (
    <div className={`empty-state ${small ? "small" : ""}`}>
      <div className="empty-icon">
        <Shirt size={small ? 25 : 31} strokeWidth={1.4} />
        <span>
          <Plus size={12} />
        </span>
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {onAdd && (
        <button className="button secondary" onClick={onAdd}>
          <Plus size={16} /> Ajouter un article
        </button>
      )}
    </div>
  );
}
export function Status({ sold }: { sold: boolean }) {
  return (
    <span className={`status ${sold ? "sold" : ""}`}>
      <i />
      {sold ? "Vendu" : "En stock"}
    </span>
  );
}
export function ArticleIcon({ category }: { category: string }) {
  return (
    <span
      className={`article-icon tone-${["Jean", "Pantalon", "Short"].includes(category) ? "blue" : ["Sac", "Accessoires", "Chaussures", "Baskets"].includes(category) ? "sand" : "green"}`}
    >
      <Shirt size={23} strokeWidth={1.5} />
    </span>
  );
}
export function ArticleRow({
  article,
  rate,
  onClick,
}: {
  article: Article;
  rate: number;
  onClick: () => void;
}) {
  return (
    <button className="article-row" onClick={onClick}>
      <ArticleIcon category={article.category} />
      <span className="article-info">
        <strong>{article.name}</strong>
        <span>
          {article.genre} <span className="dot">·</span> {article.category}
        </span>
        {article.status === "sold" && (
          <span className="article-purchase">
            Achat TTC : {money(article.purchasePrice)}
          </span>
        )}
      </span>
      <span className="article-prices">
        <strong>
          {money(
            article.status === "sold"
              ? article.salePrice!
              : article.purchasePrice,
          )}
        </strong>
        <span
          className={
            article.status === "sold" ? amountClass(profit(article, rate)) : ""
          }
        >
          {article.status === "sold"
            ? article.purchasePrice === null
              ? "Bénéfice à compléter"
              : `${money(profit(article, rate))} de bénéfice`
            : "Achat TTC"}
        </span>
      </span>
      <Status sold={article.status === "sold"} />
      <ArrowUpRight size={17} className="row-arrow" />
    </button>
  );
}
export function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <p className="error-message" role="alert">
      {children}
    </p>
  );
}
