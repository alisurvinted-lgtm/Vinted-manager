import { VaultStorage, type RecoveryRecord } from "./vault-storage";
import {
  newVault,
  openKey,
  seal,
  unseal,
  validateVault,
  type VaultRecord,
} from "./vault-crypto";
import { parseBackup, type Backup } from "./backup-format";
import {
  defaultSettings,
  type Article,
  type Activity,
  type Settings,
} from "./model";
import type { ImportRecord } from "../../protocols/gmail-transfer";
export interface Ledger {
  articles: Article[];
  activities: Activity[];
  imports: ImportRecord[];
  settings: Settings[];
}
const clone = <T>(v: T): T => structuredClone(v);
const normalize = (v: Backup): Ledger => ({
  articles: v.articles,
  activities: v.activities,
  imports: v.imports ?? [],
  settings: [v.settings],
});
const asBackup = (data: Ledger): Backup => ({
  format: "vinted-manager",
  version: 3,
  exportedAt: new Date().toISOString(),
  articles: data.articles,
  activities: data.activities,
  imports: data.imports,
  settings: data.settings[0] ?? { ...defaultSettings },
});
const canonical = (data: Ledger) =>
  JSON.stringify(normalize(parseBackup(JSON.stringify(asBackup(data)))));
const empty = (): Ledger => ({
  articles: [],
  activities: [],
  imports: [],
  settings: [{ ...defaultSettings }],
});
class Query<T extends { id: string }> {
  constructor(private readonly source: () => T[]) {}
  async first() {
    return clone(this.source()[0]);
  }
  async toArray() {
    return clone(this.source());
  }
  reverse() {
    return new Query(() => [...this.source()].reverse());
  }
  limit(n: number) {
    return new Query(() => this.source().slice(0, n));
  }
}
export class MemoryTable<T extends { id: string }> {
  constructor(
    private readonly rows: () => T[],
    private readonly mutate: <R>(fn: (rows: T[]) => R) => Promise<R>,
  ) {}
  async get(id: string) {
    return clone(this.rows().find((r) => r.id === id));
  }
  async toArray() {
    return clone(this.rows());
  }
  async count() {
    return this.rows().length;
  }
  where(key: keyof T) {
    return {
      equals: (value: unknown) =>
        new Query(() => this.rows().filter((r) => r[key] === value)),
    };
  }
  orderBy(key: keyof T) {
    return new Query(() =>
      [...this.rows()].sort((a, b) =>
        String(a[key] ?? "").localeCompare(String(b[key] ?? "")),
      ),
    );
  }
  async put(value: T) {
    return this.mutate((rows) => {
      const i = rows.findIndex((r) => r.id === value.id);
      if (i < 0) rows.push(clone(value));
      else rows[i] = clone(value);
      return value.id;
    });
  }
  async add(value: T) {
    return this.mutate((rows) => {
      if (rows.some((r) => r.id === value.id))
        throw new Error("Identifiant dupliqué.");
      rows.push(clone(value));
      return value.id;
    });
  }
  async bulkAdd(values: T[]) {
    return this.mutate((rows) => {
      for (const value of values) {
        if (rows.some((r) => r.id === value.id))
          throw new Error("Identifiant dupliqué.");
        rows.push(clone(value));
      }
    });
  }
  async delete(id: string) {
    return this.mutate((rows) => {
      const i = rows.findIndex((r) => r.id === id);
      if (i >= 0) rows.splice(i, 1);
    });
  }
  async clear() {
    return this.mutate((rows) => {
      rows.splice(0);
    });
  }
}
export interface LedgerTables {
  articles: MemoryTable<Article>;
  activities: MemoryTable<Activity>;
  imports: MemoryTable<ImportRecord>;
  settings: MemoryTable<Settings>;
}
export type VaultStatus =
  "checking" | "create" | "legacy" | "locked" | "unlocked" | "error";
export class ManagerDB implements LedgerTables {
  readonly name: string;
  readonly verno = 4;
  #storage: VaultStorage;
  #data: Ledger | undefined;
  #key: CryptoKey | undefined;
  #record: VaultRecord | undefined;
  #generation = 0;
  #serial: Promise<unknown> = Promise.resolve();
  #listeners = new Set<() => void>();
  #version = 0;
  #status: VaultStatus = "checking";
  #ivs = new Set<string>();
  articles: MemoryTable<Article>;
  activities: MemoryTable<Activity>;
  imports: MemoryTable<ImportRecord>;
  settings: MemoryTable<Settings>;
  constructor(name = "vinted-manager") {
    this.name = name;
    this.#storage = new VaultStorage(name);
    // Chaque écriture publique est une transaction complète ; les callbacks internes utilisent tx.
    const build = <K extends keyof Ledger>(name: K) =>
      new MemoryTable<Ledger[K][number]>(
        () => this.requireData()[name] as Ledger[K][number][],
        async (fn) => this.write((d) => fn(d[name] as Ledger[K][number][])),
      );
    this.articles = build("articles");
    this.activities = build("activities");
    this.imports = build("imports");
    this.settings = build("settings");
    this.#storage.on("versionchange", () => this.lock());
  }
  private requireData() {
    if (!this.#data || !this.#key || this.#status !== "unlocked")
      throw new Error("L’application est verrouillée.");
    return this.#data;
  }
  private publish(status = this.#status) {
    this.#status = status;
    this.#version++;
    for (const f of this.#listeners) f();
  }
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };
  getSnapshot = () => this.#version;
  get status() {
    return this.#status;
  }
  get migrationPending() {
    return this.#record?.migration === "pending";
  }
  get autoLockMinutes() {
    return this.#data?.settings[0]?.autoLockMinutes ?? 5;
  }
  get isUnlocked() {
    return this.#status === "unlocked" && !!this.#key;
  }
  read(): Ledger {
    return clone(this.requireData());
  }
  private tables(
    read: () => Ledger,
    mutate: <K extends keyof Ledger, R>(
      name: K,
      fn: (rows: Ledger[K]) => R,
    ) => Promise<R>,
  ): LedgerTables {
    const build = <K extends keyof Ledger>(name: K) =>
      new MemoryTable<Ledger[K][number]>(
        () => read()[name] as Ledger[K][number][],
        async (fn) => mutate(name, (rows) => fn(rows as Ledger[K][number][])),
      );
    return {
      articles: build("articles"),
      activities: build("activities"),
      imports: build("imports"),
      settings: build("settings"),
    };
  }
  async inspect() {
    if (this.isUnlocked) return this.#status;
    const generation = this.#generation;
    try {
      await this.#storage.open();
      const value = await this.#storage.vault.get("active");
      if (generation !== this.#generation) return this.#status;
      if (value) {
        validateVault(value);
        this.#record = value;
        this.publish("locked");
      } else this.publish((await this.hasLegacy()) ? "legacy" : "create");
    } catch {
      this.publish("error");
      throw new Error(
        "Le stockage du coffre ne peut pas être ouvert. Ne supprimez pas les données du site.",
      );
    }
    return this.#status;
  }
  async open() {
    await this.inspect();
    return this;
  }
  private async hasLegacy() {
    return (
      await Promise.all([
        this.#storage.articles.count(),
        this.#storage.settings.count(),
        this.#storage.activities.count(),
        this.#storage.imports.count(),
      ])
    ).some((n) => n > 0);
  }
  async legacyBackup(): Promise<Backup> {
    if (
      ((await this.#storage.vault.get("active")) as VaultRecord | undefined)
        ?.migration === "complete"
    )
      throw new Error("La migration est déjà terminée.");
    return asBackup(await this.legacyData());
  }
  private async legacyData(): Promise<Ledger> {
    return this.#storage.transaction(
      "r",
      this.#storage.articles,
      this.#storage.settings,
      this.#storage.activities,
      this.#storage.imports,
      async () =>
        normalize(
          parseBackup(
            JSON.stringify({
              format: "vinted-manager",
              version: 3,
              exportedAt: new Date().toISOString(),
              articles: await this.#storage.articles.toArray(),
              activities: await this.#storage.activities.toArray(),
              imports: await this.#storage.imports.toArray(),
              settings: (await this.#storage.settings.get("preferences")) ?? {
                ...defaultSettings,
              },
            }),
          ),
        ),
    );
  }
  private assertGeneration(g: number) {
    if (g !== this.#generation)
      throw new Error(
        "La session a été verrouillée. Déverrouillez pour reprendre.",
      );
  }
  async initialize(
    phrase: string,
    beforeMigration?: (backup: Backup) => Promise<void>,
  ) {
    await this.#storage.open();
    const generation = ++this.#generation;
    if (await this.#storage.vault.get("active"))
      throw new Error(
        "Un coffre existe déjà. Déverrouillez-le avec sa phrase secrète.",
      );
    const hasLegacy = await this.hasLegacy();
    if (hasLegacy && beforeMigration)
      await beforeMigration(await this.legacyBackup());
    const data = hasLegacy ? await this.legacyData() : empty();
    const { record, key } = await newVault(
      phrase,
      JSON.stringify(asBackup(data)),
      hasLegacy ? "pending" : "complete",
    );
    this.assertGeneration(generation);
    await this.#storage.transaction("rw", this.#storage.vault, async () => {
      if (await this.#storage.vault.get("active"))
        throw new Error("Un coffre a été créé dans une autre fenêtre.");
      await this.#storage.vault.add(record);
    });
    this.#record = record;
    try {
      const verified = normalize(parseBackup(await unseal(record, key)));
      if (canonical(verified) !== canonical(data))
        throw new Error("La copie chiffrée n’est pas identique.");
      this.assertGeneration(generation);
      const result =
        record.migration === "pending"
          ? await this.finishMigration(record, key, generation)
          : { record, data: verified };
      this.assertGeneration(generation);
      this.#record = result.record;
      this.#key = key;
      this.#data = result.data;
      this.#ivs = new Set([result.record.iv]);
      this.publish("unlocked");
    } catch (error) {
      this.#data = undefined;
      this.#key = undefined;
      this.publish("locked");
      throw error;
    }
  }
  private async finishMigration(
    record: VaultRecord,
    key: CryptoKey,
    generation: number,
  ) {
    const oldVerified = normalize(parseBackup(await unseal(record, key)));
    const current = await this.legacyData();
    const currentWitness = canonical(current);
    // Toute modification intervenue dans un ancien onglet est conservée ; la première
    // copie chiffrée reste récupérable sans conserver de données en clair.
    const changed = canonical(oldVerified) !== currentWitness;
    const final = await seal(
      { ...record, migration: "complete" },
      key,
      JSON.stringify(asBackup(current)),
      record.revision + 1,
      this.#ivs,
    );
    const check = normalize(parseBackup(await unseal(final, key)));
    if (canonical(check) !== currentWitness)
      throw new Error("La vérification de migration a échoué.");
    this.assertGeneration(generation);
    await this.#storage.transaction(
      "rw",
      this.#storage.vault,
      this.#storage.articles,
      this.#storage.settings,
      this.#storage.activities,
      this.#storage.imports,
      async () => {
        const active = await this.#storage.vault.get("active");
        if (
          !active ||
          !("keyId" in active) ||
          active.keyId !== record.keyId ||
          active.revision !== record.revision
        )
          throw new Error("Le coffre a changé dans une autre fenêtre.");
        if (canonical(await this.legacyData()) !== currentWitness)
          throw new Error(
            "Les données anciennes ont changé pendant la migration. Réessayez après fermeture de l’ancien onglet.",
          );
        if (changed)
          await this.#storage.vault.put({
            id: "migration-recovery",
            record,
          } satisfies RecoveryRecord);
        await this.#storage.vault.put(final);
        await this.#storage.articles.clear();
        await this.#storage.settings.clear();
        await this.#storage.activities.clear();
        await this.#storage.imports.clear();
      },
    );
    return { record: final, data: check };
  }
  async unlock(phrase: string) {
    await this.#storage.open();
    const generation = ++this.#generation;
    const value = await this.#storage.vault.get("active");
    validateVault(value);
    const key = await openKey(value, phrase);
    const data = normalize(parseBackup(await unseal(value, key)));
    this.assertGeneration(generation);
    const result =
      value.migration === "pending"
        ? await this.finishMigration(value, key, generation)
        : { record: value, data };
    this.assertGeneration(generation);
    this.#record = result.record;
    this.#key = key;
    this.#data = result.data;
    this.#ivs = new Set([result.record.iv]);
    this.publish("unlocked");
  }
  lock = () => {
    this.#generation++;
    this.#key = undefined;
    this.#data = undefined;
    this.#ivs.clear();
    if (typeof window !== "undefined")
      window.dispatchEvent(new Event("vm:lock"));
    this.publish(
      this.#record
        ? "locked"
        : this.#status === "unlocked"
          ? "locked"
          : this.#status,
    );
  };
  async migrationRecovery(): Promise<Backup | null> {
    this.requireData();
    const generation = this.#generation;
    const v = await this.#storage.vault.get("migration-recovery");
    if (!v || !("record" in v)) return null;
    if (v.record.keyId !== this.#record?.keyId)
      throw new Error("Cette copie nécessite sa phrase secrète d’origine.");
    const backup = parseBackup(await unseal(v.record, this.#key!));
    this.assertGeneration(generation);
    return backup;
  }
  async hasMigrationRecovery() {
    return !!(await this.#storage.vault.get("migration-recovery"));
  }
  close() {
    this.lock();
    this.#storage.close();
  }
  async delete() {
    this.lock();
    await this.#storage.delete();
    this.#record = undefined;
    this.publish("create");
  }
  private enqueue<R>(fn: () => Promise<R>) {
    const task = this.#serial.then(fn, fn);
    this.#serial = task.catch(() => {});
    return task;
  }
  private async write<R>(fn: (data: Ledger) => R | Promise<R>): Promise<R> {
    return this.transaction("rw", async (_tx, draft) => fn(draft));
  }
  transaction<R>(
    mode: "r" | "rw",
    ...args: [
      ...tables: unknown[],
      callback: (tx: LedgerTables, draft: Ledger) => R | Promise<R>,
    ]
  ): Promise<R> {
    const callback = args.at(-1) as (
      tx: LedgerTables,
      draft: Ledger,
    ) => Promise<R>;
    const generation = this.#generation;
    return this.enqueue(async () => {
      this.assertGeneration(generation);
      const current = this.requireData();
      const draft = clone(current);
      const key = this.#key!;
      const record = this.#record!;
      const tx = this.tables(
        () => {
          this.assertGeneration(generation);
          return draft;
        },
        async (name, fn) => {
          this.assertGeneration(generation);
          return fn(draft[name]);
        },
      );
      const result = await callback(tx, draft);
      this.assertGeneration(generation);
      if (mode === "rw") {
        const valid = normalize(parseBackup(JSON.stringify(asBackup(draft))));
        if (canonical(valid) === canonical(current)) return result;
        const next = await seal(
          record,
          key,
          JSON.stringify(asBackup(valid)),
          record.revision + 1,
          this.#ivs,
        );
        this.assertGeneration(generation);
        await this.#storage.transaction("rw", this.#storage.vault, async () => {
          const stored = await this.#storage.vault.get("active");
          if (
            !stored ||
            !("keyId" in stored) ||
            stored.keyId !== record.keyId ||
            stored.revision !== record.revision
          )
            throw new Error(
              "Le coffre a changé dans une autre fenêtre. Verrouillez puis déverrouillez pour recharger sa dernière version.",
            );
          this.assertGeneration(generation);
          await this.#storage.vault.put(next);
        });
        this.assertGeneration(generation);
        this.#record = next;
        this.#data = valid;
        this.publish();
      }
      return result;
    });
  }
}
