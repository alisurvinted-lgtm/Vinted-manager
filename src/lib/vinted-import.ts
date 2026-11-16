// Aucun analyseur transactionnel n'est enregistré sans structure de fichier officiel vérifiée.
export const VINTED_IMPORT_MAX_BYTES = 20 * 1024 * 1024;
export const VINTED_IMPORT_SUPPORTED_FORMATS: readonly string[] = Object.freeze(
  [],
);
export const VINTED_IMPORT_SOURCES = {
  privacy: "https://www.vinted.fr/help/1432",
  accountCopy: "https://www.vinted.co.uk/help/1374?access_channel=hc_topics",
  checkedAt: "2026-11-16",
} as const;
export type ImportFileMetadata = Pick<File, "name" | "size" | "type">;
export function checkVintedImportAvailability(file: ImportFileMetadata): {
  allowed: false;
  reason: "empty" | "size" | "unsupported";
  message: string;
} {
  if (
    !Number.isSafeInteger(file.size) ||
    file.size < 0 ||
    file.size > VINTED_IMPORT_MAX_BYTES
  )
    return {
      allowed: false,
      reason: "size",
      message:
        "Le fichier dépasse la limite de 20 Mo ou sa taille est invalide.",
    };
  if (file.size === 0)
    return { allowed: false, reason: "empty", message: "Le fichier est vide." };
  // Ni extension ni type MIME ne prouvent la structure ou la provenance d'un export.
  return {
    allowed: false,
    reason: "unsupported",
    message:
      "Aucun format de transactions Vinted n’est encore validé. Aucun fichier n’a été lu et aucune donnée n’a été importée.",
  };
}
