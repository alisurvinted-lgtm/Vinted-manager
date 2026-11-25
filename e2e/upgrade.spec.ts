import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { openVault, diskSnapshot, vaultPhrase } from "./vault-helper";
const published = "https://alisurvinted-lgtm.github.io/Vinted-manager/";
const prefix = "/Vinted-manager/";
const allowed =
  /^(?:index\.html|sw\.js|manifest\.webmanifest|favicon\.svg|_headers|workbox-[\w-]+\.js|assets\/[\w.-]+\.(?:js|css)|icons\/[\w-]+\.png)$/;
// Uniquement les fichiers statiques publics ; jamais la base ou les messages du propriétaire.
async function publishedFiles(request: APIRequestContext) {
  const result = new Map<string, Buffer>();
  async function download(path: string) {
    expect(allowed.test(path)).toBe(true);
    const response = await request.get(published + path, {
      failOnStatusCode: true,
    });
    const bytes = await response.body();
    expect(bytes.length).toBeLessThan(2 * 1024 * 1024);
    result.set(path, bytes);
    return bytes.toString("utf8");
  }
  const html = await download("index.html");
  const worker = await download("sw.js");
  const resources = new Set(
    [...worker.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]),
  );
  for (const match of worker.matchAll(/["']\.\/(workbox-[\w-]+)["']/g))
    resources.add(match[1] + ".js");
  for (const match of html.matchAll(
    /(?:src|href)="\/Vinted-manager\/([^"]+)"/g,
  ))
    resources.add(match[1]);
  expect(resources.size).toBeLessThanOrEqual(20);
  await Promise.all(
    [...resources].filter((path) => !result.has(path)).map(download),
  );
  expect(result.size).toBeGreaterThanOrEqual(10);
  return result;
}
async function update(page: Page, changed: boolean) {
  if (changed) {
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.ready).update();
    });
    await page.getByRole("button", { name: "Actualiser", exact: true }).click();
  } else await page.reload();
  await expect(
    page.getByRole("heading", { name: "Déverrouiller mon espace" }),
  ).toBeVisible();
  await openVault(page);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const r = await navigator.serviceWorker.ready;
        return !r.waiting && r.active === navigator.serviceWorker.controller;
      }),
    )
    .toBe(true);
}

test("PWA : mise à jour depuis la version publiée, récupération v4 et ancienne sauvegarde sans perte", async ({
  page,
  context,
  request,
  playwright,
  browser,
}, info) => {
  test.setTimeout(120000);
  // Respecter le proxy/CA de l'environnement Cloud ; aucune exception TLS.
  const configuredProxy = process.env.https_proxy ?? process.env.HTTPS_PROXY;
  const proxy = configuredProxy ? new URL(configuredProxy) : null;
  const network = proxy
    ? await playwright.request.newContext({
        proxy: {
          server: proxy.origin,
          ...(proxy.username
            ? { username: decodeURIComponent(proxy.username) }
            : {}),
          ...(proxy.password
            ? { password: decodeURIComponent(proxy.password) }
            : {}),
        },
      })
    : request;
  let old: Map<string, Buffer>;
  try {
    old = await publishedFiles(network);
  } finally {
    if (network !== request) await network.dispose();
  }
  const currentWorker = await readFile("dist/sw.js");
  const script = (html: string) => html.match(/<script[^>]+src="([^"]+)"/)![1];
  const currentScript = script(await readFile("dist/index.html", "utf8"));
  const oldScript = script(old.get("index.html")!.toString("utf8"));
  const changed = !old.get("sw.js")!.equals(currentWorker);
  await info.attach("versions-statiques", {
    contentType: "application/json",
    body: Buffer.from(
      JSON.stringify({
        published,
        workerChanged: changed,
        previous: [...old].map(([file, bytes]) => ({
          file,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        })),
        currentWorker: createHash("sha256").update(currentWorker).digest("hex"),
      }),
    ),
  });
  let version: "old" | "current" = "old";
  let forceWorkerChange = false;
  const server = createServer(async (req, res) => {
    const path = new URL(req.url!, "http://127.0.0.1").pathname;
    const file =
      path === prefix
        ? "index.html"
        : path.startsWith(prefix)
          ? path.slice(prefix.length)
          : "";
    if (req.method !== "GET" || !allowed.test(file)) {
      res.writeHead(404).end();
      return;
    }
    try {
      const body =
        version === "old" ? old.get(file) : await readFile(`dist/${file}`);
      if (!body) {
        res.writeHead(404).end();
        return;
      }
      const ext = file.split(".").at(-1)!;
      res.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type":
          (
            {
              html: "text/html",
              js: "text/javascript",
              css: "text/css",
              webmanifest: "application/manifest+json",
              png: "image/png",
              svg: "image/svg+xml",
            } as Record<string, string>
          )[ext] ?? "text/plain",
      });
      res.end(
        file === "sw.js" && forceWorkerChange
          ? Buffer.concat([
              body,
              Buffer.from("\n// mise à jour synthétique de première session\n"),
            ])
          : body,
      );
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Serveur de test indisponible.");
  const root = `http://127.0.0.1:${address.port}${prefix}`;
  const outbound: string[] = [];
  context.on("request", (r) =>
    outbound.push(
      JSON.stringify({
        url: r.url(),
        body: r.postData(),
        headers: r.headers(),
      }),
    ),
  );
  const marker = "__VM_PRIVATE_TEST__ article avant mise à jour";
  const backupPhrase = "__VM_SECRET_TEST__ archive ancienne cinq mots";
  try {
    await page.goto(root);
    await openVault(page);
    await expect
      .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
      .toBe(true);
    // Reproduire une PWA déjà installée et rouverte depuis la version publiée.
    await page.reload();
    await openVault(page);
    await page
      .getByRole("button", { name: "Ajouter un article", exact: true })
      .first()
      .click();
    await page.getByLabel("Nom de l’article").fill(marker);
    await page.getByLabel("Prix d’achat TTC", { exact: true }).fill("15,00");
    await page.getByLabel("Date d’achat", { exact: true }).fill("2026-10-01");
    await page.getByRole("button", { name: "Vendu", exact: true }).click();
    await page.getByLabel("Prix de vente", { exact: true }).fill("35,00");
    await page.getByLabel("Date de vente", { exact: true }).fill("2026-11-20");
    await page
      .getByRole("button", { name: "Ajouter un frais", exact: true })
      .click();
    await page.getByLabel("Montant du frais 1").fill("2,00");
    await page
      .getByRole("button", { name: "Ajouter un frais", exact: true })
      .click();
    await page.getByLabel("Type du frais 2").selectOption("Nettoyage");
    await page.getByLabel("Montant du frais 2").fill("1,00");
    await page
      .getByRole("button", { name: "Enregistrer l’article", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Ouvrir les paramètres" }).click();
    await page
      .getByRole("button", {
        name: "Exporter une sauvegarde chiffrée",
        exact: true,
      })
      .click();
    await page.getByLabel("Phrase secrète", { exact: true }).fill(backupPhrase);
    await page.getByLabel("Confirmer la phrase secrète").fill(backupPhrase);
    const downloaded = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Chiffrer et exporter", exact: true })
      .click();
    const backupPath = await (await downloaded).path();
    await page.getByRole("button", { name: "Fermer", exact: true }).click();
    const before = await diskSnapshot(page);
    expect(before.vault).toHaveLength(1);
    expect(before.articles).toEqual([]);
    version = "current";
    await update(page, changed);
    await expect(page.locator('script[type="module"]')).toHaveAttribute(
      "src",
      currentScript,
    );
    expect(await diskSnapshot(page)).toEqual(before);
    await page.getByLabel("Mois sélectionné").fill("2026-11");
    await expect(page.locator(".metric-value").first()).toContainText("35,00");
    await expect(page.locator(".metric-value").nth(1)).toContainText("12,69");
    // Retour de secours v4 : lecture/export seulement, sans synchroniser avec les anciennes règles.
    version = "old";
    await update(page, changed);
    await expect(page.locator('script[type="module"]')).toHaveAttribute(
      "src",
      oldScript,
    );
    expect(await diskSnapshot(page)).toEqual(before);
    await page.getByLabel("Mois sélectionné").fill("2026-11");
    await expect(page.locator(".metric-value").nth(1)).toContainText("12,69");
    version = "current";
    await update(page, changed);
    await page.getByRole("button", { name: "Ouvrir les paramètres" }).click();
    await page
      .getByLabel("Fichier de sauvegarde", { exact: true })
      .setInputFiles(backupPath!);
    await page.getByLabel("Phrase secrète", { exact: true }).fill(backupPhrase);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Déchiffrer et vérifier" }).click();
    await expect(page.getByText("1 article", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Fermer", exact: true }).click();
    await context.setOffline(true);
    await page.reload();
    await openVault(page);
    await page.getByLabel("Mois sélectionné").fill("2026-11");
    await expect(page.locator(".metric-value").nth(1)).toContainText("12,69");
    const disk = JSON.stringify(await diskSnapshot(page));
    for (const value of [marker, vaultPhrase, backupPhrase, "purchasePrice"]) {
      expect(disk).not.toContain(value);
      expect(outbound.join("\n")).not.toContain(value);
    }
    expect(
      await page.evaluate(() =>
        JSON.stringify({ localStorage, sessionStorage }),
      ),
    ).not.toContain(marker);
    await context.setOffline(false);
    // Contexte neuf : première installation réelle du worker, sans les effets
    // de la désinscription d'un worker encore présent dans un processus WebKit.
    const device = info.project.use;
    const firstContext = await browser.newContext({
      viewport: device.viewport,
      screen: device.screen,
      userAgent: device.userAgent,
      deviceScaleFactor: device.deviceScaleFactor,
      isMobile: device.isMobile,
      hasTouch: device.hasTouch,
    });
    try {
      const first = await firstContext.newPage();
      await first.goto(root);
      await openVault(first);
      await expect
        .poll(() => first.evaluate(() => !!navigator.serviceWorker.controller))
        .toBe(true);
      const firstDisk = await diskSnapshot(first);
      forceWorkerChange = true;
      await update(first, true);
      expect(await diskSnapshot(first)).toEqual(firstDisk);
    } finally {
      await firstContext.close();
    }
  } finally {
    await context.setOffline(false);
    await page.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
