import { CATEGORIES, GENRES, MAX_CENTS, type Article } from "../src/lib/model";
import { validDate } from "../src/lib/validation";
export { validDate };
export const GMAIL_FRAME_URL =
  "https://alisurvinted-lgtm.github.io/Vinted-manager/gmail-prototype/";
export const KINDS = [
  "incomplete",
  "sale_announced",
  "sale_final",
  "purchase",
  "purchase_final",
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
  referenceKey?: string | null;
  relatedKeys?: Partial<Record<ImportKind, string>>;
  dateEstimated?: boolean;
  confidence?: "reliable" | "incomplete" | "ambiguous";
  confirmed?: boolean;
  detectedKind?: ImportKind;
  quantity?: number | null;
  itemNames?: string[];
  acquisition?: {
    itemPrice: number | null;
    shipping: number | null;
    protection: number | null;
    otherFees: number | null;
  };
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
  referenceKey?: string | null;
  dateEstimated?: boolean;
  disposition?: "recorded" | "review" | "ignored";
  proposal?: VerifiedNotification;
  parserVersion?: number;
}
export interface ImportChoice {
  item: VerifiedNotification;
  mode:
    "create" | "sell" | "link" | "review" | "announce" | "refund" | "cancel";
  articleId: string | null;
  expectedUpdatedAt: string | null;
  distinctConfirmed: boolean;
  correctionRole?: "sale" | "purchase";
  returnToStock?: boolean;
  withdrawStock?: boolean;
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
    Object.keys(v)
      .filter(
        (k) =>
          ![
            "referenceKey",
            "relatedKeys",
            "dateEstimated",
            "confidence",
            "confirmed",
            "detectedKind",
            "quantity",
            "itemNames",
            "acquisition",
          ].includes(k),
      )
      .sort()
      .join(",") !== keys ||
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
  if (
    (v.referenceKey !== undefined &&
      v.referenceKey !== null &&
      !isDigest(v.referenceKey)) ||
    (v.dateEstimated !== undefined && typeof v.dateEstimated !== "boolean") ||
    (v.confidence !== undefined &&
      !["reliable", "incomplete", "ambiguous"].includes(
        v.confidence as string,
      )) ||
    (v.confirmed !== undefined && typeof v.confirmed !== "boolean") ||
    (v.quantity !== undefined &&
      v.quantity !== null &&
      (!Number.isSafeInteger(v.quantity) ||
        (v.quantity as number) < 1 ||
        (v.quantity as number) > 100)) ||
    (v.itemNames !== undefined &&
      (!Array.isArray(v.itemNames) ||
        v.itemNames.length > 100 ||
        v.itemNames.some(
          (n) => typeof n !== "string" || !n.trim() || n.length > 160,
        )))
  )
    throw new Error("Les informations de rapprochement sont invalides.");
  if (
    v.detectedKind !== undefined &&
    !KINDS.includes(v.detectedKind as ImportKind)
  )
    throw new Error("Type détecté invalide.");
  if (
    v.relatedKeys !== undefined &&
    (!object(v.relatedKeys) ||
      Object.entries(v.relatedKeys).some(
        ([k, value]) => !KINDS.includes(k as ImportKind) || !isDigest(value),
      ))
  )
    throw new Error("Références de rapprochement invalides.");
  if (
    v.acquisition !== undefined &&
    (!object(v.acquisition) ||
      Object.keys(v.acquisition).sort().join(",") !==
        "itemPrice,otherFees,protection,shipping" ||
      Object.values(v.acquisition).some((n) => n !== null && !cents(n)))
  )
    throw new Error("Détail du coût invalide.");
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
    Object.keys(v)
      .filter(
        (k) =>
          ![
            "referenceKey",
            "dateEstimated",
            "disposition",
            "proposal",
            "parserVersion",
          ].includes(k),
      )
      .sort()
      .join(",") !== expected ||
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
  if (
    (v.referenceKey !== undefined &&
      v.referenceKey !== null &&
      !isDigest(v.referenceKey)) ||
    (v.dateEstimated !== undefined && typeof v.dateEstimated !== "boolean") ||
    (v.disposition !== undefined &&
      !["recorded", "review", "ignored"].includes(v.disposition as string)) ||
    (v.parserVersion !== undefined &&
      (!Number.isSafeInteger(v.parserVersion) ||
        (v.parserVersion as number) < 1 ||
        (v.parserVersion as number) > 1000))
  )
    throw new Error("Métadonnées de suivi invalides.");
  if (v.proposal !== undefined) validateNotification(v.proposal);
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
