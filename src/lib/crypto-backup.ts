import { parseBackup, type Backup } from "./backup-format";

export const PBKDF2_ITERATIONS = 600_000;
export const MAX_ENCRYPTED_BYTES = 30 * 1024 * 1024;
export const MIN_PASSPHRASE_LENGTH = 16;
export interface EncryptedBackup {
  format: "vinted-manager-encrypted";
  version: 1;
  cipher: "AES-256-GCM";
  kdf: {
    algorithm: "PBKDF2";
    hash: "SHA-256";
    iterations: number;
    salt: string;
  };
  iv: string;
  ciphertext: string;
}
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).sort().join(",") === [...keys].sort().join(",");
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
function base64Length(value: unknown): number {
  // Validation linéaire sans répétitions de groupes susceptibles d'épuiser la pile sur un gros fichier.
  if (
    typeof value !== "string" ||
    value.length % 4 !== 0 ||
    /[^A-Za-z0-9+/=]/.test(value)
  )
    throw new Error("Le fichier chiffré est invalide.");
  const padding = value.indexOf("=");
  if (
    padding !== -1 &&
    (padding < value.length - 2 || !["=", "=="].includes(value.slice(padding)))
  )
    throw new Error("Le fichier chiffré est invalide.");
  try {
    if (value.length && btoa(atob(value.slice(-4))) !== value.slice(-4))
      throw new Error();
  } catch {
    throw new Error("Le fichier chiffré est invalide.");
  }
  return (value.length / 4) * 3 - (padding === -1 ? 0 : value.length - padding);
}
function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  base64Length(value);
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
function header(envelope: EncryptedBackup) {
  return encoder.encode(
    JSON.stringify({
      format: envelope.format,
      version: envelope.version,
      cipher: envelope.cipher,
      kdf: {
        algorithm: envelope.kdf.algorithm,
        hash: envelope.kdf.hash,
        iterations: envelope.kdf.iterations,
        salt: envelope.kdf.salt,
      },
      iv: envelope.iv,
    }),
  );
}
function webCrypto() {
  if (!globalThis.crypto?.subtle)
    throw new Error(
      "Le chiffrement nécessite Safari récent et une adresse HTTPS (ou localhost pour les tests).",
    );
  return globalThis.crypto;
}
function validatePassphrase(passphrase: string, exporting = false) {
  if (!passphrase.length || passphrase.length > 1024)
    throw new Error("Renseignez une phrase secrète de 1 à 1 024 caractères.");
  if (exporting && [...passphrase].length < MIN_PASSPHRASE_LENGTH)
    throw new Error(
      "Choisissez une phrase secrète d’au moins 16 caractères ; cinq mots aléatoires sont recommandés.",
    );
}
async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>) {
  const api = webCrypto();
  const bytes = encoder.encode(passphrase);
  try {
    const material = await api.subtle.importKey("raw", bytes, "PBKDF2", false, [
      "deriveKey",
    ]);
    return await api.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } finally {
    bytes.fill(0);
  }
}
export function parseEncryptedBackup(json: string): EncryptedBackup {
  if (
    json.length > MAX_ENCRYPTED_BYTES ||
    encoder.encode(json).byteLength > MAX_ENCRYPTED_BYTES
  )
    throw new Error("Le fichier chiffré dépasse 30 Mo.");
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error("Le fichier chiffré est invalide.");
  }
  if (
    !object(value) ||
    !exactKeys(value, [
      "format",
      "version",
      "cipher",
      "kdf",
      "iv",
      "ciphertext",
    ]) ||
    value.format !== "vinted-manager-encrypted" ||
    value.version !== 1 ||
    value.cipher !== "AES-256-GCM" ||
    !object(value.kdf) ||
    !exactKeys(value.kdf, ["algorithm", "hash", "iterations", "salt"]) ||
    value.kdf.algorithm !== "PBKDF2" ||
    value.kdf.hash !== "SHA-256" ||
    value.kdf.iterations !== PBKDF2_ITERATIONS
  )
    throw new Error("Format chiffré incompatible ou altéré.");
  if (
    base64Length(value.kdf.salt) !== 32 ||
    base64Length(value.iv) !== 12 ||
    base64Length(value.ciphertext) < 16 ||
    base64Length(value.ciphertext) > 20 * 1024 * 1024 + 16
  )
    throw new Error("Le fichier chiffré est invalide.");
  return value as unknown as EncryptedBackup;
}
export async function encryptBackup(
  backup: Backup,
  passphrase: string,
): Promise<string> {
  validatePassphrase(passphrase, true);
  const canonical = parseBackup(JSON.stringify(backup));
  const api = webCrypto();
  const salt = api.getRandomValues(new Uint8Array(32));
  const iv = api.getRandomValues(new Uint8Array(12));
  const envelope: EncryptedBackup = {
    format: "vinted-manager-encrypted",
    version: 1,
    cipher: "AES-256-GCM",
    kdf: {
      algorithm: "PBKDF2",
      hash: "SHA-256",
      iterations: PBKDF2_ITERATIONS,
      salt: toBase64(salt),
    },
    iv: toBase64(iv),
    ciphertext: "",
  };
  const plaintext = encoder.encode(JSON.stringify(canonical));
  try {
    const key = await deriveKey(passphrase, salt);
    const encrypted = await api.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: header(envelope), tagLength: 128 },
      key,
      plaintext,
    );
    envelope.ciphertext = toBase64(new Uint8Array(encrypted));
    const result = JSON.stringify(envelope);
    if (encoder.encode(result).byteLength > MAX_ENCRYPTED_BYTES)
      throw new Error("La sauvegarde chiffrée dépasse 30 Mo.");
    return result;
  } finally {
    plaintext.fill(0);
  }
}
export async function decryptBackup(
  json: string,
  passphrase: string,
): Promise<Backup> {
  validatePassphrase(passphrase);
  const envelope = parseEncryptedBackup(json);
  let plaintext: Uint8Array<ArrayBuffer>;
  try {
    const key = await deriveKey(passphrase, fromBase64(envelope.kdf.salt));
    plaintext = new Uint8Array(
      await webCrypto().subtle.decrypt(
        {
          name: "AES-GCM",
          iv: fromBase64(envelope.iv),
          additionalData: header(envelope),
          tagLength: 128,
        },
        key,
        fromBase64(envelope.ciphertext),
      ),
    );
  } catch {
    throw new Error(
      "Phrase secrète incorrecte ou sauvegarde altérée. Aucune donnée n’a été remplacée.",
    );
  }
  try {
    return parseBackup(decoder.decode(plaintext));
  } finally {
    plaintext.fill(0);
  }
}
export function backupFileType(json: string): "encrypted" | "plain" {
  if (json.length > MAX_ENCRYPTED_BYTES)
    throw new Error("Le fichier dépasse 30 Mo.");
  let value;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error("Le fichier de sauvegarde est invalide.");
  }
  if (value?.format === "vinted-manager-encrypted") {
    parseEncryptedBackup(json);
    return "encrypted";
  }
  if (value?.format === "vinted-manager") {
    parseBackup(json);
    return "plain";
  }
  throw new Error(
    "Ce fichier n’est pas une sauvegarde Vinted Manager compatible.",
  );
}
