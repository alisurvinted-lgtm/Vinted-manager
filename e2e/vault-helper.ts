import { expect, type Page } from "@playwright/test";
export const vaultPhrase = "__VM_SECRET_TEST__ coffre synthétique cinq mots";
export async function openVault(page: Page, migration = false) {
  const phrase = page.getByLabel("Phrase secrète du coffre", { exact: true });
  await expect(phrase).toBeVisible();
  await phrase.fill(vaultPhrase);
  if (await page.getByLabel("Confirmer la phrase du coffre").isVisible()) {
    await page.getByLabel("Confirmer la phrase du coffre").fill(vaultPhrase);
    await page.getByRole("checkbox", { name: /Je comprends/ }).check();
    if (migration)
      await page
        .getByRole("checkbox", {
          name: /Exporter une sauvegarde chiffrée avant/,
        })
        .uncheck();
    await page
      .getByRole("button", {
        name: "Chiffrer et ouvrir mon espace",
        exact: true,
      })
      .click();
  } else
    await page
      .getByRole("button", { name: "Déverrouiller", exact: true })
      .click();
  await expect(
    page.getByRole("button", { name: "Ouvrir les paramètres" }),
  ).toBeVisible();
}
export async function diskSnapshot(page: Page) {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown[]>>((resolve, reject) => {
        const open = indexedDB.open("vinted-manager");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result,
            names = [...db.objectStoreNames],
            result: Record<string, unknown[]> = {};
          const tx = db.transaction(names);
          for (const name of names) {
            const read = tx.objectStore(name).getAll();
            read.onsuccess = () => {
              result[name] = read.result;
            };
          }
          tx.oncomplete = () => {
            db.close();
            resolve(result);
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
  );
}
