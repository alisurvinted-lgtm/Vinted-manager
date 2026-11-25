import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ManagerDB, saveArticle } from "../src/lib/db";
import { importVerified, resolveReview } from "../src/lib/gmail-import";
import { createBackup, parseBackup, restoreBackup } from "../src/lib/backup";
import { decryptBackup, encryptBackup } from "../src/lib/crypto-backup";
import { contribution, profit, totals } from "../src/lib/accounting";
import {
  validateSelection,
  type ImportChoice,
  type VerifiedNotification,
} from "../protocols/gmail-transfer";
import { prepareSelection } from "../prototypes/gmail-oauth/transfer";
import { proposedRow } from "../prototypes/gmail-oauth/preview-model";
let db: ManagerDB;
const fixture = (
  patch: Partial<VerifiedNotification> = {},
): VerifiedNotification => ({
  sourceKey: "a".repeat(64),
  eventKey: "b".repeat(64),
  kind: "sale_final",
  name: "__VM_PRIVATE_TEST__ article vérifié",
  date: "2026-02-02",
  purchaseDate: "2026-01-01",
  purchasePrice: 1500,
  salePrice: 3500,
  boost: 200,
  cleaning: 100,
  genre: "Unisexe",
  category: "Autre",
  ...patch,
});
const choice = (
  item = fixture(),
  patch: Partial<ImportChoice> = {},
): ImportChoice => ({
  item,
  mode: "create",
  articleId: null,
  expectedUpdatedAt: null,
  distinctConfirmed: false,
  ...patch,
});
beforeEach(() => {
  db = new ManagerDB("import-" + crypto.randomUUID());
});
afterEach(async () => {
  await db.delete();
});
describe("Enregistrement confirmé et calculs incomplets", () => {
  it("crée une vente confirmée avec ses frais et son historique, sans contenu Gmail", async () => {
    expect((await importVerified([choice()], db)).created).toBe(1);
    const [a] = await db.articles.toArray();
    expect(a.status).toBe("sold");
    expect(profit(a, 1230)).toBe(1269);
    expect(contribution(a.salePrice!, 1230)).toBe(431);
    expect(await db.activities.count()).toBe(1);
    expect(await db.imports.count()).toBe(1);
    const raw = JSON.stringify(await createBackup(db));
    expect(raw).not.toContain("access_token");
    expect(raw).not.toContain("synthetique@");
  });
  it("compte le CA et les cotisations sans assimiler un coût inconnu à zéro", async () => {
    await importVerified(
      [choice(fixture({ purchaseDate: null, purchasePrice: null }))],
      db,
    );
    const [a] = await db.articles.toArray();
    const s = totals([a], 1230, "2026-02");
    expect(a.purchasePrice).toBeNull();
    expect(a.purchaseDate).toBeNull();
    expect(profit(a, 1230)).toBeNull();
    expect(s).toMatchObject({
      revenue: 3500,
      contributions: 431,
      net: null,
      acquisitionCost: null,
      incompleteProfitCount: 1,
      averageProfit: null,
      unknownPurchaseDates: 1,
    });
    await saveArticle(
      { ...a, purchasePrice: 1500, purchaseDate: "2026-01-01" },
      a.id,
      db,
    );
    expect(totals(await db.articles.toArray(), 1230, "2026-02").net).toBe(1269);
  });
  it("sépare un achat du mois de vente, et ne crée pas de CA pour le stock", async () => {
    await importVerified(
      [
        choice(
          fixture({
            kind: "purchase",
            date: "2025-12-30",
            purchaseDate: "2025-12-30",
            salePrice: null,
          }),
        ),
      ],
      db,
    );
    const [a] = await db.articles.toArray();
    expect(a.status).toBe("stock");
    expect(totals([a], 1230, "2025-12")).toMatchObject({
      revenue: 0,
      net: 0,
      purchaseOutflow: 1500,
      stockCount: 1,
      stockInvestment: 1800,
    });
  });
  it("garde inconnu le capital d’un stock au coût absent", async () => {
    await importVerified(
      [
        choice(
          fixture({
            kind: "purchase",
            purchasePrice: null,
            date: null,
            purchaseDate: null,
            salePrice: null,
          }),
        ),
      ],
      db,
    );
    expect(totals(await db.articles.toArray(), 1230)).toMatchObject({
      stockCount: 1,
      stockInvestment: null,
      purchaseOutflow: null,
    });
  });
  it.each(["sale_announced", "cancellation", "refund", "incomplete"] as const)(
    "conserve %s sans effet comptable",
    async (kind) => {
      await importVerified([choice(fixture({ kind }), { mode: "review" })], db);
      expect(await db.articles.count()).toBe(0);
      expect(await db.activities.count()).toBe(0);
      const [r] = await db.imports.toArray();
      expect(r.resolved).toBe(false);
      await resolveReview(r.id, db);
      expect((await db.imports.get(r.id))?.resolved).toBe(true);
    },
  );
  it("refuse une notification de remboursement transformée en vente par le choix de destination", async () => {
    await expect(
      importVerified([choice(fixture({ kind: "refund" }))], db),
    ).rejects.toThrow();
    expect(await db.articles.count()).toBe(0);
  });
});
describe("Doublons, rapprochement explicite et atomicité", () => {
  it("écarte le même message et la même référence malgré un autre message", async () => {
    await importVerified([choice()], db);
    expect((await importVerified([choice()], db)).duplicates).toBe(1);
    expect(
      (
        await importVerified(
          [choice(fixture({ sourceKey: "c".repeat(64) }))],
          db,
        )
      ).duplicates,
    ).toBe(1);
    expect(await db.articles.count()).toBe(1);
    expect(await db.activities.count()).toBe(1);
  });
  it("refuse deux articles différents sous une même référence, sans import partiel", async () => {
    const second = choice(
      fixture({ sourceKey: "c".repeat(64), name: "Autre article du lot" }),
    );
    await expect(importVerified([choice(), second], db)).rejects.toThrow(
      /même référence/,
    );
    expect(await db.articles.count()).toBe(0);
    expect(await db.imports.count()).toBe(0);
  });
  it("sérialise deux validations concurrentes du même lot", async () => {
    const results = await Promise.all([
      importVerified([choice()], db),
      importVerified([choice()], db),
    ]);
    expect(results.reduce((s, r) => s + r.created, 0)).toBe(1);
    expect(await db.articles.count()).toBe(1);
  });
  it("signale un article ressemblant et exige un rattachement ou une différence confirmée", async () => {
    const existing = await saveArticle(
      {
        name: fixture().name,
        genre: "Homme",
        category: "Jean",
        purchaseDate: "2026-01-01",
        purchasePrice: 1000,
        status: "stock",
        salePrice: null,
        saleDate: null,
        fees: [],
      },
      undefined,
      db,
    );
    await expect(importVerified([choice()], db)).rejects.toThrow(/ressemble/);
    expect(await db.articles.get(existing.id)).toEqual(existing);
    await importVerified(
      [
        choice(fixture(), {
          mode: "sell",
          articleId: existing.id,
          expectedUpdatedAt: existing.updatedAt,
        }),
      ],
      db,
    );
    const a = await db.articles.get(existing.id);
    expect(a?.purchasePrice).toBe(1000);
    expect(a?.genre).toBe("Homme");
    expect(a?.fees).toHaveLength(2);
    expect(a?.status).toBe("sold");
    expect(await db.articles.count()).toBe(1);
  });
  it("relie une vente manuelle identique sans modifier ses montants ni doubler ses frais", async () => {
    const existing = await saveArticle(
      {
        name: fixture().name,
        genre: "Homme",
        category: "Jean",
        purchaseDate: "2026-01-01",
        purchasePrice: 1000,
        status: "sold",
        salePrice: 3500,
        saleDate: "2026-02-02",
        fees: [{ id: "f", type: "Nettoyage", amount: 50 }],
      },
      undefined,
      db,
    );
    await importVerified(
      [
        choice(fixture(), {
          mode: "link",
          articleId: existing.id,
          expectedUpdatedAt: existing.updatedAt,
        }),
      ],
      db,
    );
    expect(await db.articles.get(existing.id)).toEqual(existing);
    expect(await db.activities.count()).toBe(1);
  });
  it("refuse un rattachement divergent et une fiche modifiée entre aperçu et confirmation", async () => {
    const existing = await saveArticle(
      {
        name: "Manuel",
        genre: "Homme",
        category: "Jean",
        purchaseDate: "2026-01-01",
        purchasePrice: 1000,
        status: "sold",
        salePrice: 1000,
        saleDate: "2026-02-02",
        fees: [],
      },
      undefined,
      db,
    );
    await expect(
      importVerified(
        [
          choice(fixture(), {
            mode: "link",
            articleId: existing.id,
            expectedUpdatedAt: existing.updatedAt,
          }),
        ],
        db,
      ),
    ).rejects.toThrow(/correspond/);
    await expect(
      importVerified(
        [
          choice(fixture(), {
            mode: "link",
            articleId: existing.id,
            expectedUpdatedAt: "ancienne-version",
          }),
        ],
        db,
      ),
    ).rejects.toThrow(/changé/);
    expect(await db.imports.count()).toBe(0);
    expect(await db.articles.get(existing.id)).toEqual(existing);
  });
  it("annule tout le lot si une seconde opération échoue", async () => {
    const second = choice(
      fixture({
        sourceKey: "c".repeat(64),
        eventKey: "d".repeat(64),
        name: "Second",
      }),
      { mode: "link", articleId: "absent", expectedUpdatedAt: "2026-01-01" },
    );
    await expect(importVerified([choice(), second], db)).rejects.toThrow();
    expect(await db.articles.count()).toBe(0);
    expect(await db.activities.count()).toBe(0);
    expect(await db.imports.count()).toBe(0);
  });
});
describe("Migration et sauvegarde", () => {
  it("migre une base v2 sans réécrire les articles, frais, opérations et réglages", async () => {
    const old = new Dexie(db.name);
    old.version(2).stores({
      articles: "id, status, saleDate, updatedAt",
      settings: "id",
      activities: "id, date",
    });
    await old.open();
    const article = {
      id: "ancien",
      name: "Ancien article",
      genre: "Unisexe",
      category: "Jean",
      purchaseDate: "2026-01-01",
      purchasePrice: 1520,
      status: "stock",
      salePrice: null,
      saleDate: null,
      fees: [{ id: "ancien-frais", type: "Nettoyage", amount: 100 }],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    await old.table("articles").put(article);
    await old.table("settings").put({ id: "preferences", rateBps: 1500 });
    old.close();
    await db.open();
    expect(db.verno).toBe(3);
    expect(await db.articles.get("ancien")).toEqual(article);
    expect((await db.settings.get("preferences"))?.rateBps).toBe(1500);
    expect(await db.imports.count()).toBe(0);
  });
  it("restaure le suivi des doublons et les inconnus depuis une sauvegarde chiffrée", async () => {
    await importVerified(
      [choice(fixture({ purchasePrice: null, purchaseDate: null }))],
      db,
    );
    const backup = await createBackup(db);
    expect(backup.version).toBe(2);
    const phrase = "__VM_SECRET_TEST__ phrase synthétique longue";
    const file = await encryptBackup(backup, phrase);
    await expect(
      decryptBackup(file, "mauvaise phrase de test longue"),
    ).rejects.toThrow();
    const restored = await decryptBackup(file, phrase);
    await restoreBackup(restored, db);
    expect((await importVerified([choice()], db)).duplicates).toBe(1);
    expect((await db.articles.toArray())[0].purchasePrice).toBeNull();
  });
  it("accepte une ancienne sauvegarde v1 sans suivi et refuse les suivis malformés", async () => {
    const backup = await createBackup(db);
    const old = { ...backup, version: 1 };
    delete old.imports;
    expect(parseBackup(JSON.stringify(old)).imports).toEqual([]);
    expect(() =>
      parseBackup(JSON.stringify({ ...backup, imports: [{ id: "illégal" }] })),
    ).toThrow();
  });
});
describe("Frontière de transfert", () => {
  it("projette seulement les données saisies et hache les identifiants sans transmettre message, objet ou jeton", async () => {
    const row = proposedRow(
      "identifiant-synthetique",
      "Sujet confidentiel",
      "2026-01-01T00:00:00Z",
      true,
      "Corps synthétique",
      null,
    );
    row.draft = {
      ...row.draft,
      checked: true,
      article: "Article vérifié",
      kind: "sale_final",
      date: "2026-02-02",
      sale: "35,00",
    };
    const [item] = await prepareSelection([row]);
    expect(item.purchasePrice).toBeNull();
    expect(item.purchaseDate).toBeNull();
    expect(item.boost).toBe(0);
    expect(item.sourceKey).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(item)).not.toMatch(
      /Sujet confidentiel|Corps synthétique|identifiant-synthetique/,
    );
  });
  it("refuse un expéditeur douteux et une vente sans prix ou date", async () => {
    const row = proposedRow(
      "fictif",
      "Vente",
      "2026-01-01T00:00:00Z",
      false,
      "",
      null,
    );
    row.draft = {
      ...row.draft,
      checked: true,
      article: "Article",
      kind: "sale_final",
    };
    await expect(prepareSelection([row])).rejects.toThrow(/authentifiée/);
    row.authenticated = true;
    await expect(prepareSelection([row])).rejects.toThrow();
  });
  it.each([
    { token: "interdit" },
    { text: "interdit" },
    { subject: "interdit" },
    { salePrice: -1 },
    { date: "2026-02-30" },
    { purchasePrice: 0.1 },
  ])("rejette les clés ou valeurs étrangères : %j", (patch) => {
    expect(() => validateSelection([{ ...fixture(), ...patch }])).toThrow();
  });
});
