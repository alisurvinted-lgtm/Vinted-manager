import { parisDate, parisMonthBounds } from "../../protocols/paris";
import { analyzeNotification, type Analysis } from "./analyze";
export const REVIEW_KINDS = {
  incomplete: "Transaction incomplète",
  sale_announced: "Vente annoncée",
  sale_final: "Vente finalisée",
  purchase: "Achat confirmé",
  purchase_final: "Achat finalisé (suivi)",
  cancellation: "Annulation",
  refund: "Remboursement",
} as const;
export type ReviewKind = keyof typeof REVIEW_KINDS;
export interface AmountMention {
  cents: number;
  context: string;
}
export interface PreviewRow {
  id: string;
  subject: string;
  receivedAt: string;
  authenticated: boolean;
  suggestion: string;
  text: string;
  amounts: AmountMention[];
  reference: string | null;
  warning: string | null;
  analysis?: Analysis;
  draft: {
    kind: ReviewKind;
    article: string;
    purchase: string;
    sale: string;
    boost: string;
    cleaning: string;
    date: string;
    purchaseDate: string;
    dateEstimated?: boolean;
    checked: boolean;
  };
}
export interface PreviewBatch {
  month: string;
  rows: PreviewRow[];
  seenIds: string[];
  nextPageToken: string | null;
  examined: number;
  ignored: number;
  alreadyKnown?: number;
  complete?: boolean;
  limited: boolean;
}
export function monthBounds(month: string) {
  if (
    !/^(?:20\d{2}|[3-9]\d{3})-(?:0[1-9]|1[0-2])$/.test(month) ||
    month < "2004-01" ||
    month > currentMailMonth()
  )
    throw new Error("Choisissez un mois de réception valide.");
  return parisMonthBounds(month);
}
export function currentMailMonth() {
  return parisDate().slice(0, 7);
}
export function moneyCents(value: string): number | null {
  const normalized = value
    .trim()
    .replace(/[ \u00a0\u202f]/g, "")
    .replace(",", ".");
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [euros, decimals = ""] = normalized.split(".");
  const cents = Number(euros) * 100 + Number(decimals.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= 999999999 ? cents : null;
}
export function suggestKind(subject: string): string {
  const s = subject
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/\brembours/.test(s)) return "Remboursement mentionné — à confirmer";
  if (/\bannul/.test(s)) return "Annulation mentionnée — à confirmer";
  if (/\b(?:finalise|finalisee|termine|terminee)\b/.test(s))
    return "Finalisation mentionnée — achat ou vente à préciser";
  if (/\b(?:vendu|vendue|vente)\b/.test(s))
    return "Vente mentionnée — finalisation à vérifier";
  if (/\b(?:achat|commande|achete)\b/.test(s))
    return "Achat ou commande mentionné — à confirmer";
  return "Notification à examiner";
}
export function amountMentions(text: string): AmountMention[] {
  const found = new Map<number, AmountMention>();
  for (const match of text.matchAll(
    /(?<![\d.,])(-?\d{1,7}(?:[ \u00a0\u202f]\d{3})*(?:[,.]\d{1,2})?)[ \u00a0\u202f]*(?:€|EUR\b)/gi,
  )) {
    const negative = match[1].startsWith("-");
    const cents = moneyCents(negative ? match[1].slice(1) : match[1]);
    if (cents === null) continue;
    const amount = negative ? -cents : cents;
    if (!found.has(amount))
      found.set(amount, {
        cents: amount,
        context: text
          .slice(
            Math.max(0, match.index! - 45),
            match.index! + match[0].length + 45,
          )
          .replace(/\s+/g, " "),
      });
    if (found.size >= 20) break;
  }
  return [...found.values()];
}
export function explicitReference(text: string): string | null {
  const values = [
    ...text.matchAll(
      /(?:r[eé]f[eé]rence|num[eé]ro|n[°o])\s+(?:(?:de|du)\s+)?(?:(?:la|ta|votre)\s+)?(?:commande|transaction)\s*[:#]\s*([a-zA-Z0-9-]{4,64})(?![a-zA-Z0-9-])/gi,
    ),
  ].map((m) => m[1]);
  const distinct = [...new Set(values)];
  return distinct.length === 1 ? distinct[0] : null;
}
export function proposedRow(
  id: string,
  subject: string,
  receivedAt: string,
  authenticated: boolean,
  text: string,
  warning: string | null,
  evidence?: { names?: string[]; references?: string[] },
): PreviewRow {
  const analysis = analyzeNotification(subject, text, receivedAt, evidence);
  const usable = authenticated && analysis.confirmed;
  return {
    analysis,
    id,
    subject,
    receivedAt,
    authenticated,
    suggestion: suggestKind(subject),
    text: text.slice(0, 12000),
    amounts: amountMentions(text),
    reference: explicitReference(text),
    warning,
    draft: {
      kind: usable ? analysis.kind : "incomplete",
      article: usable ? (analysis.name ?? "") : "",
      purchase:
        usable && analysis.purchasePrice !== null
          ? (analysis.purchasePrice / 100).toFixed(2)
          : "",
      sale:
        usable && analysis.salePrice !== null
          ? (analysis.salePrice / 100).toFixed(2)
          : "",
      boost: "",
      cleaning: "",
      date: usable ? analysis.date : "",
      dateEstimated: usable && analysis.dateEstimated,
      purchaseDate: "",
      checked: false,
    },
  };
}
