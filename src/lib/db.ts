import { completeReturnedCosts } from "./acquisition-cost";
import { ManagerDB } from "./secure-db";
export { ManagerDB } from "./secure-db";
import { defaultSettings, type Article, type ArticleInput } from "./model";
import { articleDetails, validateInput } from "./validation";

export const db = new ManagerDB();
// Saisie rapide : ne modifier que le coût encore inconnu de la dernière fiche.
export async function completePurchasePrice(
  id: string,
  purchasePrice: number,
  database = db,
) {
  return database.transaction("rw", async (tx) => {
    const current = await tx.articles.get(id);
    if (!current || current.purchasePrice !== null)
      throw new Error(
        "Le prix d’achat a déjà été complété ou l’article n’existe plus.",
      );
    const now = new Date().toISOString();
    const article = { ...current, purchasePrice, updatedAt: now };
    validateInput(article);
    await tx.articles.put(article);
    await completeReturnedCosts(tx, article);
    await tx.activities.add({
      id: crypto.randomUUID(),
      articleId: id,
      name: article.name,
      type: "updated",
      date: now,
      amount: article.status === "sold" ? article.salePrice : purchasePrice,
    });
  });
}
export async function saveArticle(
  input: ArticleInput,
  id?: string,
  database = db,
): Promise<Article> {
  validateInput(input);
  return database.transaction(
    "rw",
    database.articles,
    database.activities,
    async (tx) => {
      const previous = id ? await tx.articles.get(id) : undefined;
      if (id && !previous) throw new Error("Cet article n’existe plus.");
      const now = new Date().toISOString();
      if (
        previous?.refunds?.length &&
        previous.status === "sold" &&
        input.status === "stock"
      )
        throw new Error(
          "Utilisez le retour en stock associé au remboursement pour conserver l’historique financier.",
        );
      const article: Article = {
        ...(previous ? articleDetails(previous) : {}),
        ...input,
        name: input.name.trim(),
        id: id ?? crypto.randomUUID(),
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
      };
      if (article.status === "sold") delete article.pendingSale;
      validateInput(article);
      await tx.articles.put(article);
      if (previous?.purchasePrice === null && article.purchasePrice !== null)
        await completeReturnedCosts(tx, article);
      const type = previous
        ? previous.status !== article.status
          ? article.status === "sold"
            ? "sold"
            : "restocked"
          : "updated"
        : article.status === "sold"
          ? "sold"
          : "created";
      await tx.activities.add({
        id: crypto.randomUUID(),
        articleId: article.id,
        name: article.name,
        type,
        date: now,
        amount:
          article.status === "sold"
            ? article.salePrice!
            : article.purchasePrice,
      });
      return article;
    },
  );
}
export async function deleteArticle(id: string, database = db) {
  await database.transaction(
    "rw",
    database.articles,
    database.activities,
    async (tx) => {
      const article = await tx.articles.get(id);
      if (!article) throw new Error("Cet article n’existe plus.");
      if (article.refunds?.length)
        await tx.articles.put({
          ...article,
          archived: true,
          updatedAt: new Date().toISOString(),
        });
      else await tx.articles.delete(id);
      await tx.activities.add({
        id: crypto.randomUUID(),
        articleId: id,
        name: article.name,
        type: "deleted",
        date: new Date().toISOString(),
        amount: article.purchasePrice,
      });
    },
  );
}
export async function saveRate(rateBps: number, database = db) {
  if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 10000)
    throw new Error("Taux invalide.");
  await database.transaction("rw", async (tx) => {
    const current = (await tx.settings.get("preferences")) ?? defaultSettings;
    await tx.settings.put({ ...current, rateBps });
  });
}
