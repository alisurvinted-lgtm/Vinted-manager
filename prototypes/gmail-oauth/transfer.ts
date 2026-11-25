import {
  digest,
  validateSelection,
  type VerifiedNotification,
} from "../../protocols/gmail-transfer";
import type { PreviewRow } from "./preview-model";
import { moneyCents } from "./preview-model";
import config from "./config.json";
export async function prepareSelection(
  rows: PreviewRow[],
): Promise<VerifiedNotification[]> {
  const selected = rows.filter((r) => r.draft.checked);
  if (!selected.length)
    throw new Error("Cochez au moins une notification après l’avoir vérifiée.");
  const result: VerifiedNotification[] = [];
  for (const row of selected) {
    if (!row.authenticated)
      throw new Error(
        "Une notification non authentifiée ne peut pas être importée.",
      );
    const d = row.draft;
    const amount = (value: string) => {
      if (value.trim() === "") return null;
      const cents = moneyCents(value);
      if (cents === null)
        throw new Error("Corrigez les montants avant de continuer.");
      return cents;
    };
    const sourceKey = await digest(
      `gmail-personnel:${config.clientId}:${row.id}`,
    );
    result.push({
      sourceKey,
      eventKey: row.reference
        ? await digest(
            `gmail-personnel:${config.clientId}:${d.kind}:${row.reference}`,
          )
        : sourceKey,
      kind: d.kind,
      name: d.article.trim(),
      date: d.date || null,
      purchaseDate:
        d.kind === "purchase" ? d.date || null : d.purchaseDate || null,
      purchasePrice: amount(d.purchase),
      salePrice: amount(d.sale),
      boost: amount(d.boost) ?? 0,
      cleaning: amount(d.cleaning) ?? 0,
      genre: "Unisexe",
      category: "Autre",
    });
  }
  return validateSelection(result);
}
