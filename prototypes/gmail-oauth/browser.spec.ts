import { test, expect } from "@playwright/test";
test("prototype livré désactivé : aucune requête Google, aucun compte, stockage existant inchangé", async ({
  page,
  context,
}) => {
  const remote: string[] = [];
  context.on("request", (req) => {
    if (!req.url().startsWith("http://127.0.0.1:4175/")) remote.push(req.url());
  });
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Tester la connexion Gmail" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "Configuration en attente",
  );
  for (const name of [
    "Préparer le test",
    "Se connecter à Google",
    "Vérifier l’accès Gmail",
    "Déconnecter ce test",
    "Révoquer l’accès Google",
  ])
    await expect(
      page.getByRole("button", { name, exact: true }),
    ).toBeDisabled();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  expect(
    await page.evaluate(async () => (await indexedDB.databases()).length),
  ).toBe(0);
  const before = await page.evaluate(async () => {
    const open = indexedDB.open("vinted-manager", 20);
    await new Promise<void>((resolve, reject) => {
      open.onupgradeneeded = () => {
        open.result.createObjectStore("articles", { keyPath: "id" });
      };
      open.onsuccess = () => resolve();
      open.onerror = () => reject();
    });
    const database = open.result;
    const article = {
      id: "__VM_PRIVATE_TEST__",
      name: "Article synthétique protégé",
      purchasePrice: 1500,
      fees: [{ type: "Nettoyage", amount: 100 }],
    };
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction("articles", "readwrite");
      tx.objectStore("articles").put(article);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject();
    });
    database.close();
    return article;
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Se connecter à Google", exact: true })
    .evaluate((button: HTMLButtonElement) => button.click());
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent("pagehide")),
  );
  await page.reload();
  const after = await page.evaluate(async () => {
    const open = indexedDB.open("vinted-manager");
    return new Promise((resolve) => {
      open.onsuccess = () => {
        const db = open.result;
        const read = db
          .transaction("articles")
          .objectStore("articles")
          .getAll();
        read.onsuccess = () => {
          resolve(read.result);
          db.close();
        };
      };
    });
  });
  expect(after).toEqual([before]);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
  expect(
    await page.evaluate(() => Reflect.get(window, "google")),
  ).toBeUndefined();
  expect(remote).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("CSP fermée et manifeste autonome distinct de l’application comptable", async ({
  page,
  request,
  baseURL,
}) => {
  const response = await page.goto("./");
  expect(response?.headers()["cross-origin-opener-policy"]).toBe(
    "same-origin-allow-popups",
  );
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute("content");
  expect(csp).toContain("connect-src 'none'");
  expect(csp).toContain("frame-src 'none'");
  expect(csp).not.toContain("unsafe-inline");
  const json = await (await request.get("manifest.webmanifest")).json();
  expect(json.display).toBe("standalone");
  expect(new URL(json.start_url, baseURL).href).toBe(baseURL);
  expect(json.scope).toBe("/Vinted-manager/gmail-prototype/");
  const link = page.getByRole("link", { name: /Gérer ou retirer/ });
  await expect(link).toHaveAttribute(
    "href",
    "https://myaccount.google.com/connections",
  );
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
});
