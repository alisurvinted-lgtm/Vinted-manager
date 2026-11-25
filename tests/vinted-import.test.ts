import { afterEach, describe, expect, it, vi } from "vitest";
import Dexie from "dexie";
import {
  checkVintedImportAvailability,
  VINTED_IMPORT_MAX_BYTES,
  VINTED_IMPORT_SUPPORTED_FORMATS,
} from "../src/lib/vinted-import";
import { ManagerDB } from "../src/lib/db";
import { createBackup } from "../src/lib/backup";
import { monthlyReport } from "../src/lib/accounting";
const databases: ManagerDB[] = [];
afterEach(async () => {
  for (const database of databases.splice(0)) await database.delete();
});
describe("Import Vinted en attente d’un format vérifié", () => {
  it("ne déclare aucun format transactionnel pris en charge sans analyseur confirmé", () => {
    expect(VINTED_IMPORT_SUPPORTED_FORMATS).toHaveLength(0);
  });
  it.each([
    ["transactions.json", "application/json", "{"],
    ["transactions.json", "application/json", "{}"],
    ["export.zip", "application/zip", "PK\u0003\u0004archive corrompue"],
    [
      "ventes.html",
      "text/html",
      '<script>throw new Error("non exécuté")</script>',
    ],
    ["remboursements.csv", "text/csv", "date;montant\n;"],
    ["annulations.csv", "text/csv", "statut\nannulé"],
    ["achats.csv", "text/csv", "nom;prix;date\nArticle;;"],
  ])(
    "refuse %s sans lire ni interpréter son contenu",
    (name, type, content) => {
      const file = new File([content], name, { type });
      const read = vi.spyOn(file, "text");
      const array = vi.spyOn(file, "arrayBuffer");
      expect(checkVintedImportAvailability(file)).toMatchObject({
        allowed: false,
        reason: "unsupported",
      });
      expect(read).not.toHaveBeenCalled();
      expect(array).not.toHaveBeenCalled();
    },
  );
  it("refuse les fichiers vides ou trop grands avant toute lecture", () => {
    expect(
      checkVintedImportAvailability({
        name: "vide.zip",
        type: "application/zip",
        size: 0,
      }).reason,
    ).toBe("empty");
    for (const size of [-1, NaN, Infinity, VINTED_IMPORT_MAX_BYTES + 1])
      expect(
        checkVintedImportAvailability({
          name: "grand.zip",
          type: "application/zip",
          size,
        }).reason,
      ).toBe("size");
  });
  it("conserve une base v1 migrée, ses ventes, frais et paramètres, même après sélection répétée d’un export", async () => {
    const name = `v2-preservation-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old
      .version(1)
      .stores({ articles: "id, status, saleDate, updatedAt", settings: "id" });
    const article = {
      id: "ancien",
      name: "Article synthétique ancien",
      genre: "Unisexe",
      category: "Polaire",
      purchaseDate: "2025-12-01",
      purchasePrice: 1500,
      status: "sold",
      salePrice: 3500,
      saleDate: "2026-01-01",
      fees: [{ id: "ancien-frais", type: "Nettoyage", amount: 100 }],
      createdAt: "2025-12-01T12:00:00Z",
      updatedAt: "2026-01-01T12:00:00Z",
    };
    await old.table("articles").put(article);
    await old.table("settings").put({ id: "preferences", rateBps: 1450 });
    old.close();
    const database = new ManagerDB(name);
    databases.push(database);
    const before = await createBackup(database);
    const file = new File(["aucun format confirmé"], "export.zip", {
      type: "application/zip",
    });
    expect(checkVintedImportAvailability(file).allowed).toBe(false);
    expect(checkVintedImportAvailability(file).allowed).toBe(false);
    const report = monthlyReport(
      await database.articles.toArray(),
      1450,
      "2026-01",
    );
    expect(report.current.revenue).toBe(3500);
    expect(report.current.acquisitionCost).toBe(1500);
    const after = await createBackup(database);
    expect(after.articles).toEqual(before.articles);
    expect(after.settings).toEqual(before.settings);
    expect(after.activities).toEqual(before.activities);
    expect(after.articles).toEqual([article]);
    expect(database.verno).toBe(3);
  });
});
