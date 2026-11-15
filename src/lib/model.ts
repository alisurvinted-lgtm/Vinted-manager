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
export interface Article {
  id: string;
  name: string;
  genre: (typeof GENRES)[number];
  category: (typeof CATEGORIES)[number];
  purchaseDate: string;
  purchasePrice: number;
  status: "stock" | "sold";
  salePrice: number | null;
  saleDate: string | null;
  fees: Fee[];
  createdAt: string;
  updatedAt: string;
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
  amount: number;
}
export interface Settings {
  id: "preferences";
  rateBps: number;
  lastExportAt?: string;
}
export const defaultSettings: Settings = {
  id: "preferences",
  rateBps: DEFAULT_RATE,
};
export function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export const currentMonth = () => today().slice(0, 7);
