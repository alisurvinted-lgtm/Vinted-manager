import { openVault, diskSnapshot } from "./vault-helper";
import { test, expect } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("manifeste, icônes et service worker restent dans le dossier Pages", async ({
  page,
  request,
  baseURL,
}) => {
  await page.goto("./");
  await openVault(page);
  const urls = await page.evaluate(async () => {
    const manifestURL = document.querySelector<HTMLLinkElement>(
      'link[rel="manifest"]',
    )!.href;

    const registration = await navigator.serviceWorker.ready;
    return {
      manifestURL,
      scope: registration.scope,
      scriptURL: registration.active!.scriptURL,
      appleIcon: document.querySelector<HTMLLinkElement>(
        'link[rel="apple-touch-icon"]',
      )!.href,
      standalone: document
        .querySelector('meta[name="apple-mobile-web-app-capable"]')
        ?.getAttribute("content"),
    };
  });
  const manifest = await (await request.get(urls.manifestURL)).json();
  expect(urls.scope).toBe(baseURL);
  expect(urls.scriptURL).toBe(new URL("sw.js", baseURL).href);
  expect(new URL(manifest.start_url, urls.manifestURL).href).toBe(baseURL);
  expect(new URL(manifest.scope, urls.manifestURL).href).toBe(baseURL);
  expect(manifest.display).toBe("standalone");
  expect(urls.standalone).toBe("yes");
  for (const icon of manifest.icons) {
    const url = new URL(icon.src, urls.manifestURL).href;
    expect(url.startsWith(baseURL!)).toBe(true);
    const response = await request.get(url);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/png");
  }
  const icon = await request.get(urls.appleIcon);
  expect(icon.ok()).toBe(true);
  expect(icon.headers()["content-type"]).toContain("image/png");
});

test("IndexedDB conserve les données après fermeture complète et relance du navigateur", async ({
  playwright,
  browserName,
  baseURL,
}, testInfo) => {
  const profile = await mkdtemp(join(tmpdir(), "vinted-manager-persistence-"));
  const device = testInfo.project.use;
  const options = {
    headless: true,
    baseURL,
    viewport: device.viewport,
    userAgent: device.userAgent,
    deviceScaleFactor: device.deviceScaleFactor,
    isMobile: device.isMobile,
    hasTouch: device.hasTouch,
  };
  let context = await playwright[browserName].launchPersistentContext(
    profile,
    options,
  );
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto("./");
    await openVault(page);
    await page
      .getByRole("button", { name: "Ajouter un article" })
      .first()
      .click();
    await page
      .getByLabel("Nom de l’article")
      .fill("Article test fermeture navigateur");
    await page.getByLabel("Prix d’achat TTC").fill("12,34");
    await page.getByRole("button", { name: "Enregistrer l’article" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await context.close();
    context = await playwright[browserName].launchPersistentContext(
      profile,
      options,
    );
    const reopened = context.pages()[0] ?? (await context.newPage());
    await reopened.goto("./");
    await expect(
      reopened.getByRole("heading", { name: "Déverrouiller mon espace" }),
    ).toBeVisible();
    await openVault(reopened);
    await expect(reopened.locator(".metric-value").last()).toHaveText("1");
    const stored = await diskSnapshot(reopened);
    expect(stored.articles).toEqual([]);
    expect(stored.settings).toEqual([]);
    expect(stored.vault).toHaveLength(1);
    expect(JSON.stringify(stored)).not.toContain(
      "Article test fermeture navigateur",
    );
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
