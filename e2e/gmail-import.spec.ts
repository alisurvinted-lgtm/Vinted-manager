import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { openVault, diskSnapshot } from "./vault-helper";
// Les tests réseau simulés restent interceptables ; les parcours PWA testent le vrai worker.
test.use({ serviceWorkers: "block" });
const root = "https://alisurvinted-lgtm.github.io/Vinted-manager/";
const marker = "__VM_PRIVATE_TEST__ Polaire synthétique";
const token = "__VM_SECRET_TEST__-oauth-synthetic";
const messages = [
  {
    id: "final1",
    subject: "La transaction est finalisée",
    date: "2026-11-22T12:00:00Z",
    body: `Article : ${marker}\nNous avons versé 27,80 € sur ton solde Vinted.\nRéférence de transaction : FICTIF-SALE-202`,
  },
  {
    id: "announce1",
    subject: "Ton article s’est vendu !",
    date: "2026-11-15T12:00:00Z",
    body: `Ton article s’est vendu !\nArticle : ${marker}\nPrix de vente : 27,80 €\nRéférence de transaction : FICTIF-SALE-202`,
  },
  {
    id: "receipt1",
    subject: "Ton reçu pour la commande fictive",
    date: "2026-11-12T12:00:00Z",
    body: "Voici ton reçu.\nArticle : Baskets synthétiques\nMontant payé : 7,21 €\nPrix de l’article : 3,20 €\nFrais de port : 2,90 €\nProtection acheteur : 1,11 €\nRéférence de commande : FICTIF-ACQ-101",
  },
  {
    id: "label1",
    subject: "Ton bordereau d’envoi est prêt",
    date: "2026-11-16T12:00:00Z",
    body: "Ce contenu ne doit pas être téléchargé.",
  },
  {
    id: "private1",
    subject: "La transaction est finalisée",
    date: "2026-11-16T12:00:00Z",
    body: "E-mail personnel à ne pas télécharger.",
    from: "Personnel <personnel@example.invalid>",
  },
  {
    id: "ambiguous1",
    subject: "La transaction est finalisée",
    date: "2026-11-19T12:00:00Z",
    body: "Article : Veste synthétique ambiguë\nUne offre de 99 € est disponible.",
  },
  {
    id: "refund1",
    subject: "Ton remboursement a été effectué",
    date: "2026-11-23T12:00:00Z",
    body: `Article : ${marker}\nRemboursement effectué.\nMontant remboursé : 1,00 €\nRéférence de transaction : FICTIF-SALE-202`,
  },
];
export async function setup(page: Page, context: BrowserContext) {
  const outbound: { url: string; body: string }[] = [];
  const full: string[] = [];
  context.on("request", (r) =>
    outbound.push({ url: r.url(), body: r.postData() ?? "" }),
  );
  await context.route(root + "**", async (route) => {
    const url = route.request().url();
    const local = url.startsWith(root + "gmail-prototype/")
      ? url.replace(
          root + "gmail-prototype/",
          "http://127.0.0.1:4175/Vinted-manager/gmail-prototype/",
        )
      : url.replace(root, "http://127.0.0.1:4173/Vinted-manager/");
    await route.fulfill({ response: await route.fetch({ url: local }) });
  });
  await context.route("https://accounts.google.com/gsi/client", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.google={accounts:{oauth2:{initTokenClient(c){return{requestAccessToken(){c.callback({access_token:${JSON.stringify(token)},expires_in:3600,token_type:'Bearer',scope:c.scope})}}},revoke(t,c){c({successful:true})}}}};`,
    }),
  );
  await context.route(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages**",
    (route) => {
      const url = new URL(route.request().url());
      let data: unknown;
      if (url.pathname.endsWith("/messages"))
        data = { messages: messages.map((m) => ({ id: m.id })) };
      else {
        const id = url.pathname.split("/").at(-1),
          m = messages.find((m) => m.id === id)!;
        if (url.searchParams.get("format") === "metadata")
          data = {
            id,
            internalDate: String(Date.parse(m.date)),
            payload: {
              headers: [
                {
                  name: "From",
                  value: m.from ?? "Vinted <synthetique@vinted.fr>",
                },
                { name: "Subject", value: m.subject },
                {
                  name: "Authentication-Results",
                  value: "mx.google.com; dmarc=pass header.from=vinted.fr",
                },
              ],
            },
          };
        else {
          full.push(id!);
          data = {
            id,
            payload: {
              mimeType: "text/plain",
              body: { data: Buffer.from(m.body).toString("base64url") },
            },
          };
        }
      }
      return route.fulfill({
        contentType: "application/json",
        headers: { "access-control-allow-origin": new URL(root).origin },
        body: JSON.stringify(data),
      });
    },
  );
  await page.goto(root);
  await openVault(page);
  return { outbound, full };
}
export async function sync(page: Page) {
  await page
    .getByRole("button", { name: "Synchroniser Gmail", exact: true })
    .click();
  const frame = page.frameLocator('iframe[title="Connexion et analyse Gmail"]');
  await frame.getByRole("checkbox").first().check();
  await expect(
    frame.getByRole("button", { name: "Synchroniser Gmail", exact: true }),
  ).toBeEnabled();
  await frame.getByLabel("Mois des notifications").fill("2026-11");
  await frame
    .getByRole("button", { name: "Synchroniser Gmail", exact: true })
    .click();
  await expect(frame.getByRole("status")).toContainText(
    "Période entièrement parcourue",
  );
  return frame;
}
test("Gmail : préremplissage, confirmation groupée, CA à coût inconnu, chiffrement, persistance et synchronisation répétée", async ({
  page,
  context,
}) => {
  const { outbound, full } = await setup(page, context);
  const before = await diskSnapshot(page);
  await sync(page);
  await expect(
    page.getByRole("button", { name: "Valider les 3 opérations fiables" }),
  ).toBeEnabled();
  expect(await diskSnapshot(page)).toEqual(before);
  await expect(page.locator(".sync-session")).not.toHaveAttribute("open", "");
  await expect(
    page
      .getByRole("region", { name: "Opérations fiables" })
      .locator(".sync-row")
      .first(),
  ).toBeInViewport();
  await page.screenshot({
    path: `test-results/sync-${test.info().project.name}.png`,
    animations: "disabled",
  });
  // Vérifier le contenu et les cibles tactiles, pas la marge vide de la carte.
  const first = page
    .getByRole("region", { name: "Opérations fiables" })
    .locator(".sync-row")
    .first();
  await expect
    .poll(async () => {
      const footer = await page.locator(".sync-footer").boundingBox();
      const content = await first.locator(".sync-row-main").boundingBox();
      const buttons = await first
        .locator(".sync-row-actions button")
        .evaluateAll((all) =>
          all.map((b) => {
            const r = b.getBoundingClientRect();
            return { bottom: r.bottom, width: r.width, height: r.height };
          }),
        );
      return (
        !!footer &&
        !!content &&
        content.y + content.height <= footer.y &&
        buttons.every(
          (b) => b.bottom <= footer.y && b.width >= 44 && b.height >= 44,
        )
      );
    })
    .toBe(true);
  expect(full).not.toContain("private1");
  expect(full).not.toContain("label1");
  await expect(
    page.getByRole("region", { name: "Opérations fiables" }),
  ).toContainText("7,21");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await context.setOffline(true);
  await page
    .getByRole("button", { name: "Valider les 3 opérations fiables" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Mois sélectionné").fill("2026-11");
  await expect(page.locator(".metric-value").nth(0)).toContainText("27,80");
  await expect(page.locator(".metric-value").nth(1)).toContainText(
    "À compléter",
  );
  await expect(page.locator(".metric-value").nth(2)).toContainText("3,42");
  await expect(page.locator(".metric-value").nth(3)).toHaveText("1");
  const disk = await diskSnapshot(page);
  for (const name of ["articles", "settings", "activities", "imports"])
    expect(disk[name]).toEqual([]);
  expect(JSON.stringify(disk)).not.toContain(marker);
  expect(JSON.stringify(disk)).not.toContain(token);
  await context.setOffline(false);
  await page.reload();
  await openVault(page);
  await sync(page);
  const frame = page.frameLocator("iframe");
  await expect(frame.locator(".reader-counts")).toContainText("5 déjà connus");
  await expect(page.locator(".sync-row")).toHaveCount(0);
  expect(full.filter((id) => id === "final1")).toHaveLength(1);
  await page
    .getByRole("button", {
      name: "Conserver la progression et les éléments à vérifier",
    })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Mois sélectionné").fill("2026-11");
  await expect(page.locator(".metric-value").first()).toContainText("27,80");
  // Compléter le coût, sans l’assimiler à zéro ni demander une date d’achat inventée.
  await page.locator(".missing-costs summary").click();
  await page.locator(".missing-costs input").fill("12,00");
  await page.locator(".missing-costs button").click();
  await expect(page.locator(".metric-value").nth(1)).toContainText("12,38");
  for (const request of outbound) {
    expect(request.body).toBe("");
    expect(JSON.stringify(request)).not.toContain(marker);
  }
  const storage = await page.evaluate(() =>
    JSON.stringify({ local: localStorage, session: sessionStorage }),
  );
  expect(storage).not.toContain(token);
  expect(storage).not.toContain(marker);
});
test("Gmail : fermer sans validation, message forgé, verrouillage et réponse tardive ne modifient aucune donnée", async ({
  page,
  context,
}) => {
  await setup(page, context);
  const before = await diskSnapshot(page);
  await sync(page);
  await page.evaluate(() =>
    window.postMessage(
      {
        type: "vm:gmail-proposals",
        version: 2,
        nonce: crypto.randomUUID(),
        items: [],
        stats: {},
      },
      location.origin,
    ),
  );
  expect(await diskSnapshot(page)).toEqual(before);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await diskSnapshot(page)).toEqual(before);
  await page.getByRole("button", { name: "Verrouiller", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Déverrouiller mon espace" }),
  ).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
  expect(await diskSnapshot(page)).toEqual(before);
  await openVault(page);
  await expect(page.locator(".metric-value").first()).toContainText("0,00");
});
test("Gmail : correction dédiée, confirmation refusée puis remboursement tracé sans écrasement", async ({
  page,
  context,
}) => {
  await setup(page, context);
  await sync(page);
  await page
    .getByRole("button", { name: "Valider les 3 opérations fiables" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // Les corrections conservées se retrouvent hors ligne depuis À vérifier.
  await page
    .locator(".import-review")
    .getByRole("button", { name: "Compléter / examiner" })
    .last()
    .click();
  await page.getByLabel("Nature du remboursement").selectOption("sale");
  const before = await diskSnapshot(page);
  page.once("dialog", (d) => d.dismiss());
  await page
    .getByRole("button", { name: "Confirmer cette correction" })
    .click();
  expect(await diskSnapshot(page)).toEqual(before);
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Confirmer cette correction" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Mois sélectionné").fill("2026-11");
  await expect(page.locator(".metric-value").first()).toContainText("26,80");
});

test("phase 2 : date Gmail préremplie, estimation modifiable et mois d’encaissement conservé", async ({
  page,
  context,
}) => {
  await setup(page, context);
  const before = await diskSnapshot(page);
  await sync(page);
  const sale = page
    .getByRole("region", { name: "Opérations fiables" })
    .locator(".sync-row")
    .filter({ hasText: "Vente encaissée" });
  await sale.getByRole("button", { name: "Modifier / détails" }).click();
  await expect(sale.locator('input[type="date"]')).toHaveValue("2026-11-22");
  await expect(sale.locator(".sync-row-main")).toContainText("estimée");
  await sale.locator('input[type="date"]').fill("2026-12-01");
  await expect(sale.locator(".sync-row-main")).not.toContainText("estimée");
  expect(await diskSnapshot(page)).toEqual(before);
  await page
    .getByRole("button", { name: "Valider les 3 opérations fiables" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Mois sélectionné").fill("2026-11");
  await expect(page.locator(".metric-value").first()).toContainText("0,00");
  await page.getByLabel("Mois sélectionné").fill("2026-12");
  await expect(page.locator(".metric-value").first()).toContainText("27,80");
});
