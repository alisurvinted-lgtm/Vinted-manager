import { useState, type FormEvent } from "react";
import { ArrowRight, Check, Plus, Trash2 } from "lucide-react";
import {
  CATEGORIES,
  FEE_TYPES,
  GENRES,
  today,
  type Article,
  type ArticleInput,
  type Fee,
} from "../lib/model";
import {
  contribution,
  editMoney,
  money,
  parseMoney,
  profit,
} from "../lib/accounting";
import { saveArticle } from "../lib/db";
import { errorMessage } from "../lib/errors";
import { ErrorMessage, Modal } from "./ui";

export function ArticleForm({
  article,
  sell,
  focusFees,
  rate,
  onClose,
  onSaved,
}: {
  article?: Article;
  sell?: boolean;
  focusFees?: boolean;
  rate: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(article?.name ?? "");
  const [genre, setGenre] = useState<ArticleInput["genre"]>(
    article?.genre ?? "Unisexe",
  );
  const [category, setCategory] = useState<ArticleInput["category"]>(
    article?.category ?? "Sweat / Hoodie",
  );
  const [purchaseDate, setPurchaseDate] = useState(
    article ? (article.purchaseDate ?? "") : today(),
  );
  const [purchase, setPurchase] = useState(
    article ? editMoney(article.purchasePrice) : "",
  );
  const [sold, setSold] = useState(sell || article?.status === "sold");
  const [sale, setSale] = useState(
    article?.salePrice != null ? editMoney(article.salePrice) : "",
  );
  const [saleDate, setSaleDate] = useState(article?.saleDate ?? today());
  const [fees, setFees] = useState<
    { id: string; type: Fee["type"]; amount: string }[]
  >(article?.fees.map((f) => ({ ...f, amount: editMoney(f.amount) })) ?? []);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  function close() {
    if (!dirty || window.confirm("Fermer sans enregistrer les modifications ?"))
      onClose();
  }
  function input(): ArticleInput {
    return {
      name: name.trim(),
      genre,
      category,
      purchaseDate: purchaseDate || null,
      purchasePrice: purchase === "" && article ? null : parseMoney(purchase),
      status: sold ? "sold" : "stock",
      salePrice: sold ? parseMoney(sale) : null,
      saleDate: sold ? saleDate : null,
      fees: fees.map((f) => ({ ...f, amount: parseMoney(f.amount) })),
    };
  }
  let estimated: number | null = null;
  try {
    if (sold && sale && purchase)
      estimated = profit(
        { ...input(), id: "", createdAt: "", updatedAt: "" },
        rate,
      );
  } catch {
    /* Le formulaire reste éditable tant que les montants sont incomplets. */
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await saveArticle(input(), article?.id);
      onSaved();
    } catch (e) {
      setError(errorMessage(e, "Impossible d’enregistrer. Réessayez."));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      title={
        article
          ? sell
            ? "Marquer comme vendu"
            : "Modifier l’article"
          : "Un nouvel article"
      }
      subtitle={
        article ? article.name : "Quelques informations, et le tour est joué."
      }
      onClose={close}
    >
      <form
        onSubmit={submit}
        onChange={() => setDirty(true)}
        className="article-form"
      >
        <label>
          Nom de l’article
          <input
            autoFocus={!sell && !focusFees}
            name="name"
            maxLength={120}
            required
            value={name}
            placeholder="Ex. Sweat Carhartt bordeaux"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="form-grid">
          <label>
            Genre
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value as typeof genre)}
            >
              {GENRES.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <label>
            Catégorie
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as typeof category)}
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-grid">
          <label>
            Date d’achat
            <input
              type="date"
              required={!article || article.purchaseDate !== null}
              min="1900-01-01"
              max="9999-12-31"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
            />
          </label>
          <label>
            Prix d’achat TTC
            <MoneyInput
              label="Prix d’achat TTC"
              name="purchasePrice"
              value={purchase}
              onChange={setPurchase}
              required={!article || article.purchasePrice !== null}
            />
          </label>
        </div>
        <p className="field-help">
          Le total payé, frais de port et protection acheteur inclus.
        </p>
        <fieldset className="status-field">
          <legend>Statut de l’article</legend>
          <div className="segmented">
            <button
              type="button"
              aria-pressed={!sold}
              className={!sold ? "active" : ""}
              onClick={() => {
                setSold(false);
                setDirty(true);
              }}
            >
              En stock
            </button>
            <button
              type="button"
              aria-pressed={sold}
              className={sold ? "active" : ""}
              onClick={() => {
                setSold(true);
                setDirty(true);
              }}
            >
              <Check size={15} /> Vendu
            </button>
          </div>
        </fieldset>
        {sold && (
          <div className="sale-fields">
            <div className="form-grid">
              <label>
                Prix de vente
                <MoneyInput
                  label="Prix de vente"
                  name="salePrice"
                  value={sale}
                  onChange={setSale}
                  required
                  autoFocus={sell}
                />
              </label>
              <label>
                Date de vente
                <input
                  type="date"
                  required
                  min={purchaseDate || "1900-01-01"}
                  max="9999-12-31"
                  value={saleDate}
                  onChange={(e) => setSaleDate(e.target.value)}
                />
              </label>
            </div>
          </div>
        )}
        <div className="fees-heading">
          <div>
            <h3>Frais supplémentaires</h3>
            <p>Facultatif, à ajouter si besoin.</p>
          </div>
          <button
            type="button"
            className="text-button"
            autoFocus={focusFees}
            disabled={fees.length >= 100}
            onClick={() => {
              setFees([
                ...fees,
                { id: crypto.randomUUID(), type: "Boost Vinted", amount: "" },
              ]);
              setDirty(true);
            }}
          >
            <Plus size={16} /> Ajouter un frais
          </button>
        </div>
        {fees.map((fee, index) => (
          <div className="fee-row" key={fee.id}>
            <select
              aria-label={`Type du frais ${index + 1}`}
              value={fee.type}
              onChange={(e) =>
                setFees(
                  fees.map((f) =>
                    f.id === fee.id
                      ? { ...f, type: e.target.value as Fee["type"] }
                      : f,
                  ),
                )
              }
            >
              {FEE_TYPES.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
            <MoneyInput
              name={`fee-${index}`}
              label={`Montant du frais ${index + 1}`}
              value={fee.amount}
              required
              onChange={(amount) =>
                setFees(
                  fees.map((f) => (f.id === fee.id ? { ...f, amount } : f)),
                )
              }
            />
            <button
              type="button"
              className="icon-button"
              aria-label={`Supprimer le frais ${index + 1}`}
              onClick={() => {
                setFees(fees.filter((f) => f.id !== fee.id));
                setDirty(true);
              }}
            >
              <Trash2 size={17} />
            </button>
          </div>
        ))}
        {estimated !== null && (
          <div className="profit-preview">
            <span>
              Bénéfice net estimé
              <small>
                Après frais et {money(contribution(parseMoney(sale), rate))} de
                cotisations
              </small>
            </span>
            <strong className={estimated < 0 ? "negative" : "positive"}>
              {money(estimated)}
            </strong>
          </div>
        )}
        {error && <ErrorMessage>{error}</ErrorMessage>}
        <div className="form-footer">
          <button type="button" className="button secondary" onClick={close}>
            Annuler
          </button>
          <button className="button primary" disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer l’article"}
            <ArrowRight size={17} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
function MoneyInput({
  value,
  onChange,
  name,
  required,
  label,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  name: string;
  required?: boolean;
  label?: string;
  autoFocus?: boolean;
}) {
  return (
    <span className="money-input">
      <input
        name={name}
        aria-label={label}
        inputMode="decimal"
        type="text"
        required={required}
        autoFocus={autoFocus}
        maxLength={12}
        value={value}
        placeholder="0,00"
        onChange={(e) => onChange(e.target.value)}
      />
      <span aria-hidden="true">€</span>
    </span>
  );
}
