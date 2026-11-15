import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDecipheriv, pbkdf2Sync } from "node:crypto";
import { ManagerDB, saveArticle, saveRate } from "../src/lib/db";
import { createBackup, restoreBackup } from "../src/lib/backup";
import {
  backupFileType,
  decryptBackup,
  encryptBackup,
  parseEncryptedBackup,
  PBKDF2_ITERATIONS,
} from "../src/lib/crypto-backup";
const phrase = "__VM_SECRET_TEST__ cinq mots fictifs pour les tests";
let db: ManagerDB;
beforeEach(() => {
  db = new ManagerDB(`crypto-test-${crypto.randomUUID()}`);
});
afterEach(async () => {
  await db.delete();
});
async function fixture() {
  await saveRate(1450, db);
  await saveArticle(
    {
      name: "__VM_PRIVATE_TEST__ article synthétique",
      genre: "Unisexe",
      category: "Polaire",
      purchaseDate: "2026-01-01",
      purchasePrice: 1500,
      status: "sold",
      salePrice: 3500,
      saleDate: "2026-02-01",
      fees: [{ id: "fictif", type: "Nettoyage", amount: 100 }],
    },
    undefined,
    db,
  );
  return createBackup(db);
}
describe("Sauvegardes authentifiées Web Crypto", () => {
  it("chiffre, déchiffre et restaure toutes les données en conservant le format interne", async () => {
    const backup = await fixture();
    const json = await encryptBackup(backup, phrase);
    expect(json).not.toContain("__VM_PRIVATE_TEST__");
    expect(json).not.toContain(phrase);
    expect(backupFileType(json)).toBe("encrypted");
    const restored = await decryptBackup(json, phrase);
    expect(restored).toEqual(backup);
    await saveRate(0, db);
    await restoreBackup(restored, db);
    expect(await db.articles.toArray()).toEqual(backup.articles);
    expect(await db.activities.toArray()).toEqual(backup.activities);
    expect(await db.settings.get("preferences")).toEqual(backup.settings);
  });
  it("utilise un sel et un IV différents pour chaque export", async () => {
    const backup = await fixture();
    const a = parseEncryptedBackup(await encryptBackup(backup, phrase));
    const b = parseEncryptedBackup(await encryptBackup(backup, phrase));
    expect(a.iv).not.toBe(b.iv);
    expect(a.kdf.salt).not.toBe(b.kdf.salt);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });
  it("est compatible avec une implémentation indépendante AES-256-GCM/PBKDF2 de Node", async () => {
    const backup = await fixture();
    const e = parseEncryptedBackup(await encryptBackup(backup, phrase));
    const header = {
      format: e.format,
      version: e.version,
      cipher: e.cipher,
      kdf: {
        algorithm: "PBKDF2",
        hash: "SHA-256",
        iterations: PBKDF2_ITERATIONS,
        salt: e.kdf.salt,
      },
      iv: e.iv,
    };
    const key = pbkdf2Sync(
      phrase,
      Buffer.from(e.kdf.salt, "base64"),
      600000,
      32,
      "sha256",
    );
    const encrypted = Buffer.from(e.ciphertext, "base64");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(e.iv, "base64"),
    );
    decipher.setAAD(Buffer.from(JSON.stringify(header)));
    decipher.setAuthTag(encrypted.subarray(-16));
    expect(
      JSON.parse(
        Buffer.concat([
          decipher.update(encrypted.subarray(0, -16)),
          decipher.final(),
        ]).toString(),
      ),
    ).toEqual(backup);
  });
  it("refuse la mauvaise phrase sans toucher à IndexedDB", async () => {
    const backup = await fixture();
    const json = await encryptBackup(backup, phrase);
    await expect(
      decryptBackup(json, "mauvaise phrase fictive"),
    ).rejects.toThrow("incorrecte ou sauvegarde altérée");
    expect(await db.articles.toArray()).toEqual(backup.articles);
  });
  it.each(["ciphertext", "iv", "salt"])(
    "refuse une modification de %s",
    async (field) => {
      const backup = await fixture();
      const e = parseEncryptedBackup(await encryptBackup(backup, phrase));
      const original =
        field === "salt" ? e.kdf.salt : e[field as "iv" | "ciphertext"];
      const bytes = Buffer.from(original, "base64");
      bytes[0] ^= 1;
      if (field === "salt") e.kdf.salt = bytes.toString("base64");
      else e[field as "iv" | "ciphertext"] = bytes.toString("base64");
      await expect(decryptBackup(JSON.stringify(e), phrase)).rejects.toThrow();
      expect(await db.articles.toArray()).toEqual(backup.articles);
    },
  );
  it("refuse les paramètres affaiblis, excessifs, versions et champs inconnus avant dérivation", async () => {
    const e = parseEncryptedBackup(
      await encryptBackup(await fixture(), phrase),
    );
    for (const iterations of [1, 599999, 600001, 1e12])
      expect(() =>
        parseEncryptedBackup(
          JSON.stringify({ ...e, kdf: { ...e.kdf, iterations } }),
        ),
      ).toThrow();
    expect(() =>
      parseEncryptedBackup(JSON.stringify({ ...e, version: 99 })),
    ).toThrow();
    expect(() =>
      parseEncryptedBackup(JSON.stringify({ ...e, extra: "non authentifié" })),
    ).toThrow();
  });
  it("refuse le base64 invalide, un tag tronqué et les fichiers trop grands", async () => {
    const e = parseEncryptedBackup(
      await encryptBackup(await fixture(), phrase),
    );
    expect(() =>
      parseEncryptedBackup(JSON.stringify({ ...e, iv: "not base64!" })),
    ).toThrow();
    expect(() =>
      parseEncryptedBackup(JSON.stringify({ ...e, ciphertext: "AAAA" })),
    ).toThrow();
    expect(() =>
      parseEncryptedBackup(" ".repeat(30 * 1024 * 1024 + 1)),
    ).toThrow("30 Mo");
  });
  it("refuse une phrase vide ou trop courte pour un nouvel export", async () => {
    const backup = await fixture();
    await expect(encryptBackup(backup, "")).rejects.toThrow();
    await expect(encryptBackup(backup, "trop court")).rejects.toThrow(
      "16 caractères",
    );
  });
  it("identifie explicitement le JSON ancien et rejette les formats inconnus", async () => {
    expect(backupFileType(JSON.stringify(await fixture()))).toBe("plain");
    expect(() => backupFileType("{}")).toThrow();
    expect(() => backupFileType("{")).toThrow();
  });
});
