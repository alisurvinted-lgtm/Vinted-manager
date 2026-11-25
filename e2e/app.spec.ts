import { openVault } from "./vault-helper";
import { test, expect, type Page } from "@playwright/test";
async function create(page: Page, name = "Sweat Carhartt bordeaux") {
  await page
    .getByRole("button", { name: "Ajouter un article" })
    .first()
    .click();
  await page.getByLabel("Nom de l’article").fill(name);
  await page.getByLabel("Prix d’achat TTC").fill("15,00");
  await page.getByLabel("Date d’achat").fill("2026-01-01");
  await page.getByRole("button", { name: "Enregistrer l’article" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function tab(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: /Navigation/ })
    .filter({ visible: true })
    .getByRole("button", { name, exact: true })
    .click();
}
async function detail(page: Page, name = "Sweat Carhartt bordeaux") {
  await page
    .getByRole("button")
    .filter({ has: page.locator(".article-info strong", { hasText: name }) })
    .click();
}

test("créer, recharger, modifier, vendre avec plusieurs frais et supprimer", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await openVault(page);
  await expect(
    page.getByText("Tout commence par une trouvaille"),
  ).toBeVisible();
  await create(page);
  await page.reload();
  await openVault(page);
  await tab(page, "Mes articles");
  await expect(page.locator(".article-info strong")).toHaveText(
    "Sweat Carhartt bordeaux",
  );
  await detail(page);
  await page
    .getByRole("button", { name: "Modifier l’article", exact: true })
    .click();
  await page.getByLabel("Nom de l’article").fill("Sweat Carhartt modifié");
  await page
    .getByRole("button", { name: "Ajouter un frais", exact: true })
    .click();
  await page.getByLabel("Montant du frais 1").fill("2");
  await page
    .getByRole("button", { name: "Ajouter un frais", exact: true })
    .click();
  await page.getByLabel("Type du frais 2").selectOption("Nettoyage");
  await page.getByLabel("Montant du frais 2").fill("1");
  await page.getByRole("button", { name: "Enregistrer l’article" }).click();
  await detail(page, "Sweat Carhartt modifié");
  await page
    .getByRole("button", { name: "Marquer comme vendu", exact: true })
    .click();
  await page.getByLabel("Prix de vente", { exact: true }).fill("35");
  await page.getByLabel("Date de vente").fill("2026-02-03");
  await expect(page.locator(".profit-preview strong")).toHaveText(/12,69/);
  await page.getByRole("button", { name: "Enregistrer l’article" }).click();
  await expect(page.locator(".article-prices")).toContainText("12,69");
  await tab(page, "Accueil");
  await page.getByLabel("Mois sélectionné").fill("2026-02");
  await expect(page.locator(".metric-value").nth(0)).toHaveText(/35,00/);
  await expect(page.locator(".metric-value").nth(1)).toHaveText(/12,69/);
  await expect(page.locator(".metric-value").nth(2)).toHaveText(/4,31/);
  await expect(page.locator(".metric-value").nth(3)).toHaveText("0");
  await tab(page, "Mes articles");
  await detail(page, "Sweat Carhartt modifié");
  await page
    .getByRole("button", { name: "Modifier l’article", exact: true })
    .click();
  await page.getByLabel("Date de vente").fill("2026-03-01");
  await page.getByRole("button", { name: "Enregistrer l’article" }).click();
  await tab(page, "Accueil");
  await expect(page.locator(".metric-value").nth(0)).toHaveText(/0,00/);
  await tab(page, "Mes articles");
  await detail(page, "Sweat Carhartt modifié");
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Repasser en stock", exact: true })
    .click();
  await expect(page.locator(".article-row .status")).toHaveText("En stock");
  await detail(page, "Sweat Carhartt modifié");
  page.once("dialog", (d) => d.dismiss());
  await page
    .getByRole("button", { name: "Supprimer l’article", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Supprimer l’article", exact: true })
    .click();
  await expect(page.locator(".article-row")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("sauvegarde JSON, confirmation, validation et restauration depuis l’interface", async ({
  page,
}) => {
  await page.goto("./");
  await openVault(page);
  await create(page, "Jean sauvegardé");
  await page.getByRole("button", { name: "Ouvrir les paramètres" }).click();
  await page.getByLabel("Taux de cotisations").fill("14,5");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page
    .getByText("Ancien format et CSV non chiffrés", { exact: true })
    .click();
  page.once("dialog", (d) => d.accept());
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exporter un JSON non chiffré", exact: true })
    .click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  await create(page, "Article à remplacer");
  await page.getByRole("button", { name: "Ouvrir les paramètres" }).click();
  await page.getByLabel("Fichier de sauvegarde").setInputFiles({
    name: "invalide.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"articles":[]}'),
  });
  await expect(page.getByRole("alert")).toContainText("compatible");
  page.once("dialog", (d) => d.dismiss());
  await page.getByLabel("Fichier de sauvegarde").setInputFiles(path!);
  await expect(page.getByText("2 articles", { exact: true })).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByLabel("Fichier de sauvegarde").setInputFiles(path!);
  await expect(page.getByText("1 article", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Taux de cotisations")).toHaveValue("14,5");
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  await page.reload();
  await openVault(page);
  await tab(page, "Mes articles");
  await expect(page.locator(".article-info strong")).toHaveText(
    "Jean sauvegardé",
  );
});

test("PWA disponible hors ligne après chargement et données conservées", async ({
  page,
  context,
}) => {
  await page.goto("./");
  await openVault(page);
  await create(page, "Article hors ligne");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await openVault(page);
  await expect(page.getByText("Mode hors ligne")).toBeVisible();
  await tab(page, "Mes articles");
  await expect(page.locator(".article-info strong")).toHaveText(
    "Article hors ligne",
  );
  await create(page, "Ajout hors ligne");
  await page.reload();
  await openVault(page);
  await tab(page, "Mes articles");
  await expect(page.locator(".article-row")).toHaveCount(2);
  await context.setOffline(false);
});

test("recherche, filtres, statistiques et écran mobile sans débordement", async ({
  page,
}) => {
  await page.goto("./");
  await openVault(page);
  await create(page, "Polaire Patagonia");
  await tab(page, "Mes articles");
  await page.getByLabel("Rechercher par nom").fill("inexistant");
  await expect(page.getByText("Aucun article trouvé")).toBeVisible();
  await page.getByLabel("Rechercher par nom").fill("patagonia");
  await expect(page.locator(".article-row")).toHaveCount(1);
  await page.getByRole("button", { name: /^Vendus/ }).click();
  await expect(page.locator(".article-row")).toHaveCount(0);
  await tab(page, "Statistiques");
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(12);
  await expect(page.locator(".secondary-metrics strong").first()).toHaveText(
    "1",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await tab(page, "Accueil");
  await expect(page.locator(".metrics-grid")).toBeVisible();
  if (test.info().project.name === "webkit-iphone") {
    const stock = await page.locator(".metric-card").last().boundingBox();
    const navigation = await page.locator(".bottom-nav").boundingBox();
    expect(stock!.y + stock!.height).toBeLessThanOrEqual(navigation!.y);
  }
  const dismiss = page.getByRole("button", { name: "Masquer le message" });
  if (await dismiss.isVisible()) await dismiss.click();
  await page.screenshot({
    path: `test-results/accueil-${test.info().project.name}.png`,
    fullPage: true,
    animations: "disabled",
  });
});
