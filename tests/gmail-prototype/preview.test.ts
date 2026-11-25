import { afterEach, describe, expect, it, vi } from "vitest";
import { sourceKey } from "../../prototypes/gmail-oauth/identifiers";
import { gmailRead } from "../../prototypes/gmail-oauth/gmail-api";
import {
  decodeMailHeader,
  decodeBase64Text,
  htmlAsText,
  isAuthenticated,
  isFrenchVintedSender,
  messageText,
  readHeaders,
} from "../../prototypes/gmail-oauth/mail-content";
import {
  amountMentions,
  explicitReference,
  moneyCents,
  monthBounds,
  proposedRow,
  suggestKind,
} from "../../prototypes/gmail-oauth/preview-model";
import { readPreview } from "../../prototypes/gmail-oauth/preview";
const token = "__VM_SECRET_TEST__-phase2";
const privateText = "__VM_PRIVATE_TEST__";
const auth =
  "mx.google.com; dkim=pass header.i=@vinted.fr header.s=synthetique; dmarc=pass header.from=vinted.fr";
const metadata = (
  id: string,
  from = "Vinted <synthetique@vinted.fr>",
  authentication = auth,
  subject = "Ton article est vendu",
  date = "2026-01-10T12:00:00Z",
) => ({
  id,
  internalDate: String(Date.parse(date)),
  payload: {
    headers: [
      { name: "From", value: from },
      { name: "Subject", value: subject },
      { name: "Authentication-Results", value: authentication },
    ],
  },
});
const encode = (s: string) => Buffer.from(s).toString("base64url");
const body = (
  id: string,
  text = `${privateText}\nPrix de vente : 35,00 €\nRéférence de commande : FICTIF-1234`,
) => ({
  id,
  payload: { mimeType: "text/plain", body: { data: encode(text) } },
});
function server(
  values: Record<string, unknown>,
  listing: unknown = { messages: [{ id: "a1" }] },
) {
  const calls: { url: URL; options: RequestInit }[] = [];
  const network = vi.fn(async (input: string, options: RequestInit) => {
    const url = new URL(input);
    calls.push({ url, options });
    let response: unknown;
    if (url.pathname.endsWith("/messages"))
      response = typeof listing === "function" ? listing(url) : listing;
    else {
      const id = url.pathname.split("/").at(-1);
      response =
        url.searchParams.get("format") === "metadata"
          ? values["meta:" + id]
          : values["body:" + id];
    }
    if (response instanceof Response) return response;
    return new Response(JSON.stringify(response), {
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", network);
  return { calls, network };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe("Sélection et authenticité des notifications", () => {
  it.each([
    "synthetique@vinted.fr",
    "Vinted <synthetique@vinted.fr>",
    '"Vinted" <NOREPLY@VINTED.FR>',
  ])("accepte le domaine exact : %s", (sender) =>
    expect(isFrenchVintedSender(sender)).toBe(true),
  );
  it.each([
    "scam@vinted.fr.evil.test",
    "Vinted <personnel@example.invalid>",
    "synthetique@mailer.vinted.fr",
    "a@vinted.fr,b@example.invalid",
    "Vinted\n<test@vinted.fr>",
    "Vinted <test@vinted.fr",
    "test@vinted.fr>",
  ])("refuse les adresses ambiguës ou ressemblantes : %s", (sender) =>
    expect(isFrenchVintedSender(sender)).toBe(false),
  );
  it("exige un résultat Google unique et un domaine authentifié aligné", () => {
    const h = (v: string) => [{ name: "authentication-results", value: v }];
    expect(isAuthenticated(h(auth))).toBe(true);
    expect(
      isAuthenticated(
        h("mx.google.com; dkim=pass header.d=vinted.fr header.s=x"),
      ),
    ).toBe(true);
    expect(
      isAuthenticated(h("mx.google.com; dkim=fail header.d=vinted.fr")),
    ).toBe(false);
    expect(
      isAuthenticated(
        h(
          "mx.google.com; dkim=pass header.d=evil.test; dmarc=fail header.from=vinted.fr",
        ),
      ),
    ).toBe(false);
    expect(
      isAuthenticated(
        h("mx.google.com; dmarc=pass header.from=vinted.fr.evil.test"),
      ),
    ).toBe(false);
    expect(isAuthenticated([...h(auth), ...h(auth)])).toBe(false);
    expect(
      isAuthenticated(h("attaquant.example; dkim=pass header.i=@vinted.fr")),
    ).toBe(false);
  });
  it("ne lit jamais le contenu d’un message personnel, même si la recherche le renvoie", async () => {
    const api = server({
      "meta:a1": metadata("a1", "Personnel <personnel@example.invalid>"),
    });
    const batch = await readPreview(
      token,
      { month: "2026-01" },
      new AbortController().signal,
    );
    expect(batch.rows).toEqual([]);
    expect(batch.ignored).toBe(1);
    expect(api.calls).toHaveLength(2);
    expect(
      api.calls.some((c) => c.url.searchParams.get("format") === "full"),
    ).toBe(false);
  });
  it("affiche un doute sans charger le contenu non authentifié ou non pertinent", async () => {
    const api = server(
      {
        "meta:a1": metadata(
          "a1",
          undefined,
          "mx.google.com; dkim=fail header.i=@vinted.fr",
        ),
        "meta:a2": metadata("a2", undefined, undefined, "Offre de la semaine"),
      },
      { messages: [{ id: "a1" }, { id: "a2" }] },
    );
    const batch = await readPreview(
      token,
      { month: "2026-01" },
      new AbortController().signal,
    );
    expect(batch.rows).toHaveLength(1);
    expect(batch.ignored).toBe(1);
    expect(batch.rows[0].authenticated).toBe(false);
    expect(batch.rows[0].text).toBe("");
    expect(batch.rows[0].warning).toContain("non confirmée");
    expect(
      api.calls.some((c) => c.url.searchParams.get("format") === "full"),
    ).toBe(false);
  });
});
describe("Lecture locale bornée et pagination", () => {
  it("recherche le mois local avec des secondes Unix, lit uniquement un message authentifié et ne transmet aucun contenu", async () => {
    vi.stubEnv("TZ", "Europe/Paris");
    const api = server({ "meta:a1": metadata("a1"), "body:a1": body("a1") });
    const result = await readPreview(
      token,
      { month: "2026-01" },
      new AbortController().signal,
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].reference).toBe("FICTIF-1234");
    expect(result.rows[0].draft).toMatchObject({
      kind: "incomplete",
      purchase: "",
      sale: "",
      date: "",
    });
    const q = api.calls[0].url.searchParams.get("q")!;
    const range = monthBounds("2026-01");
    expect(q).toContain("from:(@vinted.fr)");
    expect(q).toContain(`after:${range.start / 1000 - 1}`);
    expect(q).toContain(`before:${range.end / 1000}`);
    for (const { url, options } of api.calls) {
      expect(url.origin).toBe("https://gmail.googleapis.com");
      expect(url.href).not.toContain(privateText);
      expect(url.href).not.toContain(token);
      expect(options.method).toBe("GET");
      expect(options.credentials).toBe("omit");
      expect(options.cache).toBe("no-store");
      expect(options.redirect).toBe("error");
      expect(options.body).toBeUndefined();
    }
    expect(result.rows[0].receivedAt).toBe("2026-01-10T12:00:00.000Z");
  });
  it("préserve les changements d’heure et d’année, sans décaler les mois vers PST", () => {
    vi.stubEnv("TZ", "Europe/Paris");
    const jan = monthBounds("2026-01");
    expect(new Date(jan.start).toISOString()).toBe("2025-12-31T23:00:00.000Z");
    const march = monthBounds("2026-03");
    expect(march.end - march.start).toBe(31 * 86400000 - 3600000);
    const october = monthBounds("2026-10");
    expect(october.end - october.start).toBe(31 * 86400000 + 3600000);
  });
  it("refuse les messages hors du mois exact et ceux marqués spam", async () => {
    const spam = { ...metadata("a2"), labelIds: ["SPAM"] };
    const api = server(
      {
        "meta:a1": metadata(
          "a1",
          undefined,
          undefined,
          undefined,
          "2025-12-31T12:00:00Z",
        ),
        "meta:a2": spam,
      },
      { messages: [{ id: "a1" }, { id: "a2" }] },
    );
    const batch = await readPreview(
      token,
      { month: "2026-01" },
      new AbortController().signal,
    );
    expect(batch.ignored).toBe(2);
    expect(batch.rows).toEqual([]);
    expect(api.calls).toHaveLength(3);
  });
  it("supprime les doublons d’identifiant, y compris ceux déjà vus, sans confondre des notifications différentes", async () => {
    const api = server(
      { "meta:a1": metadata("a1"), "body:a1": body("a1") },
      { messages: [{ id: "a1" }, { id: "a1" }], nextPageToken: "cursor-2" },
    );
    const first = await readPreview(
      token,
      { month: "2026-01" },
      new AbortController().signal,
    );
    expect(first.rows).toHaveLength(1);
    expect(first.nextPageToken).toBe("cursor-2");
    expect(api.calls).toHaveLength(3);
    const again = await readPreview(
      token,
      { month: "2026-01", seenIds: first.seenIds },
      new AbortController().signal,
    );
    expect(again.rows).toHaveLength(0);
    expect(again.examined).toBe(0);
  });
  it("évite même la lecture des métadonnées pour les sources déjà connues", async () => {
    const api = server({});
    const batch = await readPreview(
      token,
      { month: "2026-01", knownSourceKeys: [await sourceKey("a1")] },
      new AbortController().signal,
    );
    expect(batch.alreadyKnown).toBe(1);
    expect(batch.rows).toEqual([]);
    expect(api.calls).toHaveLength(1);
    expect(batch.complete).toBe(true);
  });
  it("plafonne à 200 et conserve le curseur de reprise sans annoncer un succès complet", async () => {
    const seen = Array.from({ length: 199 }, (_, i) => "old" + i);
    const api = server(
      { "meta:a1": metadata("a1"), "body:a1": body("a1") },
      { messages: [{ id: "a1" }], nextPageToken: "suite-fictive" },
    );
    const batch = await readPreview(
      token,
      { month: "2026-01", seenIds: seen, pageToken: "avant-fictif" },
      new AbortController().signal,
    );
    expect(batch).toMatchObject({
      limited: true,
      complete: false,
      nextPageToken: "suite-fictive",
    });
    expect(api.calls[0].url.searchParams.get("maxResults")).toBe("1");
  });
  it.each([429, 500])(
    "ne qualifie pas de réussie une lecture réseau interrompue (%s)",
    async (status) => {
      server({}, new Response("Erreur synthétique", { status }));
      await expect(
        readPreview(token, { month: "2026-01" }, new AbortController().signal),
      ).rejects.toThrow();
    },
  );
  it.each([
    { messages: [{ id: "../personnel" }] },
    { messages: "invalide" },
    { messages: [{ id: "a1" }], nextPageToken: 42 },
  ])("refuse une structure malformée : %j", async (listing) => {
    server({ "meta:a1": metadata("a1"), "body:a1": body("a1") }, listing);
    await expect(
      readPreview(token, { month: "2026-01" }, new AbortController().signal),
    ).rejects.toThrow();
  });
  it("refuse une pagination répétée et un lot sans progrès", async () => {
    server({}, { messages: [], nextPageToken: "meme" });
    await expect(
      readPreview(
        token,
        { month: "2026-01", pageToken: "meme" },
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    await expect(
      readPreview(
        token,
        { month: "2026-01", pageToken: "avant" },
        new AbortController().signal,
      ),
    ).rejects.toThrow();
  });
  it("ne masque pas un refus d’accès Google et ne charge jamais les pièces jointes", async () => {
    const api = server({
      "meta:a1": metadata("a1"),
      "body:a1": new Response("privé", { status: 401 }),
    });
    await expect(
      readPreview(token, { month: "2026-01" }, new AbortController().signal),
    ).rejects.toThrow();
    expect(api.calls.some((c) => c.url.pathname.includes("/attachments"))).toBe(
      false,
    );
  });
  it("présente une limite de contenu, sans deviner les données d’un message trop grand", async () => {
    server({
      "meta:a1": metadata("a1"),
      "body:a1": body("a1", "x".repeat(550000)),
    });
    const result = await readPreview(
      token,
      { month: "2026-01" },
      new AbortController().signal,
    );
    expect(result.rows[0].warning).toContain("trop volumineux");
    expect(result.rows[0].text).toBe("");
    expect(result.rows[0].draft.purchase).toBe("");
  });
  it("bloque les autres points d’accès avant tout réseau", async () => {
    const api = server({});
    for (const path of [
      "https://evil.test",
      "messages/a/attachments/b",
      "messages/a/modify",
      "../messages",
      "messages/a%2fb",
    ])
      await expect(
        gmailRead(
          path,
          new URLSearchParams(),
          token,
          new AbortController().signal,
        ),
      ).rejects.toThrow();
    expect(api.network).not.toHaveBeenCalled();
  });
  it.each(["2026-13", "2026-1", "2003-12", "9999-12", ""])(
    "refuse un mois invalide avant tout appel : %s",
    async (month) => {
      const api = server({});
      await expect(
        readPreview(token, { month }, new AbortController().signal),
      ).rejects.toThrow();
      expect(api.network).not.toHaveBeenCalled();
    },
  );
});
describe("Texte inerte et propositions sans donnée inventée", () => {
  it("décode les objets MIME français B et Q avant de proposer une catégorie", () => {
    const b =
      "=?UTF-8?B?" +
      Buffer.from("Transaction finalisée").toString("base64") +
      "?=";
    expect(decodeMailHeader(b)).toBe("Transaction finalisée");
    expect(decodeMailHeader("=?UTF-8?Q?Vente_finalis=C3=A9e?=")).toBe(
      "Vente finalisée",
    );
    expect(decodeMailHeader("=?inconnu?B?YWJj?=")).toBe("=?inconnu?B?YWJj?=");
  });
  it("charge le contenu d’un objet MIME reconnu sans prendre la date du message pour une vente", async () => {
    const subject =
      "=?UTF-8?B?" +
      Buffer.from("Transaction finalisée").toString("base64") +
      "?=";
    server({
      "meta:a1": metadata("a1", undefined, undefined, subject),
      "body:a1": body("a1"),
    });
    const result = await readPreview(
      token,
      { month: "2026-01" },
      new AbortController().signal,
    );
    expect(result.rows[0].subject).toBe("Transaction finalisée");
    expect(result.rows[0].text).toContain(privateText);
    expect(result.rows[0].draft.date).toBe("");
  });

  it("décode uniquement du texte UTF-8 et préfère le texte brut au HTML", () => {
    expect(decodeBase64Text(encode("Achat à 15,20 €"))).toBe("Achat à 15,20 €");
    expect(
      messageText({
        mimeType: "multipart/alternative",
        parts: [
          {
            mimeType: "text/html",
            body: { data: encode("<p>Autre prix</p>") },
          },
          {
            mimeType: "text/plain",
            body: { data: encode("Prix réellement écrit") },
          },
          {
            mimeType: "text/plain",
            filename: "piece.txt",
            body: { data: encode("pièce ignorée") },
          },
        ],
      }),
    ).toBe("Prix réellement écrit");
  });
  it("retire les balises sans créer de document ni charger de pixels ou de scripts", () => {
    const text = htmlAsText(
      '<head><title>secret</title></head><script>window.pwned=1</script><p>Article &amp; prix</p><img src="https://tracker.invalid"><p>35&nbsp;&euro;</p>',
    );
    expect(text).toContain("Article & prix");
    expect(text).toContain("35 €");
    expect(text).not.toContain("pwned");
    expect(text).not.toContain("tracker");
    expect(text).not.toContain("secret");
    expect(htmlAsText("<".repeat(100000))).toHaveLength(100000);
  });
  it("refuse base64 invalide, contenu binaire et arborescence excessive", () => {
    expect(() => decodeBase64Text("%%%")).toThrow();
    expect(() => decodeBase64Text("a")).toThrow();
    expect(() => decodeBase64Text("_w")).toThrow();
    let payload: unknown = {
      mimeType: "text/plain",
      body: { data: encode("ok") },
    };
    for (let i = 0; i < 10; i++)
      payload = { mimeType: "multipart/mixed", parts: [payload] };
    expect(() => messageText(payload)).toThrow();
  });
  it("ne déduit ni rôle, ni date de transaction, ni coût nul à partir d’une notification", () => {
    const row = proposedRow(
      "fictif",
      "Transaction finalisée",
      "2026-01-01T00:00:00Z",
      true,
      "Montant : 35 €",
      null,
    );
    expect(row.suggestion).toContain("achat ou vente à préciser");
    expect(row.draft).toMatchObject({
      kind: "incomplete",
      purchase: "",
      sale: "",
      date: "",
    });
    expect(moneyCents(row.draft.purchase)).toBeNull();
    expect(suggestKind("Vente annulée, remboursement prévu")).toContain(
      "Remboursement",
    );
    expect(suggestKind("Vente annulée")).toContain("Annulation");
  });
  it("repère les décimales et les montants négatifs sans les affecter automatiquement à un prix", () => {
    expect(
      amountMentions("35,00 € puis 1 234,56 EUR et -15 €").map((v) => v.cents),
    ).toEqual([3500, 123456, -1500]);
    expect(moneyCents("0")).toBe(0);
    expect(moneyCents("15,20")).toBe(1520);
    expect(moneyCents("15,205")).toBeNull();
    expect(moneyCents("")).toBeNull();
    expect(moneyCents("-2")).toBeNull();
  });
  it("rapproche seulement une référence explicitement présente, sans utiliser une URL supposée", () => {
    expect(explicitReference("Référence de commande : SYNTH-1111")).toBe(
      "SYNTH-1111",
    );
    expect(
      explicitReference(
        "Référence de commande : SYNTH-1111\nRéférence de transaction : SYNTH-2222",
      ),
    ).toBeNull();
    expect(
      explicitReference("https://vinted.fr/transaction/123456"),
    ).toBeNull();
    expect(
      explicitReference("Référence de commande : " + "A".repeat(65)),
    ).toBeNull();
    expect(explicitReference("Référence de commande : SYNTH-1111-")).toBe(
      "SYNTH-1111-",
    );
  });
  it("refuse les en-têtes ambigus et les valeurs gigantesques", () => {
    expect(
      readHeaders({ headers: [{ name: "From", value: "x".repeat(17000) }] }),
    ).toEqual([]);
    expect(readHeaders({ headers: 42 })).toEqual([]);
  });
});
