import { test, expect } from "@playwright/test";
import { openVault, vaultPhrase, diskSnapshot } from "./vault-helper";
test("coffre : mauvais secret, verrouillage automatique et aucune donnée sensible persistante en clair", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("./");
  await openVault(page);
  await page
    .getByRole("button", { name: "Ajouter un article" })
    .first()
    .click();
  await page
    .getByLabel("Nom de l’article")
    .fill("__VM_PRIVATE_TEST__ montant chiffré");
  await page.getByLabel("Prix d’achat TTC").fill("19,87");
  await page.getByRole("button", { name: "Enregistrer l’article" }).click();
  await page.getByRole("button", { name: "Ouvrir les paramètres" }).click();
  await page.getByLabel("Délai de verrouillage").selectOption("1");
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  await page.clock.fastForward(60001);
  await expect(
    page.getByRole("heading", { name: "Déverrouiller mon espace" }),
  ).toBeVisible();
  await page
    .getByLabel("Phrase secrète du coffre")
    .fill("Phrase synthétique incorrecte");
  await page
    .getByRole("button", { name: "Déverrouiller", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Phrase incorrecte");
  await expect(page.locator(".metric-value")).toHaveCount(0);
  const disk = await diskSnapshot(page);
  for (const name of ["articles", "settings", "activities", "imports"])
    expect(disk[name]).toEqual([]);
  for (const value of [
    "__VM_PRIVATE_TEST__",
    vaultPhrase,
    "purchasePrice",
    "19,87",
  ])
    expect(JSON.stringify(disk)).not.toContain(value);
  const other = await page.evaluate(async () => {
    const cached: string[] = [];
    for (const name of await caches.keys()) {
      for (const request of await (await caches.open(name)).keys()) {
        const response = await (await caches.open(name)).match(request);
        if (response?.headers.get("content-type")?.includes("text"))
          cached.push(await response.text());
      }
    }
    return JSON.stringify({
      local: localStorage,
      session: sessionStorage,
      cached,
    });
  });
  expect(other).not.toContain("__VM_PRIVATE_TEST__");
  expect(other).not.toContain(vaultPhrase);
  await openVault(page);
  await expect(page.locator(".metric-value").last()).toHaveText("1");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Déverrouiller mon espace" }),
  ).toBeVisible();
});
test("migration interrompue : conserve le clair jusqu’au contrôle, reprend et chiffre les anciennes données", async ({
  page,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Créer mon espace chiffré" }),
  ).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const r = indexedDB.open("vinted-manager");
        r.onerror = () => reject();
        r.onsuccess = () => {
          const db = r.result,
            tx = db.transaction("articles", "readwrite");
          tx.objectStore("articles").put({
            id: "ancien-synthetique",
            name: "__VM_PRIVATE_TEST__ migration synthétique",
            genre: "Unisexe",
            category: "Jean",
            purchasePrice: 1678,
            purchaseDate: "2026-01-01",
            salePrice: null,
            saleDate: null,
            status: "stock",
            fees: [],
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject();
        };
      }),
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Protéger mes données" }),
  ).toBeVisible();
  await page.evaluate(() => {
    const original = crypto.subtle.decrypt.bind(crypto.subtle);
    let once = true;
    crypto.subtle.decrypt = (...args: Parameters<SubtleCrypto["decrypt"]>) => {
      if (once) {
        once = false;
        return Promise.reject(new Error("Interruption synthétique"));
      }
      return original(...args);
    };
  });
  await page.getByLabel("Phrase secrète du coffre").fill(vaultPhrase);
  await page.getByLabel("Confirmer la phrase du coffre").fill(vaultPhrase);
  await page.getByRole("checkbox", { name: /Je comprends/ }).check();
  await page
    .getByRole("checkbox", { name: /Exporter une sauvegarde chiffrée avant/ })
    .uncheck();
  await page
    .getByRole("button", { name: "Chiffrer et ouvrir mon espace" })
    .click();
  await expect(page.getByRole("alert")).toContainText("migration");
  const interrupted = await diskSnapshot(page);
  expect(interrupted.articles).toHaveLength(1);
  expect(interrupted.vault).toHaveLength(1);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Terminer la migration" }),
  ).toBeVisible();
  await openVault(page);
  await expect(page.locator(".metric-value").last()).toHaveText("1");
  const after = await diskSnapshot(page);
  expect(after.articles).toEqual([]);
  expect(JSON.stringify(after)).not.toContain("__VM_PRIVATE_TEST__");
});
test("coffre altéré : refuse le déchiffrement sans effacer ni remplacer les données", async ({
  page,
}) => {
  await page.goto("./");
  await openVault(page);
  await page.getByRole("button", { name: "Verrouiller", exact: true }).click();
  const disk = await diskSnapshot(page);
  const record = disk.vault[0] as { ciphertext: string };
  await page.evaluate(
    (r) =>
      new Promise<void>((resolve, reject) => {
        const o = indexedDB.open("vinted-manager");
        o.onsuccess = () => {
          const db = o.result,
            tx = db.transaction("vault", "readwrite");
          tx.objectStore("vault").put({
            ...r,
            ciphertext:
              (r.ciphertext[0] === "A" ? "B" : "A") + r.ciphertext.slice(1),
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject();
        };
      }),
    record,
  );
  const altered = await diskSnapshot(page);
  await page.getByLabel("Phrase secrète du coffre").fill(vaultPhrase);
  await page
    .getByRole("button", { name: "Déverrouiller", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("coffre altéré");
  expect(await diskSnapshot(page)).toEqual(altered);
  await expect(page.locator(".metric-value")).toHaveCount(0);
});
