import { MAX_CENTS, type Article } from "./model";
import { isMonth, moveMonth, monthRange } from "./periods";

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
export const editMoney = (cents: number | null) =>
  cents === null ? "" : (cents / 100).toFixed(2);
const formatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});
export const money = (cents: number | null) =>
  cents === null ? "À compléter" : formatter.format(cents / 100);
export const amountClass = (value: number | null) =>
  value === null ? "" : value < 0 ? "negative" : "positive";
export const rateLabel = (bps: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(
    bps / 100,
  );
export const feeTotal = (article: Article) =>
  article.fees.reduce((sum, fee) => sum + fee.amount, 0);
export const contribution = (saleCents: number, rateBps: number) =>
  Math.round((saleCents * rateBps) / 10000);
export const effectivePurchasePrice = (article: Article): number | null =>
  article.purchasePrice === null
    ? null
    : article.purchasePrice -
      (article.refunds ?? [])
        .filter((r) => r.kind === "purchase")
        .reduce((s, r) => s + r.amount, 0);
export const profit = (article: Article, rateBps: number): number | null => {
  if (article.status !== "sold") return 0;
  const cost = effectivePurchasePrice(article);
  if (cost === null) return null;
  const refunded = (article.refunds ?? []).filter((r) => r.kind === "sale");
  return (
    article.salePrice! -
    cost -
    feeTotal(article) -
    contribution(article.salePrice!, rateBps) +
    refunded.reduce(
      (s, r) =>
        s -
        r.amount +
        contribution(r.amount, rateBps) +
        (r.returnedStockId ? cost : 0),
      0,
    )
  );
};
export function totals(articles: Article[], rateBps: number, period?: string) {
  const inPeriod = (date: string | null | undefined) =>
    !!date && (!period || date.startsWith(period));
  const sold = articles.filter(
    (a) => a.status === "sold" && inPeriod(a.saleDate),
  );
  const stock = articles.filter((a) => a.status === "stock" && !a.archived);
  const bought = articles.filter(
    (a) => !a.purchaseAlreadyCounted && (!period || inPeriod(a.purchaseDate)),
  );
  const corrections = articles.flatMap((a) =>
    (a.refunds ?? [])
      .filter((r) => inPeriod(r.date))
      .map((refund) => ({ article: a, refund })),
  );
  const saleRefunds = corrections.filter((e) => e.refund.kind === "sale");
  const purchaseRefunds = corrections
    .filter((e) => e.refund.kind === "purchase")
    .reduce((s, e) => s + e.refund.amount, 0);
  const incompleteIds = new Set(
    sold.filter((a) => effectivePurchasePrice(a) === null).map((a) => a.id),
  );
  for (const e of saleRefunds)
    if (e.refund.returnedStockId && effectivePurchasePrice(e.article) === null)
      incompleteIds.add(e.article.id);
  const boostFees = sold.reduce(
    (s, a) =>
      s +
      a.fees
        .filter((f) => f.type === "Boost Vinted")
        .reduce((n, f) => n + f.amount, 0),
    0,
  );
  const cleaningFees = sold.reduce(
    (s, a) =>
      s +
      a.fees
        .filter((f) => f.type === "Nettoyage")
        .reduce((n, f) => n + f.amount, 0),
    0,
  );
  const baseNet = (a: Article) => {
    const c = effectivePurchasePrice(a);
    return c === null
      ? null
      : a.salePrice! - c - feeTotal(a) - contribution(a.salePrice!, rateBps);
  };
  const correctionNet = (e: (typeof saleRefunds)[number]) => {
    const c = effectivePurchasePrice(e.article);
    return e.refund.returnedStockId && c === null
      ? null
      : -e.refund.amount +
          contribution(e.refund.amount, rateBps) +
          (e.refund.returnedStockId ? c! : 0);
  };
  const knownNet =
    sold.reduce((s, a) => s + (baseNet(a) ?? 0), 0) +
    saleRefunds.reduce((s, e) => s + (correctionNet(e) ?? 0), 0);
  const revenue =
    sold.reduce((s, a) => s + a.salePrice!, 0) -
    saleRefunds.reduce((s, e) => s + e.refund.amount, 0);
  const contributions =
    sold.reduce((s, a) => s + contribution(a.salePrice!, rateBps), 0) -
    saleRefunds.reduce((s, e) => s + contribution(e.refund.amount, rateBps), 0);
  const purchaseOutflow = bought.some((a) => a.purchasePrice === null)
    ? null
    : bought.reduce((s, a) => s + a.purchasePrice!, 0) - purchaseRefunds;
  const asOf =
    period?.length === 7
      ? monthRange(period).last
      : period?.length === 4
        ? period + "-12-31"
        : null;
  const pending = articles.filter(
    (a) =>
      (!!asOf || !a.archived) &&
      a.announcedSaleDate &&
      (!asOf || a.announcedSaleDate <= asOf) &&
      (!a.saleDate || (asOf && a.saleDate > asOf)) &&
      (!a.cancellationDate || (asOf && a.cancellationDate > asOf)),
  );
  const net = incompleteIds.size ? null : knownNet;
  return {
    revenue,
    net,
    knownNet,
    completeSoldCount: sold.filter((a) => effectivePurchasePrice(a) !== null)
      .length,
    incompleteProfitCount: incompleteIds.size,
    estimatedSaleDates: sold.filter((a) => a.saleDateEstimated).length,
    acquisitionCost: sold.some((a) => effectivePurchasePrice(a) === null)
      ? null
      : sold.reduce((s, a) => s + effectivePurchasePrice(a)!, 0),
    unknownPurchaseDates: articles.filter(
      (a) => !a.purchaseDate && !a.purchaseAlreadyCounted,
    ).length,
    boostFees,
    cleaningFees,
    salesFees: boostFees + cleaningFees,
    purchaseOutflow,
    purchasedCount: bought.length,
    contributions,
    soldCount: sold.length,
    stockCount: stock.reduce((s, a) => s + (a.quantity ?? 1), 0),
    stockInvestment: stock.some((a) => effectivePurchasePrice(a) === null)
      ? null
      : stock.reduce((s, a) => s + effectivePurchasePrice(a)! + feeTotal(a), 0),
    averageSale: sold.length
      ? Math.round(sold.reduce((s, a) => s + a.salePrice!, 0) / sold.length)
      : 0,
    averageProfit:
      net === null ? null : sold.length ? Math.round(net / sold.length) : 0,
    pendingCount: pending.length,
    pendingAmount: pending.some(
      (a) => (a.pendingSale?.price ?? a.announcedSalePrice) === null,
    )
      ? null
      : pending.reduce(
          (s, a) => s + (a.pendingSale?.price ?? a.announcedSalePrice ?? 0),
          0,
        ),
    purchaseRefunds,
    saleRefundAmount: saleRefunds.reduce((s, e) => s + e.refund.amount, 0),
    cashFlow: purchaseOutflow === null ? null : revenue - purchaseOutflow,
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

export function monthlyReport(
  articles: Article[],
  rateBps: number,
  month: string,
) {
  if (!isMonth(month))
    throw new Error("Choisissez un mois et une année valides.");
  const previousMonth = moveMonth(month, -1);
  const current = totals(articles, rateBps, month);
  const previous = previousMonth
    ? totals(articles, rateBps, previousMonth)
    : null;
  return { month, previousMonth, current, previous };
}
export function changePercent(
  current: number,
  previous: number,
): number | null {
  // Les écarts en euros restent lisibles quand la référence est nulle ou négative.
  return previous > 0 && current >= 0
    ? Math.round(((current - previous) * 10000) / previous)
    : null;
}
