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
    !validDate(value.purchaseDate) ||
    !cents(value.purchasePrice) ||
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
  if (value.status === "sold") {
    if (!cents(value.salePrice) || !validDate(value.saleDate))
      throw new Error("Renseignez le prix et la date de vente.");
    if (value.saleDate < value.purchaseDate)
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
    !cents(v.amount)
  )
    throw new Error("L’historique de la sauvegarde est invalide.");
}
