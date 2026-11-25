import {
  CATEGORIES,
  FEE_TYPES,
  GENRES,
  MAX_CENTS,
  type Activity,
  type Article,
  type ArticleInput,
} from "./model";
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const cents = (v: unknown): v is number =>
  Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= MAX_CENTS;
const text = (v: unknown, max = 200): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;
export function validDate(v: unknown): v is string {
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    v < "1900-01-01" ||
    v > "9999-12-31"
  )
    return false;
  const date = new Date(`${v}T12:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === v
  );
}
const timestamp = (v: unknown): v is string =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}T/.test(v) &&
  Number.isFinite(Date.parse(v));
export function validateInput(value: unknown): asserts value is ArticleInput {
  if (
    !object(value) ||
    !text(value.name, 120) ||
    !GENRES.includes(value.genre as never) ||
    !CATEGORIES.includes(value.category as never) ||
    (value.purchaseDate !== null && !validDate(value.purchaseDate)) ||
    (value.purchasePrice !== null && !cents(value.purchasePrice)) ||
    !["stock", "sold"].includes(value.status as string)
  )
    throw new Error("Les informations de l’article sont invalides.");
  if (
    !Array.isArray(value.fees) ||
    value.fees.length > 100 ||
    value.fees.some(
      (f) =>
        !object(f) ||
        !text(f.id) ||
        !FEE_TYPES.includes(f.type as never) ||
        !cents(f.amount),
    )
  )
    throw new Error("Les frais de l’article sont invalides.");
  if (value.fees.reduce((sum, fee) => sum + fee.amount, 0) > MAX_CENTS)
    throw new Error("Le total des frais est trop élevé.");
  if (new Set(value.fees.map((f) => f.id)).size !== value.fees.length)
    throw new Error("Des frais sont dupliqués.");
  validateArticleDetails(value);
  if (value.status === "sold") {
    if (!cents(value.salePrice) || !validDate(value.saleDate))
      throw new Error("Renseignez le prix et la date de vente.");
    if (value.purchaseDate !== null && value.saleDate < value.purchaseDate)
      throw new Error("La date de vente doit suivre la date d’achat.");
  } else if (value.salePrice !== null || value.saleDate !== null)
    throw new Error("Un article en stock ne doit pas contenir de vente.");
}
export function validateArticle(v: unknown): asserts v is Article {
  validateInput(v);
  const a = v as unknown as Record<string, unknown>;
  if (!text(a.id) || !timestamp(a.createdAt) || !timestamp(a.updatedAt))
    throw new Error("Les métadonnées d’un article sont invalides.");
}
export function validateActivity(v: unknown): asserts v is Activity {
  if (
    !object(v) ||
    !text(v.id) ||
    !text(v.articleId) ||
    !text(v.name, 120) ||
    !["created", "updated", "sold", "restocked", "deleted"].includes(
      v.type as string,
    ) ||
    !timestamp(v.date) ||
    (v.amount !== null && !cents(v.amount))
  )
    throw new Error("L’historique de la sauvegarde est invalide.");
}

export function validateArticleDetails(value: Record<string, unknown>) {
  const digest = (v: unknown) =>
    v === null || (typeof v === "string" && /^[a-f0-9]{64}$/.test(v));
  for (const key of [
    "purchaseDateEstimated",
    "saleDateEstimated",
    "archived",
    "purchaseAlreadyCounted",
  ])
    if (value[key] !== undefined && typeof value[key] !== "boolean")
      throw new Error("Indication de date invalide.");
  for (const key of ["purchaseReference", "saleReference"])
    if (value[key] !== undefined && !digest(value[key]))
      throw new Error("Référence invalide.");
  if (
    value.announcedSaleDate !== undefined &&
    value.announcedSaleDate !== null &&
    !validDate(value.announcedSaleDate)
  )
    throw new Error("Date annoncée invalide.");
  if (value.restockedFrom !== undefined && !text(value.restockedFrom, 200))
    throw new Error("Origine de retour invalide.");
  if (
    value.announcedSalePrice !== undefined &&
    value.announcedSalePrice !== null &&
    !cents(value.announcedSalePrice)
  )
    throw new Error("Prix annoncé invalide.");
  if (
    value.cancellationDate !== undefined &&
    value.cancellationDate !== null &&
    !validDate(value.cancellationDate)
  )
    throw new Error("Date d’annulation invalide.");
  if (value.refunds !== undefined && Array.isArray(value.refunds)) {
    const refunds = value.refunds as { kind: string; amount: number }[];
    if (
      typeof value.purchasePrice === "number" &&
      refunds
        .filter((r) => r.kind === "purchase")
        .reduce((s, r) => s + r.amount, 0) > value.purchasePrice
    )
      throw new Error("Remboursements supérieurs à l’achat.");
    if (
      typeof value.salePrice === "number" &&
      refunds
        .filter((r) => r.kind === "sale")
        .reduce((s, r) => s + r.amount, 0) > value.salePrice
    )
      throw new Error("Remboursements supérieurs à la vente.");
  }
  if (
    value.quantity !== undefined &&
    value.quantity !== null &&
    (!Number.isSafeInteger(value.quantity) ||
      (value.quantity as number) < 1 ||
      (value.quantity as number) > 100)
  )
    throw new Error("Quantité invalide.");
  if (value.pendingSale !== undefined) {
    const p = value.pendingSale;
    if (
      !object(p) ||
      Object.keys(p).sort().join(",") !==
        "date,dateEstimated,price,referenceKey" ||
      (p.price !== null && !cents(p.price)) ||
      !validDate(p.date) ||
      typeof p.dateEstimated !== "boolean" ||
      !digest(p.referenceKey)
    )
      throw new Error("Vente en attente invalide.");
  }
  if (
    value.bundleItems !== undefined &&
    (!Array.isArray(value.bundleItems) ||
      value.bundleItems.length > 100 ||
      value.bundleItems.some(
        (i) =>
          !object(i) ||
          !text(i.name, 160) ||
          (i.cost !== null && !cents(i.cost)),
      ))
  )
    throw new Error("Détail du lot invalide.");
  if (
    value.acquisition !== undefined &&
    (!object(value.acquisition) ||
      Object.keys(value.acquisition).sort().join(",") !==
        "itemPrice,otherFees,protection,shipping" ||
      Object.values(value.acquisition).some((v) => v !== null && !cents(v)))
  )
    throw new Error("Détail d’acquisition invalide.");
  if (
    value.refunds !== undefined &&
    (!Array.isArray(value.refunds) ||
      value.refunds.length > 100 ||
      value.refunds.some(
        (r) =>
          !object(r) ||
          !text(r.id, 200) ||
          !cents(r.amount) ||
          !validDate(r.date) ||
          typeof r.dateEstimated !== "boolean" ||
          !["sale", "purchase"].includes(r.kind as string) ||
          (r.returnedStockId !== undefined && !text(r.returnedStockId, 200)),
      ) ||
      new Set(value.refunds.map((r) => r.id)).size !== value.refunds.length)
  )
    throw new Error("Remboursements invalides.");
}
export function articleDetails(a: Article): Partial<Article> {
  return {
    ...(a.archived !== undefined ? { archived: a.archived } : {}),
    ...(a.purchaseAlreadyCounted !== undefined
      ? { purchaseAlreadyCounted: a.purchaseAlreadyCounted }
      : {}),
    ...(a.restockedFrom ? { restockedFrom: a.restockedFrom } : {}),
    ...(a.purchaseDateEstimated !== undefined
      ? { purchaseDateEstimated: a.purchaseDateEstimated }
      : {}),
    ...(a.saleDateEstimated !== undefined
      ? { saleDateEstimated: a.saleDateEstimated }
      : {}),
    ...(a.purchaseReference !== undefined
      ? { purchaseReference: a.purchaseReference }
      : {}),
    ...(a.saleReference !== undefined
      ? { saleReference: a.saleReference }
      : {}),
    ...(a.announcedSalePrice !== undefined
      ? { announcedSalePrice: a.announcedSalePrice }
      : {}),
    ...(a.cancellationDate !== undefined
      ? { cancellationDate: a.cancellationDate }
      : {}),
    ...(a.announcedSaleDate !== undefined
      ? { announcedSaleDate: a.announcedSaleDate }
      : {}),
    ...(a.pendingSale ? { pendingSale: { ...a.pendingSale } } : {}),
    ...(a.quantity !== undefined ? { quantity: a.quantity } : {}),
    ...(a.bundleItems
      ? {
          bundleItems: a.bundleItems.map((i) => ({
            name: i.name,
            cost: i.cost,
          })),
        }
      : {}),
    ...(a.acquisition ? { acquisition: { ...a.acquisition } } : {}),
    ...(a.refunds
      ? {
          refunds: a.refunds.map((r) => ({
            id: r.id,
            amount: r.amount,
            date: r.date,
            dateEstimated: r.dateEstimated,
            kind: r.kind,
            ...(r.returnedStockId
              ? { returnedStockId: r.returnedStockId }
              : {}),
          })),
        }
      : {}),
  };
}
