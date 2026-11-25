import { openVault } from "./vault-helper";
import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
const privateName = "__VM_PRIVATE_TEST__ article synthétique";
const phrase = "__VM_SECRET_TEST__ cinq mots de démonstration";
async function create(page: Page, name = privateName) {
  await page
    .getByRole("button", { name: "Ajouter un article" })
    .first()
    .click();
  await page.getByLabel("Nom de l’article").fill(name);
  await page.getByLabel("Prix d’achat TTC").fill("15,99");
  await page.getByRole("button", { name: "Enregistrer l’article" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function settings(page: Page) {
  await page.getByRole("button", { name: "Ouvrir les paramètres" }).click();
}
test("sauvegarde chiffrée, refus du mauvais secret et de l’altération, restauration sans fuite réseau", async ({
  page,
  context,
  baseURL,
}) => {
  const requests: {
    url: string;
    method: string;
    body: string;
    headers: string;
  }[] = [];
  const logs: string[] = [];
  context.on("request", (request) =>
    requests.push({
      url: request.url(),
      method: request.method(),
      body: request.postData() ?? "",
      headers: JSON.stringify(request.headers()),
    }),
  );
  page.on("console", (message) => logs.push(message.text()));
  await page.goto("./");
  await openVault(page);
  await create(page);
  await settings(page);
  await page.getByLabel("Taux de cotisations").fill("14,5");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Exporter une sauvegarde chiffrée",
      exact: true,
    })
    .click();
  await page.getByLabel("Phrase secrète", { exact: true }).fill(phrase);
  await page.getByLabel("Confirmer la phrase secrète").fill(phrase);
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Chiffrer et exporter", exact: true })
    .click();
  const file = await downloaded;
  const path = await file.path();
  expect(file.suggestedFilename()).toMatch(/\.vmbackup$/);
  const raw = await readFile(path!, "utf8");
  expect(raw).not.toContain(privateName);
  expect(raw).not.toContain(phrase);
  await expect(page.getByLabel("Phrase secrète", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  await create(page, "Article de test supplémentaire");
  await settings(page);
  await page
    .getByLabel("Fichier de sauvegarde", { exact: true })
    .setInputFiles(path!);
  await page
    .getByLabel("Phrase secrète", { exact: true })
    .fill("phrase incorrecte synthétique");
  await page.getByRole("button", { name: "Déchiffrer et vérifier" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "incorrecte ou sauvegarde altérée",
  );
  await expect(page.getByText("2 articles", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Phrase secrète", { exact: true })).toHaveValue(
    "",
  );
  const altered = JSON.parse(raw);
  altered.ciphertext =
    (altered.ciphertext[0] === "A" ? "B" : "A") + altered.ciphertext.slice(1);
  await page
    .getByLabel("Fichier de sauvegarde", { exact: true })
    .setInputFiles({
      name: "alteree.vmbackup",
      mimeType: "application/octet-stream",
      buffer: Buffer.from(JSON.stringify(altered)),
    });
  await page.getByLabel("Phrase secrète", { exact: true }).fill(phrase);
  await page.getByRole("button", { name: "Déchiffrer et vérifier" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "incorrecte ou sauvegarde altérée",
  );
  await expect(page.getByText("2 articles", { exact: true })).toBeVisible();
  await page
    .getByLabel("Fichier de sauvegarde", { exact: true })
    .setInputFiles(path!);
  await page.getByLabel("Phrase secrète", { exact: true }).fill(phrase);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Déchiffrer et vérifier" }).click();
  await expect(page.getByText("1 article", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Taux de cotisations")).toHaveValue("14,5");
  const storage = await page.evaluate(() => ({
    local: JSON.stringify(localStorage),
    session: JSON.stringify(sessionStorage),
  }));
  expect(JSON.stringify(storage)).not.toContain(phrase);
  for (const request of requests) {
    expect(request.url.startsWith(baseURL!)).toBe(true);
    expect(request.method).toBe("GET");
    expect(request.body).toBe("");
    expect(JSON.stringify(request)).not.toContain(privateName);
    expect(JSON.stringify(request)).not.toContain(
      encodeURIComponent(privateName),
    );
    expect(JSON.stringify(request)).not.toContain(phrase);
  }
  expect(logs.join("\n")).not.toContain(privateName);
  expect(logs.join("\n")).not.toContain(phrase);
  const storedSecret = await page.evaluate(
    () =>
      new Promise<boolean>((resolve, reject) => {
        const open = indexedDB.open("vinted-manager");
        open.onerror = () => reject();
        open.onsuccess = () => {
          const database = open.result;
          const names = Array.from(database.objectStoreNames);
          const transaction = database.transaction(names);
          const values: unknown[] = [];
          names.forEach((name) => {
            const read = transaction.objectStore(name).getAll();
            read.onsuccess = () => values.push(read.result);
          });
          transaction.oncomplete = () => {
            resolve(JSON.stringify(values).includes("__VM_SECRET_TEST__"));
            database.close();
          };
          transaction.onerror = () => reject();
        };
      }),
  );
  expect(storedSecret).toBe(false);
});

test("CSP interdit les connexions et scripts injectés ; le texte HTML est échappé", async ({
  page,
}) => {
  await page.goto("./");
  await openVault(page);
  const hostile = '<img src=x onerror="window.vmXss=1">';
  await create(page, hostile);
  expect(
    await page.evaluate(
      () => document.querySelectorAll(".activity-info img").length,
    ),
  ).toBe(0);
  expect(
    await page.evaluate(() => Reflect.get(window, "vmXss")),
  ).toBeUndefined();
  const blocked = await page.evaluate(async () => {
    const violations: string[] = [];
    document.addEventListener("securitypolicyviolation", (e) =>
      violations.push(e.effectiveDirective),
    );
    const script = document.createElement("script");
    script.textContent = "window.vmInjected=1";
    document.body.append(script);
    let networkBlocked = false;
    try {
      await fetch(location.href + "?csp-probe=1");
    } catch {
      networkBlocked = true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    return {
      violations,
      networkBlocked,
      injected: Reflect.get(window, "vmInjected"),
      csp: document
        .querySelector('meta[http-equiv="Content-Security-Policy"]')
        ?.getAttribute("content"),
    };
  });
  expect(blocked.networkBlocked).toBe(true);
  expect(blocked.injected).toBeUndefined();
  expect(blocked.csp).toContain("connect-src 'none'");
  expect(blocked.csp).not.toContain("script-src 'self' 'unsafe-inline'");
  expect(blocked.violations.some((v) => v.startsWith("script-src"))).toBe(true);
  expect(blocked.violations).toContain("connect-src");
});

test("le cache ne contient que des ressources statiques locales et aucune sauvegarde", async ({
  page,
  baseURL,
}) => {
  await page.goto("./");
  await openVault(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const urls = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys())
      for (const request of await (await caches.open(name)).keys())
        urls.push(request.url);
    return urls;
  });
  expect(urls.length).toBeGreaterThan(0);
  for (const url of urls) {
    expect(url.startsWith(baseURL!)).toBe(true);
    expect(new URL(url).pathname).not.toMatch(
      /\.(json|csv|vmbackup|zip|map)$/i,
    );
    expect(url).not.toContain("__VM_PRIVATE_TEST__");
  }
});
