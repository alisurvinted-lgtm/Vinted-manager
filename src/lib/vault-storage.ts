import Dexie, { type Table } from "dexie";
import { type VaultRecord } from "./vault-crypto";
import { type Article, type Activity, type Settings } from "./model";
import type { ImportRecord } from "../../protocols/gmail-transfer";
export interface RecoveryRecord {
  id: "migration-recovery";
  record: VaultRecord;
}
export class VaultStorage extends Dexie {
  vault!: Table<VaultRecord | RecoveryRecord, string>;
  articles!: Table<Article, string>;
  settings!: Table<Settings, string>;
  activities!: Table<Activity, string>;
  imports!: Table<ImportRecord, string>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({
      articles: "id, status, saleDate, updatedAt",
      settings: "id",
    });
    this.version(2).stores({
      articles: "id, status, saleDate, updatedAt",
      settings: "id",
      activities: "id, date",
    });
    this.version(3).stores({
      articles: "id, status, saleDate, updatedAt",
      settings: "id",
      activities: "id, date",
      imports: "id, &eventKey, articleId, kind, date",
    });
    // Les tables historiques restent intactes jusqu’à validation du coffre chiffré.
    this.version(4).stores({
      articles: "id, status, saleDate, updatedAt",
      settings: "id",
      activities: "id, date",
      imports: "id, &eventKey, articleId, kind, date",
      vault: "id",
    });
  }
}
