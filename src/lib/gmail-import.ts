import { db, type ManagerDB } from "./db";
import { validateInput } from "./validation";
import { feeTotal } from "./accounting";
import type { Article, ArticleInput, Fee } from "./model";
import {
  validateSelection,
  type ImportChoice,
  type ImportRecord,
  type VerifiedNotification,
} from "../../protocols/gmail-transfer";
export const financial = (kind: VerifiedNotification["kind"]) =>
  kind === "purchase" || kind === "sale_final";
export function possibleMatches(
  item: VerifiedNotification,
  articles: Article[],
) {
  const name = item.name.trim().normalize("NFKC").toLocaleLowerCase("fr");
  return articles.filter(
    (a) =>
      a.name.trim().normalize("NFKC").toLocaleLowerCase("fr") === name ||
      (item.kind === "sale_final" &&
        a.status === "sold" &&
        a.saleDate === item.date &&
        a.salePrice === item.salePrice),
  );
}
function fees(item: VerifiedNotification): Fee[] {
  return [
    ...(item.boost
      ? [
          {
            id: crypto.randomUUID(),
            type: "Boost Vinted" as const,
            amount: item.boost,
          },
        ]
      : []),
    ...(item.cleaning
      ? [
          {
            id: crypto.randomUUID(),
            type: "Nettoyage" as const,
            amount: item.cleaning,
          },
        ]
      : []),
  ];
}
// Appelé uniquement après la confirmation finale dans la page comptable sans réseau.
export async function importVerified(
  choices: ImportChoice[],
  database: ManagerDB = db,
) {
  const items = validateSelection(choices.map((c) => c.item));
  for (const c of choices)
    if (
      !["create", "sell", "link", "review"].includes(c.mode) ||
      typeof c.distinctConfirmed !== "boolean" ||
      (c.articleId !== null &&
        (typeof c.articleId !== "string" ||
          !c.articleId ||
          c.articleId.length > 200)) ||
      (c.expectedUpdatedAt !== null && typeof c.expectedUpdatedAt !== "string")
    )
      throw new Error("Choix d’enregistrement invalide.");
  return database.transaction(
    "rw",
    database.articles,
    database.activities,
    database.imports,
    async () => {
      let created = 0,
        linked = 0,
        review = 0,
        duplicates = 0;
      for (let index = 0; index < items.length; index++) {
        const item = items[index],
          choice = choices[index];
        const bySource = await database.imports.get(item.sourceKey);
        const byEvent = await database.imports
          .where("eventKey")
          .equals(item.eventKey)
          .first();
        if (
          !bySource &&
          byEvent &&
          ((byEvent.name !== item.name &&
            (choice.articleId === null ||
              choice.articleId !== byEvent.articleId)) ||
            byEvent.date !== item.date ||
            byEvent.amount !==
              (item.kind === "purchase" ? item.purchasePrice : item.salePrice))
        )
          throw new Error(
            "Une même référence présente des articles ou montants différents. Les lots et cas ambigus doivent être vérifiés manuellement ; aucune valeur n’a été remplacée.",
          );
        if (bySource || byEvent) {
          duplicates++;
          continue;
        }
        const now = new Date().toISOString();
        let article: Article | undefined;
        let changed = false;
        if (choice.mode === "review") {
          if (financial(item.kind))
            throw new Error(
              "Un achat ou une vente validé doit être créé ou relié à un article.",
            );
          review++;
        } else {
          if (!financial(item.kind))
            throw new Error(
              "Une annonce, annulation ou un remboursement doit rester à vérifier, sans effet automatique.",
            );
          if (choice.mode === "create") {
            if (choice.articleId !== null || choice.expectedUpdatedAt !== null)
              throw new Error("Choix d’article incohérent.");
            if (
              !choice.distinctConfirmed &&
              possibleMatches(item, await database.articles.toArray()).length
            )
              throw new Error(
                "Un article ressemble à cette transaction. Reliez-le ou confirmez qu’il est distinct.",
              );
            const input: ArticleInput = {
              name: item.name,
              genre: item.genre,
              category: item.category,
              purchaseDate:
                item.kind === "purchase" ? item.date : item.purchaseDate,
              purchasePrice: item.purchasePrice,
              status: item.kind === "sale_final" ? "sold" : "stock",
              saleDate: item.kind === "sale_final" ? item.date : null,
              salePrice: item.kind === "sale_final" ? item.salePrice : null,
              fees: fees(item),
            };
            validateInput(input);
            article = {
              ...input,
              id: crypto.randomUUID(),
              createdAt: now,
              updatedAt: now,
            };
            created++;
            changed = true;
          } else {
            if (!choice.articleId)
              throw new Error("Choisissez l’article à relier.");
            article = await database.articles.get(choice.articleId);
            if (!article || article.updatedAt !== choice.expectedUpdatedAt)
              throw new Error(
                "L’article a changé. Fermez puis recommencez la vérification pour préserver ses modifications.",
              );
            if (choice.mode === "link") {
              if (
                item.kind === "sale_final" &&
                (article.status !== "sold" ||
                  article.saleDate !== item.date ||
                  article.salePrice !== item.salePrice)
              )
                throw new Error(
                  "La vente déjà enregistrée ne correspond pas. Modifiez sa fiche manuellement si nécessaire.",
                );
              if (
                item.kind === "purchase" &&
                ((article.purchasePrice !== null &&
                  item.purchasePrice !== null &&
                  article.purchasePrice !== item.purchasePrice) ||
                  (article.purchaseDate !== null &&
                    item.date !== null &&
                    article.purchaseDate !== item.date))
              )
                throw new Error(
                  "L’achat déjà enregistré ne correspond pas. Aucune valeur n’a été remplacée.",
                );
            } else {
              if (item.kind !== "sale_final" || article.status !== "stock")
                throw new Error(
                  "Seule une vente finalisée peut vendre un article encore en stock.",
                );
              if (
                article.fees.length + fees(item).length > 100 ||
                feeTotal(article) + item.boost + item.cleaning > 999999999
              )
                throw new Error("Le total des frais dépasse la limite.");
              article = {
                ...article,
                status: "sold",
                salePrice: item.salePrice,
                saleDate: item.date,
                purchasePrice: article.purchasePrice ?? item.purchasePrice,
                purchaseDate: article.purchaseDate ?? item.purchaseDate,
                fees: [...article.fees, ...fees(item)],
                updatedAt: now,
              };
              validateInput(article);
              changed = true;
            }
            linked++;
          }
          if (changed && article) {
            await database.articles.put(article);
            await database.activities.add({
              id: crypto.randomUUID(),
              articleId: article.id,
              name: article.name,
              type: article.status === "sold" ? "sold" : "created",
              date: now,
              amount:
                article.status === "sold"
                  ? article.salePrice
                  : article.purchasePrice,
            });
          }
        }
        const record: ImportRecord = {
          id: item.sourceKey,
          eventKey: item.eventKey,
          kind: item.kind,
          name: item.name,
          date: item.date,
          amount:
            item.kind === "purchase" ? item.purchasePrice : item.salePrice,
          articleId: article?.id ?? null,
          resolved: !!article,
          recordedAt: now,
        };
        await database.imports.add(record);
      }
      return { created, linked, review, duplicates };
    },
  );
}
export async function resolveReview(id: string, database: ManagerDB = db) {
  await database.transaction("rw", database.imports, async () => {
    const record = await database.imports.get(id);
    if (!record) throw new Error("Cette notification n’existe plus.");
    await database.imports.put({ ...record, resolved: true });
  });
}
