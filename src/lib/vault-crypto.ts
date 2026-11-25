// Primitives Web Crypto uniquement. Aucun secret ou champ comptable dans les en-têtes.
export const VAULT_ITERATIONS = 600000;
const enc = new TextEncoder();
const dec = new TextDecoder("utf-8", { fatal: true });
export interface VaultRecord {
  id: "active";
  format: "vinted-manager-vault";
  version: 1;
  keyId: string;
  kdf: {
    algorithm: "PBKDF2";
    hash: "SHA-256";
    iterations: 600000;
    salt: string;
  };
  wrapIv: string;
  wrappedKey: string;
  iv: string;
  ciphertext: string;
  revision: number;
  migration: "pending" | "complete";
}
const MAX_BYTES = 30 * 1024 * 1024;
export function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192)
    s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
}
export function unbase64(
  value: unknown,
  max = MAX_BYTES,
): Uint8Array<ArrayBuffer> {
  if (
    typeof value !== "string" ||
    value.length > Math.ceil(max / 3) * 4 ||
    value.length % 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  )
    throw new Error("Format du coffre invalide.");
  const b = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  if (b.byteLength > max || base64(b) !== value)
    throw new Error("Format du coffre invalide.");
  return b;
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export function validateVault(v: unknown): asserts v is VaultRecord {
  if (
    !object(v) ||
    Object.keys(v).sort().join(",") !==
      [
        "id",
        "format",
        "version",
        "keyId",
        "kdf",
        "wrapIv",
        "wrappedKey",
        "iv",
        "ciphertext",
        "revision",
        "migration",
      ]
        .sort()
        .join(",") ||
    v.id !== "active" ||
    v.format !== "vinted-manager-vault" ||
    v.version !== 1 ||
    typeof v.keyId !== "string" ||
    !/^[a-f0-9-]{36}$/.test(v.keyId) ||
    !Number.isSafeInteger(v.revision) ||
    (v.revision as number) < 1 ||
    (v.revision as number) >= 2 ** 32 ||
    !["pending", "complete"].includes(v.migration as string) ||
    !object(v.kdf) ||
    Object.keys(v.kdf).sort().join(",") !== "algorithm,hash,iterations,salt" ||
    v.kdf.algorithm !== "PBKDF2" ||
    v.kdf.hash !== "SHA-256" ||
    v.kdf.iterations !== VAULT_ITERATIONS
  )
    throw new Error("Format du coffre invalide.");
  if (
    unbase64(v.kdf.salt, 16).length !== 16 ||
    unbase64(v.wrapIv, 12).length !== 12 ||
    unbase64(v.wrappedKey, 48).length !== 48 ||
    unbase64(v.iv, 12).length !== 12 ||
    unbase64(v.ciphertext).length < 16
  )
    throw new Error("Format du coffre invalide.");
}
export function checkNewPhrase(value: string) {
  if ([...value].length < 16 || value.length > 1024)
    throw new Error(
      "Choisissez une phrase secrète d’au moins 16 caractères, idéalement cinq mots aléatoires.",
    );
}
function wrapAAD(
  v: Pick<VaultRecord, "format" | "version" | "keyId" | "kdf" | "wrapIv">,
) {
  return enc.encode(
    JSON.stringify({
      purpose: "vault-key",
      format: v.format,
      version: v.version,
      keyId: v.keyId,
      kdf: v.kdf,
      wrapIv: v.wrapIv,
    }),
  );
}
function dataAAD(
  v: Pick<
    VaultRecord,
    "format" | "version" | "keyId" | "revision" | "iv" | "migration"
  >,
) {
  return enc.encode(
    JSON.stringify({
      purpose: "vault-ledger",
      format: v.format,
      version: v.version,
      keyId: v.keyId,
      revision: v.revision,
      iv: v.iv,
      migration: v.migration,
    }),
  );
}
async function kek(phrase: string, salt: Uint8Array<ArrayBuffer>) {
  if (!phrase || phrase.length > 1024)
    throw new Error("Renseignez votre phrase secrète.");
  const bytes = enc.encode(phrase);
  try {
    const material = await crypto.subtle.importKey(
      "raw",
      bytes,
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    return await crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations: VAULT_ITERATIONS },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } finally {
    bytes.fill(0);
  }
}
export async function newVault(
  phrase: string,
  plaintext: string,
  migration: VaultRecord["migration"],
): Promise<{ record: VaultRecord; key: CryptoKey }> {
  checkNewPhrase(phrase);
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const wrapIv = crypto.getRandomValues(new Uint8Array(12));
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      raw,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"],
    );
    const record: VaultRecord = {
      id: "active",
      format: "vinted-manager-vault",
      version: 1,
      keyId: crypto.randomUUID(),
      kdf: {
        algorithm: "PBKDF2",
        hash: "SHA-256",
        iterations: VAULT_ITERATIONS,
        salt: base64(salt),
      },
      wrapIv: base64(wrapIv),
      wrappedKey: "",
      iv: "",
      ciphertext: "",
      revision: 1,
      migration,
    };
    record.wrappedKey = base64(
      new Uint8Array(
        await crypto.subtle.encrypt(
          {
            name: "AES-GCM",
            iv: wrapIv,
            additionalData: wrapAAD(record),
            tagLength: 128,
          },
          await kek(phrase, salt),
          raw,
        ),
      ),
    );
    return { record: await seal(record, key, plaintext, 1, new Set()), key };
  } finally {
    raw.fill(0);
    salt.fill(0);
    wrapIv.fill(0);
  }
}
export async function openKey(
  record: VaultRecord,
  phrase: string,
): Promise<CryptoKey> {
  validateVault(record);
  let raw: Uint8Array<ArrayBuffer> | undefined;
  try {
    raw = new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: unbase64(record.wrapIv, 12),
          additionalData: wrapAAD(record),
          tagLength: 128,
        },
        await kek(phrase, unbase64(record.kdf.salt, 16)),
        unbase64(record.wrappedKey, 48),
      ),
    );
    if (raw.length !== 32) throw new Error();
    return await crypto.subtle.importKey(
      "raw",
      raw,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"],
    );
  } catch {
    throw new Error(
      "Phrase secrète incorrecte ou coffre altéré. Aucune donnée n’a été remplacée.",
    );
  } finally {
    raw?.fill(0);
  }
}
export async function seal(
  previous: VaultRecord,
  key: CryptoKey,
  plaintext: string,
  revision: number,
  used: Set<string>,
): Promise<VaultRecord> {
  const bytes = enc.encode(plaintext);
  if (bytes.length > 20 * 1024 * 1024)
    throw new Error("Les données dépassent la limite de 20 Mo.");
  if (!Number.isSafeInteger(revision) || revision < 1 || revision >= 2 ** 32)
    throw new Error("Limite de version du coffre atteinte.");
  let iv: Uint8Array<ArrayBuffer> | undefined;
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      iv = crypto.getRandomValues(new Uint8Array(12));
      const candidate = base64(iv);
      if (candidate !== previous.iv && !used.has(candidate)) {
        used.add(candidate);
        const record = { ...previous, revision, iv: candidate };
        record.ciphertext = base64(
          new Uint8Array(
            await crypto.subtle.encrypt(
              {
                name: "AES-GCM",
                iv,
                additionalData: dataAAD(record),
                tagLength: 128,
              },
              key,
              bytes,
            ),
          ),
        );
        return record;
      }
    }
    throw new Error(
      "Impossible de produire un IV neuf. L’écriture est refusée.",
    );
  } finally {
    bytes.fill(0);
    iv?.fill(0);
  }
}
export async function unseal(
  record: VaultRecord,
  key: CryptoKey,
): Promise<string> {
  validateVault(record);
  let bytes: Uint8Array<ArrayBuffer> | undefined;
  try {
    bytes = new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: unbase64(record.iv, 12),
          additionalData: dataAAD(record),
          tagLength: 128,
        },
        key,
        unbase64(record.ciphertext),
      ),
    );
    return dec.decode(bytes);
  } catch {
    throw new Error(
      "Le contenu du coffre est altéré ou illisible. Aucune donnée n’a été remplacée.",
    );
  } finally {
    bytes?.fill(0);
  }
}
