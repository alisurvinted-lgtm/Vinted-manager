import type { ManagerDB } from "../src/lib/db";
export const TEST_VAULT_PHRASE =
  "__VM_SECRET_TEST__ coffre fictif pour les tests";
export async function initializeTestVault(db: ManagerDB) {
  await db.initialize(TEST_VAULT_PHRASE);
}
