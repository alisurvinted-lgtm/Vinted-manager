import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ManagerDB, saveArticle } from "../src/lib/db";
import { VaultStorage } from "../src/lib/vault-storage";
import {
  newVault,
  openKey,
  seal,
  unseal,
  validateVault,
  unbase64,
} from "../src/lib/vault-crypto";
import { createBackup, restoreBackup } from "../src/lib/backup";
import { encryptBackup, decryptBackup } from "../src/lib/crypto-backup";
import { SessionLock } from "../src/lib/session-lock";
const phrase = "__VM_SECRET_TEST__ phrase de coffre synthétique";
const secret = "__VM_PRIVATE_TEST__ donnée financière synthétique";
let db: ManagerDB;
const article = {
  name: secret,
  genre: "Unisexe" as const,
  category: "Jean" as const,
  purchasePrice: 1520,
  purchaseDate: "2026-01-01",
  status: "stock" as const,
  salePrice: null,
  saleDate: null,
  fees: [{ id: "fictif", type: "Nettoyage" as const, amount: 110 }],
};
beforeEach(() => {
  db = new ManagerDB("vault-" + crypto.randomUUID());
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  await db.delete();
});
async function disk() {
  const raw = new Dexie(db.name);
  await raw.open();
  const rows: Record<string, unknown[]> = {};
  for (const table of raw.tables) rows[table.name] = await table.toArray();
  raw.close();
  return rows;
}
describe("Coffre AES-256-GCM actif", () => {
  it("exige une phrase et refuse toute lecture ou écriture verrouillée", async () => {
    await expect(db.articles.toArray()).rejects.toThrow(/verrouillée/);
    await expect(saveArticle(article, undefined, db)).rejects.toThrow();
    await expect(db.initialize("court")).rejects.toThrow();
    await db.initialize(phrase);
    expect(db.isUnlocked).toBe(true);
  });
  it("ne conserve que des données chiffrées sur disque, y compris réglages et historique", async () => {
    await db.initialize(phrase);
    const a = await saveArticle(article, undefined, db);
    await db.settings.put({
      id: "preferences",
      rateBps: 1450,
      autoLockMinutes: 1,
    });
    const raw = await disk();
    expect(raw.articles).toEqual([]);
    expect(raw.settings).toEqual([]);
    expect(raw.activities).toEqual([]);
    expect(raw.imports).toEqual([]);
    const text = JSON.stringify(raw);
    for (const value of [
      secret,
      phrase,
      "2026-01-01",
      a.id,
      "Nettoyage",
      "purchasePrice",
      "rateBps",
    ])
      expect(text).not.toContain(value);
    expect((await db.articles.get(a.id))?.purchasePrice).toBe(1520);
    expect(db.autoLockMinutes).toBe(1);
  });
  it("verrouille les clés et références puis restaure les données après réouverture", async () => {
    await db.initialize(phrase);
    const a = await saveArticle(article, undefined, db);
    const name = db.name;
    db.close();
    db = new ManagerDB(name);
    await db.open();
    expect(db.isUnlocked).toBe(false);
    await expect(db.unlock("mauvaise phrase longue")).rejects.toThrow();
    expect(db.isUnlocked).toBe(false);
    await db.unlock(phrase);
    expect(await db.articles.get(a.id)).toEqual(a);
    db.lock();
    expect(db.isUnlocked).toBe(false);
    await expect(db.articles.get(a.id)).rejects.toThrow();
  });
  it("refuse un texte chiffré ou des métadonnées altérées sans modifier le disque", async () => {
    await db.initialize(phrase);
    await saveArticle(article, undefined, db);
    db.lock();
    const storage = new VaultStorage(db.name);
    const record = await storage.vault.get("active");
    if (!record || !("ciphertext" in record)) throw new Error();
    await storage.vault.put({
      ...record,
      ciphertext: record.ciphertext.slice(0, -4) + "AAAA",
    });
    const before = JSON.stringify(await storage.vault.toArray());
    await expect(db.unlock(phrase)).rejects.toThrow();
    expect(JSON.stringify(await storage.vault.toArray())).toBe(before);
    storage.close();
  });
  it("refuse les paramètres de dérivation affaiblis ou excessifs avant calcul", async () => {
    const { record } = await newVault(phrase, "{}", "complete");
    for (const iterations of [1, 599999, 1000000000])
      expect(() =>
        validateVault({ ...record, kdf: { ...record.kdf, iterations } }),
      ).toThrow();
  });
  it("produit des IV distincts et une clé non exportable sans clé codée en dur", async () => {
    const first = await newVault(phrase, secret, "complete");
    expect(first.key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("raw", first.key)).rejects.toThrow();
    const seen = new Set<string>();
    let record = first.record;
    for (let i = 0; i < 80; i++) {
      record = await seal(record, first.key, secret, i + 2, seen);
      expect(await unseal(record, first.key)).toBe(secret);
    }
    expect(seen.size).toBe(80);
    const key = await openKey(first.record, phrase);
    expect(await unseal(first.record, key)).toBe(secret);
  });
  it("refuse une collision d’IV persistante avant de chiffrer", async () => {
    const { record, key } = await newVault(phrase, secret, "complete");
    const iv = unbase64(record.iv);
    const encrypt = vi.spyOn(crypto.subtle, "encrypt");
    vi.spyOn(crypto, "getRandomValues").mockImplementation((v) => {
      (v as Uint8Array).set(iv);
      return v;
    });
    await expect(seal(record, key, secret, 2, new Set())).rejects.toThrow(
      /IV neuf/,
    );
    expect(encrypt).not.toHaveBeenCalled();
  });
  it("authentifie la clé, les versions et le statut de migration", async () => {
    const { record, key } = await newVault(phrase, secret, "complete");
    await expect(
      unseal({ ...record, migration: "pending" }, key),
    ).rejects.toThrow();
    await expect(unseal({ ...record, revision: 2 }, key)).rejects.toThrow();
    await expect(
      openKey({ ...record, keyId: crypto.randomUUID() }, phrase),
    ).rejects.toThrow();
  });
  it("annule tout un lot en cas d’erreur et refuse les réponses tardives après verrouillage", async () => {
    await db.initialize(phrase);
    await expect(
      db.transaction("rw", async (tx) => {
        await tx.articles.add({
          ...article,
          id: "faux",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        throw new Error("fictif");
      }),
    ).rejects.toThrow();
    expect(await db.articles.count()).toBe(0);
    let release!: () => void;
    const wait = new Promise<void>((r) => (release = r));
    const p = db.transaction("rw", async (tx) => {
      await wait;
      await tx.settings.put({ id: "preferences", rateBps: 999 });
    });
    await Promise.resolve();
    db.lock();
    release();
    await expect(p).rejects.toThrow();
    await db.unlock(phrase);
    expect((await db.settings.get("preferences"))?.rateBps).toBe(1230);
  });
  it("détecte une autre fenêtre ayant modifié le coffre sans écraser ses données", async () => {
    await db.initialize(phrase);
    const other = new ManagerDB(db.name);
    await other.unlock(phrase);
    await saveArticle(article, undefined, db);
    await expect(
      saveArticle({ ...article, name: "Autre synthétique" }, undefined, other),
    ).rejects.toThrow(/autre fenêtre/);
    other.close();
    expect(await db.articles.count()).toBe(1);
  });
});
describe("Migration récupérable et anciennes sauvegardes", () => {
  async function legacy(version = 3) {
    const old = new Dexie(db.name);
    old.version(version).stores({
      articles: "id, status, saleDate, updatedAt",
      settings: "id",
      ...(version >= 2 ? { activities: "id, date" } : {}),
      ...(version >= 3
        ? { imports: "id, &eventKey, articleId, kind, date" }
        : {}),
    });
    const record = {
      ...article,
      id: "ancien",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    await old.table("articles").put(record);
    await old.table("settings").put({ id: "preferences", rateBps: 1550 });
    old.close();
    return record;
  }
  it.each([1, 2, 3])(
    "préserve une base v%s puis ne retire le clair qu’après contrôle du coffre",
    async (version) => {
      const record = await legacy(version);
      await db.inspect();
      expect(db.status).toBe("legacy");
      let backupName = "";
      await db.initialize(phrase, async (backup) => {
        backupName = backup.articles[0].name;
        const raw = await disk();
        expect(raw.articles).toHaveLength(1);
      });
      expect(backupName).toBe(secret);
      expect(await db.articles.get(record.id)).toEqual(record);
      expect((await db.settings.get("preferences"))?.rateBps).toBe(1550);
      expect((await disk()).articles).toEqual([]);
    },
  );
  it("reprend après interruption entre écriture chiffrée et vérification, sans perte du clair", async () => {
    const record = await legacy();
    await db.inspect();
    const decrypt = vi
      .spyOn(crypto.subtle, "decrypt")
      .mockRejectedValueOnce(new Error("interruption synthétique"));
    await expect(db.initialize(phrase)).rejects.toThrow();
    decrypt.mockRestore();
    expect((await disk()).articles).toHaveLength(1);
    expect(db.isUnlocked).toBe(false);
    await db.unlock(phrase);
    expect(await db.articles.get(record.id)).toEqual(record);
    expect((await disk()).articles).toHaveLength(0);
  });
  it("reprend une migration interrompue et garde une copie chiffrée si un ancien onglet a modifié le stock", async () => {
    await legacy();
    await db.inspect();
    const decrypt = vi
      .spyOn(crypto.subtle, "decrypt")
      .mockRejectedValueOnce(new Error("interruption"));
    await expect(db.initialize(phrase)).rejects.toThrow();
    decrypt.mockRestore();
    const raw = new Dexie(db.name);
    await raw.open();
    await raw.table("articles").update("ancien", { purchasePrice: 1780 });
    raw.close();
    await db.unlock(phrase);
    expect((await db.articles.get("ancien"))?.purchasePrice).toBe(1780);
    expect((await db.migrationRecovery())?.articles[0].purchasePrice).toBe(
      1520,
    );
    expect((await disk()).articles).toHaveLength(0);
    expect(JSON.stringify(await disk())).not.toContain(secret);
  });
  it("restaure une sauvegarde historique sans laisser de clair sur disque", async () => {
    await db.initialize(phrase);
    await saveArticle(article, undefined, db);
    const backup = await createBackup(db);
    const legacyBackup = { ...backup, version: 1 as const };
    delete legacyBackup.imports;
    const encrypted = await encryptBackup(legacyBackup, phrase);
    await restoreBackup(await decryptBackup(encrypted, phrase), db);
    expect(JSON.stringify(await disk())).not.toContain(secret);
  });
});
describe("Verrouillage adapté au navigateur mobile", () => {
  it("verrouille après cinq minutes d’inactivité, malgré une activité tardive", () => {
    vi.useFakeTimers();
    const lock = vi.fn();
    const clock = new SessionLock(lock, 300000);
    vi.advanceTimersByTime(300001);
    expect(lock).toHaveBeenCalledTimes(1);
    clock.activity();
    vi.advanceTimersByTime(300001);
    expect(lock).toHaveBeenCalledTimes(1);
    clock.stop();
  });
  it("préserve un bref retour OAuth et verrouille un arrière-plan prolongé", () => {
    vi.useFakeTimers();
    const lock = vi.fn();
    const clock = new SessionLock(lock, 300000);
    clock.authorization(true);
    clock.visibility(true);
    vi.advanceTimersByTime(35000);
    expect(lock).not.toHaveBeenCalled();
    clock.visibility(false);
    clock.authorization(false);
    clock.visibility(true);
    vi.advanceTimersByTime(30001);
    expect(lock).toHaveBeenCalledTimes(1);
    clock.stop();
  });
});
