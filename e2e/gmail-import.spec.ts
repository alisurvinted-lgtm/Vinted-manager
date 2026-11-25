import { test, expect, type Page, type BrowserContext } from "@playwright/test";
const root = "https://alisurvinted-lgtm.github.io/Vinted-manager/";
const marker = "__VM_PRIVATE_TEST__ article confirmé";
async function setup(page: Page, context: BrowserContext) {
  const outbound: { url: string; body: string }[] = [];
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
      body: `window.google={accounts:{oauth2:{initTokenClient(c){return{requestAccessToken(){c.callback({access_token:'__VM_SECRET_TEST__-phase3',expires_in:3600,token_type:'Bearer',scope:c.scope})}}},revoke(t,c){c({successful:true})}}}};`,
    }),
  );
  await context.route(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages**",
    (route) => {
      const url = new URL(route.request().url());
      const data = url.pathname.endsWith("/messages")
        ? { messages: [{ id: "synthetique1" }] }
        : url.searchParams.get("format") === "metadata"
          ? {
              id: "synthetique1",
              internalDate: String(Date.parse("2026-02-05T12:00:00Z")),
              payload: {
                headers: [
                  { name: "From", value: "Vinted <synthetique@vinted.fr>" },
                  { name: "Subject", value: "Vente finalisée" },
                  {
                    name: "Authentication-Results",
                    value: "mx.google.com; dmarc=pass header.from=vinted.fr",
                  },
                ],
              },
            }
          : {
              id: "synthetique1",
              payload: {
                mimeType: "text/plain",
                body: {
                  data: Buffer.from(
                    "Texte de message synthétique. Prix : 35,00 €. Référence de commande : SYNTH-1234",
                  ).toString("base64url"),
                },
              },
            };
      return route.fulfill({
        contentType: "application/json",
        headers: { "access-control-allow-origin": new URL(root).origin },
        body: JSON.stringify(data),
      });
    },
  );
  await page.goto(root);
  await page
    .getByRole("button", { name: "Importer depuis Gmail", exact: true })
    .click();
  const frame = page.frameLocator('iframe[title="Connexion et aperçu Gmail"]');
  await frame.getByRole("checkbox").check();
  await frame
    .getByRole("button", { name: "Préparer le test", exact: true })
    .click();
  await expect(frame.getByRole("status")).toContainText("Prêt.");
  await frame
    .getByRole("button", { name: "Se connecter à Google", exact: true })
    .click();
  await frame.getByLabel("Mois des notifications").fill("2026-02");
  await frame
    .getByRole("button", {
      name: "Rechercher les notifications Vinted",
      exact: true,
    })
    .click();
  await expect(frame.locator(".notification-card")).toHaveCount(1);
  await frame
    .getByLabel("Type pour Vente finalisée")
    .selectOption("sale_final");
  await frame.getByLabel("Article pour Vente finalisée").fill(marker);
  await frame.getByLabel("Prix de vente pour Vente finalisée").fill("35,00");
  await frame
    .getByLabel("Date de transaction pour Vente finalisée")
    .fill("2026-02-02");
  await frame.getByRole("checkbox").last().check();
  await frame
    .getByRole("button", {
      name: "Vérifier l’enregistrement des lignes cochées",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Confirmer l’enregistrement",
      exact: true,
    }),
  ).toBeVisible();
  return { outbound, frame };
}
test("Gmail : validation explicite, CA avec coût inconnu, persistance, doublons et aucune transmission comptable", async ({
  page,
  context,
}) => {
  const { outbound } = await setup(page, context);
  expect(
    await page.evaluate(async () => {
      const r = indexedDB.open("vinted-manager");
      return new Promise((resolve) => {
        r.onsuccess = () => {
          const q = r.result
            .transaction("articles")
            .objectStore("articles")
            .count();
          q.onsuccess = () => {
            resolve(q.result);
            r.result.close();
          };
        };
      });
    }),
  ).toBe(0);
  // L’annulation du dialogue ne doit rien enregistrer.
  page.once("dialog", (d) => d.dismiss());
  await page
    .getByRole("button", { name: "Confirmer et enregistrer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Confirmer l’enregistrement",
      exact: true,
    }),
  ).toBeVisible();
  await context.setOffline(true);
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Confirmer et enregistrer", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Mois sélectionné").fill("2026-02");
  await expect(page.locator(".metric-value").nth(0)).toContainText("35,00");
  await expect(page.locator(".metric-value").nth(1)).toContainText(
    "À compléter",
  );
  await expect(page.locator(".metric-value").nth(2)).toContainText("4,31");
  await context.setOffline(false);
  await page.reload();
  await page.getByLabel("Mois sélectionné").fill("2026-02");
  await expect(page.locator(".metric-value").nth(0)).toContainText("35,00");
  // Une seconde recherche de la même notification ne crée ni vente ni frais supplémentaires.
  const frame = await (async () => {
    await page
      .getByRole("button", { name: "Importer depuis Gmail", exact: true })
      .click();
    const f = page.frameLocator("iframe");
    await f.getByRole("checkbox").check();
    await f
      .getByRole("button", { name: "Préparer le test", exact: true })
      .click();
    await expect(f.getByRole("status")).toContainText("Prêt.");
    await f
      .getByRole("button", { name: "Se connecter à Google", exact: true })
      .click();
    await f.getByLabel("Mois des notifications").fill("2026-02");
    await f
      .getByRole("button", {
        name: "Rechercher les notifications Vinted",
        exact: true,
      })
      .click();
    return f;
  })();
  await frame
    .getByLabel("Type pour Vente finalisée")
    .selectOption("sale_final");
  await frame.getByLabel("Article pour Vente finalisée").fill(marker);
  await frame.getByLabel("Prix de vente pour Vente finalisée").fill("35");
  await frame
    .getByLabel("Date de transaction pour Vente finalisée")
    .fill("2026-02-02");
  await frame.getByRole("checkbox").last().check();
  await frame
    .getByRole("button", {
      name: "Vérifier l’enregistrement des lignes cochées",
      exact: true,
    })
    .click();
  // Ressemblance signalée : on relie explicitement à la vente déjà présente.
  await page
    .getByLabel(`Enregistrement pour ${marker}`)
    .selectOption({ label: `Déjà enregistré, relier uniquement : ${marker}` });
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Confirmer et enregistrer", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "1 doublon(s) écarté(s)" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Navigation mobile" })
    .getByRole("button", { name: "Mes articles", exact: true })
    .isVisible()
    .then(async (visible) => {
      if (visible)
        await page
          .getByRole("navigation", { name: "Navigation mobile" })
          .getByRole("button", { name: "Mes articles", exact: true })
          .click();
      else
        await page
          .getByRole("navigation", { name: "Navigation principale" })
          .getByRole("button", { name: "Mes articles", exact: true })
          .click();
    });
  await page.getByRole("button").filter({ hasText: marker }).click();
  await page
    .getByRole("button", { name: "Modifier l’article", exact: true })
    .click();
  await page.getByLabel("Prix d’achat TTC", { exact: true }).fill("15");
  await page
    .getByRole("button", { name: "Enregistrer l’article", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await page.getByLabel("Mois sélectionné").fill("2026-02");
  await expect(page.locator(".metric-value").nth(1)).toContainText("15,69");
  const state = await page.evaluate(async () => {
    const r = indexedDB.open("vinted-manager");
    return new Promise((resolve) => {
      r.onsuccess = () => {
        const tx = r.result.transaction(["articles", "imports"]);
        const a = tx.objectStore("articles").getAll(),
          i = tx.objectStore("imports").getAll();
        tx.oncomplete = () => {
          resolve({ articles: a.result, imports: i.result });
          r.result.close();
        };
      };
    });
  });
  expect((state as { articles: unknown[] }).articles).toHaveLength(1);
  expect((state as { imports: unknown[] }).imports).toHaveLength(1);
  for (const event of outbound) {
    expect(event.url).not.toContain(marker);
    expect(event.body).not.toContain(marker);
    expect(event.url).not.toContain("__VM_SECRET_TEST__");
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("Gmail : source et nonce étrangers refusés, fermeture sans import, base conservée", async ({
  page,
  context,
}) => {
  await setup(page, context);
  await page.evaluate(() =>
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: location.origin,
        source: window,
        data: {
          type: "vm:gmail-selection",
          version: 1,
          nonce: "faux",
          items: [],
        },
      }),
    ),
  );
  await page.evaluate(() =>
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: location.origin,
        source: document.querySelector("iframe")!.contentWindow,
        data: {
          type: "vm:gmail-selection",
          version: 1,
          nonce: "mauvais",
          items: [],
        },
      }),
    ),
  );
  await expect(
    page.getByRole("heading", {
      name: "Confirmer l’enregistrement",
      exact: true,
    }),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  await page.reload();
  await expect(
    page.getByText("Tout commence par une trouvaille", { exact: true }),
  ).toBeVisible();
});
