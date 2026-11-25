import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ManagerDB, saveArticle } from "../src/lib/db";
import { importVerified, reconcile } from "../src/lib/gmail-import";
import { totals } from "../src/lib/accounting";
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
