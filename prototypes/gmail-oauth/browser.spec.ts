import { test, expect, type Page, type BrowserContext } from "@playwright/test";
test.use({ serviceWorkers: "block" });
const root = "https://alisurvinted-lgtm.github.io/Vinted-manager/";
const canonical = root + "gmail-prototype/";
const local = "http://127.0.0.1:4175/Vinted-manager/gmail-prototype/";
const fakeToken = "__VM_SECRET_TEST__-prototype-synthetic";
const nonce = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const profileURL =
  "https://gmail.googleapis.com/gmail/v1/users/me/profile?fields=historyId";
async function seed(page: Page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const r = indexedDB.open("vinted-manager", 2);
        r.onupgradeneeded = () =>
          r.result.createObjectStore("articles", { keyPath: "id" });
        r.onsuccess = () => {
          const db = r.result,
            tx = db.transaction("articles", "readwrite");
          tx.objectStore("articles").put({
            id: "fictif",
            name: "__VM_PRIVATE_TEST__ ancien article",
            purchasePrice: 1520,
          });
          tx.oncomplete = () => {
            db.close();
            resolve(true);
          };
        };
      }),
  );
}
async function stored(page: Page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const r = indexedDB.open("vinted-manager");
        r.onsuccess = () => {
          const db = r.result,
            q = db.transaction("articles").objectStore("articles").getAll();
          q.onsuccess = () => {
            db.close();
            resolve(q.result);
          };
        };
      }),
  );
}
test("origine locale et lecteur autonome : aucune connexion Google ni modification du stockage", async ({
  page,
  context,
}) => {
  const remote: string[] = [];
  context.on("request", (r) => {
    if (!r.url().startsWith("http://127.0.0.1:4175/")) remote.push(r.url());
  });
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Synchroniser Gmail" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Ouvrir Vinted Manager" }),
  ).toBeVisible();
  await expect(page.getByRole("button")).toHaveCount(0);
  expect(
    await page.evaluate(async () => (await indexedDB.databases()).length),
  ).toBe(0);
  await seed(page);
  const before = await stored(page);
  await page.reload();
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent("pagehide")),
  );
  await page.reload();
  expect(await stored(page)).toEqual(before);
  expect(remote).toEqual([]);
  expect(
    await page.evaluate(() => ({ ...localStorage, ...sessionStorage })),
  ).toEqual({});
});
test("CSP précise, manifeste isolé et retour vers le coffre comptable", async ({
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
  expect(csp).not.toContain("unsafe-inline");
  expect(csp).not.toContain("connect-src 'self'");
  expect(csp).toContain("form-action 'none'");
  const json = await (await request.get("manifest.webmanifest")).json();
  expect(json.display).toBe("standalone");
  expect(new URL(json.start_url, baseURL).href).toBe(baseURL);
  expect(json.scope).toBe("/Vinted-manager/gmail-prototype/");
  await expect(
    page.getByRole("link", { name: "Ouvrir Vinted Manager" }),
  ).toHaveAttribute("href", "/Vinted-manager/");
});
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
  context.on("request", (r) =>
    traffic.push({
      url: r.url(),
      method: r.method(),
      body: r.postData(),
      authorization: r.headers()["authorization"],
    }),
  );
  await context.route(canonical + "**", async (route) =>
    route.fulfill({
      response: await route.fetch({
        url: route.request().url().replace(canonical, local),
      }),
    }),
  );
  await context.route(root, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html lang="fr"><body><iframe title="Lecteur" src="${canonical}"></iframe><script>const f=document.querySelector('iframe');function session(){f.contentWindow.postMessage({type:'vm:gmail-session',version:2,nonce:'${nonce}',knownSourceKeys:[],progress:[]},location.origin)}f.onload=session;window.addEventListener('message',e=>{if(e.source!==f.contentWindow||e.origin!==location.origin)return;if(e.data.type==='vm:gmail-hello')session();if(e.data.type==='vm:gmail-proposals')window.vmProposals=e.data;});</script></body></html>`,
    }),
  );
  await context.route("https://accounts.google.com/gsi/client", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.google={accounts:{oauth2:{initTokenClient(c){if(c.scope!=='https://www.googleapis.com/auth/gmail.readonly'||c.include_granted_scopes!==false)throw new Error('Scope synthétique invalide');return{requestAccessToken(){c.callback({access_token:${JSON.stringify(fakeToken)},expires_in:3600,token_type:'Bearer',scope:c.scope})}}},revoke(t,c){fetch('https://oauth2.googleapis.com/revoke',{method:'POST',body:'token='+encodeURIComponent(t),headers:{'Content-Type':'application/x-www-form-urlencoded'},credentials:'omit',cache:'no-store',redirect:'error'}).then(r=>c({successful:r.ok})).catch(()=>c({successful:false}));}}}};`,
    }),
  );
  const cors = { "access-control-allow-origin": new URL(root).origin };
  await context.route(profileURL, (route) =>
    route.fulfill({
      contentType: "application/json",
      headers: cors,
      body: '{"historyId":"123456789"}',
    }),
  );
  await context.route("https://oauth2.googleapis.com/revoke", (route) =>
    route.fulfill({
      status: failRevocation ? 400 : 200,
      headers: cors,
      body: failRevocation ? '{"error":"invalid_token"}' : "{}",
    }),
  );
  await context.route(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages**",
    (route) =>
      route.fulfill({
        contentType: "application/json",
        headers: cors,
        body: "{}",
      }),
  );
  await page.goto(root);
  return { traffic, frame: page.frameLocator("iframe") };
}
async function authorize(page: Page) {
  const f = page.frameLocator("iframe");
  await f.getByRole("checkbox").check();
  await expect(
    f.getByRole("button", { name: "Synchroniser Gmail", exact: true }),
  ).toBeEnabled();
  await f.getByLabel("Mois des notifications").fill("2026-01");
  await f
    .getByRole("button", { name: "Synchroniser Gmail", exact: true })
    .click();
  await expect(f.getByRole("status")).toContainText(
    "Période entièrement parcourue",
  );
  return f;
}
test("origine approuvée : lecture minimale, révocation et aucune persistance du jeton", async ({
  page,
  context,
}) => {
  const { traffic, frame } = await mockGoogle(page, context);
  expect(
    traffic.some((t) => t.url.startsWith("https://accounts.google.com/")),
  ).toBe(false);
  await authorize(page);
  await frame.getByText("Connexion et révocation", { exact: true }).click();
  await frame.getByRole("button", { name: "Vérifier l’accès Gmail" }).click();
  await expect(frame.getByRole("status")).toContainText(
    "Période entièrement parcourue",
  );
  await expect
    .poll(() => traffic.filter((t) => t.url === profileURL).length)
    .toBe(1);
  const p = traffic.find((t) => t.url === profileURL)!;
  expect(p.method).toBe("GET");
  expect(p.body).toBeNull();
  expect(p.authorization).toBe(`Bearer ${fakeToken}`);
  expect(
    await page.evaluate(async () => (await indexedDB.databases()).length),
  ).toBe(0);
  expect(
    await page.evaluate(() => ({ ...localStorage, ...sessionStorage })),
  ).toEqual({});
  expect(await frame.locator("body").textContent()).not.toContain(fakeToken);
  await frame.getByRole("button", { name: "Révoquer l’accès Google" }).click();
  await expect(frame.getByRole("status")).toContainText(
    "Google a confirmé la révocation",
  );
  const revoke = traffic.find(
    (t) => t.url === "https://oauth2.googleapis.com/revoke",
  );
  expect(revoke?.body).toBe("token=" + encodeURIComponent(fakeToken));
  expect(revoke?.method).toBe("POST");
  await expect(
    frame.getByRole("button", { name: "Vérifier l’accès Gmail" }),
  ).toBeDisabled();
  await page.reload();
  await expect(frame.getByRole("checkbox")).not.toBeChecked();
  for (const t of traffic) expect(t.url).not.toContain(fakeToken);
});
test("révocation refusée et sortie de page : aucun faux succès ni jeton conservé", async ({
  page,
  context,
}) => {
  const { frame } = await mockGoogle(page, context, true);
  await authorize(page);
  await frame.getByText("Connexion et révocation", { exact: true }).click();
  await frame.getByRole("button", { name: "Révoquer l’accès Google" }).click();
  await expect(frame.getByRole("status")).toContainText(
    "La révocation n’est pas confirmée",
  );
  await expect(
    frame.getByRole("button", { name: "Vérifier l’accès Gmail" }),
  ).toBeDisabled();
  await frame
    .getByRole("button", { name: "Synchroniser Gmail", exact: true })
    .click();
  await expect(frame.getByRole("status")).toContainText(
    "Période entièrement parcourue",
  );
  await page
    .locator("iframe")
    .evaluate((f: HTMLIFrameElement) =>
      f.contentWindow!.dispatchEvent(new PageTransitionEvent("pagehide")),
    );
  await expect(frame.getByRole("checkbox")).not.toBeChecked();
  await expect(
    frame.getByRole("button", { name: "Synchroniser Gmail", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() => ({ ...localStorage, ...sessionStorage })),
  ).toEqual({});
});
test("notifications paginées, HTML inerte et aucune écriture comptable depuis le lecteur", async ({
  page,
  context,
}) => {
  const { traffic, frame } = await mockGoogle(page, context);
  await seed(page);
  const before = await stored(page);
  const full: string[] = [];
  await context.route(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages**",
    (route) => {
      const url = new URL(route.request().url()),
        id = url.pathname.split("/").at(-1)!;
      let data: unknown;
      if (id === "messages")
        data = url.searchParams.has("pageToken")
          ? { messages: [{ id: "a1" }, { id: "a2" }] }
          : {
              messages: [
                { id: "a1" },
                { id: "personal" },
                { id: "unverified" },
                { id: "label" },
              ],
              nextPageToken: "synthetic-next",
            };
      else if (url.searchParams.get("format") === "metadata")
        data = {
          id,
          internalDate: String(Date.parse("2026-01-10T12:00:00Z")),
          payload: {
            headers: [
              {
                name: "From",
                value:
                  id === "personal"
                    ? "Personnel <fictif@example.invalid>"
                    : "Vinted <synthetique@vinted.fr>",
              },
              {
                name: "Subject",
                value:
                  id === "a1"
                    ? "Ton article s’est vendu !"
                    : id === "label"
                      ? "Ton bordereau d’envoi est prêt"
                      : "La transaction est finalisée",
              },
              {
                name: "Authentication-Results",
                value:
                  id === "unverified"
                    ? "mx.google.com; dmarc=fail header.from=vinted.fr"
                    : "mx.google.com; dmarc=pass header.from=vinted.fr",
              },
            ],
          },
        };
      else {
        full.push(id);
        data = {
          id,
          payload: {
            mimeType: "text/html",
            body: {
              data: Buffer.from(
                `<script>window.vmExecuted=1</script><img src="https://pixel.example.invalid/trace"><p>Ton article s’est vendu !</p><p>Article : __VM_PRIVATE_TEST__ notification synthétique</p><p>Prix de vente : 27,80 €</p><p>Nous avons viré 27,80 € sur ton porte-monnaie Vinted.</p><p>Référence de transaction : FICTIF-1234</p>`,
              ).toString("base64url"),
            },
          },
        };
      }
      return route.fulfill({
        contentType: "application/json",
        headers: { "access-control-allow-origin": new URL(root).origin },
        body: JSON.stringify(data),
      });
    },
  );
  await authorize(page);
  await expect
    .poll(() =>
      page.evaluate(() => Reflect.get(window, "vmProposals")?.items?.length),
    )
    .toBe(2);
  expect(full).toEqual(["a1", "a2"]);
  expect(await stored(page)).toEqual(before);
  const proposal = await page.evaluate(() =>
    Reflect.get(window, "vmProposals"),
  );
  expect(proposal.stats).toMatchObject({
    examined: 5,
    complete: true,
    unverified: 1,
  });
  expect(JSON.stringify(proposal)).not.toContain("<script>");
  expect(JSON.stringify(proposal)).not.toContain("access_token");
  await page.locator("iframe").evaluate((f: HTMLIFrameElement) =>
    f.contentWindow!.postMessage(
      {
        type: "vm:gmail-detail",
        version: 2,
        nonce: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
        sourceKey: Reflect.get(window, "vmProposals").items[0].sourceKey,
      },
      location.origin,
    ),
  );
  await expect(frame.locator(".reader-message pre")).toContainText(
    "__VM_PRIVATE_TEST__",
  );
  expect(
    await page
      .locator("iframe")
      .evaluate((f: HTMLIFrameElement) =>
        Reflect.get(f.contentWindow!, "vmExecuted"),
      ),
  ).toBeUndefined();
  expect(traffic.some((t) => t.url.includes("pixel.example.invalid"))).toBe(
    false,
  );
  await frame.getByText("Connexion et révocation", { exact: true }).click();
  await frame.getByRole("button", { name: "Révoquer l’accès Google" }).click();
  await expect(frame.locator(".reader-message pre")).toHaveCount(0);
  expect(await stored(page)).toEqual(before);
});
