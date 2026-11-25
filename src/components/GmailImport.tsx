import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import {
  GMAIL_FRAME_URL,
  validateSelection,
  type VerifiedNotification,
  type ImportChoice,
  type ImportRecord,
  type ImportKind,
  KINDS,
} from "../../protocols/gmail-transfer";
import { db } from "../lib/db";
import {
  importVerified,
  reconcile,
  type SyncProgress,
} from "../lib/gmail-import";
import { money, editMoney, parseMoney } from "../lib/accounting";
import { errorMessage } from "../lib/errors";
import type { Article, Settings } from "../lib/model";
import { ErrorMessage, Modal } from "./ui";
const labels: Record<ImportKind, string> = {
  purchase: "Achat",
  sale_announced: "Vente en cours",
  sale_final: "Vente encaissée",
  purchase_final: "Achat finalisé",
  refund: "Remboursement",
  cancellation: "Annulation",
  incomplete: "À préciser",
};
interface Row {
  item: VerifiedNotification;
  ignored: boolean;
  edited: boolean;
  choice?: ImportChoice;
}
interface Stats {
  period: string;
  examined: number;
  known: number;
  ignored: number;
  unverified: number;
  complete: boolean;
  nextPageToken: string | null;
  limited: boolean;
  running: boolean;
  interrupted: boolean;
}
function validStats(v: unknown): v is Stats {
  if (!v || typeof v !== "object") return false;
  const s = v as Stats;
  return (
    /^\d{4}-(0[1-9]|1[0-2])$/.test(s.period) &&
    ["examined", "known", "ignored", "unverified"].every(
      (k) =>
        Number.isSafeInteger(s[k as keyof Stats]) &&
        (s[k as keyof Stats] as number) >= 0 &&
        (s[k as keyof Stats] as number) <= 200,
    ) &&
    ["complete", "limited", "running", "interrupted"].every(
      (k) => typeof s[k as keyof Stats] === "boolean",
    ) &&
    (s.nextPageToken === null ||
      (typeof s.nextPageToken === "string" && s.nextPageToken.length <= 2048))
  );
}
export function GmailImport({
  articles,
  records,
  settings,
  sourceId,
  onClose,
  onSaved,
}: {
  articles: Article[];
  records: ImportRecord[];
  settings: Settings;
  sourceId?: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const original = sourceId
    ? records.find((r) => r.id === sourceId)
    : undefined;
  const initial: VerifiedNotification | undefined = original
    ? (original.proposal ?? {
        sourceKey: original.id,
        eventKey: original.eventKey,
        kind:
          original.kind === "sale_final" &&
          (!original.date || original.amount === null)
            ? "incomplete"
            : original.kind,
        detectedKind: original.kind,
        name: original.name,
        date: original.date,
        purchaseDate: original.kind === "purchase" ? original.date : null,
        purchasePrice: original.kind === "purchase" ? original.amount : null,
        salePrice: original.kind !== "purchase" ? original.amount : null,
        boost: 0,
        cleaning: 0,
        genre: "Unisexe",
        category: "Autre",
        referenceKey: original.referenceKey ?? null,
        confirmed: false,
        confidence: "ambiguous",
      })
    : undefined;
  const [rows, setRows] = useState<Row[]>(
      initial ? [{ item: initial, ignored: false, edited: false }] : [],
    ),
    [stats, setStats] = useState<Stats | null>(null),
    [height, setHeight] = useState(300),
    [expanded, setExpanded] = useState<string | null>(sourceId ?? null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [connected, setConnected] = useState(!initial),
    [connectorOpen, setConnectorOpen] = useState(!initial);
  const iframe = useRef<HTMLIFrameElement>(null),
    busyRef = useRef(false);
  const [nonce] = useState(() => crypto.randomUUID());
  const known = records
    .filter((r) => r.resolved || (r.proposal && r.parserVersion === 1))
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
    .slice(0, 10000)
    .map((r) => r.id);
  function sendSession() {
    iframe.current?.contentWindow?.postMessage(
      {
        type: "vm:gmail-session",
        version: 2,
        nonce,
        knownSourceKeys: known,
        progress: (settings.gmailProgress ?? []).map((p) => ({
          period: p.period,
          pageToken: p.pageToken,
        })),
      },
      location.origin,
    );
  }
  function abortReader() {
    try {
      (
        iframe.current?.contentWindow as
          (Window & { closeVintedGmail?: () => void }) | null
      )?.closeVintedGmail?.();
    } catch {
      /* Un abandon ne doit jamais exposer une erreur privée. */
    }
    window.dispatchEvent(
      new CustomEvent("vm:authorization", { detail: false }),
    );
  }
  useLayoutEffect(() => {
    window.addEventListener("vm:lock", abortReader);
    return () => {
      abortReader();
      window.removeEventListener("vm:lock", abortReader);
    };
  }, []);
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (
        event.origin !== location.origin ||
        event.source !== iframe.current?.contentWindow ||
        busyRef.current ||
        !db.isUnlocked
      )
        return;
      const data = event.data;
      if (!data || typeof data !== "object" || data.version !== 2) return;
      if (data.type === "vm:gmail-hello") {
        sendSession();
        return;
      }
      if (data.nonce !== nonce) return;
      if (data.type === "vm:gmail-activity") {
        window.dispatchEvent(new Event("vm:activity"));
        return;
      }
      if (
        data.type === "vm:gmail-authorization" &&
        typeof data.active === "boolean"
      ) {
        window.dispatchEvent(
          new CustomEvent("vm:authorization", { detail: data.active }),
        );
        return;
      }
      if (
        data.type === "vm:gmail-height" &&
        Number.isFinite(data.height) &&
        data.height >= 160 &&
        data.height <= 20000
      ) {
        setHeight(data.height);
        return;
      }
      if (data.type === "vm:gmail-clear") {
        if (!initial) {
          setRows([]);
          setStats(null);
        }
        setError("");
        return;
      }
      if (data.type === "vm:gmail-analysis-error") {
        setError(
          "L’analyse locale n’a pas pu être terminée. Aucune opération n’a été enregistrée.",
        );
        return;
      }
      if (
        data.type !== "vm:gmail-proposals" ||
        Object.keys(data).sort().join(",") !==
          "items,nonce,stats,type,version" ||
        !validStats(data.stats)
      )
        return;
      try {
        const selected =
          Array.isArray(data.items) && data.items.length === 0
            ? []
            : validateSelection(data.items);
        setRows((previous) =>
          selected.map(
            (item) =>
              previous.find(
                (r) => r.item.sourceKey === item.sourceKey && r.edited,
              ) ?? { item, ignored: false, edited: false },
          ),
        );
        setStats(data.stats);
        if (!data.stats.running) setConnectorOpen(false);
        setError("");
      } catch {
        setError(
          "Les opérations reçues ont été refusées : format non compatible. Aucune donnée n’a été enregistrée.",
        );
      }
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [nonce]);
  function prepared(row: Row) {
    let item = row.item;
    let match = reconcile(item, articles, records);
    const actualKind =
      item.kind === "incomplete" && item.detectedKind
        ? item.detectedKind
        : item.kind;
    // Le nom absent peut provenir d’un rapprochement par référence, jamais d’un nom semblable.
    if (
      item.confirmed &&
      item.name === "Nom à compléter" &&
      item.referenceKey
    ) {
      const target = reconcile(
        { ...item, kind: actualKind },
        articles,
        records,
      ).article;
      if (target) {
        item = {
          ...item,
          name: target.name,
          kind: actualKind,
          confidence:
            ["sale_final", "sale_announced"].includes(actualKind) &&
            item.salePrice === null
              ? "incomplete"
              : "reliable",
        };
        match = reconcile(item, articles, records);
      }
    }
    if (
      match.article &&
      item.purchasePrice === null &&
      match.article.purchasePrice !== null &&
      (!row.choice || row.choice.mode !== "create")
    )
      item = {
        ...item,
        purchasePrice: match.article.purchasePrice,
        purchaseDate: match.article.purchaseDate,
      };
    const isCorrection = ["refund", "cancellation"].includes(
      item.detectedKind ?? item.kind,
    );
    const completeName = item.name !== "Nom à compléter";
    const reliable =
      !row.ignored &&
      !isCorrection &&
      item.kind !== "incomplete" &&
      completeName &&
      item.confidence === "reliable" &&
      item.confirmed !== false &&
      (row.choice ? row.choice.mode !== "review" : match.reliable);
    const choice = row.choice
      ? { ...row.choice, item }
      : {
          item,
          mode: match.mode,
          articleId: match.article?.id ?? null,
          expectedUpdatedAt: match.article?.updatedAt ?? null,
          distinctConfirmed: false,
        };
    return { item, match, choice, reliable, isCorrection };
  }
  const plans = rows.map((row) => ({ row, ...prepared(row) }));
  const ready = plans.filter((p) => p.reliable);
  const corrections = plans.filter((p) => p.isCorrection && !p.row.ignored);
  const review = plans.filter(
    (p) => !p.reliable && !p.isCorrection && !p.row.ignored,
  );
  function update(id: string, patch: Partial<VerifiedNotification>) {
    setRows((all) =>
      all.map((r) =>
        r.item.sourceKey === id
          ? {
              ...r,
              edited: true,
              item: { ...r.item, ...patch },
              ...(r.choice
                ? { choice: { ...r.choice, item: { ...r.item, ...patch } } }
                : {}),
            }
          : r,
      ),
    );
  }
  function choose(id: string, value: string) {
    setRows((all) =>
      all.map((r) => {
        if (r.item.sourceKey !== id) return r;
        const p = prepared(r);
        if (value === "create")
          return {
            ...r,
            edited: true,
            choice: {
              item: p.item,
              mode: "create",
              articleId: null,
              expectedUpdatedAt: null,
              distinctConfirmed: true,
            },
          };
        const split = value.indexOf(":"),
          mode = value.slice(0, split) as ImportChoice["mode"],
          a = articles.find((a) => a.id === value.slice(split + 1));
        return a
          ? {
              ...r,
              edited: true,
              choice: {
                item: p.item,
                mode,
                articleId: a.id,
                expectedUpdatedAt: a.updatedAt,
                distinctConfirmed: false,
              },
            }
          : r;
      }),
    );
  }
  async function commit(event: MouseEvent, only?: string) {
    if (
      !event.isTrusted ||
      busyRef.current ||
      !db.isUnlocked ||
      stats?.running ||
      error.startsWith("Saisissez")
    )
      return;
    const selected = only
      ? plans.filter((p) => p.item.sourceKey === only)
      : ready;
    const choices = selected.map((p) => p.choice);
    const selectedIds = new Set(selected.map((p) => p.item.sourceKey));
    const pending = only
      ? []
      : plans
          .filter((p) => !selectedIds.has(p.item.sourceKey) && !p.row.ignored)
          .map((p) => p.item);
    const ignored = only
      ? []
      : plans.filter((p) => p.row.ignored).map((p) => p.item);
    const progress: SyncProgress | undefined =
      stats && !stats.interrupted && !only
        ? {
            period: stats.period,
            pageToken: stats.nextPageToken,
            complete: stats.complete,
          }
        : undefined;
    if (only) {
      const p = selected[0];
      if (!p || p.choice.mode === "review") {
        setError(
          "Choisissez l’article et le type de correction avant de confirmer.",
        );
        return;
      }
      if (
        !window.confirm(
          "Confirmer cette correction avec traçabilité, sans écraser les encaissements précédents ?",
        )
      )
        return;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await importVerified(choices, db, {
        pending,
        ignored,
        ...(progress ? { progress } : {}),
      });
      onSaved(
        `${result.created} article(s) créé(s), ${result.linked} opération(s) rapprochée(s), ${result.review} à vérifier, ${result.duplicates} doublon(s) écarté(s).`,
      );
    } catch (e) {
      setError(
        errorMessage(
          e,
          "L’enregistrement n’a pas abouti. Vos données sont conservées.",
        ),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function moneyEdit(
    item: VerifiedNotification,
    key: "purchasePrice" | "salePrice" | "boost" | "cleaning",
    text: string,
  ) {
    try {
      setError("");
      update(item.sourceKey, {
        [key]:
          text.trim() === ""
            ? key === "boost" || key === "cleaning"
              ? 0
              : null
            : parseMoney(text),
      });
    } catch {
      setError("Saisissez un montant positif, avec deux décimales maximum.");
    }
  }
  const close = () => {
    if (
      !busyRef.current &&
      (!rows.length ||
        window.confirm(
          "Fermer cet aperçu sans enregistrer les opérations non validées ?",
        ))
    )
      onClose();
  };
  function card(plan: (typeof plans)[number]) {
    const { item, row, match, choice, reliable, isCorrection } = plan;
    const open = expanded === item.sourceKey;
    const kind =
      item.kind === "incomplete" ? (item.detectedKind ?? item.kind) : item.kind;
    const amount = kind === "purchase" ? item.purchasePrice : item.salePrice;
    return (
      <article
        className={`sync-row ${row.ignored ? "is-ignored" : ""}`}
        key={item.sourceKey}
      >
        <div className="sync-row-main">
          <div>
            <strong>{item.name}</strong>
            <p>
              {labels[kind]} · {item.date ?? "Date à préciser"}
              {item.dateEstimated ? " · estimée" : ""}
            </p>
          </div>
          <div className="sync-row-right">
            <b>{money(amount)}</b>
            <span className={reliable ? "sync-ready" : "sync-check"}>
              {row.ignored
                ? "Ignorée"
                : reliable
                  ? "Prête"
                  : isCorrection
                    ? "Intervention"
                    : "À vérifier"}
            </span>
          </div>
        </div>
        <div className="sync-row-actions">
          <button
            className="text-button"
            onClick={() => setExpanded(open ? null : item.sourceKey)}
          >
            {open ? "Réduire" : "Modifier / détails"}
          </button>
          <button
            className="text-button"
            onClick={() =>
              setRows((all) =>
                all.map((r) =>
                  r === row ? { ...r, ignored: !r.ignored, edited: true } : r,
                ),
              )
            }
          >
            {row.ignored ? "Rétablir" : "Ignorer"}
          </button>
        </div>
        {open && (
          <div className="sync-editor">
            <p className="field-help">
              {match.reason}. Les champs déjà reconnus sont préremplis.
            </p>
            <label>
              Type
              <select
                aria-label={`Type de ${item.sourceKey}`}
                value={kind}
                disabled={busy}
                onChange={(e) => {
                  const next = e.target.value as ImportKind;
                  update(item.sourceKey, {
                    kind: next,
                    detectedKind: next,
                    eventKey: item.relatedKeys?.[next] ?? item.sourceKey,
                  });
                }}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {labels[k]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Article
              <input
                aria-label={`Article de ${item.sourceKey}`}
                value={item.name === "Nom à compléter" ? "" : item.name}
                maxLength={120}
                disabled={busy}
                onChange={(e) =>
                  update(item.sourceKey, {
                    name: e.target.value || "Nom à compléter",
                  })
                }
              />
            </label>
            <div className="form-grid">
              <label>
                {kind === "purchase"
                  ? "Coût total payé TTC"
                  : "Prix d’achat TTC, si connu"}
                <input
                  key={item.sourceKey + "purchase"}
                  aria-label={`Achat TTC de ${item.sourceKey}`}
                  inputMode="decimal"
                  defaultValue={editMoney(item.purchasePrice)}
                  disabled={
                    busy ||
                    (!!choice.articleId &&
                      articles.some(
                        (a) =>
                          a.id === choice.articleId && a.purchasePrice !== null,
                      ))
                  }
                  onBlur={(e) =>
                    moneyEdit(item, "purchasePrice", e.target.value)
                  }
                />
              </label>
              {kind !== "purchase" && kind !== "purchase_final" && (
                <label>
                  {kind === "refund" ? "Montant remboursé" : "Montant de vente"}
                  <input
                    key={item.sourceKey + "sale"}
                    aria-label={`Vente de ${item.sourceKey}`}
                    inputMode="decimal"
                    defaultValue={editMoney(item.salePrice)}
                    disabled={busy}
                    onBlur={(e) => moneyEdit(item, "salePrice", e.target.value)}
                  />
                </label>
              )}
            </div>
            <label>
              Date {item.dateEstimated ? "(estimée depuis Gmail)" : ""}
              <input
                type="date"
                aria-label={`Date de ${item.sourceKey}`}
                value={item.date ?? ""}
                disabled={busy}
                onChange={(e) =>
                  update(item.sourceKey, {
                    date: e.target.value || null,
                    dateEstimated: false,
                    ...(kind === "purchase"
                      ? { purchaseDate: e.target.value || null }
                      : {}),
                  })
                }
              />
            </label>
            {item.acquisition && (
              <details>
                <summary>Détail du reçu</summary>
                <dl className="detail-list">
                  <div>
                    <dt>Prix article(s)</dt>
                    <dd>{money(item.acquisition.itemPrice)}</dd>
                  </div>
                  <div>
                    <dt>Port inclus</dt>
                    <dd>{money(item.acquisition.shipping)}</dd>
                  </div>
                  <div>
                    <dt>Protection incluse</dt>
                    <dd>{money(item.acquisition.protection)}</dd>
                  </div>
                  <div>
                    <dt>Autres frais inclus</dt>
                    <dd>{money(item.acquisition.otherFees)}</dd>
                  </div>
                </dl>
                <p className="field-help">
                  Le total payé est utilisé une seule fois. Ces montants ne sont
                  pas ajoutés une deuxième fois.
                </p>
              </details>
            )}
            <details>
              <summary>Frais supplémentaires enregistrés</summary>
              <div className="form-grid">
                <label>
                  Boost (€)
                  <input
                    aria-label={`Boost de ${item.sourceKey}`}
                    inputMode="decimal"
                    defaultValue={editMoney(item.boost)}
                    disabled={busy}
                    onBlur={(e) => moneyEdit(item, "boost", e.target.value)}
                  />
                </label>
                <label>
                  Nettoyage (€)
                  <input
                    aria-label={`Nettoyage de ${item.sourceKey}`}
                    inputMode="decimal"
                    defaultValue={editMoney(item.cleaning)}
                    disabled={busy}
                    onBlur={(e) => moneyEdit(item, "cleaning", e.target.value)}
                  />
                </label>
              </div>
            </details>
            <label>
              Correspondance
              <select
                aria-label={`Enregistrement pour ${item.sourceKey}`}
                value={
                  choice.articleId
                    ? `${choice.mode}:${choice.articleId}`
                    : choice.mode === "review"
                      ? "review"
                      : "create"
                }
                disabled={busy}
                onChange={(e) => choose(item.sourceKey, e.target.value)}
              >
                <option value="review" disabled>
                  Choisir une correspondance
                </option>
                <option value="create">Nouvel article distinct</option>
                {articles
                  .filter((a) => !a.archived || a.id === choice.articleId)
                  .map((a) => {
                    const mode: ImportChoice["mode"] =
                      kind === "refund"
                        ? "refund"
                        : kind === "cancellation"
                          ? "cancel"
                          : kind === "sale_announced"
                            ? "announce"
                            : kind === "sale_final" && a.status === "stock"
                              ? "sell"
                              : "link";
                    return (
                      <option key={a.id} value={`${mode}:${a.id}`}>
                        {a.status === "stock" ? "Stock" : "Historique"} :{" "}
                        {a.name}
                      </option>
                    );
                  })}
              </select>
            </label>
            {match.article &&
              !match.reliable &&
              item.confirmed &&
              item.confidence === "reliable" &&
              !row.choice && (
                <button
                  className="button secondary"
                  onClick={() =>
                    setRows((all) =>
                      all.map((r) =>
                        r.item.sourceKey === item.sourceKey
                          ? { ...r, edited: true, choice }
                          : r,
                      ),
                    )
                  }
                >
                  Confirmer ce rapprochement après vérification
                </button>
              )}
            {(!item.confirmed || item.confidence !== "reliable") && (
              <label className="sync-confirm">
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={
                    item.confirmed === true && item.confidence === "reliable"
                  }
                  onChange={(e) =>
                    update(item.sourceKey, {
                      kind,
                      confirmed: e.target.checked,
                      confidence: e.target.checked ? "reliable" : "ambiguous",
                    })
                  }
                />{" "}
                J’ai vérifié les informations manquantes et je confirme cet
                événement.
              </label>
            )}
            {isCorrection && (
              <>
                <p className="info-box">
                  Cette correction n’affectera une transaction existante
                  qu’après votre confirmation dédiée.
                </p>
                {kind === "refund" && (
                  <label>
                    Nature du remboursement
                    <select
                      value={
                        choice.correctionRole ??
                        (item.referenceKey &&
                        match.article?.purchaseReference === item.referenceKey
                          ? "purchase"
                          : item.referenceKey &&
                              match.article?.saleReference === item.referenceKey
                            ? "sale"
                            : "")
                      }
                      onChange={(e) =>
                        setRows((all) =>
                          all.map((r) =>
                            r.item.sourceKey === item.sourceKey
                              ? {
                                  ...r,
                                  edited: true,
                                  choice: {
                                    ...choice,
                                    correctionRole: e.target.value as
                                      "sale" | "purchase",
                                  },
                                }
                              : r,
                          ),
                        )
                      }
                    >
                      <option value="">À préciser</option>
                      <option value="sale">
                        Remboursement d’une vente à l’acheteur
                      </option>
                      <option value="purchase">
                        Remboursement de mon achat
                      </option>
                    </select>
                  </label>
                )}
                {kind === "refund" && (
                  <label className="sync-confirm">
                    <input
                      type="checkbox"
                      checked={choice.returnToStock ?? false}
                      onChange={(e) =>
                        setRows((all) =>
                          all.map((r) =>
                            r.item.sourceKey === item.sourceKey
                              ? {
                                  ...r,
                                  edited: true,
                                  choice: {
                                    ...choice,
                                    returnToStock: e.target.checked,
                                  },
                                }
                              : r,
                          ),
                        )
                      }
                    />{" "}
                    Vente entièrement remboursée et article physiquement
                    retourné : remettre l’article en stock
                  </label>
                )}
                {kind === "refund" && (
                  <label className="sync-confirm">
                    <input
                      type="checkbox"
                      checked={choice.withdrawStock ?? false}
                      onChange={(e) =>
                        setRows((all) =>
                          all.map((r) =>
                            r.item.sourceKey === item.sourceKey
                              ? {
                                  ...r,
                                  edited: true,
                                  choice: {
                                    ...choice,
                                    withdrawStock: e.target.checked,
                                  },
                                }
                              : r,
                          ),
                        )
                      }
                    />{" "}
                    Achat remboursé et rendu au vendeur : retirer l’article du
                    stock
                  </label>
                )}
                {kind === "refund" &&
                  match.article?.refunds?.some(
                    (r) => r.amount === item.salePrice && r.date === item.date,
                  ) && (
                    <label className="sync-confirm">
                      <input
                        type="checkbox"
                        checked={choice.distinctConfirmed}
                        onChange={(e) =>
                          setRows((all) =>
                            all.map((r) =>
                              r.item.sourceKey === item.sourceKey
                                ? {
                                    ...r,
                                    edited: true,
                                    choice: {
                                      ...choice,
                                      distinctConfirmed: e.target.checked,
                                    },
                                  }
                                : r,
                            ),
                          )
                        }
                      />{" "}
                      Un remboursement de ce montant à cette date existe déjà.
                      J’ai vérifié qu’il s’agit d’un autre remboursement
                      distinct.
                    </label>
                  )}
                <button
                  className="button secondary"
                  disabled={busy || !choice.articleId}
                  onClick={(e) => void commit(e, item.sourceKey)}
                >
                  Confirmer cette correction
                </button>
              </>
            )}
            {connected && (
              <button
                className="text-button"
                onClick={() => {
                  setConnectorOpen(true);
                  iframe.current?.contentWindow?.postMessage(
                    {
                      type: "vm:gmail-detail",
                      version: 2,
                      nonce,
                      sourceKey: item.sourceKey,
                    },
                    location.origin,
                  );
                  requestAnimationFrame(() =>
                    iframe.current?.scrollIntoView({
                      block: "start",
                      behavior: "smooth",
                    }),
                  );
                }}
              >
                Consulter le texte du message
              </button>
            )}
          </div>
        )}
      </article>
    );
  }
  return (
    <Modal
      title="Synchroniser Gmail"
      subtitle="Analyse locale · validation groupée avant enregistrement"
      onClose={close}
      wide
      closeDisabled={busy}
    >
      <div className="sync-workspace">
        <p className="sync-privacy">
          Lecture locale. Les opérations et éléments à vérifier seront
          enregistrés chiffrés après votre validation. Les e-mails restent en
          mémoire.
        </p>
        {connected ? (
          <details
            className="sync-session"
            open={connectorOpen}
            onToggle={(e) => setConnectorOpen(e.currentTarget.open)}
          >
            <summary>
              Connexion et période
              {stats && !stats.running ? " · modifier / révoquer" : ""}
            </summary>
            <iframe
              ref={iframe}
              title="Connexion et analyse Gmail"
              src={GMAIL_FRAME_URL}
              onLoad={sendSession}
              className="sync-connector"
              scrolling="no"
              style={{ height }}
              referrerPolicy="no-referrer"
            />
          </details>
        ) : (
          <button
            className="button secondary"
            onClick={() => setConnected(true)}
          >
            Relancer une synchronisation Gmail
          </button>
        )}
        {rows.length > 0 && (
          <>
            <div className="sync-summary" aria-live="polite">
              {(
                [
                  [
                    "Achats",
                    plans.filter((p) => p.item.kind === "purchase").length,
                  ],
                  [
                    "Ventes en cours",
                    plans.filter((p) => p.item.kind === "sale_announced")
                      .length,
                  ],
                  [
                    "Ventes encaissées",
                    plans.filter((p) => p.item.kind === "sale_final").length,
                  ],
                  ["Déjà connues", stats?.known ?? 0],
                  ["Prêtes", ready.length],
                  ["À vérifier", review.length + corrections.length],
                ] as const
              ).map(([label, n]) => (
                <div key={label}>
                  <strong>{n}</strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            {stats && !stats.complete && (
              <p className="info-box">
                {stats.running
                  ? "Analyse en cours…"
                  : stats.interrupted
                    ? "Synchronisation interrompue : relancez pour terminer."
                    : "Parcours partiel : ce lot peut être validé, puis la suite sera reprise sans doublons."}
              </p>
            )}
            <section aria-label="Opérations fiables">
              <h3>{ready.length} opération(s) prête(s)</h3>
              {plans.filter((p) => p.reliable || p.row.ignored).map(card)}
            </section>
            {review.length > 0 && (
              <details className="sync-review-section" open={!!initial}>
                <summary>
                  {review.length} opération(s) à compléter ou vérifier
                </summary>
                {review.map(card)}
              </details>
            )}
            {corrections.length > 0 && (
              <details className="sync-review-section" open={!!initial}>
                <summary>
                  {corrections.length} correction(s), annulation(s) ou
                  remboursement(s)
                </summary>
                {corrections.map(card)}
              </details>
            )}
          </>
        )}
        {error && <ErrorMessage>{error}</ErrorMessage>}
        {(rows.length > 0 || stats) && (
          <div className="sync-footer">
            <p>
              {ready.length} opération(s) prêtes ·{" "}
              {review.length + corrections.length} à vérifier, sans effet
              automatique.
            </p>
            <button
              className="button secondary"
              disabled={busy}
              onClick={close}
            >
              Annuler
            </button>
            <button
              className="button primary"
              disabled={
                busy ||
                stats?.running ||
                stats?.interrupted ||
                error.startsWith("Saisissez")
              }
              onClick={(e) => void commit(e)}
            >
              {busy
                ? "Enregistrement chiffré…"
                : ready.length
                  ? `Valider les ${ready.length} opérations fiables`
                  : "Conserver la progression et les éléments à vérifier"}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
