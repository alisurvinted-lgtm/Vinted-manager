import Dexie, { type Table } from "dexie";
import {
  defaultSettings,
  type Activity,
  type Article,
  type ArticleInput,
  type Settings,
} from "./model";
import { validateInput } from "./validation";

export class ManagerDB extends Dexie {
  articles!: Table<Article, string>;
  settings!: Table<Settings, string>;
  activities!: Table<Activity, string>;
  constructor(name = "vinted-manager") {
    super(name);
    this.version(1).stores({
      articles: "id, status, saleDate, updatedAt",
      settings: "id",
    });
    this.version(2).stores({
      articles: "id, status, saleDate, updatedAt",
      settings: "id",
      activities: "id, date",
    });
  }
}
export const db = new ManagerDB();
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
    async () => {
      const previous = id ? await database.articles.get(id) : undefined;
      if (id && !previous) throw new Error("Cet article n’existe plus.");
      const now = new Date().toISOString();
      const article: Article = {
        ...input,
        name: input.name.trim(),
        id: id ?? crypto.randomUUID(),
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
      };
      await database.articles.put(article);
      const type = previous
        ? previous.status !== article.status
          ? article.status === "sold"
            ? "sold"
            : "restocked"
          : "updated"
        : article.status === "sold"
          ? "sold"
          : "created";
      await database.activities.add({
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
    async () => {
      const article = await database.articles.get(id);
      if (!article) throw new Error("Cet article n’existe plus.");
      await database.articles.delete(id);
      await database.activities.add({
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
  const current =
    (await database.settings.get("preferences")) ?? defaultSettings;
  await database.settings.put({ ...current, rateBps });
}
