import {
  validateImportRecord,
  type ImportRecord,
} from "../../protocols/gmail-transfer";
import { db, type ManagerDB } from "./db";
import {
  defaultSettings,
  type Activity,
  type Article,
  type Settings,
} from "./model";
import { validateActivity, validateArticle } from "./validation";
import { contribution, editMoney, feeTotal, profit } from "./accounting";
export interface Backup {
  format: "vinted-manager";
  version: 1 | 2;
  exportedAt: string;
  articles: Article[];
  activities: Activity[];
  settings: Settings;
  imports?: ImportRecord[];
}
export async function createBackup(database = db): Promise<Backup> {
  return database.transaction(
    "r",
    database.articles,
    database.settings,
    database.activities,
    database.imports,
    async () => ({
      format: "vinted-manager",
      version: 2,
      exportedAt: new Date().toISOString(),
      articles: await database.articles.toArray(),
      activities: await database.activities.toArray(),
      imports: await database.imports.toArray(),
      settings: (await database.settings.get("preferences")) ?? {
        ...defaultSettings,
      },
    }),
  );
}
export function parseBackup(json: string): Backup {
  if (
    json.length > 20 * 1024 * 1024 ||
    new TextEncoder().encode(json).byteLength > 20 * 1024 * 1024
  )
    throw new Error("La sauvegarde dépasse la limite de 20 Mo.");
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("Le fichier ne contient pas de JSON valide.");
  }
  if (
    !data ||
    data.format !== "vinted-manager" ||
    ![1, 2].includes(data.version) ||
    !Array.isArray(data.articles) ||
    !Array.isArray(data.activities) ||
    data.articles.length > 100000 ||
    data.activities.length > 200000 ||
    typeof data.exportedAt !== "string" ||
    !Number.isFinite(Date.parse(data.exportedAt)) ||
    !data.settings ||
    data.settings.id !== "preferences" ||
    !Number.isInteger(data.settings.rateBps) ||
    data.settings.rateBps < 0 ||
    data.settings.rateBps > 10000 ||
    (data.settings.lastExportAt !== undefined &&
      (typeof data.settings.lastExportAt !== "string" ||
        !Number.isFinite(Date.parse(data.settings.lastExportAt))))
  )
    throw new Error(
      "Ce fichier n’est pas une sauvegarde Vinted Manager compatible.",
    );
  if (
    data.version === 2 &&
    (!Array.isArray(data.imports) || data.imports.length > 200000)
  )
    throw new Error("Le suivi des imports est invalide.");
  const imports: ImportRecord[] = data.version === 2 ? data.imports : [];
  imports.forEach(validateImportRecord);
  if (
    new Set(imports.map((i) => i.id)).size !== imports.length ||
    new Set(imports.map((i) => i.eventKey)).size !== imports.length
  )
    throw new Error("Le suivi des imports contient des doublons.");
  if (
    data.version === 1 &&
    (data.articles.some(
      (a: Article) => a.purchasePrice === null || a.purchaseDate === null,
    ) ||
      data.activities.some((a: Activity) => a.amount === null) ||
      (data.imports !== undefined &&
        (!Array.isArray(data.imports) || data.imports.length > 0)))
  )
    throw new Error(
      "Les données ne correspondent pas au format historique de sauvegarde.",
    );
  data.articles.forEach(validateArticle);
  data.activities.forEach(validateActivity);
  if (
    new Set(data.articles.map((a: Article) => a.id)).size !==
      data.articles.length ||
    new Set(data.activities.map((a: Activity) => a.id)).size !==
      data.activities.length
  )
    throw new Error("La sauvegarde contient des identifiants dupliqués.");
  // Reconstruire uniquement les champs connus, pour ne pas importer de propriétés arbitraires.
  return {
    format: "vinted-manager",
    version: data.version,
    imports: imports.map((i) => ({ ...i })),
    exportedAt: data.exportedAt,
    settings: {
      id: "preferences",
      rateBps: data.settings.rateBps,
      ...(data.settings.lastExportAt
        ? { lastExportAt: data.settings.lastExportAt }
        : {}),
    },
    articles: data.articles.map((a: Article) => ({
      id: a.id,
      name: a.name.trim(),
      genre: a.genre,
      category: a.category,
      purchaseDate: a.purchaseDate,
      purchasePrice: a.purchasePrice,
      status: a.status,
      salePrice: a.salePrice,
      saleDate: a.saleDate,
      fees: a.fees.map((f) => ({ id: f.id, type: f.type, amount: f.amount })),
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    })),
    activities: data.activities.map((a: Activity) => ({
      id: a.id,
      articleId: a.articleId,
      name: a.name,
      type: a.type,
      date: a.date,
      amount: a.amount,
    })),
  };
}
export async function restoreBackup(backup: Backup, database: ManagerDB = db) {
  const valid = parseBackup(JSON.stringify(backup));
  await database.transaction(
    "rw",
    database.articles,
    database.settings,
    database.activities,
    database.imports,
    async () => {
      await database.articles.clear();
      await database.settings.clear();
      await database.activities.clear();
      await database.imports.clear();
      await database.articles.bulkAdd(valid.articles);
      await database.settings.put(valid.settings);
      await database.activities.bulkAdd(valid.activities);
      await database.imports.bulkAdd(valid.imports ?? []);
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
