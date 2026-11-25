import { db, type ManagerDB } from "./db";
import { defaultSettings, type Article } from "./model";
import { contribution, editMoney, feeTotal, profit } from "./accounting";
export { parseBackup, type Backup } from "./backup-format";
import { parseBackup, type Backup } from "./backup-format";
export async function createBackup(database = db): Promise<Backup> {
  return database.transaction(
    "r",
    database.articles,
    database.settings,
    database.activities,
    database.imports,
    async (tx) => ({
      format: "vinted-manager",
      version: 3,
      exportedAt: new Date().toISOString(),
      articles: await tx.articles.toArray(),
      activities: await tx.activities.toArray(),
      imports: await tx.imports.toArray(),
      settings: (await tx.settings.get("preferences")) ?? {
        ...defaultSettings,
      },
    }),
  );
}
export async function restoreBackup(backup: Backup, database: ManagerDB = db) {
  const valid = parseBackup(JSON.stringify(backup));
  await database.transaction(
    "rw",
    database.articles,
    database.settings,
    database.activities,
    database.imports,
    async (tx) => {
      await tx.articles.clear();
      await tx.settings.clear();
      await tx.activities.clear();
      await tx.imports.clear();
      await tx.articles.bulkAdd(valid.articles);
      await tx.settings.put(valid.settings);
      await tx.activities.bulkAdd(valid.activities);
      await tx.imports.bulkAdd(valid.imports ?? []);
    },
  );
}
const csvCell = (value: string) =>
  `"${(/^[=+\-@\t\r]/.test(value) && !/^-?\d+(,\d{1,2})?$/.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`;
export function salesCSV(articles: Article[], rateBps: number): string {
  const rows = [
    [
      "Article",
      "Genre",
      "Catégorie",
      "Date d’achat",
      "Achat TTC (€)",
      "Date de vente",
      "Vente (€)",
      "Frais (€)",
      "Taux (%)",
      "Cotisations estimées (€)",
      "Bénéfice estimé (€)",
    ],
    ...articles
      .filter((a) => a.status === "sold")
      .sort((a, b) => a.saleDate!.localeCompare(b.saleDate!))
      .map((a) => [
        a.name,
        a.genre,
        a.category,
        a.purchaseDate ?? "À compléter",
        editMoney(a.purchasePrice),
        a.saleDate!,
        editMoney(a.salePrice!),
        editMoney(feeTotal(a)),
        editMoney(rateBps),
        editMoney(contribution(a.salePrice!, rateBps)),
        a.purchasePrice === null
          ? "Bénéfice à compléter"
          : editMoney(profit(a, rateBps)),
      ]),
  ];
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((v) => csvCell(v.replace(/^(-?\d+)\.(\d{2})$/, "$1,$2")))
          .join(";"),
      )
      .join("\r\n")
  );
}
export function download(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}
