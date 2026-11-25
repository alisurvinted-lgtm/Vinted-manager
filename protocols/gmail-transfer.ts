import { CATEGORIES, GENRES, MAX_CENTS, type Article } from "../src/lib/model";
import { validDate } from "../src/lib/validation";
export const GMAIL_FRAME_URL =
  "https://alisurvinted-lgtm.github.io/Vinted-manager/gmail-prototype/";
export const KINDS = [
  "incomplete",
  "sale_announced",
  "sale_final",
  "purchase",
  "cancellation",
  "refund",
] as const;
export type ImportKind = (typeof KINDS)[number];
export interface VerifiedNotification {
  sourceKey: string;
  eventKey: string;
  kind: ImportKind;
  name: string;
  date: string | null;
  purchaseDate: string | null;
  purchasePrice: number | null;
  salePrice: number | null;
  boost: number;
  cleaning: number;
  genre: Article["genre"];
  category: Article["category"];
}
export interface ImportRecord {
  id: string;
  eventKey: string;
  kind: ImportKind;
  name: string;
  date: string | null;
  amount: number | null;
  articleId: string | null;
  resolved: boolean;
  recordedAt: string;
}
export interface ImportChoice {
  item: VerifiedNotification;
  mode: "create" | "sell" | "link" | "review";
  articleId: string | null;
  expectedUpdatedAt: string | null;
  distinctConfirmed: boolean;
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export const isDigest = (v: unknown): v is string =>
  typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const cents = (v: unknown): v is number =>
  Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= MAX_CENTS;
const nullableDate = (v: unknown) => v === null || validDate(v);
const keys = [
  "sourceKey",
  "eventKey",
  "kind",
  "name",
  "date",
  "purchaseDate",
  "purchasePrice",
  "salePrice",
  "boost",
  "cleaning",
  "genre",
  "category",
]
  .sort()
  .join(",");
export function validateNotification(
  v: unknown,
): asserts v is VerifiedNotification {
  if (
    !object(v) ||
    Object.keys(v).sort().join(",") !== keys ||
    !isDigest(v.sourceKey) ||
    !isDigest(v.eventKey) ||
    !KINDS.includes(v.kind as ImportKind) ||
    typeof v.name !== "string" ||
    !v.name.trim() ||
    v.name.length > 120 ||
    /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(v.name) ||
    !nullableDate(v.date) ||
    !nullableDate(v.purchaseDate) ||
    (v.purchasePrice !== null && !cents(v.purchasePrice)) ||
    (v.salePrice !== null && !cents(v.salePrice)) ||
    !cents(v.boost) ||
    !cents(v.cleaning) ||
    v.boost + v.cleaning > MAX_CENTS ||
    !GENRES.includes(v.genre as never) ||
    !CATEGORIES.includes(v.category as never)
  )
    throw new Error("La sélection contient une transaction invalide.");
  if (v.kind === "sale_final" && (!validDate(v.date) || !cents(v.salePrice)))
    throw new Error(
      "Une vente finalisée exige un prix et une date de vente confirmés.",
    );
  if (
    v.kind === "sale_final" &&
    v.purchaseDate !== null &&
    (v.date as string) < (v.purchaseDate as string)
  )
    throw new Error("La vente doit suivre l’achat.");
}
export function validateSelection(v: unknown): VerifiedNotification[] {
  if (!Array.isArray(v) || !v.length || v.length > 200)
    throw new Error("Sélection invalide : 1 à 200 éléments.");
  v.forEach(validateNotification);
  if (new Set(v.map((i) => i.sourceKey)).size !== v.length)
    throw new Error("La sélection contient des notifications en double.");
  return v.map((i) => ({ ...i, name: i.name.trim() }));
}
export function validateImportRecord(v: unknown): asserts v is ImportRecord {
  const expected = [
    "id",
    "eventKey",
    "kind",
    "name",
    "date",
    "amount",
    "articleId",
    "resolved",
    "recordedAt",
  ]
    .sort()
    .join(",");
  if (
    !object(v) ||
    Object.keys(v).sort().join(",") !== expected ||
    !isDigest(v.id) ||
    !isDigest(v.eventKey) ||
    !KINDS.includes(v.kind as ImportKind) ||
    typeof v.name !== "string" ||
    !v.name.trim() ||
    v.name.length > 120 ||
    !nullableDate(v.date) ||
    (v.amount !== null && !cents(v.amount)) ||
    (v.articleId !== null &&
      (typeof v.articleId !== "string" ||
        !v.articleId ||
        v.articleId.length > 200)) ||
    typeof v.resolved !== "boolean" ||
    typeof v.recordedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T/.test(v.recordedAt) ||
    !Number.isFinite(Date.parse(v.recordedAt))
  )
    throw new Error("Le suivi des imports est invalide.");
}
export async function digest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  try {
    return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } finally {
    bytes.fill(0);
  }
}
