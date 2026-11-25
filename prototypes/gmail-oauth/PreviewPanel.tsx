import {
  REVIEW_KINDS,
  moneyCents,
  type PreviewBatch,
  type PreviewRow,
  type ReviewKind,
} from "./preview-model";
const euro = (cents: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );
export function PreviewPanel({
  batch,
  busy,
  onChange,
  onMore,
  onClear,
  onTransfer,
  canTransfer,
}: {
  batch: PreviewBatch;
  busy: boolean;
  onChange: (row: PreviewRow) => void;
  onMore: () => void;
  onClear: () => void;
  onTransfer: () => void;
  canTransfer: boolean;
}) {
  const references = new Map<string, number>();
  for (const row of batch.rows)
    if (row.reference)
      references.set(row.reference, (references.get(row.reference) ?? 0) + 1);
  return (
    <section className="preview-panel" aria-labelledby="preview-title">
      <h2 id="preview-title">Notifications à vérifier</h2>
      <p>
        {batch.rows.length} notification{batch.rows.length > 1 ? "s" : ""}{" "}
        affichée{batch.rows.length > 1 ? "s" : ""} · {batch.examined} message
        {batch.examined > 1 ? "s" : ""} examiné{batch.examined > 1 ? "s" : ""}
      </p>
      <p className="preview-note">
        Les catégories sont des pistes tirées de l’objet. Une notification seule
        ne prouve pas une vente définitive. La date du message n’est pas une
        date d’achat ou de vente.
      </p>
      {batch.ignored > 0 && (
        <p>
          {batch.ignored} message{batch.ignored > 1 ? "s" : ""} écarté
          {batch.ignored > 1 ? "s" : ""} : expéditeur, date ou format non
          retenu.
        </p>
      )}
      {!batch.rows.length && (
        <p>
          Aucune notification retenue pour ce mois. Seuls les expéditeurs exacts
          en @vinted.fr sont actuellement pris en charge.
        </p>
      )}
      {batch.rows.map((row) => {
        const set = (patch: Partial<PreviewRow["draft"]>) =>
          onChange({
            ...row,
            draft: { ...row.draft, ...patch, checked: patch.checked ?? false },
          });
        const missingCost =
          row.draft.kind === "sale_final" &&
          moneyCents(row.draft.purchase) === null;
        return (
          <article className="notification-card" key={row.id}>
            <h3>{row.subject}</h3>
            <p className="mail-date">
              Date du message Gmail :{" "}
              {new Intl.DateTimeFormat("fr-FR", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(row.receivedAt))}
            </p>
            <p className="suggestion">{row.suggestion}</p>
            {row.warning && <p className="preview-warning">{row.warning}</p>}
            {row.reference && (
              <p>
                Référence mentionnée : <strong>{row.reference}</strong>
              </p>
            )}
            {row.reference && (references.get(row.reference) ?? 0) > 1 && (
              <p className="preview-warning">
                Même référence dans plusieurs notifications : rapprochez-les,
                sans compter plusieurs fois la transaction.
              </p>
            )}
            {row.amounts.length > 0 && (
              <div className="amounts">
                <strong>Montants repérés, à affecter manuellement</strong>
                <ul>
                  {row.amounts.map((a) => (
                    <li key={a.cents}>
                      <b>{euro(a.cents)}</b>
                      <span>{a.context}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {row.text && (
              <details>
                <summary>Consulter le texte du message</summary>
                <pre className="mail-text">{row.text}</pre>
                {row.text.length >= 12000 && (
                  <p>Extrait limité pour cet aperçu.</p>
                )}
              </details>
            )}
            <fieldset disabled={busy}>
              <legend>Votre vérification, uniquement dans cet aperçu</legend>
              <label>
                Type à confirmer
                <select
                  aria-label={`Type pour ${row.subject}`}
                  value={row.draft.kind}
                  onChange={(e) => set({ kind: e.target.value as ReviewKind })}
                >
                  {Object.entries(REVIEW_KINDS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Article
                <input
                  aria-label={`Article pour ${row.subject}`}
                  maxLength={120}
                  value={row.draft.article}
                  placeholder="À préciser"
                  onChange={(e) => set({ article: e.target.value })}
                />
              </label>
              <div className="preview-fields">
                {(
                  [
                    ["purchase", "Achat TTC"],
                    ["sale", "Prix de vente"],
                    ["boost", "Frais de boost"],
                    ["cleaning", "Frais de nettoyage"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    {label} (€)
                    <input
                      inputMode="decimal"
                      aria-label={`${label} pour ${row.subject}`}
                      maxLength={12}
                      placeholder="Non renseigné"
                      value={row.draft[key]}
                      onChange={(e) => set({ [key]: e.target.value })}
                    />
                    {row.draft[key] !== "" &&
                      moneyCents(row.draft[key]) === null && (
                        <small className="preview-warning">
                          Montant à corriger : deux décimales maximum.
                        </small>
                      )}
                  </label>
                ))}
              </div>
              <p className="preview-note">
                L’achat TTC doit inclure le port et la protection acheteur. Un
                champ vide reste inconnu ; saisissez 0 seulement si vous
                confirmez un coût nul.
              </p>
              <label>
                Date de la transaction
                <input
                  type="date"
                  aria-label={`Date de transaction pour ${row.subject}`}
                  value={row.draft.date}
                  onChange={(e) => set({ date: e.target.value })}
                />
              </label>
              {row.draft.kind === "sale_final" && (
                <label>
                  Date d’achat, si connue
                  <input
                    type="date"
                    aria-label={`Date d’achat pour ${row.subject}`}
                    value={row.draft.purchaseDate}
                    onChange={(e) => set({ purchaseDate: e.target.value })}
                  />
                </label>
              )}
              {missingCost && (
                <p className="missing-profit">
                  Bénéfice à compléter : prix d’achat manquant.
                </p>
              )}
              <label className="review-check">
                <input
                  type="checkbox"
                  checked={row.draft.checked}
                  disabled={!row.authenticated}
                  onChange={(e) => set({ checked: e.target.checked })}
                />
                J’ai vérifié le type, les montants et les dates. Les champs de
                frais vides signifient aucun frais supplémentaire.
              </label>
            </fieldset>
          </article>
        );
      })}
      {batch.limited && (
        <p className="preview-warning">
          Limite de 200 messages atteinte pour cet aperçu. D’autres
          notifications peuvent ne pas être examinées.
        </p>
      )}
      <div className="actions">
        {batch.nextPageToken && (
          <button disabled={busy} onClick={onMore}>
            Charger la suite du mois
          </button>
        )}
        <button disabled={busy} onClick={onClear}>
          Effacer uniquement l’aperçu
        </button>
      </div>
      {canTransfer ? (
        <button
          disabled={busy || !batch.rows.some((r) => r.draft.checked)}
          onClick={onTransfer}
        >
          Vérifier l’enregistrement des lignes cochées
        </button>
      ) : (
        <p>
          Pour enregistrer, ouvrez l’import depuis votre application Vinted
          Manager habituelle.{" "}
          <a href="/Vinted-manager/#gmail-import" target="_top">
            Ouvrir Vinted Manager
          </a>
        </p>
      )}
      <p className="preview-note">
        Seules les lignes cochées peuvent être transmises à la confirmation
        comptable. Les e-mails et le jeton ne quittent pas cet aperçu. Les
        lignes non confirmées disparaissent à la fermeture.
      </p>
    </section>
  );
}
