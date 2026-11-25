import { parisDate } from "../../protocols/paris";
export const GENRES = ["Homme", "Femme", "Enfant", "Unisexe"] as const;
export const CATEGORIES = [
  "Sweat / Hoodie",
  "Pull",
  "Polaire",
  "Veste / Manteau",
  "T-shirt",
  "Polo",
  "Chemise",
  "Jean",
  "Pantalon",
  "Short",
  "Robe",
  "Jupe",
  "Chaussures",
  "Baskets",
  "Sac",
  "Accessoires",
  "Autre",
] as const;
export const FEE_TYPES = ["Boost Vinted", "Nettoyage"] as const;
export const DEFAULT_RATE = 1230;
export const MAX_CENTS = 999_999_999;
export interface Fee {
  id: string;
  type: (typeof FEE_TYPES)[number];
  amount: number;
}
export interface PendingSale {
  price: number | null;
  date: string;
  dateEstimated: boolean;
  referenceKey: string | null;
}
export interface Refund {
  id: string;
  amount: number;
  date: string;
  dateEstimated: boolean;
  kind: "sale" | "purchase";
  returnedStockId?: string;
}
export interface Article {
  id: string;
  name: string;
  genre: (typeof GENRES)[number];
  category: (typeof CATEGORIES)[number];
  purchaseDate: string | null;
  purchasePrice: number | null;
  status: "stock" | "sold";
  salePrice: number | null;
  saleDate: string | null;
  fees: Fee[];
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
  purchaseAlreadyCounted?: boolean;
  restockedFrom?: string;
  purchaseDateEstimated?: boolean;
  saleDateEstimated?: boolean;
  purchaseReference?: string | null;
  saleReference?: string | null;
  announcedSaleDate?: string | null;
  announcedSalePrice?: number | null;
  cancellationDate?: string | null;
  pendingSale?: PendingSale;
  quantity?: number | null;
  bundleItems?: { name: string; cost: number | null }[];
  acquisition?: {
    itemPrice: number | null;
    shipping: number | null;
    protection: number | null;
    otherFees: number | null;
  };
  refunds?: Refund[];
}
export type ArticleInput = Omit<Article, "id" | "createdAt" | "updatedAt">;
export type ActivityType =
  "created" | "updated" | "sold" | "restocked" | "deleted";
export interface Activity {
  id: string;
  articleId: string;
  name: string;
  type: ActivityType;
  date: string;
  amount: number | null;
}
export interface Settings {
  id: "preferences";
  rateBps: number;
  lastExportAt?: string;
  autoLockMinutes?: 1 | 5 | 15;
  gmailProgress?: {
    period: string;
    pageToken: string | null;
    complete: boolean;
    updatedAt: string;
  }[];
}
export const defaultSettings: Settings = {
  id: "preferences",
  rateBps: DEFAULT_RATE,
};
export function today() {
  return parisDate();
}
export const currentMonth = () => today().slice(0, 7);
