import { openVault } from "./vault-helper";
import { test, expect, type Page } from "@playwright/test";
async function tab(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: /Navigation/ })
    .filter({ visible: true })
    .getByRole("button", { name, exact: true })
    .click();
}
async function snapshot(page: Page) {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown[]>>((resolve, reject) => {
        const open = indexedDB.open("vinted-manager");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const names = Array.from(database.objectStoreNames);
          const data: Record<string, unknown[]> = {};
          const transaction = database.transaction(names);
          for (const name of names) {
            const read = transaction.objectStore(name).getAll();
            read.onsuccess = () => {
              data[name] = read.result;
            };
          }
          transaction.oncomplete = () => {
            database.close();
            resolve(data);
          };
          transaction.onerror = () => {
            database.close();
            reject(transaction.error);
          };
        };
      }),
  );
}
async function legacyData(page: Page) {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Créer mon espace chiffré" }),
  ).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("vinted-manager");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const transaction = database.transaction(
            ["articles", "settings"],
            "readwrite",
          );
          const common = {
            name: "Article synthétique existant",
            genre: "Unisexe",
            category: "Polaire",
            createdAt: "2025-12-20T12:00:00Z",
            updatedAt: "2026-01-04T12:00:00Z",
          };
          transaction.objectStore("articles").put({
            ...common,
            id: "legacy-sold",
            purchaseDate: "2025-12-20",
            purchasePrice: 1500,
            status: "sold",
            saleDate: "2026-01-04",
            salePrice: 3500,
            fees: [
              { id: "boost", type: "Boost Vinted", amount: 200 },
              { id: "clean", type: "Nettoyage", amount: 100 },
            ],
          });
          transaction.objectStore("articles").put({
            ...common,
            id: "legacy-stock",
            name: "Stock synthétique existant",
            purchaseDate: "2026-01-10",
            purchasePrice: 1000,
            status: "stock",
            saleDate: null,
            salePrice: null,
            fees: [{ id: "stock-boost", type: "Boost Vinted", amount: 50 }],
          });
          transaction
            .objectStore("settings")
            .put({ id: "preferences", rateBps: 1230 });
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => {
            database.close();
            reject(transaction.error);
          };
        };
      }),
  );
  await page.reload();
  await openVault(page, true);
  await expect(page.locator(".metric-value").last()).toHaveText("1");
}
test("V2 : bilan mensuel, coût des ventes distinct des achats, historique, année et conservation des données", async ({
  page,
  context,
}) => {
  await legacyData(page);
  const before = await snapshot(page);
  await page.getByLabel("Mois sélectionné").fill("2026-01");
  const report = page.getByRole("region", { name: "Bilan de janvier 2026" });
  await expect(report).toBeVisible();
  await expect(
    report
      .locator(".monthly-facts>div")
      .filter({ hasText: "Coût des articles vendus" })
      .locator("dd"),
  ).toHaveText(/15,00/);
  await expect(report.locator('[data-testid="monthly-purchases"]')).toHaveText(
    /10,00/,
  );
  await expect(
    report
      .locator(".monthly-facts>div")
      .filter({ hasText: "Frais de boost" })
      .locator("dd"),
  ).toHaveText(/2,00/);
  await expect(
    report
      .locator(".monthly-facts>div")
      .filter({
        has: page.locator("dt", { hasText: /^Nettoyage des ventes$/ }),
      })
      .locator("dd"),
  ).toHaveText(/1,00/);
  await expect(report.locator(".monthly-result>strong")).toHaveText(/12,69/);
  await expect(
    report.getByText("Comparaison avec décembre 2025"),
  ).toBeVisible();
  await expect(
    report.getByLabel("Chiffre d’affaires, mois précédent", { exact: true }),
  ).toHaveText(/0,00/);
  await page
    .getByRole("button", { name: "Mois précédent", exact: true })
    .click();
  await expect(page.getByLabel("Mois sélectionné")).toHaveValue("2025-12");
  await expect(page.locator('[data-testid="monthly-purchases"]')).toHaveText(
    /15,00/,
  );
  await expect(page.locator(".metric-value").first()).toHaveText(/0,00/);
  await page.getByRole("button", { name: "Mois suivant", exact: true }).click();
  await expect(page.getByLabel("Mois sélectionné")).toHaveValue("2026-01");
  await tab(page, "Statistiques");
  await page.getByLabel("Année des statistiques").selectOption("2025");
  await expect(page.locator("tbody tr")).toHaveCount(12);
  await page
    .getByRole("button", {
      name: "Afficher le bilan de décembre 2025",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Mois sélectionné")).toHaveValue("2025-12");
  await page.getByRole("button", { name: /Jan 2025 : CA/ }).click();
  await expect(page.getByLabel("Mois sélectionné")).toHaveValue("2025-01");
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await openVault(page, true);
  await page.getByLabel("Mois sélectionné").fill("2026-01");
  await expect(page.locator(".monthly-result>strong")).toHaveText(/12,69/);
  expect(await snapshot(page)).toEqual(before);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await context.setOffline(false);
});
test("V2 : import préparé sans lecture, exécution, doublon, écrasement ou envoi de fichier", async ({
  page,
  context,
}) => {
  await legacyData(page);
  const before = await snapshot(page);
  const requests: { url: string; body: string; method: string }[] = [];
  context.on("request", (request) =>
    requests.push({
      url: request.url(),
      body: request.postData() ?? "",
      method: request.method(),
    }),
  );
  await tab(page, "Mes articles");
  await page
    .getByRole("button", { name: "Importer depuis Vinted", exact: true })
    .click();
  const modal = page.getByRole("dialog");
  await expect(
    modal.getByText("Import de transactions en préparation", { exact: true }),
  ).toBeVisible();
  await expect(modal.locator('input[type="password"]')).toHaveCount(0);
  const cases = [
    [
      "export.zip",
      "application/zip",
      "PK\u0003\u0004__VM_PRIVATE_TEST__ corrompu",
    ],
    ["incomplet.json", "application/json", "{"],
    ["ventes.html", "text/html", "<script>window.vmFileExecuted=1</script>"],
  ];
  for (const [name, mimeType, content] of cases) {
    await page
      .getByLabel("Vérifier un export Vinted")
      .setInputFiles({ name, mimeType, buffer: Buffer.from(content) });
    await expect(modal.getByRole("status")).toContainText(
      "Aucun format de transactions",
    );
  }
  const duplicate = {
    name: "export.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("__VM_PRIVATE_TEST__ dupliqué"),
  };
  await page.getByLabel("Vérifier un export Vinted").setInputFiles(duplicate);
  await page.getByLabel("Vérifier un export Vinted").setInputFiles(duplicate);
  await page.getByLabel("Vérifier un export Vinted").setInputFiles({
    name: "trop-grand.zip",
    mimeType: "application/zip",
    buffer: Buffer.alloc(20 * 1024 * 1024 + 1),
  });
  await expect(modal.getByRole("status")).toContainText("20 Mo");
  expect(await snapshot(page)).toEqual(before);
  expect(
    await page.evaluate(() => Reflect.get(window, "vmFileExecuted")),
  ).toBeUndefined();
  for (const request of requests) {
    expect(request.method).toBe("GET");
    expect(request.body).toBe("");
    expect(JSON.stringify(request)).not.toContain("__VM_PRIVATE_TEST__");
    expect(request.url).not.toContain("vinted.fr");
    expect(request.url).not.toContain("vinted.co.uk");
  }
  await modal
    .getByRole("button", {
      name: "Ajouter un article manuellement",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Nom de l’article")).toHaveValue("");
  await expect(page.getByLabel("Prix d’achat TTC")).toHaveValue("");
});
