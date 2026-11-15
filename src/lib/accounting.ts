import { MAX_CENTS, type Article } from "./model";

// Conversion décimale en entier : aucun calcul financier sur un montant en euros flottant.
export function parseMoney(value: string): number {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized))
    throw new Error(
      "Saisissez un montant positif avec deux décimales maximum.",
    );
  const [euros, decimals = ""] = normalized.split(".");
  const cents = Number(euros) * 100 + Number(decimals.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS)
    throw new Error("Le montant est trop élevé.");
  return cents;
}
export function parseRate(value: string): number {
  const bps = parseMoney(value);
  if (bps > 10000)
    throw new Error("Le taux doit être compris entre 0 et 100 %.");
  return bps;
}
export const editMoney = (cents: number) => (cents / 100).toFixed(2);
const formatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});
export const money = (cents: number) => formatter.format(cents / 100);
export const rateLabel = (bps: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(
    bps / 100,
  );
export const feeTotal = (article: Article) =>
  article.fees.reduce((sum, fee) => sum + fee.amount, 0);
export const contribution = (saleCents: number, rateBps: number) =>
  Math.round((saleCents * rateBps) / 10000);
export const profit = (article: Article, rateBps: number) =>
  article.status === "sold"
    ? article.salePrice! -
      article.purchasePrice -
      feeTotal(article) -
      contribution(article.salePrice!, rateBps)
    : 0;
export function totals(articles: Article[], rateBps: number, period?: string) {
  const sold = articles.filter(
    (a) => a.status === "sold" && (!period || a.saleDate?.startsWith(period)),
  );
  const stock = articles.filter((a) => a.status === "stock");
  const revenue = sold.reduce((sum, a) => sum + a.salePrice!, 0);
  const net = sold.reduce((sum, a) => sum + profit(a, rateBps), 0);
  return {
    revenue,
    net,
    contributions: sold.reduce(
      (sum, a) => sum + contribution(a.salePrice!, rateBps),
      0,
    ),
    soldCount: sold.length,
    stockCount: stock.length,
    stockInvestment: stock.reduce(
      (sum, a) => sum + a.purchasePrice + feeTotal(a),
      0,
    ),
    averageSale: sold.length ? Math.round(revenue / sold.length) : 0,
    averageProfit: sold.length ? Math.round(net / sold.length) : 0,
  };
}
export function monthlyTotals(
  articles: Article[],
  rateBps: number,
  year: number,
) {
  return Array.from({ length: 12 }, (_, i) => ({
    month: `${year}-${String(i + 1).padStart(2, "0")}`,
    ...totals(articles, rateBps, `${year}-${String(i + 1).padStart(2, "0")}`),
  }));
}
