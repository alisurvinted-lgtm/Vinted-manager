import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ManagerDB, saveArticle } from "../src/lib/db";
import {
  importVerified,
  reconcile,
  possibleMatches,
} from "../src/lib/gmail-import";
import { totals } from "../src/lib/accounting";
import { createBackup, restoreBackup } from "../src/lib/backup";
import { encryptBackup, decryptBackup } from "../src/lib/crypto-backup";
import type { ArticleInput } from "../src/lib/model";
import { splitBundle } from "../src/lib/bundles";
import { initializeTestVault } from "./test-vault";
import { proposedRow } from "../prototypes/gmail-oauth/preview-model";
import { proposalSelection } from "../prototypes/gmail-oauth/transfer";
import type {
  VerifiedNotification,
  ImportChoice,
} from "../protocols/gmail-transfer";
let db: ManagerDB;
const ref = "d".repeat(64);
const item = (
  patch: Partial<VerifiedNotification> = {},
): VerifiedNotification => ({
  sourceKey: "a".repeat(64),
  eventKey: "b".repeat(64),
  referenceKey: ref,
  kind: "sale_announced",
  name: "__VM_PRIVATE_TEST__ polaire synthétique",
  date: "2026-11-28",
  purchaseDate: "2026-10-01",
  purchasePrice: 1500,
  salePrice: 3500,
  boost: 200,
  cleaning: 100,
  genre: "Unisexe",
  category: "Polaire",
  confirmed: true,
  confidence: "reliable",
  dateEstimated: false,
  ...patch,
});
const choice = (
  i: VerifiedNotification,
  patch: Partial<ImportChoice> = {},
): ImportChoice => ({
  item: i,
  mode: "create",
  articleId: null,
  expectedUpdatedAt: null,
  distinctConfirmed: false,
  ...patch,
});
beforeEach(async () => {
  db = new ManagerDB("auto-" + crypto.randomUUID());
  await initializeTestVault(db);
});
afterEach(async () => await db.delete());
describe("Achats et cycle vente annoncé / encaissé", () => {
  it("préremplit le coût total payé, les dates et la référence, sans montant inventé", async () => {
    const row = proposedRow(
      "message-fictif",
      "Ton reçu pour la commande fictive",
      "2026-11-27T12:00:00Z",
      true,
      "Voici ton reçu.\nArticle : Baskets synthétiques\nMontant payé : 7,21 €\nPrix de l’article : 3,20 €\nFrais de port : 2,90 €\nProtection acheteur : 1,11 €\nRéférence de commande : SYNTH-2233",
      null,
    );
    const [i] = await proposalSelection([row]);
    expect(i).toMatchObject({
      kind: "purchase",
      purchasePrice: 721,
      date: "2026-11-27",
      dateEstimated: true,
      confidence: "reliable",
    });
    await importVerified([choice(i)], db);
    const [a] = await db.articles.toArray();
    expect(a.purchasePrice).toBe(721);
    expect(a.fees).toEqual([]);
    expect(a.acquisition?.shipping).toBe(290);
    expect(totals([a], 1230, "2026-11").purchaseOutflow).toBe(721);
  });
  it("ne crée aucun CA pour une annonce puis rapproche l’encaissement du mois suivant", async () => {
    await importVerified([choice(item())], db);
    const [stock] = await db.articles.toArray();
    expect(stock.status).toBe("stock");
    expect(totals([stock], 1230, "2026-11")).toMatchObject({
      revenue: 0,
      pendingAmount: 3500,
      pendingCount: 1,
    });
    const final = item({
      sourceKey: "c".repeat(64),
      eventKey: "e".repeat(64),
      kind: "sale_final",
      date: "2026-12-02",
      purchasePrice: null,
      boost: 0,
      cleaning: 0,
    });
    const match = reconcile(final, [stock], await db.imports.toArray());
    expect(match.reliable).toBe(true);
    expect(match.article?.id).toBe(stock.id);
    await importVerified(
      [
        choice(final, {
          mode: match.mode,
          articleId: stock.id,
          expectedUpdatedAt: stock.updatedAt,
        }),
      ],
      db,
    );
    const all = await db.articles.toArray();
    expect(all).toHaveLength(1);
    expect(all[0].purchasePrice).toBe(1500);
    expect(all[0].fees).toHaveLength(2);
    expect(totals(all, 1230, "2026-11")).toMatchObject({
      revenue: 0,
      pendingAmount: 3500,
    });
    expect(totals(all, 1230, "2026-12")).toMatchObject({
      revenue: 3500,
      net: 1269,
      pendingAmount: 0,
      contributions: 431,
    });
    expect(
      (
        await importVerified(
          [
            choice(final, {
              mode: "link",
              articleId: all[0].id,
              expectedUpdatedAt: all[0].updatedAt,
            }),
          ],
          db,
        )
      ).duplicates,
    ).toBe(1);
  });
  it.each([true, false])(
    "rapproche un même lot annonce / finalisation dans les deux ordres (%s)",
    async (ascending) => {
      const announced = item({ boost: 0, cleaning: 0 });
      const final = item({
        kind: "sale_final",
        sourceKey: "c".repeat(64),
        eventKey: "e".repeat(64),
        date: "2026-12-02",
        purchasePrice: null,
        boost: 0,
        cleaning: 0,
      });
      await importVerified(
        (ascending ? [announced, final] : [final, announced]).map((i) =>
          choice(i),
        ),
        db,
      );
      const all = await db.articles.toArray();
      expect(all).toHaveLength(1);
      expect(all[0].status).toBe("sold");
      expect(totals(all, 1230, "2026-11").revenue).toBe(0);
      expect(totals(all, 1230, "2026-12").revenue).toBe(3500);
    },
  );
  it("n’utilise pas un nom identique seul pour associer automatiquement une vente à un stock", async () => {
    const a = await saveArticle(
      {
        name: item().name,
        genre: "Unisexe",
        category: "Polaire",
        purchaseDate: "2026-01-01",
        purchasePrice: 1200,
        status: "stock",
        saleDate: null,
        salePrice: null,
        fees: [],
      },
      undefined,
      db,
    );
    const p = item({ referenceKey: "f".repeat(64) });
    expect(reconcile(p, [a], [])).toMatchObject({
      mode: "review",
      reliable: false,
    });
  });
  it("demande vérification si l’encaissement diffère du montant annoncé", async () => {
    await importVerified([choice(item())], db);
    const [a] = await db.articles.toArray();
    const p = item({
      kind: "sale_final",
      sourceKey: "c".repeat(64),
      eventKey: "e".repeat(64),
      salePrice: 3200,
    });
    expect(reconcile(p, [a], await db.imports.toArray()).reliable).toBe(false);
  });
  it("ne transforme pas une finalisation d’achat en nouvelle dépense ou recette", async () => {
    const p = item({ kind: "purchase", salePrice: null });
    await importVerified([choice(p)], db);
    const [a] = await db.articles.toArray();
    const end = item({
      sourceKey: "c".repeat(64),
      eventKey: "e".repeat(64),
      kind: "purchase_final",
      salePrice: null,
      date: "2026-12-01",
    });
    const m = reconcile(end, [a], await db.imports.toArray());
    await importVerified(
      [
        choice(end, {
          mode: m.mode,
          articleId: a.id,
          expectedUpdatedAt: a.updatedAt,
        }),
      ],
      db,
    );
    expect(await db.articles.count()).toBe(1);
    expect(
      totals(await db.articles.toArray(), 1230, "2026-11").purchaseOutflow,
    ).toBe(1500);
    expect(totals(await db.articles.toArray(), 1230, "2026-12").revenue).toBe(
      0,
    );
  });
});
describe("Corrections financières tracées, jamais appliquées deux fois", () => {
  it("annule une attente sans supprimer de chiffre d’affaires inexistant", async () => {
    await importVerified([choice(item())], db);
    const [a] = await db.articles.toArray();
    const cancel = item({
      sourceKey: "c".repeat(64),
      eventKey: "e".repeat(64),
      kind: "cancellation",
      date: "2026-11-29",
      salePrice: null,
    });
    await importVerified(
      [
        choice(cancel, {
          mode: "cancel",
          articleId: a.id,
          expectedUpdatedAt: a.updatedAt,
        }),
      ],
      db,
    );
    expect(totals(await db.articles.toArray(), 1230, "2026-11")).toMatchObject({
      revenue: 0,
      pendingAmount: 0,
      stockCount: 1,
    });
  });
  it("place le remboursement partiel au mois de sa réalisation sans doubler son effet", async () => {
    await importVerified([choice(item({ kind: "sale_final" }))], db);
    const [a] = await db.articles.toArray();
    const refund = item({
      sourceKey: "c".repeat(64),
      eventKey: "e".repeat(64),
      kind: "refund",
      salePrice: 1000,
      date: "2026-12-03",
    });
    const c = choice(refund, {
      mode: "refund",
      articleId: a.id,
      expectedUpdatedAt: a.updatedAt,
      correctionRole: "sale",
    });
    await importVerified([c], db);
    expect((await importVerified([c], db)).duplicates).toBe(1);
    const all = await db.articles.toArray();
    expect(totals(all, 1230, "2026-11").revenue).toBe(3500);
    expect(totals(all, 1230, "2026-12")).toMatchObject({
      revenue: -1000,
      contributions: -123,
      net: -877,
    });
  });
  it("préserve l’encaissement et remet le bien en stock après remboursement total confirmé", async () => {
    await importVerified([choice(item({ kind: "sale_final" }))], db);
    const [a] = await db.articles.toArray();
    const r = item({
      sourceKey: "c".repeat(64),
      eventKey: "e".repeat(64),
      kind: "refund",
      date: "2026-12-03",
    });
    await importVerified(
      [
        choice(r, {
          mode: "refund",
          articleId: a.id,
          expectedUpdatedAt: a.updatedAt,
          correctionRole: "sale",
          returnToStock: true,
        }),
      ],
      db,
    );
    const all = await db.articles.toArray();
    expect(all).toHaveLength(2);
    expect(totals(all, 1230)).toMatchObject({
      revenue: 0,
      net: -300,
      stockCount: 1,
      stockInvestment: 1500,
      purchaseOutflow: 1500,
    });
  });
  it("retire du stock un achat remboursé et retourné sans perdre sa dépense ni sa correction", async () => {
    await importVerified(
      [
        choice(
          item({ kind: "purchase", salePrice: null, boost: 0, cleaning: 0 }),
        ),
      ],
      db,
    );
    const [a] = await db.articles.toArray();
    const r = item({
      kind: "refund",
      sourceKey: "c".repeat(64),
      eventKey: "e".repeat(64),
      date: "2026-12-03",
      salePrice: 1500,
    });
    await importVerified(
      [
        choice(r, {
          mode: "refund",
          articleId: a.id,
          expectedUpdatedAt: a.updatedAt,
          correctionRole: "purchase",
          withdrawStock: true,
        }),
      ],
      db,
    );
    const all = await db.articles.toArray();
    expect(all).toHaveLength(1);
    expect(totals(all, 1230)).toMatchObject({
      stockCount: 0,
      purchaseOutflow: 0,
      revenue: 0,
    });
    expect(totals(all, 1230, "2026-11").purchaseOutflow).toBe(1500);
    expect(totals(all, 1230, "2026-12").purchaseOutflow).toBe(-1500);
  });
  it("complète le coût inconnu du même bien après son retour sans inventer de nouvel achat", async () => {
    await importVerified(
      [
        choice(
          item({
            kind: "sale_final",
            purchasePrice: null,
            purchaseDate: null,
            boost: 0,
            cleaning: 0,
          }),
        ),
      ],
      db,
    );
    const [a] = await db.articles.toArray();
    const r = item({
      kind: "refund",
      sourceKey: "c".repeat(64),
      eventKey: "e".repeat(64),
      date: "2026-12-03",
    });
    await importVerified(
      [
        choice(r, {
          mode: "refund",
          articleId: a.id,
          expectedUpdatedAt: a.updatedAt,
          correctionRole: "sale",
          returnToStock: true,
        }),
      ],
      db,
    );
    const old = await db.articles.get(a.id);
    await saveArticle({ ...old!, purchasePrice: 1234 }, a.id, db);
    const all = await db.articles.toArray();
    expect(all.every((a) => a.purchasePrice === 1234)).toBe(true);
    expect(totals(all, 1230)).toMatchObject({ net: 0, stockInvestment: 1234 });
  });
  it("accepte deux remboursements partiels distincts et bloque une répétition ambiguë", async () => {
    await importVerified([choice(item({ kind: "sale_final" }))], db);
    let [a] = await db.articles.toArray();
    const make = (id: string, date: string, amount: number) =>
      item({
        kind: "refund",
        sourceKey: id.repeat(64),
        eventKey: id.repeat(64),
        date,
        salePrice: amount,
      });
    for (const r of [
      make("c", "2026-12-03", 100),
      make("e", "2026-12-04", 200),
    ]) {
      await importVerified(
        [
          choice(r, {
            mode: "refund",
            articleId: a.id,
            expectedUpdatedAt: a.updatedAt,
            correctionRole: "sale",
          }),
        ],
        db,
      );
      a = (await db.articles.get(a.id))!;
    }
    const duplicate = make("f", "2026-12-04", 200);
    await expect(
      importVerified(
        [
          choice(duplicate, {
            mode: "refund",
            articleId: a.id,
            expectedUpdatedAt: a.updatedAt,
            correctionRole: "sale",
          }),
        ],
        db,
      ),
    ).rejects.toThrow(/existe déjà/);
    expect(totals(await db.articles.toArray(), 1230, "2026-12").revenue).toBe(
      -300,
    );
  });
  it("ne déduit pas les frais de port ou protection une seconde fois lors de la vente", async () => {
    await importVerified(
      [
        choice(
          item({
            kind: "sale_final",
            purchasePrice: 721,
            boost: 0,
            cleaning: 0,
            acquisition: {
              itemPrice: 320,
              shipping: 290,
              protection: 111,
              otherFees: null,
            },
          }),
        ),
      ],
      db,
    );
    expect(totals(await db.articles.toArray(), 1230, "2026-11").net).toBe(2348);
  });
});
describe("Lots et progression chiffrée", () => {
  it("autorise une répartition explicite du lot et conserve son capital total", async () => {
    await importVerified(
      [
        choice(
          item({
            kind: "purchase",
            salePrice: null,
            purchasePrice: 1800,
            quantity: 2,
            itemNames: ["Pull synthétique", "Jean synthétique"],
            boost: 0,
            cleaning: 0,
          }),
        ),
      ],
      db,
    );
    const [a] = await db.articles.toArray();
    expect(a.bundleItems?.every((i) => i.cost === null)).toBe(true);
    await expect(
      splitBundle(
        a.id,
        [
          { name: "Pull", cost: 800, boost: 0, cleaning: 0 },
          { name: "Jean", cost: 900, boost: 0, cleaning: 0 },
        ],
        a.updatedAt,
        db,
      ),
    ).rejects.toThrow();
    expect(await db.articles.count()).toBe(1);
    await splitBundle(
      a.id,
      [
        { name: "Pull", cost: 800, boost: 0, cleaning: 0 },
        { name: "Jean", cost: 1000, boost: 0, cleaning: 0 },
      ],
      a.updatedAt,
      db,
    );
    expect(totals(await db.articles.toArray(), 1230, "2026-11")).toMatchObject({
      stockCount: 2,
      stockInvestment: 1800,
      purchaseOutflow: 1800,
    });
  });
  it("garde la fiche originale d’un lot et refuse de perdre ses corrections lors d’une répartition", async () => {
    await importVerified(
      [
        choice(
          item({
            kind: "purchase",
            salePrice: null,
            purchasePrice: 1800,
            quantity: 2,
            itemNames: ["Pull fictif", "Jean fictif"],
            boost: 0,
            cleaning: 0,
          }),
        ),
      ],
      db,
    );
    const [a] = await db.articles.toArray();
    const parts = [
      { name: "Pull", cost: 800, boost: 0, cleaning: 0 },
      { name: "Jean", cost: 1000, boost: 0, cleaning: 0 },
    ];
    const withRefund = {
      ...a,
      refunds: [
        {
          id: "fictif-rembourse",
          amount: 100,
          date: "2026-11-29",
          dateEstimated: false,
          kind: "purchase" as const,
        },
      ],
    };
    await db.articles.put(withRefund);
    await expect(splitBundle(a.id, parts, a.updatedAt, db)).rejects.toThrow(
      /corrections/,
    );
    expect((await db.articles.get(a.id))?.refunds).toHaveLength(1);
    await db.articles.put(a);
    await splitBundle(a.id, parts, a.updatedAt, db);
    expect((await db.articles.get(a.id))?.archived).toBe(true);
    expect(await db.articles.count()).toBe(3);
    expect(totals(await db.articles.toArray(), 1230, "2026-11")).toMatchObject({
      stockCount: 2,
      purchaseOutflow: 1800,
    });
  });
  it("conserve les éléments à vérifier et la reprise sans les comptabiliser", async () => {
    const p = item({
      kind: "incomplete",
      detectedKind: "sale_final",
      confirmed: false,
      confidence: "ambiguous",
    });
    await importVerified([], db, {
      pending: [p],
      progress: {
        period: "2026-11",
        pageToken: "__VM_PRIVATE_TEST__-pagination",
        complete: false,
      },
    });
    expect(await db.articles.count()).toBe(0);
    expect((await db.imports.toArray())[0].proposal?.sourceKey).toBe(
      p.sourceKey,
    );
    expect(
      (await db.settings.get("preferences"))?.gmailProgress?.[0],
    ).toMatchObject({
      pageToken: "__VM_PRIVATE_TEST__-pagination",
      complete: false,
    });
  });
});

// Tous les identifiants et opérations ci-dessous sont synthétiques.
const digestId = (n: number) => n.toString(16).padStart(64, "0");
const message = (n: number, patch: Partial<VerifiedNotification> = {}) =>
  item({
    sourceKey: digestId(n),
    eventKey: digestId(n + 1000),
    boost: 0,
    cleaning: 0,
    ...patch,
  });
const manual = (patch: Partial<ArticleInput> = {}) =>
  saveArticle(
    {
      name: item().name,
      genre: "Unisexe",
      category: "Polaire",
      purchasePrice: 1500,
      purchaseDate: "2026-10-01",
      status: "stock",
      salePrice: null,
      saleDate: null,
      fees: [],
      ...patch,
    },
    undefined,
    db,
  );
async function matchedChoice(i: VerifiedNotification) {
  const m = reconcile(
    i,
    await db.articles.toArray(),
    await db.imports.toArray(),
  );
  return choice(i, {
    mode: m.mode,
    articleId: m.article?.id ?? null,
    expectedUpdatedAt: m.article?.updatedAt ?? null,
  });
}

describe("Phase 3 — références séparées et rapprochement prudent", () => {
  it.each(["purchase", "purchase_final"] as const)(
    "ne rapproche pas %s d’une référence de revente identique",
    async (kind) => {
      const a = await manual({
        name: "Autre bien synthétique",
        saleReference: ref,
      });
      const p = message(1, { kind, salePrice: null });
      const m = reconcile(p, [a], []);
      expect(m.article).toBeUndefined();
      expect(m.mode).toBe(kind === "purchase" ? "create" : "review");
    },
  );
  it.each(["sale_announced", "sale_final"] as const)(
    "ne rapproche pas %s d’une commande d’achat, même avec les clés liées",
    async (kind) => {
      await importVerified(
        [choice(message(1, { kind: "purchase", salePrice: null }))],
        db,
      );
      const a = (await db.articles.toArray())[0];
      const p = message(2, { kind, relatedKeys: { purchase: digestId(1001) } });
      expect(reconcile(p, [a], await db.imports.toArray())).toMatchObject({
        reliable: false,
        mode: "review",
      });
    },
  );
  it("associe explicitement l’achat et la revente, puis finalise avec la seule référence de revente", async () => {
    await importVerified(
      [choice(message(1, { kind: "purchase", salePrice: null }))],
      db,
    );
    let [a] = await db.articles.toArray();
    const announced = message(2, { referenceKey: digestId(2) });
    expect(reconcile(announced, [a], await db.imports.toArray()).reliable).toBe(
      false,
    );
    await importVerified(
      [
        choice(announced, {
          mode: "announce",
          articleId: a.id,
          expectedUpdatedAt: a.updatedAt,
        }),
      ],
      db,
    );
    const final = message(3, {
      kind: "sale_final",
      referenceKey: digestId(2),
      date: "2026-12-02",
      purchasePrice: null,
      purchaseDate: null,
    });
    expect(
      reconcile(final, await db.articles.toArray(), await db.imports.toArray())
        .reliable,
    ).toBe(true);
    await importVerified([await matchedChoice(final)], db);
    [a] = await db.articles.toArray();
    expect(await db.articles.count()).toBe(1);
    expect(a).toMatchObject({
      purchaseReference: ref,
      saleReference: digestId(2),
      purchasePrice: 1500,
      status: "sold",
    });
    expect(totals([a], 1230, "2026-11")).toMatchObject({
      revenue: 0,
      purchaseOutflow: 1500,
    });
    expect(totals([a], 1230, "2026-12")).toMatchObject({
      revenue: 3500,
      contributions: 431,
      net: 1569,
    });
  });
  it("conserve deux achats distincts de même titre, montant et date", async () => {
    const first = message(1, { kind: "purchase", salePrice: null });
    await importVerified([choice(first)], db);
    const second = message(2, {
      kind: "purchase",
      salePrice: null,
      referenceKey: digestId(2),
    });
    expect(
      reconcile(
        second,
        await db.articles.toArray(),
        await db.imports.toArray(),
      ),
    ).toMatchObject({ reliable: true, mode: "create" });
    await importVerified([choice(second)], db);
    const all = await db.articles.toArray();
    expect(all).toHaveLength(2);
    expect(totals(all, 1230, "2026-11")).toMatchObject({
      revenue: 0,
      stockCount: 2,
      purchaseOutflow: 3000,
    });
    expect(
      reconcile(
        message(3, { referenceKey: digestId(3) }),
        all,
        await db.imports.toArray(),
      ).reliable,
    ).toBe(false);
  });
  it("ne vend que l’homonyme portant la référence de vente confirmée", async () => {
    const one = await manual({ saleReference: ref });
    const two = await manual({ saleReference: digestId(2) });
    const final = message(3, { kind: "sale_final" });
    const m = reconcile(final, [one, two], []);
    expect(m).toMatchObject({ reliable: true, article: { id: one.id } });
    await importVerified([await matchedChoice(final)], db);
    expect((await db.articles.get(two.id))?.status).toBe("stock");
    expect(totals(await db.articles.toArray(), 1230).soldCount).toBe(1);
  });
  it("normalise accents, espaces et ponctuation uniquement pour proposer une vérification", async () => {
    const a = await manual({
      name: "Veste côtelée — Marque fictive / taille M",
    });
    const p = message(1, {
      name: "  VESTE COTELEE - Marque fictive | taille M  ",
      referenceKey: null,
    });
    expect(possibleMatches(p, [a])).toEqual([a]);
    expect(reconcile(p, [a], []).reliable).toBe(false);
  });
  it("un montant et une date identiques sans même titre ne prouvent pas une identité", async () => {
    const a = await manual({
      name: "Autre marque et taille",
      status: "sold",
      salePrice: 3500,
      saleDate: "2026-11-28",
    });
    const p = message(1, { kind: "sale_final", referenceKey: null });
    expect(reconcile(p, [a], [])).toMatchObject({
      mode: "review",
      reliable: false,
      article: undefined,
    });
  });
  it("demande vérification de deux articles portant la même référence plutôt que de choisir le premier", async () => {
    await manual({ saleReference: ref });
    await manual({ saleReference: ref });
    const p = message(1, { kind: "sale_final", name: "Titre différent" });
    expect(reconcile(p, await db.articles.toArray(), [])).toMatchObject({
      mode: "review",
      reliable: false,
    });
    await expect(
      importVerified([choice(p, { distinctConfirmed: true })], db),
    ).rejects.toThrow(/vérifi/i);
    expect(totals(await db.articles.toArray(), 1230).revenue).toBe(0);
  });
  it("refuse de remplacer le suivi d’une autre revente lors d’un rattachement explicite", async () => {
    const a = await manual({ saleReference: digestId(2) });
    await expect(
      importVerified(
        [
          choice(message(1, { kind: "sale_final" }), {
            mode: "sell",
            articleId: a.id,
            expectedUpdatedAt: a.updatedAt,
          }),
        ],
        db,
      ),
    ).rejects.toThrow(/autre référence/);
    expect(await db.articles.get(a.id)).toEqual(a);
  });
  it.each(["purchase", "sale_final"] as const)(
    "conserve la référence d’un %s rattaché manuellement pour les synchronisations futures",
    async (kind) => {
      const a = await manual(
        kind === "purchase"
          ? {}
          : { status: "sold", saleDate: "2026-11-28", salePrice: 3500 },
      );
      const p = message(1, {
        kind,
        ...(kind === "purchase"
          ? { date: a.purchaseDate, salePrice: null }
          : {}),
      });
      await importVerified(
        [
          choice(p, {
            mode: "link",
            articleId: a.id,
            expectedUpdatedAt: a.updatedAt,
          }),
        ],
        db,
      );
      expect(
        (await db.articles.get(a.id))?.[
          kind === "purchase" ? "purchaseReference" : "saleReference"
        ],
      ).toBe(ref);
      expect(
        reconcile(
          message(2, {
            ...p,
            sourceKey: digestId(2),
            eventKey: digestId(1002),
          }),
          await db.articles.toArray(),
          await db.imports.toArray(),
        ).reliable,
      ).toBe(true);
    },
  );
  it("retrouve une ancienne annonce par sa clé d’étape sans référence commune persistée", async () => {
    await importVerified([choice(message(1, { referenceKey: undefined }))], db);
    const p = message(2, {
      kind: "sale_final",
      referenceKey: null,
      relatedKeys: { sale_announced: digestId(1001) },
      date: "2026-12-02",
    });
    expect(
      reconcile(p, await db.articles.toArray(), await db.imports.toArray())
        .reliable,
    ).toBe(true);
    await importVerified([choice(p)], db);
    expect(await db.articles.count()).toBe(1);
    expect((await db.articles.toArray())[0].status).toBe("sold");
  });
});

describe("Phase 3 — répétitions, corrections manuelles et ordre des messages", () => {
  it("réévalue un aperçu de création devenu ancien sans doubler la vente ni remplacer le nom corrigé", async () => {
    await importVerified([choice(message(1))], db);
    const [a] = await db.articles.toArray();
    await saveArticle(
      {
        ...a,
        name: "Titre corrigé manuellement",
        purchasePrice: 1900,
        fees: [{ id: "frais-manuel", type: "Nettoyage", amount: 80 }],
      },
      a.id,
      db,
    );
    await importVerified(
      [
        choice(
          message(2, {
            kind: "sale_final",
            date: "2026-12-02",
            name: "Ancien titre synthétique",
            purchasePrice: null,
            purchaseDate: null,
          }),
        ),
      ],
      db,
    );
    expect(await db.articles.count()).toBe(1);
    expect((await db.articles.toArray())[0]).toMatchObject({
      name: "Titre corrigé manuellement",
      purchasePrice: 1900,
      salePrice: 3500,
      fees: [{ amount: 80 }],
    });
  });
  it("ignore une copie d’événement sous une nouvelle clé et une date de réception estimée différente", async () => {
    const p = message(1, { kind: "sale_final", dateEstimated: true });
    await importVerified([choice(p)], db);
    const before = await db.articles.toArray();
    const repeat = message(2, {
      kind: "sale_final",
      date: "2026-12-01",
      dateEstimated: true,
    });
    expect((await importVerified([choice(repeat)], db)).duplicates).toBe(1);
    expect(await db.articles.toArray()).toEqual(before);
    expect(await db.activities.count()).toBe(1);
    expect(await db.imports.count()).toBe(2);
  });
  it("refuse une nouvelle date explicite contradictoire au lieu de décaler une vente connue", async () => {
    await importVerified([choice(message(1, { kind: "sale_final" }))], db);
    const p = message(2, { kind: "sale_final", date: "2026-12-01" });
    expect(
      reconcile(p, await db.articles.toArray(), await db.imports.toArray())
        .reliable,
    ).toBe(false);
    await expect(importVerified([choice(p)], db)).rejects.toThrow(
      /même référence/,
    );
    expect(totals(await db.articles.toArray(), 1230, "2026-11").revenue).toBe(
      3500,
    );
  });
  it("préserve nom, prix, dates, achat et frais corrigés lors d’un nouveau message de la même vente", async () => {
    const p = message(1, { kind: "sale_final" });
    await importVerified([choice(p)], db);
    const [a] = await db.articles.toArray();
    const edited = await saveArticle(
      {
        ...a,
        name: "Nom corrigé",
        purchasePrice: 1900,
        purchaseDate: "2026-09-01",
        salePrice: 3600,
        saleDate: "2026-12-01",
        fees: [{ id: "manuel", type: "Boost Vinted", amount: 90 }],
      },
      a.id,
      db,
    );
    const repeat = message(2, { kind: "sale_final" });
    expect(
      reconcile(repeat, [edited], await db.imports.toArray()).reliable,
    ).toBe(true);
    expect(
      (await importVerified([await matchedChoice(repeat)], db)).duplicates,
    ).toBe(1);
    expect(await db.articles.get(a.id)).toEqual(edited);
    expect((await importVerified([choice(p)], db)).duplicates).toBe(1);
  });
  it("préserve une date et un montant d’attente corrigés lors d’un rattachement explicite", async () => {
    await importVerified([choice(message(1))], db);
    const [a] = await db.articles.toArray();
    const edited = await saveArticle(
      {
        ...a,
        pendingSale: { ...a.pendingSale!, date: "2026-11-27", price: 3600 },
      },
      a.id,
      db,
    );
    const p = message(2, { salePrice: 3600, date: "2026-11-27" });
    expect(
      (
        await importVerified(
          [
            choice(p, {
              mode: "announce",
              articleId: a.id,
              expectedUpdatedAt: edited.updatedAt,
            }),
          ],
          db,
        )
      ).duplicates,
    ).toBe(1);
    expect((await db.articles.get(a.id))?.pendingSale).toEqual(
      edited.pendingSale,
    );
  });
  it("ne remplace pas un coût d’achat corrigé par celui d’un reçu tardif", async () => {
    const a = await manual({ purchaseReference: ref, purchasePrice: 1900 });
    const p = message(1, {
      kind: "purchase",
      date: a.purchaseDate,
      salePrice: null,
    });
    expect(reconcile(p, [a], []).reliable).toBe(false);
    await expect(
      importVerified(
        [
          choice(p, {
            mode: "link",
            articleId: a.id,
            expectedUpdatedAt: a.updatedAt,
          }),
        ],
        db,
      ),
    ).rejects.toThrow(/coût manuel/);
    expect(await db.articles.get(a.id)).toEqual(a);
  });
  it("conserve le coût inconnu d’une vente sans achat correspondant", async () => {
    await importVerified(
      [
        choice(
          message(1, {
            kind: "sale_final",
            purchasePrice: null,
            purchaseDate: null,
          }),
        ),
      ],
      db,
    );
    expect(totals(await db.articles.toArray(), 1230, "2026-11")).toMatchObject({
      revenue: 3500,
      contributions: 431,
      net: null,
      incompleteProfitCount: 1,
    });
  });
  it("complète un achat retrouvé après la vente uniquement après association manuelle, sans recréer de dépense", async () => {
    await importVerified(
      [
        choice(
          message(1, {
            kind: "sale_final",
            date: "2026-12-02",
            purchasePrice: null,
            purchaseDate: null,
          }),
        ),
      ],
      db,
    );
    const [a] = await db.articles.toArray();
    const purchase = message(2, {
      kind: "purchase",
      referenceKey: digestId(777),
      date: "2026-11-01",
      purchaseDate: "2026-11-01",
      purchasePrice: 721,
      salePrice: null,
    });
    expect(reconcile(purchase, [a], await db.imports.toArray()).reliable).toBe(
      false,
    );
    await importVerified(
      [
        choice(purchase, {
          mode: "link",
          articleId: a.id,
          expectedUpdatedAt: a.updatedAt,
        }),
      ],
      db,
    );
    const all = await db.articles.toArray();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      purchasePrice: 721,
      purchaseReference: digestId(777),
      saleReference: ref,
    });
    expect(totals(all, 1230, "2026-11").purchaseOutflow).toBe(721);
    expect(totals(all, 1230, "2026-12")).toMatchObject({
      purchaseOutflow: 0,
      revenue: 3500,
      net: 2348,
    });
    expect(
      (
        await importVerified(
          [
            choice(
              message(3, {
                ...purchase,
                sourceKey: digestId(3),
                eventKey: digestId(1003),
              }),
            ),
          ],
          db,
        )
      ).duplicates,
    ).toBe(1);
  });
  it("rattache une annonce reçue après la finalisation sans nouvelle vente ni nouveaux frais", async () => {
    await importVerified(
      [choice(message(1, { kind: "sale_final", date: "2027-01-02" }))],
      db,
    );
    const p = message(2, { date: "2026-12-29" });
    const m = reconcile(
      p,
      await db.articles.toArray(),
      await db.imports.toArray(),
    );
    expect(m.reliable).toBe(true);
    await importVerified([await matchedChoice(p)], db);
    expect(await db.articles.count()).toBe(1);
    expect(totals(await db.articles.toArray(), 1230, "2026-12")).toMatchObject({
      revenue: 0,
      pendingAmount: 3500,
    });
    expect(totals(await db.articles.toArray(), 1230, "2027-01")).toMatchObject({
      revenue: 3500,
      pendingAmount: 0,
    });
  });
  it("signale une finalisation explicitement antérieure à son annonce", async () => {
    await importVerified([choice(message(1))], db);
    expect(
      reconcile(
        message(2, { kind: "sale_final", date: "2026-11-27" }),
        await db.articles.toArray(),
        await db.imports.toArray(),
      ).reliable,
    ).toBe(false);
  });
  it("garde deux estimations de réception hors d’ordre sans les transformer en dates certaines", async () => {
    const final = message(1, {
      kind: "sale_final",
      date: "2026-11-27",
      dateEstimated: true,
    });
    const announced = message(2, { dateEstimated: true });
    await importVerified([choice(final), choice(announced)], db);
    expect(await db.articles.count()).toBe(1);
    expect((await db.articles.toArray())[0].saleDateEstimated).toBe(true);
  });
  it("permet de valider un élément à vérifier déjà conservé, sans le bloquer sur sa propre référence", async () => {
    const p = message(1, { kind: "sale_final" });
    await importVerified([], db, { pending: [p] });
    expect(reconcile(p, [], await db.imports.toArray())).toMatchObject({
      mode: "create",
      reliable: true,
    });
    await importVerified([choice(p)], db);
    expect(await db.articles.count()).toBe(1);
  });
  it("ne recrée pas un article supprimé sur la seule référence d’un ancien événement", async () => {
    await importVerified([choice(message(1))], db);
    const [a] = await db.articles.toArray();
    await db.articles.delete(a.id);
    const p = message(2, { kind: "sale_final", name: "Titre changé" });
    expect(reconcile(p, [], await db.imports.toArray()).reliable).toBe(false);
    await expect(importVerified([choice(p)], db)).rejects.toThrow(/vérifi/i);
    expect(await db.articles.count()).toBe(0);
  });
});

describe("Phase 3 — corrections liées et suivi restaurable", () => {
  it("refuse un remboursement dont la date explicite précède l’encaissement réel", async () => {
    await importVerified(
      [choice(message(1, { kind: "sale_final", date: "2026-12-02" }))],
      db,
    );
    const p = message(2, {
      kind: "refund",
      date: "2026-12-01",
      salePrice: 200,
    });
    await expect(importVerified([await matchedChoice(p)], db)).rejects.toThrow(
      /précède/,
    );
    expect((await db.articles.toArray())[0].refunds).toBeUndefined();
    expect(totals(await db.articles.toArray(), 1230, "2026-12").revenue).toBe(
      3500,
    );
  });
  it("garde une vente réellement encaissée si une annulation tardive arrive sans remboursement", async () => {
    await importVerified([choice(message(1, { kind: "sale_final" }))], db);
    const p = message(2, {
      kind: "cancellation",
      date: "2026-12-01",
      salePrice: null,
    });
    const c = await matchedChoice(p);
    await expect(importVerified([c], db)).rejects.toThrow(/déjà été encaissée/);
    expect(totals(await db.articles.toArray(), 1230, "2026-11").revenue).toBe(
      3500,
    );
  });
  it("une annonce répétée après annulation ne remet pas la vente en attente", async () => {
    await importVerified([choice(message(1))], db);
    let [a] = await db.articles.toArray();
    const cancel = message(2, {
      kind: "cancellation",
      salePrice: null,
      date: "2026-11-29",
    });
    expect(reconcile(cancel, [a], await db.imports.toArray()).reliable).toBe(
      false,
    );
    await importVerified(
      [
        choice(cancel, {
          mode: "cancel",
          articleId: a.id,
          expectedUpdatedAt: a.updatedAt,
        }),
      ],
      db,
    );
    const late = message(3);
    expect((await importVerified([choice(late)], db)).duplicates).toBe(1);
    [a] = await db.articles.toArray();
    expect(a.pendingSale).toBeUndefined();
    expect(totals([a], 1230)).toMatchObject({
      revenue: 0,
      pendingCount: 0,
      stockCount: 1,
    });
    expect(
      reconcile(
        message(4, { kind: "sale_final", date: "2026-12-01" }),
        [a],
        await db.imports.toArray(),
      ).reliable,
    ).toBe(false);
  });
  it("ne valide pas automatiquement une vente si une correction antérieure non résolue porte la même référence", async () => {
    const cancel = message(1, { kind: "cancellation", salePrice: null });
    await importVerified([], db, { pending: [cancel] });
    const p = message(2);
    expect(reconcile(p, [], await db.imports.toArray())).toMatchObject({
      reliable: false,
      mode: "review",
    });
    await expect(importVerified([choice(p)], db)).rejects.toThrow(/vérifi/i);
    expect(await db.articles.count()).toBe(0);
  });
  it("conserve un remboursement arrivé avant l’encaissement pour confirmation après rapprochement", async () => {
    await importVerified([choice(message(1))], db);
    const refund = message(2, {
      kind: "refund",
      salePrice: 300,
      date: "2026-12-03",
    });
    await importVerified([], db, { pending: [refund] });
    const final = message(3, { kind: "sale_final", date: "2026-12-02" });
    expect(
      reconcile(final, await db.articles.toArray(), await db.imports.toArray())
        .reliable,
    ).toBe(false);
    const [a] = await db.articles.toArray();
    await importVerified(
      [
        choice(final, {
          mode: "sell",
          articleId: a.id,
          expectedUpdatedAt: a.updatedAt,
        }),
      ],
      db,
    );
    await importVerified([await matchedChoice(refund)], db);
    expect(totals(await db.articles.toArray(), 1230, "2026-12")).toMatchObject({
      revenue: 3200,
      saleRefundAmount: 300,
      soldCount: 1,
    });
    expect(
      (await importVerified([await matchedChoice(refund)], db)).duplicates,
    ).toBe(1);
  });
  it("accepte les remboursements partiels distincts partageant aussi une ancienne clé d’étape", async () => {
    await importVerified([choice(message(1, { kind: "sale_final" }))], db);
    for (const [id, date, value] of [
      [2, "2026-12-02", 300],
      [3, "2026-12-03", 400],
    ] as const) {
      const p = message(id, {
        kind: "refund",
        date,
        salePrice: value,
        eventKey: digestId(555),
      });
      await importVerified([await matchedChoice(p)], db);
    }
    const records = await db.imports.toArray();
    expect(new Set(records.map((r) => r.eventKey)).size).toBe(3);
    expect(totals(await db.articles.toArray(), 1230, "2026-12").revenue).toBe(
      -700,
    );
    const copy = message(4, {
      kind: "refund",
      date: "2026-12-03",
      salePrice: 400,
    });
    await expect(
      importVerified([await matchedChoice(copy)], db),
    ).rejects.toThrow(/existe déjà/);
    expect((await db.articles.toArray())[0].refunds).toHaveLength(2);
  });
  it("ne confond pas le remboursement d’un achat avec celui de sa revente", async () => {
    await importVerified([choice(message(1, { kind: "sale_final" }))], db);
    const [a] = await db.articles.toArray();
    await saveArticle({ ...a, purchaseReference: digestId(777) }, a.id, db);
    const p = message(2, {
      kind: "refund",
      referenceKey: digestId(777),
      salePrice: 500,
      date: "2026-12-02",
    });
    const c = await matchedChoice(p);
    await expect(
      importVerified([{ ...c, correctionRole: "sale" }], db),
    ).rejects.toThrow(/contredit/);
    await importVerified([c], db);
    expect(totals(await db.articles.toArray(), 1230)).toMatchObject({
      revenue: 3500,
      purchaseRefunds: 500,
    });
  });
  it("exige un rôle explicite si une ancienne fiche partage une référence d’achat et de vente", async () => {
    const a = await manual({
      status: "sold",
      salePrice: 3500,
      saleDate: "2026-11-28",
      purchaseReference: ref,
      saleReference: ref,
    });
    const p = message(1, {
      kind: "refund",
      salePrice: 100,
      date: "2026-12-02",
    });
    const c = choice(p, {
      mode: "refund",
      articleId: a.id,
      expectedUpdatedAt: a.updatedAt,
    });
    await expect(importVerified([c], db)).rejects.toThrow(/achat ou une vente/);
    await importVerified([{ ...c, correctionRole: "sale" }], db);
    expect(totals(await db.articles.toArray(), 1230, "2026-12").revenue).toBe(
      -100,
    );
  });
  it("une annulation d’achat ne supprime pas une revente en attente différente", async () => {
    const a = await manual({
      purchaseReference: ref,
      saleReference: digestId(777),
      pendingSale: {
        referenceKey: digestId(777),
        date: "2026-11-28",
        price: 3500,
        dateEstimated: false,
      },
    });
    const p = message(1, { kind: "cancellation", salePrice: null });
    await expect(
      importVerified(
        [
          choice(p, {
            mode: "cancel",
            articleId: a.id,
            expectedUpdatedAt: a.updatedAt,
          }),
        ],
        db,
      ),
    ).rejects.toThrow(/concerne l’achat/);
    expect(await db.articles.get(a.id)).toEqual(a);
  });
  it("préserve références, alias et corrections après sauvegarde chiffrée, restauration et réouverture", async () => {
    const a = await manual({
      purchaseReference: digestId(777),
      saleReference: ref,
      fees: [{ id: "f", type: "Nettoyage", amount: 150 }],
    });
    const announced = message(1, { date: "2026-12-29" });
    const final = message(2, {
      kind: "sale_final",
      date: "2027-01-02",
      purchasePrice: null,
    });
    await importVerified([await matchedChoice(announced)], db);
    await importVerified([await matchedChoice(final)], db);
    const refund = message(3, {
      kind: "refund",
      date: "2027-01-03",
      salePrice: 200,
    });
    await importVerified([await matchedChoice(refund)], db);
    const duplicate = message(4, {
      ...final,
      sourceKey: digestId(4),
      eventKey: digestId(1004),
    });
    expect(
      (await importVerified([await matchedChoice(duplicate)], db)).duplicates,
    ).toBe(1);
    const before = await createBackup(db);
    const phrase = "__VM_SECRET_TEST__ sauvegarde fictive phase trois";
    const encrypted = await encryptBackup(before, phrase);
    await restoreBackup(await decryptBackup(encrypted, phrase), db);
    const name = db.name;
    db.close();
    db = new ManagerDB(name);
    const { TEST_VAULT_PHRASE } = await import("./test-vault");
    await db.unlock(TEST_VAULT_PHRASE);
    expect(db.verno).toBe(4);
    expect((await createBackup(db)).imports).toEqual(before.imports);
    for (const p of [announced, final, refund, duplicate])
      expect((await importVerified([choice(p)], db)).duplicates).toBe(1);
    const otherCopy = message(5, {
      ...final,
      sourceKey: digestId(5),
      eventKey: digestId(1005),
    });
    expect(
      (await importVerified([await matchedChoice(otherCopy)], db)).duplicates,
    ).toBe(1);
    expect(await db.articles.count()).toBe(1);
    expect((await db.articles.get(a.id))?.fees).toEqual(a.fees);
    expect(totals(await db.articles.toArray(), 1230, "2026-12")).toMatchObject({
      revenue: 0,
      pendingCount: 1,
    });
    expect(totals(await db.articles.toArray(), 1230, "2027-01")).toMatchObject({
      revenue: 3300,
      contributions: 406,
      soldCount: 1,
    });
  });
});
