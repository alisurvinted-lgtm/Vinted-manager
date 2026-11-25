import type { Article } from "./model";
import type { LedgerTables } from "./secure-db";
// Un retour physique conserve le coût du même bien, sans nouvelle sortie de trésorerie.
// Compléter une valeur inconnue propage seulement les coûts manquants reliés par nos IDs.
export async function completeReturnedCosts(
  tx: LedgerTables,
  article: Article,
) {
  if (article.purchasePrice === null) return;
  const all = await tx.articles.toArray();
  const byId = new Map(all.map((a) => [a.id, a]));
  byId.set(article.id, article);
  const queue = [article],
    seen = new Set<string>();
  while (queue.length) {
    const current = queue.shift()!;
    if (seen.has(current.id) || current.purchasePrice === null) continue;
    seen.add(current.id);
    const refundSum = (a: Article) =>
      (a.refunds ?? [])
        .filter((r) => r.kind === "purchase")
        .reduce((s, r) => s + r.amount, 0);
    const parent = current.restockedFrom
      ? byId.get(current.restockedFrom)
      : undefined;
    if (
      parent &&
      parent.purchasePrice === null &&
      parent.refunds?.some((r) => r.returnedStockId === current.id)
    ) {
      const cost = current.purchasePrice + refundSum(parent);
      if (cost <= 999999999) {
        const next = {
          ...parent,
          purchasePrice: cost,
          updatedAt: new Date().toISOString(),
        };
        await tx.articles.put(next);
        byId.set(next.id, next);
        queue.push(next);
      }
    }
    for (const r of current.refunds ?? []) {
      const child = r.returnedStockId ? byId.get(r.returnedStockId) : undefined;
      if (child?.restockedFrom === current.id && child.purchasePrice === null) {
        const next = {
          ...child,
          purchasePrice: current.purchasePrice - refundSum(current),
          updatedAt: new Date().toISOString(),
        };
        await tx.articles.put(next);
        byId.set(next.id, next);
        queue.push(next);
      }
    }
  }
}
