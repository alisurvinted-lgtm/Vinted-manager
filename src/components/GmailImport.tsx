import { useEffect, useRef, useState } from "react";
import {
  GMAIL_FRAME_URL,
  validateSelection,
  type ImportChoice,
} from "../../protocols/gmail-transfer";
import {
  financial,
  importVerified,
  possibleMatches,
} from "../lib/gmail-import";
import { money } from "../lib/accounting";
import type { Article } from "../lib/model";
import { errorMessage } from "../lib/errors";
import { ErrorMessage, Modal } from "./ui";
export function GmailImport({
  articles,
  onClose,
  onSaved,
}: {
  articles: Article[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const [nonce] = useState(() => crypto.randomUUID());
  const [choices, setChoices] = useState<ImportChoice[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  function sendSession() {
    iframe.current?.contentWindow?.postMessage(
      { type: "vm:gmail-session", version: 1, nonce },
      location.origin,
    );
  }
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (
        event.origin !== location.origin ||
        event.source !== iframe.current?.contentWindow ||
        busyRef.current
      )
        return;
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type === "vm:gmail-hello") {
        sendSession();
        return;
      }
      if (data.nonce !== nonce || data.version !== 1) return;
      if (data.type === "vm:gmail-clear") {
        setChoices([]);
        setError("");
        return;
      }
      if (
        data.type !== "vm:gmail-selection" ||
        Object.keys(data).sort().join(",") !== "items,nonce,type,version"
      )
        return;
      try {
        const selected = validateSelection(data.items);
        setChoices(
          selected.map((item) => ({
            item,
            mode: financial(item.kind) ? "create" : "review",
            articleId: null,
            expectedUpdatedAt: null,
            distinctConfirmed: false,
          })),
        );
        setError("");
      } catch {
        setError(
          "Sélection refusée : les informations reçues ne sont pas compatibles.",
        );
        setChoices([]);
      }
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [nonce]);
  async function commit() {
    if (busyRef.current || !choices.length) return;
    if (
      !window.confirm(
        `Enregistrer ${choices.length} notification(s) vérifiée(s) sur cet appareil ? Les doublons seront écartés. Les annulations et remboursements resteront sans effet automatique. Aucune sauvegarde ou donnée existante ne sera remplacée.`,
      )
    )
      return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await importVerified(choices);
      onSaved(
        `${r.created} article(s) créé(s), ${r.linked} lié(s), ${r.review} à vérifier, ${r.duplicates} doublon(s) écarté(s).`,
      );
    } catch (error) {
      setError(
        "Enregistrement refusé, sans modification du lot. " +
          errorMessage(error, "Réessayez après avoir vérifié la sélection."),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const close = () => {
    if (
      !busyRef.current &&
      (!choices.length ||
        window.confirm("Fermer sans enregistrer cette sélection ?"))
    )
      onClose();
  };
  return (
    <Modal
      title="Importer depuis Gmail"
      subtitle="Lecture seule, puis vérification avant enregistrement local"
      onClose={close}
      wide
      closeDisabled={busy}
    >
      <p className="info-box">
        Les e-mails et le jeton Google ne sont jamais enregistrés. Seules les
        transactions que vous confirmez rejoignent cet appareil. Les
        identifiants de suivi sont hachés. La base comptable locale n’est pas
        chiffrée par l’application ; exportez régulièrement une sauvegarde
        chiffrée.
      </p>
      <iframe
        ref={iframe}
        title="Connexion et aperçu Gmail"
        src={GMAIL_FRAME_URL}
        onLoad={sendSession}
        className="gmail-frame"
        hidden={choices.length > 0}
        referrerPolicy="no-referrer"
      />
      {choices.length > 0 && (
        <section className="gmail-selection">
          <h3>Confirmer l’enregistrement</h3>
          <p>
            Genres et catégories : Unisexe / Autre par défaut, modifiables
            ensuite. Les achats ou frais absents ne sont pas déduits des
            messages. Les champs de frais vides ont été confirmés sans frais
            dans l’aperçu.
          </p>
          {choices.map((choice, index) => {
            const item = choice.item;
            const candidates = possibleMatches(item, articles);
            const target = articles.find((a) => a.id === choice.articleId);
            function patch(value: Partial<ImportChoice>) {
              setChoices((all) =>
                all.map((c, i) => (i === index ? { ...c, ...value } : c)),
              );
            }
            return (
              <article className="gmail-review-card" key={item.sourceKey}>
                <h4>{item.name}</h4>
                <p>
                  {item.kind === "sale_final"
                    ? "Vente finalisée"
                    : item.kind === "purchase"
                      ? "Achat confirmé"
                      : "Notification à vérifier, sans effet sur les chiffres"}{" "}
                  · {item.date ?? "Date à compléter"}
                </p>
                {financial(item.kind) && (
                  <p>
                    Achat TTC : {money(item.purchasePrice)} ·{" "}
                    {item.kind === "sale_final" && (
                      <>Vente : {money(item.salePrice)} · </>
                    )}
                    Frais à ajouter : {money(item.boost + item.cleaning)}
                  </p>
                )}
                {financial(item.kind) && (
                  <label>
                    Enregistrement pour {item.name}
                    <select
                      aria-label={`Enregistrement pour ${item.name}`}
                      disabled={busy}
                      value={
                        choice.mode === "create"
                          ? "create"
                          : `${choice.mode}:${choice.articleId}`
                      }
                      onChange={(e) => {
                        if (e.target.value === "create") {
                          patch({
                            mode: "create",
                            articleId: null,
                            expectedUpdatedAt: null,
                            distinctConfirmed: false,
                          });
                          return;
                        }
                        const separator = e.target.value.indexOf(":");
                        const mode = e.target.value.slice(0, separator);
                        const id = e.target.value.slice(separator + 1);
                        const a = articles.find((a) => a.id === id);
                        if (a)
                          patch({
                            mode: mode as "link" | "sell",
                            articleId: id,
                            expectedUpdatedAt: a.updatedAt,
                            distinctConfirmed: false,
                          });
                      }}
                    >
                      <option value="create">Créer un nouvel article</option>
                      {articles.map((a) => (
                        <option
                          key={a.id}
                          value={`${item.kind === "sale_final" && a.status === "stock" ? "sell" : "link"}:${a.id}`}
                        >
                          {item.kind === "sale_final" && a.status === "stock"
                            ? "Vendre cet article en stock"
                            : "Déjà enregistré, relier uniquement"}{" "}
                          : {a.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {choice.mode === "create" && candidates.length > 0 && (
                  <div className="info-box">
                    <p>
                      Article(s) ressemblant(s) :{" "}
                      {candidates
                        .slice(0, 5)
                        .map((a) => a.name)
                        .join(", ")}
                      . Reliez l’article existant pour éviter de compter deux
                      fois.
                    </p>
                    <label>
                      <input
                        type="checkbox"
                        checked={choice.distinctConfirmed}
                        disabled={busy}
                        onChange={(e) =>
                          patch({ distinctConfirmed: e.target.checked })
                        }
                      />{" "}
                      Je confirme qu’il s’agit d’un article distinct
                    </label>
                  </div>
                )}
                {target && (
                  <p>
                    {choice.mode === "sell"
                      ? "L’article sera marqué vendu ; ses coûts et frais existants seront conservés. Les frais saisis s’ajoutent aux frais existants."
                      : "L’article ne sera pas modifié ; seul le suivi du doublon sera enregistré."}{" "}
                    Achat déjà enregistré : {money(target.purchasePrice)}.
                  </p>
                )}
                {item.kind === "sale_final" &&
                  item.purchasePrice === null &&
                  choice.mode === "create" && (
                    <p className="info-box">
                      Bénéfice à compléter. Le CA et les cotisations compteront
                      la vente ; le bénéfice restera inconnu jusqu’à la saisie
                      du coût d’achat.
                    </p>
                  )}
              </article>
            );
          })}
          <div className="form-footer">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setChoices([])}
            >
              Revenir à l’aperçu
            </button>
            <button
              className="button primary"
              disabled={
                busy ||
                choices.some(
                  (c) =>
                    c.mode === "create" &&
                    !c.distinctConfirmed &&
                    possibleMatches(c.item, articles).length > 0,
                )
              }
              onClick={() => void commit()}
            >
              {busy ? "Enregistrement…" : "Confirmer et enregistrer"}
            </button>
          </div>
        </section>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </Modal>
  );
}
