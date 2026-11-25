import { completeReturnedCosts } from "./acquisition-cost";
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
  kind === "purchase" || kind === "sale_announced" || kind === "sale_final";
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
export interface SyncProgress {
  period: string;
  pageToken: string | null;
  complete: boolean;
}
export interface ImportOptions {
  pending?: VerifiedNotification[];
  ignored?: VerifiedNotification[];
  progress?: SyncProgress;
}
function validateProgress(p: SyncProgress | undefined) {
  if (
    p &&
    (!/^\d{4}-(0[1-9]|1[0-2])$/.test(p.period) ||
      (p.pageToken !== null && (!p.pageToken || p.pageToken.length > 2048)) ||
      typeof p.complete !== "boolean")
  )
    throw new Error("Progression de synchronisation invalide.");
}
export async function importVerified(
  choices: ImportChoice[],
  database: ManagerDB = db,
  options: ImportOptions = {},
) {
  const pending = options.pending?.length
    ? validateSelection(options.pending)
    : [];
  const ignored = options.ignored?.length
    ? validateSelection(options.ignored)
    : [];
  const items = choices.length
    ? validateSelection(choices.map((c) => c.item))
    : [];
  if (!items.length && !pending.length && !ignored.length && !options.progress)
    throw new Error("Aucune opération à enregistrer.");
  if (items.length + pending.length + ignored.length > 200)
    throw new Error("Le lot dépasse 200 opérations.");
  validateProgress(options.progress);
  for (const c of choices)
    if (
      ![
        "create",
        "sell",
        "link",
        "review",
        "announce",
        "refund",
        "cancel",
      ].includes(c.mode) ||
      typeof c.distinctConfirmed !== "boolean" ||
      (c.correctionRole !== undefined &&
        !["sale", "purchase"].includes(c.correctionRole)) ||
      (c.returnToStock !== undefined && typeof c.returnToStock !== "boolean") ||
      (c.withdrawStock !== undefined && typeof c.withdrawStock !== "boolean") ||
      (c.articleId !== null &&
        (typeof c.articleId !== "string" ||
          !c.articleId ||
          c.articleId.length > 200))
    )
      throw new Error("Choix d’enregistrement invalide.");
  return database.transaction("rw", async (tx) => {
    let created = 0,
      linked = 0,
      review = 0,
      duplicates = 0;
    async function record(
      item: VerifiedNotification,
      article: Article | undefined,
      disposition: "recorded" | "review" | "ignored",
      eventKey = item.eventKey,
    ) {
      const r: ImportRecord = {
        id: item.sourceKey,
        eventKey,
        kind: item.kind,
        name: item.name,
        date: item.date,
        amount: item.kind === "purchase" ? item.purchasePrice : item.salePrice,
        articleId: article?.id ?? null,
        resolved: disposition !== "review",
        recordedAt: new Date().toISOString(),
        ...(item.referenceKey ? { referenceKey: item.referenceKey } : {}),
        ...(item.dateEstimated !== undefined
          ? { dateEstimated: item.dateEstimated }
          : {}),
        disposition,
        parserVersion: 1,
        ...(disposition === "review" ? { proposal: item } : {}),
      };
      await tx.imports.put(r);
    }
    const initialVersions = new Map(
      (await tx.articles.toArray()).map((a) => [a.id, a.updatedAt]),
    );
    const batchArticles = new Set<string>();
    const priority = (kind: VerifiedNotification["kind"]) =>
      kind === "purchase"
        ? 0
        : kind === "sale_announced"
          ? 1
          : kind === "sale_final"
            ? 2
            : 3;
    const order = items
      .map((_, index) => index)
      .sort(
        (a, b) =>
          (items[a].date ?? "9999").localeCompare(items[b].date ?? "9999") ||
          priority(items[a].kind) - priority(items[b].kind) ||
          a - b,
      );
    for (const index of order) {
      const item = items[index];
      let c = choices[index];
      // Un même lot peut contenir la finalisation et l’annonce, dans n’importe quel ordre.
      // Seule une référence commune fiable autorise ce rapprochement interne au lot.
      if (c.mode === "create" && !c.distinctConfirmed && item.referenceKey) {
        const matched = reconcile(
          item,
          await tx.articles.toArray(),
          await tx.imports.toArray(),
        );
        if (matched.article && batchArticles.has(matched.article.id)) {
          if (!matched.reliable)
            throw new Error(
              "Les notifications d’une même transaction se contredisent. Vérifiez-les avant validation groupée.",
            );
          c = {
            ...c,
            mode: matched.mode,
            articleId: matched.article.id,
            expectedUpdatedAt: matched.article.updatedAt,
          };
        }
      }
      const bySource = await tx.imports.get(item.sourceKey);
      const byEvent = await tx.imports
        .where("eventKey")
        .equals(item.eventKey)
        .first();
      if (bySource?.resolved) {
        duplicates++;
        continue;
      }
      if (byEvent?.resolved && byEvent.id !== item.sourceKey) {
        if (
          (byEvent.name !== item.name &&
            (c.articleId === null || c.articleId !== byEvent.articleId)) ||
          byEvent.date !== item.date ||
          byEvent.amount !==
            (item.kind === "purchase" ? item.purchasePrice : item.salePrice)
        )
          throw new Error(
            "Une même référence présente des articles ou montants différents. Vérifiez ce cas ou ce lot manuellement.",
          );
        const existing = byEvent.articleId
          ? await tx.articles.get(byEvent.articleId)
          : undefined;
        await record(item, existing, "ignored", item.sourceKey);
        duplicates++;
        continue;
      }
      const now = new Date().toISOString();
      let a: Article | undefined;
      let changed = false;
      if (c.mode === "review") {
        await record(item, undefined, "review");
        review++;
        continue;
      }
      if (item.confirmed === false)
        throw new Error(
          "Confirmez le contenu du message avant tout effet comptable.",
        );
      if (c.mode === "create") {
        if (!financial(item.kind))
          throw new Error("Une correction ne doit pas créer un article.");
        if (
          c.articleId !== null ||
          c.expectedUpdatedAt !== null ||
          item.name === "Nom à compléter"
        )
          throw new Error("Renseignez le nom de l’article.");
        const matches = possibleMatches(item, await tx.articles.toArray());
        const distinctPurchase =
          item.kind === "purchase" &&
          item.referenceKey &&
          matches.length > 0 &&
          matches.every(
            (m) =>
              m.purchaseReference && m.purchaseReference !== item.referenceKey,
          );
        if (!c.distinctConfirmed && !distinctPurchase && matches.length)
          throw new Error(
            "Un article ressemble à cette opération. Validez la correspondance ou confirmez un article distinct.",
          );
        const sold = item.kind === "sale_final",
          announced = item.kind === "sale_announced";
        const input: ArticleInput = {
          name: item.name,
          genre: item.genre,
          category: item.category,
          purchaseDate:
            item.kind === "purchase" ? item.date : item.purchaseDate,
          purchasePrice: item.purchasePrice,
          status: sold ? "sold" : "stock",
          saleDate: sold ? item.date : null,
          salePrice: sold ? item.salePrice : null,
          fees: fees(item),
          ...(item.kind === "purchase"
            ? {
                purchaseDateEstimated: item.dateEstimated ?? false,
                purchaseReference: item.referenceKey ?? null,
              }
            : {}),
          ...(sold
            ? {
                saleDateEstimated: item.dateEstimated ?? false,
                saleReference: item.referenceKey ?? null,
              }
            : {}),
          ...(announced && item.date
            ? {
                pendingSale: {
                  price: item.salePrice,
                  date: item.date,
                  dateEstimated: item.dateEstimated ?? false,
                  referenceKey: item.referenceKey ?? null,
                },
                announcedSaleDate: item.date,
                announcedSalePrice: item.salePrice,
                saleReference: item.referenceKey ?? null,
              }
            : {}),
          ...(item.quantity !== undefined ? { quantity: item.quantity } : {}),
          ...(item.itemNames && item.itemNames.length > 1
            ? {
                bundleItems: item.itemNames.map((name) => ({
                  name,
                  cost: null,
                })),
              }
            : {}),
          ...(item.kind === "purchase" && item.acquisition
            ? { acquisition: item.acquisition }
            : {}),
        };
        validateInput(input);
        a = {
          ...input,
          id: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
        };
        changed = true;
        created++;
        batchArticles.add(a.id);
      } else {
        if (!c.articleId) throw new Error("Choisissez l’article concerné.");
        a = await tx.articles.get(c.articleId);
        if (
          !a ||
          (a.updatedAt !== c.expectedUpdatedAt &&
            initialVersions.get(a.id) !== c.expectedUpdatedAt)
        )
          throw new Error(
            "L’article a changé dans une autre fenêtre. Recommencez la vérification pour préserver les corrections.",
          );
        if (c.mode === "link") {
          if (
            item.kind === "sale_final" &&
            (a.status !== "sold" ||
              a.salePrice !== item.salePrice ||
              (!item.dateEstimated && a.saleDate !== item.date))
          )
            throw new Error(
              "La vente enregistrée ne correspond pas. Vos corrections manuelles sont conservées.",
            );
          if (
            item.kind === "purchase" &&
            ((a.purchasePrice !== null &&
              item.purchasePrice !== null &&
              a.purchasePrice !== item.purchasePrice) ||
              (a.purchaseDate !== null &&
                item.date !== null &&
                !item.dateEstimated &&
                a.purchaseDate !== item.date))
          )
            throw new Error(
              "L’achat enregistré ne correspond pas. Aucun coût manuel n’a été remplacé.",
            );
          if (
            item.kind === "purchase" &&
            ((a.purchasePrice === null && item.purchasePrice !== null) ||
              (a.purchaseDate === null && item.date !== null))
          ) {
            a = {
              ...a,
              purchasePrice: a.purchasePrice ?? item.purchasePrice,
              purchaseDate: a.purchaseDate ?? item.date,
              purchaseDateEstimated:
                a.purchaseDate === null
                  ? (item.dateEstimated ?? false)
                  : a.purchaseDateEstimated,
              ...(!a.acquisition && item.acquisition
                ? { acquisition: item.acquisition }
                : {}),
              updatedAt: now,
            };
            changed = true;
          }
          if (!["purchase", "sale_final", "purchase_final"].includes(item.kind))
            throw new Error("Ce type exige une vérification dédiée.");
        } else if (c.mode === "announce") {
          if (
            item.kind !== "sale_announced" ||
            !item.date ||
            item.salePrice === null
          )
            throw new Error("La vente annoncée est incomplète.");
          if (
            a.pendingSale &&
            (a.pendingSale.price !== item.salePrice ||
              a.pendingSale.referenceKey !== item.referenceKey)
          )
            throw new Error(
              "Une vente en attente différente existe déjà pour cet article.",
            );
          a = {
            ...a,
            ...(a.status === "stock"
              ? {
                  pendingSale: {
                    price: item.salePrice,
                    date: item.date,
                    dateEstimated: item.dateEstimated ?? false,
                    referenceKey: item.referenceKey ?? null,
                  },
                }
              : {}),
            announcedSaleDate: a.announcedSaleDate ?? item.date,
            announcedSalePrice: a.announcedSalePrice ?? item.salePrice,
            saleReference: a.saleReference ?? item.referenceKey ?? null,
            updatedAt: now,
          };
          changed = true;
        } else if (c.mode === "sell") {
          if (item.kind !== "sale_final" || a.status !== "stock")
            throw new Error(
              "Seule une vente finalisée peut vendre un article en stock.",
            );
          const additional = fees(item);
          if (
            a.fees.length + additional.length > 100 ||
            feeTotal(a) + item.boost + item.cleaning > 999999999
          )
            throw new Error("Le total des frais dépasse la limite.");
          const { pendingSale, ...rest } = a;
          a = {
            ...rest,
            status: "sold",
            salePrice: item.salePrice,
            saleDate: item.date,
            purchasePrice: a.purchasePrice ?? item.purchasePrice,
            purchaseDate: a.purchaseDate ?? item.purchaseDate,
            announcedSaleDate: a.announcedSaleDate ?? pendingSale?.date ?? null,
            announcedSalePrice:
              a.announcedSalePrice ?? pendingSale?.price ?? null,
            saleReference: a.saleReference ?? item.referenceKey ?? null,
            saleDateEstimated: item.dateEstimated ?? false,
            fees: [...a.fees, ...additional],
            updatedAt: now,
          };
          changed = true;
        } else if (c.mode === "cancel") {
          if (item.kind !== "cancellation")
            throw new Error("La correction n’est pas une annulation.");
          if (a.status === "sold")
            throw new Error(
              "Cette vente a déjà été encaissée. Vérifiez et enregistrez le remboursement effectif, sans effacer l’encaissement.",
            );
          const { pendingSale, ...rest } = a;
          void pendingSale;
          a = { ...rest, cancellationDate: item.date, updatedAt: now };
          changed = true;
        } else if (c.mode === "refund") {
          if (item.kind !== "refund" || item.salePrice === null || !item.date)
            throw new Error("Le remboursement exige un montant et une date.");
          const inferred =
            item.referenceKey && item.referenceKey === a.purchaseReference
              ? "purchase"
              : item.referenceKey &&
                  (item.referenceKey === a.saleReference ||
                    item.referenceKey === a.pendingSale?.referenceKey)
                ? "sale"
                : undefined;
          const role = c.correctionRole ?? inferred;
          if (!role)
            throw new Error(
              "Précisez si le remboursement concerne un achat ou une vente.",
            );
          const prior = (a.refunds ?? [])
            .filter((r) => r.kind === role)
            .reduce((s, r) => s + r.amount, 0);
          const limit = role === "sale" ? a.salePrice : a.purchasePrice;
          if (role === "sale" && a.status !== "sold")
            throw new Error("Aucun encaissement de vente à rembourser.");
          if (limit !== null && prior + item.salePrice > limit)
            throw new Error(
              "Le remboursement dépasse le montant encore remboursable.",
            );
          if (
            !c.distinctConfirmed &&
            (a.refunds ?? []).some(
              (r) =>
                r.kind === role &&
                r.amount === item.salePrice &&
                r.date === item.date,
            )
          )
            throw new Error(
              "Un remboursement du même montant à cette date existe déjà. Vérifiez le doublon ou confirmez une correction distincte.",
            );
          const refund = {
            id: item.sourceKey,
            amount: item.salePrice,
            date: item.date,
            dateEstimated: item.dateEstimated ?? false,
            kind: role,
          };
          a = { ...a, refunds: [...(a.refunds ?? []), refund], updatedAt: now };
          if (c.returnToStock) {
            if (role !== "sale" || prior + item.salePrice !== a.salePrice)
              throw new Error(
                "Le retour en stock exige un remboursement total confirmé.",
              );
            const buyerRefund = (a.refunds ?? [])
              .filter((r) => r.kind === "purchase")
              .reduce((s, r) => s + r.amount, 0);
            const cost =
              a.purchasePrice === null ? null : a.purchasePrice - buyerRefund;
            const returned: Article = {
              id: crypto.randomUUID(),
              name: a.name,
              genre: a.genre,
              category: a.category,
              purchasePrice: cost,
              purchaseDate: a.purchaseDate,
              status: "stock",
              salePrice: null,
              saleDate: null,
              fees: [],
              createdAt: now,
              updatedAt: now,
              purchaseAlreadyCounted: true,
              restockedFrom: a.id,
              ...(a.quantity !== undefined ? { quantity: a.quantity } : {}),
              ...(a.bundleItems
                ? {
                    bundleItems: a.bundleItems.map((i) => ({
                      ...i,
                      cost: null,
                    })),
                  }
                : {}),
            };
            validateInput(returned);
            await tx.articles.add(returned);
            a = {
              ...a,
              archived: true,
              refunds: a.refunds!.map((r) =>
                r.id === refund.id ? { ...r, returnedStockId: returned.id } : r,
              ),
            };
          }
          if (c.withdrawStock) {
            if (role !== "purchase" || a.status !== "stock")
              throw new Error(
                "Le retrait du stock concerne uniquement un achat retourné.",
              );
            a = { ...a, archived: true };
          }
          changed = true;
        }
        linked++;
      }
      if (changed && a) {
        validateInput(a);
        await tx.articles.put(a);
        await completeReturnedCosts(tx, a);
        await tx.activities.add({
          id: crypto.randomUUID(),
          articleId: a.id,
          name: a.name,
          type:
            a.status === "sold" && item.kind === "sale_final"
              ? "sold"
              : item.kind === "purchase" || c.mode === "create"
                ? "created"
                : "updated",
          date: now,
          amount:
            item.kind === "purchase" ? item.purchasePrice : item.salePrice,
        });
      }
      await record(item, a, "recorded");
    }
    for (const item of pending) {
      const old = await tx.imports.get(item.sourceKey);
      if (old) continue;
      await record(
        item,
        undefined,
        "review",
        (await tx.imports.where("eventKey").equals(item.eventKey).first())
          ? item.sourceKey
          : item.eventKey,
      );
      review++;
    }
    for (const item of ignored) {
      if (await tx.imports.get(item.sourceKey)) continue;
      await record(
        item,
        undefined,
        "ignored",
        (await tx.imports.where("eventKey").equals(item.eventKey).first())
          ? item.sourceKey
          : item.eventKey,
      );
    }
    if (options.progress) {
      const p = options.progress;
      const settings = (await tx.settings.get("preferences")) ?? {
        id: "preferences" as const,
        rateBps: 1230,
      };
      await tx.settings.put({
        ...settings,
        gmailProgress: [
          ...(settings.gmailProgress ?? []).filter(
            (v) => v.period !== p.period,
          ),
          { ...p, updatedAt: new Date().toISOString() },
        ].slice(-600),
      });
    }
    return { created, linked, review, duplicates };
  });
}
export async function resolveReview(id: string, database: ManagerDB = db) {
  await database.transaction("rw", async (tx) => {
    const r = await tx.imports.get(id);
    if (!r) throw new Error("Cette notification n’existe plus.");
    await tx.imports.put({ ...r, resolved: true, disposition: "ignored" });
  });
}

export function reconcile(
  item: VerifiedNotification,
  articles: Article[],
  records: ImportRecord[],
): {
  mode: ImportChoice["mode"];
  article: Article | undefined;
  reliable: boolean;
  reason: string;
} {
  const bySource = records.find((r) => r.id === item.sourceKey);
  if (bySource?.resolved && bySource.articleId)
    return {
      mode: "link",
      article: articles.find((a) => a.id === bySource.articleId),
      reliable: true,
      reason: "Notification déjà enregistrée",
    };
  const keys = Object.values(item.relatedKeys ?? {});
  const related = records.filter(
    (r) =>
      (item.referenceKey && r.referenceKey === item.referenceKey) ||
      keys.includes(r.eventKey),
  );
  const ids = [
    ...new Set(
      related.map((r) => r.articleId).filter((id): id is string => !!id),
    ),
  ];
  const direct = articles.filter(
    (a) =>
      item.referenceKey &&
      (a.saleReference === item.referenceKey ||
        a.pendingSale?.referenceKey === item.referenceKey ||
        ((item.kind === "purchase" || item.kind === "purchase_final") &&
          a.purchaseReference === item.referenceKey)),
  );
  const strong = [
    ...new Map(
      [...direct, ...articles.filter((a) => ids.includes(a.id))].map((a) => [
        a.id,
        a,
      ]),
    ).values(),
  ];
  const modeFor = (a: Article): ImportChoice["mode"] =>
    item.kind === "sale_final" && a.status === "stock"
      ? "sell"
      : item.kind === "sale_announced"
        ? "announce"
        : item.kind === "refund"
          ? "refund"
          : item.kind === "cancellation"
            ? "cancel"
            : "link";
  if (strong.length === 1) {
    const a = strong[0];
    const difference =
      (["sale_final", "sale_announced"].includes(item.kind) &&
        !!a.purchaseDate &&
        !!item.date &&
        item.date < a.purchaseDate) ||
      (item.kind === "sale_announced" &&
        a.status === "sold" &&
        a.salePrice !== item.salePrice) ||
      (item.kind === "sale_final" &&
        ((a.pendingSale?.price !== undefined &&
          a.pendingSale.price !== null &&
          a.pendingSale.price !== item.salePrice) ||
          (a.status === "sold" &&
            (a.salePrice !== item.salePrice ||
              (!item.dateEstimated && a.saleDate !== item.date))))) ||
      (item.kind === "purchase" &&
        a.purchasePrice !== null &&
        item.purchasePrice !== null &&
        a.purchasePrice !== item.purchasePrice);
    return {
      mode: modeFor(a),
      article: a,
      reliable:
        !difference &&
        item.confirmed !== false &&
        item.confidence !== "ambiguous",
      reason: difference
        ? "Montant ou date différent : vos corrections doivent être vérifiées"
        : "Même référence de transaction",
    };
  }
  if (strong.length > 1)
    return {
      mode: "review",
      article: undefined,
      reliable: false,
      reason: "Plusieurs articles partagent la référence",
    };
  const named = possibleMatches(item, articles);
  const exact = named.filter(
    (a) =>
      !item.dateEstimated &&
      (item.kind === "purchase"
        ? a.purchasePrice === item.purchasePrice && a.purchaseDate === item.date
        : a.status === "sold" &&
          a.salePrice === item.salePrice &&
          a.saleDate === item.date),
  );
  if (exact.length === 1)
    return {
      mode: "link",
      article: exact[0],
      reliable: false,
      reason:
        "Nom, montant et date concordent sans référence commune : confirmez le rapprochement",
    };
  if (named.length)
    return {
      mode: "review",
      article: undefined,
      reliable: false,
      reason: "Article ressemblant : choisissez la correspondance",
    };
  if (["refund", "cancellation", "purchase_final"].includes(item.kind))
    return {
      mode: "review",
      article: undefined,
      reliable: false,
      reason: "Aucune transaction existante rapprochée",
    };
  return {
    mode: "create",
    article: undefined,
    reliable: item.confidence === "reliable",
    reason: "Nouvelle opération proposée",
  };
}
