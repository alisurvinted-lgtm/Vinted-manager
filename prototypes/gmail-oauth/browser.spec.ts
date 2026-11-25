import { test, expect, type Page, type BrowserContext } from "@playwright/test";
test("origine locale non autorisée : aucune requête Google et stockage existant inchangé", async ({
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
test("CSP limitée à Google et manifeste distinct de l’application comptable", async ({
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
  expect(csp).toContain(
    "https://gmail.googleapis.com/gmail/v1/users/me/profile",
  );
  expect(csp).toContain("https://oauth2.googleapis.com/revoke");
  expect(csp).not.toContain("*");
  expect(csp).not.toContain("connect-src 'self'");
  expect(csp).toContain("form-action 'none'");
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

const canonical =
  "https://alisurvinted-lgtm.github.io/Vinted-manager/gmail-prototype/";
const local = "http://127.0.0.1:4175/Vinted-manager/gmail-prototype/";
const fakeToken = "__VM_SECRET_TEST__-prototype-only";
const profileURL =
  "https://gmail.googleapis.com/gmail/v1/users/me/profile?fields=historyId";
async function mockGoogle(
  page: Page,
  context: BrowserContext,
  failRevocation = false,
) {
  const traffic: {
    url: string;
    method: string;
    body: string | null;
    authorization: string | undefined;
  }[] = [];
  context.on("request", (request) =>
    traffic.push({
      url: request.url(),
      method: request.method(),
      body: request.postData(),
      authorization: request.headers()["authorization"],
    }),
  );
  await context.route(canonical + "**", async (route) => {
    const response = await route.fetch({
      url: route.request().url().replace(canonical, local),
    });
    await route.fulfill({ response });
  });
  await context.route("https://accounts.google.com/gsi/client", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
    window.google = { accounts: { oauth2: {
      initTokenClient(config) {
        if(config.scope !== 'https://www.googleapis.com/auth/gmail.readonly' || config.include_granted_scopes !== false) throw new Error('Scope de test invalide');
        return { requestAccessToken() { config.callback({access_token:${JSON.stringify(fakeToken)},expires_in:3600,token_type:'Bearer',scope:config.scope}); } };
      },
      revoke(token, callback) {
        fetch('https://oauth2.googleapis.com/revoke', {method:'POST',body:'token='+encodeURIComponent(token),headers:{'Content-Type':'application/x-www-form-urlencoded'},credentials:'omit',cache:'no-store',redirect:'error'}).then(r=>callback({successful:r.ok})).catch(()=>callback({successful:false}));
      }
    } } };
  `,
    }),
  );
  await context.route(profileURL, (route) =>
    route.fulfill({
      headers: {
        "access-control-allow-origin": "https://alisurvinted-lgtm.github.io",
      },
      contentType: "application/json",
      body: '{"historyId":"123456789"}',
    }),
  );
  await context.route("https://oauth2.googleapis.com/revoke", (route) =>
    route.fulfill({
      status: failRevocation ? 400 : 200,
      headers: {
        "access-control-allow-origin": "https://alisurvinted-lgtm.github.io",
      },
      body: failRevocation ? '{"error":"invalid_token"}' : "{}",
    }),
  );
  await page.goto(canonical);
  return traffic;
}
async function authorize(page: Page) {
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Préparer le test", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Prêt.");
  await page
    .getByRole("button", { name: "Se connecter à Google", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Autorisation reçue en mémoire",
  );
}
test("origine approuvée : parcours simulé, vérification minimale, révocation et aucune persistance du jeton", async ({
  page,
  context,
}) => {
  const traffic = await mockGoogle(page, context);
  await expect(
    page.getByRole("button", { name: "Préparer le test", exact: true }),
  ).toBeDisabled();
  expect(
    traffic.some((t) => t.url.startsWith("https://accounts.google.com/")),
  ).toBe(false);
  await authorize(page);
  expect(
    traffic.some((t) => t.url.startsWith("https://gmail.googleapis.com/")),
  ).toBe(false);
  await page
    .getByRole("button", { name: "Vérifier l’accès Gmail", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Accès Gmail en lecture seule confirmé",
  );
  const profile = traffic.filter((t) =>
    t.url.startsWith("https://gmail.googleapis.com/"),
  );
  expect(profile).toHaveLength(1);
  expect(profile[0].url).toBe(profileURL);
  expect(profile[0].method).toBe("GET");
  expect(profile[0].body).toBeNull();
  expect(profile[0].authorization).toBe(`Bearer ${fakeToken}`);
  expect(
    await page.evaluate(async () => (await indexedDB.databases()).length),
  ).toBe(0);
  expect(
    await page.evaluate(() => ({
      local: { ...localStorage },
      session: { ...sessionStorage },
    })),
  ).toEqual({ local: {}, session: {} });
  expect(await page.locator("body").textContent()).not.toContain(fakeToken);
  expect(await page.locator("body").textContent()).not.toContain("123456789");
  await page
    .getByRole("button", { name: "Révoquer l’accès Google", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Google a confirmé la révocation",
  );
  const revoke = traffic.find(
    (t) => t.url === "https://oauth2.googleapis.com/revoke",
  );
  expect(revoke?.method).toBe("POST");
  expect(revoke?.body).toBe("token=" + encodeURIComponent(fakeToken));
  for (const event of traffic) {
    expect(event.url).not.toContain(fakeToken);
    expect(event.url).not.toContain("/messages");
  }
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Vérifier l’accès Gmail", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("checkbox")).not.toBeChecked();
});
test("refus de révocation et sortie de page : aucun faux succès, plus d’accès en mémoire", async ({
  page,
  context,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "standalone", {
      value: true,
      configurable: true,
    }),
  );
  await mockGoogle(page, context, true);
  await expect(page.locator(".mode")).toContainText("application installée");
  await authorize(page);
  await page
    .getByRole("button", { name: "Révoquer l’accès Google", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "La révocation n’est pas confirmée",
  );
  await expect(
    page.getByRole("button", { name: "Vérifier l’accès Gmail", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Se connecter à Google", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Autorisation reçue en mémoire",
  );
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent("pagehide")),
  );
  await expect(page.getByRole("status")).toContainText("Déconnecté de ce test");
  await expect(
    page.getByRole("button", { name: "Vérifier l’accès Gmail", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("checkbox")).not.toBeChecked();
});
