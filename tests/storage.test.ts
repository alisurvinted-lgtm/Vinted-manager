import { TEST_VAULT_PHRASE, initializeTestVault } from "./test-vault";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ManagerDB, deleteArticle, saveArticle, saveRate } from "../src/lib/db";
import {
  createBackup,
  parseBackup,
  restoreBackup,
  salesCSV,
} from "../src/lib/backup";
import { DEFAULT_RATE, type ArticleInput } from "../src/lib/model";
let db: ManagerDB;
const input = (patch: Partial<ArticleInput> = {}): ArticleInput => ({
  name: "Jean Levi’s 501",
  genre: "Homme",
  category: "Jean",
  purchaseDate: "2026-01-03",
  purchasePrice: 1599,
  status: "stock",
  salePrice: null,
  saleDate: null,
  fees: [],
  ...patch,
});
beforeEach(async () => {
  db = new ManagerDB(`test-${crypto.randomUUID()}`);
  await initializeTestVault(db);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await db.delete();
});
describe("Articles et persistance IndexedDB", () => {
  it("crée un article et son opération sans données de démonstration", async () => {
    expect(await db.articles.count()).toBe(0);
    const a = await saveArticle(input(), undefined, db);
    expect(a.id).toBeTruthy();
    expect((await db.articles.get(a.id))?.purchasePrice).toBe(1599);
    expect(await db.activities.count()).toBe(1);
  });
  it("modifie l’article en conservant l’identifiant et la date de création", async () => {
    const a = await saveArticle(input(), undefined, db);
    const updated = await saveArticle(
      input({ name: "Jean modifié", purchasePrice: 1700 }),
      a.id,
      db,
    );
    expect(updated.id).toBe(a.id);
    expect(updated.createdAt).toBe(a.createdAt);
    expect((await db.articles.get(a.id))?.name).toBe("Jean modifié");
  });
  it("supprime un article et trace la suppression", async () => {
    const a = await saveArticle(input(), undefined, db);
    await deleteArticle(a.id, db);
    expect(await db.articles.count()).toBe(0);
    expect(
      (await db.activities.toArray()).some((a) => a.type === "deleted"),
    ).toBe(true);
  });
  it("passe de stock à vendu avec prix et date, puis revient en stock", async () => {
    const a = await saveArticle(input(), undefined, db);
    const sold = await saveArticle(
      input({ status: "sold", salePrice: 3500, saleDate: "2026-02-01" }),
      a.id,
      db,
    );
    expect(sold.status).toBe("sold");
    expect(sold.salePrice).toBe(3500);
    const stock = await saveArticle(input(), a.id, db);
    expect(stock.saleDate).toBeNull();
    expect((await db.activities.toArray()).map((a) => a.type)).toContain(
      "restocked",
    );
  });
  it("refuse une vente sans prix/date, une date antérieure, un montant flottant", async () => {
    await expect(
      saveArticle(input({ status: "sold" }), undefined, db),
    ).rejects.toThrow();
    await expect(
      saveArticle(
        input({ status: "sold", salePrice: 0, saleDate: "2025-12-01" }),
        undefined,
        db,
      ),
    ).rejects.toThrow();
    await expect(
      saveArticle(input({ purchasePrice: 15.99 }), undefined, db),
    ).rejects.toThrow();
    expect(await db.articles.count()).toBe(0);
  });
  it("refuse de modifier un article supprimé", async () => {
    await expect(saveArticle(input(), "missing", db)).rejects.toThrow(
      "n’existe plus",
    );
  });
  it("conserve les articles et paramètres après fermeture et réouverture de la base", async () => {
    const a = await saveArticle(input(), undefined, db);
    await saveRate(1450, db);
    const name = db.name;
    db.close();
    db = new ManagerDB(name);
    await db.unlock(TEST_VAULT_PHRASE);
    expect((await db.articles.get(a.id))?.name).toBe(a.name);
    expect((await db.settings.get("preferences"))?.rateBps).toBe(1450);
  });
  it("migre une base v1 vers v2 sans perte", async () => {
    const name = db.name;
    await db.delete();
    const old = new Dexie(name);
    old
      .version(1)
      .stores({ articles: "id, status, saleDate, updatedAt", settings: "id" });
    const record = {
      ...input(),
      id: "migrated",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    await old.table("articles").put(record);
    old.close();
    db = new ManagerDB(name);
    await db.initialize(TEST_VAULT_PHRASE);
    expect((await db.articles.get("migrated"))?.name).toBe(record.name);
    expect(await db.activities.count()).toBe(0);
  });
});
describe("Sauvegardes fiables", () => {
  it("exporte et restaure les articles, les frais, l’historique et les paramètres", async () => {
    const a = await saveArticle(
      input({ fees: [{ id: "fee", type: "Nettoyage", amount: 299 }] }),
      undefined,
      db,
    );
    await saveRate(1550, db);
    const backup = parseBackup(JSON.stringify(await createBackup(db)));
    await deleteArticle(a.id, db);
    await saveRate(100, db);
    await restoreBackup(backup, db);
    expect(await db.articles.toArray()).toEqual(backup.articles);
    expect(await db.activities.toArray()).toEqual(backup.activities);
    expect((await db.settings.get("preferences"))?.rateBps).toBe(1550);
  });
  it("restaure aussi un export vide", async () => {
    const backup = await createBackup(db);
    await saveArticle(input(), undefined, db);
    await restoreBackup(backup, db);
    expect(await db.articles.count()).toBe(0);
  });
  it("valide les fichiers malformés, mauvaises versions et structures", () => {
    for (const json of [
      "{",
      "{}",
      "null",
      '{"format":"vinted-manager","version":999}',
    ])
      expect(() => parseBackup(json)).toThrow();
  });
  it("refuse les montants négatifs, les dates impossibles et les doublons avant remplacement", async () => {
    await saveArticle(input(), undefined, db);
    const backup = await createBackup(db);
    expect(() =>
      parseBackup(
        JSON.stringify({
          ...backup,
          articles: [{ ...backup.articles[0], purchasePrice: -1 }],
        }),
      ),
    ).toThrow();
    expect(() =>
      parseBackup(
        JSON.stringify({
          ...backup,
          articles: [{ ...backup.articles[0], purchaseDate: "2026-02-30" }],
        }),
      ),
    ).toThrow();
    expect(() =>
      parseBackup(
        JSON.stringify({
          ...backup,
          articles: [backup.articles[0], backup.articles[0]],
        }),
      ),
    ).toThrow("dupliqués");
    await expect(
      restoreBackup(
        { ...backup, articles: [{ ...backup.articles[0], purchasePrice: -1 }] },
        db,
      ),
    ).rejects.toThrow();
    expect(await db.articles.count()).toBe(1);
  });
  it("annule la transaction si une écriture échoue après l’effacement", async () => {
    const a = await saveArticle(input(), undefined, db);
    const backup = await createBackup(db);
    backup.articles[0].name = "Restauration synthétique différente";
    const encrypt = vi
      .spyOn(crypto.subtle, "encrypt")
      .mockRejectedValueOnce(new Error("Quota dépassé"));
    await expect(restoreBackup(backup, db)).rejects.toThrow();
    expect(await db.articles.get(a.id)).toEqual(a);
    expect(await db.activities.count()).toBe(1);
    encrypt.mockRestore();
  });
  it("exporte uniquement les ventes en CSV avec les décimales françaises", async () => {
    await saveArticle(input(), undefined, db);
    await saveArticle(
      input({
        name: 'Chemise "bleue"',
        status: "sold",
        salePrice: 3500,
        saleDate: "2026-02-01",
      }),
      undefined,
      db,
    );
    const csv = salesCSV(await db.articles.toArray(), DEFAULT_RATE);
    expect(csv.split("\r\n")).toHaveLength(2);
    expect(csv).toContain('Chemise ""bleue""');
    expect(csv).toContain('"4,31"');
    expect(csv).toContain('"14,70"');
    expect(csv.startsWith("\uFEFF")).toBe(true);
  });
  it("conserve les pertes comme nombres négatifs en CSV", async () => {
    await saveArticle(
      input({ status: "sold", salePrice: 1000, saleDate: "2026-02-01" }),
      undefined,
      db,
    );
    const csv = salesCSV(await db.articles.toArray(), DEFAULT_RATE);
    expect(csv).toContain('"-7,22"');
    expect(csv).not.toContain("'-7");
  });
  it("neutralise les formules de tableur dans les noms", async () => {
    await saveArticle(
      input({
        name: "=1+2",
        status: "sold",
        salePrice: 3500,
        saleDate: "2026-02-01",
      }),
      undefined,
      db,
    );
    expect(salesCSV(await db.articles.toArray(), DEFAULT_RATE)).toContain(
      "'=1+2",
    );
  });
});
