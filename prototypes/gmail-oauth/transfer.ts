import { sourceKey, stageKey, referenceKey, relatedKeys } from "./identifiers";
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

export async function proposalSelection(
  rows: PreviewRow[],
): Promise<VerifiedNotification[]> {
  const result: VerifiedNotification[] = [];
  for (const row of rows) {
    if (!row.authenticated) continue;
    const a = row.analysis;
    if (!a) continue;
    const id = await sourceKey(row.id);
    const ref = a.reference;
    const kind =
      a.confirmed &&
      a.name &&
      (!["sale_final", "sale_announced"].includes(a.kind) ||
        a.salePrice !== null)
        ? a.kind
        : "incomplete";
    result.push({
      sourceKey: id,
      eventKey:
        ref && !["refund", "cancellation"].includes(a.kind)
          ? await stageKey(a.kind, ref)
          : id,
      referenceKey: ref ? await referenceKey(ref) : null,
      relatedKeys: ref ? await relatedKeys(ref) : {},
      kind,
      detectedKind: a.kind,
      name: a.name?.slice(0, 120) ?? "Nom à compléter",
      date: a.date,
      purchaseDate: a.kind === "purchase" ? a.date : null,
      purchasePrice: a.purchasePrice,
      salePrice: a.salePrice,
      boost: 0,
      cleaning: 0,
      genre: "Unisexe",
      category: "Autre",
      dateEstimated: a.dateEstimated,
      confidence: a.confidence,
      confirmed: a.confirmed,
      quantity: a.quantity,
      itemNames: a.itemNames,
      acquisition: {
        itemPrice: a.itemPrice,
        shipping: a.shipping,
        protection: a.protection,
        otherFees: a.otherFees,
      },
    });
  }
  return result.length ? validateSelection(result) : [];
}
