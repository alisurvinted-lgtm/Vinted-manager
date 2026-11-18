import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkAccess,
  GMAIL_PROBE_URL,
} from "../../prototypes/gmail-oauth/google";
const token = "__VM_SECRET_TEST__-fake";
afterEach(() => vi.unstubAllGlobals());
describe("Vérification Gmail sans consulter de message", () => {
  it("utilise uniquement le profil partiel fixe, un GET sans cookies, journal ou cache", async () => {
    const network = vi.fn(
      async () =>
        new Response('{"historyId":"123"}', {
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", network);
    const signal = new AbortController().signal;
    expect(await checkAccess(token, signal)).toBeUndefined();
    expect(network).toHaveBeenCalledExactlyOnceWith(GMAIL_PROBE_URL, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal,
    });
    expect(GMAIL_PROBE_URL).not.toContain(token);
    expect(GMAIL_PROBE_URL).not.toContain("messages");
  });
  it.each([
    "{",
    '{"emailAddress":"synthese@example.invalid"}',
    '{"historyId":"1","emailAddress":"synthese@example.invalid"}',
    '{"historyId":12}',
    '{"historyId":"abc"}',
    " ".repeat(1025),
  ])(
    "refuse une réponse inattendue sans conserver son contenu",
    async (body) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(body, {
              headers: { "content-type": "application/json" },
            }),
        ),
      );
      await expect(
        checkAccess(token, new AbortController().signal),
      ).rejects.toThrow(/Gmail/);
    },
  );
  it("rejette un refus d’accès sans lire le corps d’erreur", async () => {
    const response = new Response(token, { status: 401 });
    const read = vi.spyOn(response, "text");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response),
    );
    await expect(
      checkAccess(token, new AbortController().signal),
    ).rejects.toThrow("Accès Gmail non confirmé.");
    expect(read).not.toHaveBeenCalled();
  });
});
