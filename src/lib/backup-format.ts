import {
  validateImportRecord,
  type ImportRecord,
} from "../../protocols/gmail-transfer";
import { type Activity, type Article, type Settings } from "./model";
import {
  articleDetails,
  validateActivity,
  validateArticle,
} from "./validation";
export interface Backup {
  format: "vinted-manager";
  version: 1 | 2 | 3;
  exportedAt: string;
  articles: Article[];
  activities: Activity[];
  settings: Settings;
  imports?: ImportRecord[];
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
    ![1, 2, 3].includes(data.version) ||
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
    (data.settings.autoLockMinutes !== undefined &&
      ![1, 5, 15].includes(data.settings.autoLockMinutes)) ||
    (data.settings.lastExportAt !== undefined &&
      (typeof data.settings.lastExportAt !== "string" ||
        !Number.isFinite(Date.parse(data.settings.lastExportAt))))
  )
    throw new Error(
      "Ce fichier n’est pas une sauvegarde Vinted Manager compatible.",
    );
  if (
    data.version >= 2 &&
    (!Array.isArray(data.imports) || data.imports.length > 200000)
  )
    throw new Error("Le suivi des imports est invalide.");
  const imports: ImportRecord[] = data.version >= 2 ? data.imports : [];
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
  if (
    data.settings.gmailProgress !== undefined &&
    (!Array.isArray(data.settings.gmailProgress) ||
      data.settings.gmailProgress.length > 600 ||
      data.settings.gmailProgress.some(
        (p: Record<string, unknown>) =>
          !p ||
          typeof p.period !== "string" ||
          !/^\d{4}-(0[1-9]|1[0-2])$/.test(p.period) ||
          (p.pageToken !== null &&
            (typeof p.pageToken !== "string" ||
              !p.pageToken ||
              p.pageToken.length > 2048)) ||
          typeof p.complete !== "boolean" ||
          typeof p.updatedAt !== "string" ||
          !Number.isFinite(Date.parse(p.updatedAt)),
      ))
  )
    throw new Error("Progression Gmail invalide.");
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
      ...(data.settings.gmailProgress
        ? {
            gmailProgress: data.settings.gmailProgress.map(
              (p: {
                period: string;
                pageToken: string | null;
                complete: boolean;
                updatedAt: string;
              }) => ({
                period: p.period,
                pageToken: p.pageToken,
                complete: p.complete,
                updatedAt: p.updatedAt,
              }),
            ),
          }
        : {}),
      ...(data.settings.autoLockMinutes !== undefined
        ? { autoLockMinutes: data.settings.autoLockMinutes }
        : {}),
      ...(data.settings.lastExportAt
        ? { lastExportAt: data.settings.lastExportAt }
        : {}),
    },
    articles: data.articles.map((a: Article) => ({
      ...articleDetails(a),
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
