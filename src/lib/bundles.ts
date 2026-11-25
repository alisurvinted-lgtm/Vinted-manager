import { db, type ManagerDB } from "./db";
import { validateInput } from "./validation";
import type { Article, ArticleInput } from "./model";
export async function splitBundle(
  id: string,
  parts: { name: string; cost: number; boost: number; cleaning: number }[],
  expectedUpdatedAt: string,
  database: ManagerDB = db,
) {
  if (!Array.isArray(parts) || parts.length < 2 || parts.length > 100)
    throw new Error("Précisez les articles du lot.");
  return database.transaction("rw", async (tx) => {
    const a = await tx.articles.get(id);
    if (
      !a ||
      a.status !== "stock" ||
      a.updatedAt !== expectedUpdatedAt ||
      a.pendingSale
    )
      throw new Error("Le lot a changé ou fait déjà l’objet d’une vente.");
    if (a.purchasePrice === null)
      throw new Error("Renseignez le coût total avant sa répartition.");
    if (a.quantity && a.quantity !== parts.length)
      throw new Error(
        "Le nombre d’articles doit correspondre à la quantité du lot.",
      );
    const originalBoost = a.fees
        .filter((f) => f.type === "Boost Vinted")
        .reduce((s, f) => s + f.amount, 0),
      originalCleaning = a.fees
        .filter((f) => f.type === "Nettoyage")
        .reduce((s, f) => s + f.amount, 0);
    if (
      parts.reduce((s, p) => s + p.cost, 0) !== a.purchasePrice ||
      parts.reduce((s, p) => s + p.boost, 0) !== originalBoost ||
      parts.reduce((s, p) => s + p.cleaning, 0) !== originalCleaning
    )
      throw new Error(
        "La somme des répartitions doit être égale aux coûts et frais du lot.",
      );
    const now = new Date().toISOString();
    const children: Article[] = [];
    for (const p of parts) {
      const input: ArticleInput = {
        name: p.name,
        genre: a.genre,
        category: a.category,
        purchasePrice: p.cost,
        purchaseDate: a.purchaseDate,
        status: "stock",
        salePrice: null,
        saleDate: null,
        fees: [
          ...(p.boost
            ? [
                {
                  id: crypto.randomUUID(),
                  type: "Boost Vinted" as const,
                  amount: p.boost,
                },
              ]
            : []),
          ...(p.cleaning
            ? [
                {
                  id: crypto.randomUUID(),
                  type: "Nettoyage" as const,
                  amount: p.cleaning,
                },
              ]
            : []),
        ],
        purchaseReference: a.purchaseReference ?? null,
        purchaseDateEstimated: a.purchaseDateEstimated ?? false,
        quantity: 1,
        purchaseAlreadyCounted: a.purchaseAlreadyCounted ?? false,
      };
      validateInput(input);
      children.push({
        ...input,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
      });
    }
    await tx.articles.bulkAdd(children);
    await tx.articles.delete(a.id);
    await tx.activities.add({
      id: crypto.randomUUID(),
      articleId: children[0].id,
      name: ("Lot réparti : " + a.name).slice(0, 120),
      type: "updated",
      date: now,
      amount: a.purchasePrice,
    });
    return children;
  });
}
