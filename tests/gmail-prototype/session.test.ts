import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProbe,
  GMAIL_SCOPE,
  isApproved,
  type GoogleAuthorization,
  type ProbeConfig,
  type ProbeState,
  type TokenResponse,
} from "../../prototypes/gmail-oauth/session";
const fakeToken = "__VM_SECRET_TEST__-synthetic-token";
const config: ProbeConfig = {
  enabled: true,
  clientId: "123456789-fictif.apps.googleusercontent.com",
  expectedOrigin: "https://alisurvinted-lgtm.github.io",
  personalModeConfirmed: true,
  securityReviewConfirmed: true,
};
function setup(patch: Partial<ProbeConfig> = {}) {
  let handlers!: Parameters<GoogleAuthorization["initTokenClient"]>[0];
  let revokeDone!: Parameters<GoogleAuthorization["revoke"]>[1];
  const requestAccessToken = vi.fn();
  const sdk: GoogleAuthorization = {
    initTokenClient: vi.fn((c) => {
      handlers = c;
      return { requestAccessToken };
    }),
    revoke: vi.fn((_token, cb) => {
      revokeDone = cb;
    }),
  };
  const states: ProbeState[] = [];
  const dependencies = {
    origin: config.expectedOrigin,
    secure: true,
    loadGoogle: vi.fn(async () => sdk),
    checkAccess: vi.fn(async () => {}),
    notify: (s: ProbeState) => states.push(s),
  };
  const probe = createProbe({ ...config, ...patch }, dependencies);
  const respond = (patch: TokenResponse = {}) =>
    handlers.callback({
      access_token: fakeToken,
      scope: GMAIL_SCOPE,
      token_type: "Bearer",
      expires_in: 3600,
      ...patch,
    });
  async function connected() {
    await probe.prepare(true);
    probe.connect(true);
    respond();
  }
  return {
    probe,
    dependencies,
    sdk,
    states,
    requestAccessToken,
    respond,
    connected,
    get handlers() {
      return handlers;
    },
    finishRevoke: (success: boolean) => revokeDone({ successful: success }),
  };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe("Prototype Gmail en mémoire uniquement", () => {
  it.each([
    { enabled: false },
    { clientId: "" },
    { personalModeConfirmed: false },
    { securityReviewConfirmed: false },
    { expectedOrigin: "https://autre.example" },
    { clientId: "javascript:invalide" },
  ])(
    "reste inactif et ne charge pas Google si un verrou est absent : %j",
    async (patch) => {
      const x = setup(patch);
      await x.probe.prepare(true);
      x.probe.connect(true);
      await x.probe.check();
      x.probe.revoke();
      expect(x.probe.snapshot().notice).toBe("disabled");
      expect(x.dependencies.loadGoogle).not.toHaveBeenCalled();
      expect(x.dependencies.checkAccess).not.toHaveBeenCalled();
    },
  );
  it("rejette une origine différente et un contexte non sécurisé", async () => {
    for (const patch of [
      { origin: "https://attaquant.example" },
      { secure: false },
    ]) {
      const x = setup();
      const probe = createProbe(config, { ...x.dependencies, ...patch });
      await probe.prepare(true);
      expect(probe.snapshot().notice).toBe("disabled");
      expect(x.dependencies.loadGoogle).not.toHaveBeenCalled();
    }
  });
  it("exige un accord explicite et deux gestes sans ouverture asynchrone de fenêtre", async () => {
    const x = setup();
    await x.probe.prepare(false);
    expect(x.dependencies.loadGoogle).not.toHaveBeenCalled();
    await x.probe.prepare(true);
    expect(x.requestAccessToken).not.toHaveBeenCalled();
    x.probe.connect(false);
    expect(x.requestAccessToken).not.toHaveBeenCalled();
    x.probe.connect(true);
    expect(x.requestAccessToken).toHaveBeenCalledExactlyOnceWith({
      prompt: "select_account consent",
    });
    expect(x.handlers.scope).toBe(GMAIL_SCOPE);
    expect(x.handlers.include_granted_scopes).toBe(false);
    expect(x.probe.snapshot().notice).toBe("authorizing");
  });
  it("ne lit aucun message automatiquement, et ne publie jamais le jeton dans un état", async () => {
    const x = setup();
    await x.connected();
    expect(x.dependencies.checkAccess).not.toHaveBeenCalled();
    await x.probe.check();
    expect(x.probe.snapshot().notice).toBe("verified");
    expect(x.dependencies.checkAccess).toHaveBeenCalledExactlyOnceWith(
      fakeToken,
      expect.any(AbortSignal),
    );
    expect(JSON.stringify(x.states)).not.toContain(fakeToken);
    expect(Object.keys(x.probe.snapshot()).sort()).toEqual([
      "busy",
      "connected",
      "notice",
      "ready",
    ]);
  });
  it.each([
    { scope: "" },
    { scope: 42 },
    { scope: GMAIL_SCOPE + " openid" },
    { access_token: "" },
    { access_token: "interdit\r\nHeader: contenu" },
    { expires_in: 0 },
    { expires_in: Infinity },
    { expires_in: "NaN" },
    { expires_in: 86401 },
    { token_type: "Autre" },
    { token_type: 42 },
  ])(
    "refuse une réponse invalide sans exposer son contenu : %j",
    async (response) => {
      const x = setup();
      await x.probe.prepare(true);
      x.probe.connect(true);
      x.respond(response);
      expect(x.probe.snapshot().connected).toBe(false);
      await x.probe.check();
      expect(x.dependencies.checkAccess).not.toHaveBeenCalled();
      expect(JSON.stringify(x.states)).not.toContain(fakeToken);
    },
  );
  it("gère refus, fermeture de fenêtre et absence de réponse sans journaliser les erreurs", async () => {
    const x = setup();
    await x.probe.prepare(true);
    x.probe.connect(true);
    x.respond({ error: "access_denied" });
    expect(x.probe.snapshot().notice).toBe("denied");
    x.probe.connect(true);
    x.handlers.error_callback({ type: "popup_failed_to_open" });
    expect(x.probe.snapshot().notice).toBe("popup");
    x.probe.connect(true);
    await vi.advanceTimersByTimeAsync(180_000);
    expect(x.probe.snapshot().notice).toBe("popup");
  });
  it("ignore une réponse arrivée après annulation ou déconnexion", async () => {
    const x = setup();
    await x.probe.prepare(true);
    x.probe.connect(true);
    x.probe.disconnect();
    x.respond();
    expect(x.probe.snapshot().connected).toBe(false);
    await x.probe.check();
    expect(x.dependencies.checkAccess).not.toHaveBeenCalled();
  });
  it("ne permet pas à une ancienne fenêtre de reconnecter une session plus récente", async () => {
    const x = setup();
    await x.probe.prepare(true);
    x.probe.connect(true);
    const old = x.handlers;
    x.probe.disconnect();
    x.probe.connect(true);
    old.callback({
      access_token: fakeToken,
      scope: GMAIL_SCOPE,
      expires_in: 3600,
      token_type: "Bearer",
    });
    expect(x.probe.snapshot().notice).toBe("authorizing");
    expect(x.probe.snapshot().connected).toBe(false);
    x.respond();
    expect(x.probe.snapshot().connected).toBe(true);
  });
  it("efface le jeton à l’expiration et annule un accès en cours", async () => {
    const x = setup();
    await x.connected();
    x.dependencies.checkAccess.mockImplementationOnce(
      (_token?: string, _signal?: AbortSignal) => new Promise<void>(() => {}),
    );
    void x.probe.check();
    const signal = x.dependencies.checkAccess.mock.calls[0][1];
    x.probe.disconnect();
    expect(signal.aborted).toBe(true);
    expect(x.probe.snapshot().connected).toBe(false);
    x.probe.connect(true);
    x.respond({ expires_in: 1 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(x.probe.snapshot().notice).toBe("expired");
    expect(x.probe.snapshot().connected).toBe(false);
  });
  it("annule la préparation quand la page est quittée", async () => {
    const x = setup();
    let resolve!: (sdk: GoogleAuthorization) => void;
    x.dependencies.loadGoogle.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const preparing = x.probe.prepare(true);
    x.probe.disconnect();
    resolve(x.sdk);
    await preparing;
    expect(x.probe.snapshot().connected).toBe(false);
    expect(x.probe.snapshot().ready).toBe(false);
  });
  it("traite les exceptions réseau sans montrer une donnée privée dans les erreurs", async () => {
    const x = setup();
    await x.connected();
    x.dependencies.checkAccess.mockRejectedValueOnce(new Error(fakeToken));
    await x.probe.check();
    expect(x.probe.snapshot().notice).toBe("failed");
    expect(x.probe.snapshot().connected).toBe(false);
    expect(JSON.stringify(x.states)).not.toContain(fakeToken);
  });
  it("révoque chez Google, efface immédiatement le jeton et exige une confirmation de réussite", async () => {
    const x = setup();
    await x.connected();
    x.probe.revoke();
    expect(x.sdk.revoke).toHaveBeenCalledWith(fakeToken, expect.any(Function));
    expect(x.probe.snapshot().connected).toBe(false);
    expect(x.probe.snapshot().notice).toBe("revoking");
    x.finishRevoke(true);
    expect(x.probe.snapshot().notice).toBe("revoked");
  });
  it.each(["error", "timeout"])(
    "ne prétend pas avoir révoqué en cas de %s",
    async (mode) => {
      const x = setup();
      await x.connected();
      x.probe.revoke();
      if (mode === "error") x.finishRevoke(false);
      else await vi.advanceTimersByTimeAsync(20_000);
      expect(x.probe.snapshot().notice).toBe("revokeFailed");
      expect(x.probe.snapshot().connected).toBe(false);
    },
  );
  it("ne confond pas déconnexion et révocation", async () => {
    const x = setup();
    await x.connected();
    x.probe.disconnect();
    expect(x.sdk.revoke).not.toHaveBeenCalled();
    expect(x.probe.snapshot().notice).toBe("disconnected");
    x.probe.revoke();
    expect(x.sdk.revoke).not.toHaveBeenCalled();
  });
  it("lie la configuration au client public et au mode personnel confirmés par le propriétaire", async () => {
    const real = (await import("../../prototypes/gmail-oauth/config.json"))
      .default;
    expect(real.clientId).toBe(
      "210373554820-k53i9niec2drhtj7t27m3r7lcfbo3lhn.apps.googleusercontent.com",
    );
    expect(real.personalModeConfirmed).toBe(true);
    expect(real.expectedOrigin).toBe(config.expectedOrigin);
    expect(isApproved({ ...real, securityReviewConfirmed: false })).toBe(false);
  });
});

describe("Aperçu Gmail temporaire", () => {
  function batch(cursor: string | null = null, id = "a1") {
    return {
      month: "2026-01",
      rows: [],
      seenIds: [id],
      nextPageToken: cursor,
      examined: 1,
      ignored: 0,
      limited: false,
    };
  }
  it("n’accède aux messages que sur demande, après connexion, sans révéler le jeton dans l’état", async () => {
    const x = setup();
    const reader = vi.fn(async () => batch());
    const display = vi.fn();
    Object.assign(x.dependencies, {
      readPreview: reader,
      notifyPreview: display,
    });
    await x.probe.preview("2026-01");
    expect(reader).not.toHaveBeenCalled();
    await x.connected();
    expect(reader).not.toHaveBeenCalled();
    await x.probe.preview("2026-01");
    expect(reader).toHaveBeenCalledWith(
      fakeToken,
      { month: "2026-01" },
      expect.any(AbortSignal),
    );
    expect(x.probe.snapshot().notice).toBe("previewReady");
    expect(display).toHaveBeenLastCalledWith(batch(), false);
    expect(JSON.stringify(x.states)).not.toContain(fakeToken);
    x.probe.disconnect();
    expect(display).toHaveBeenLastCalledWith(null, false);
  });
  it("transmet la pagination et les identifiants déjà vus, et refuse de changer de mois en chargeant la suite", async () => {
    const x = setup();
    const reader = vi.fn(async () => batch("curseur"));
    Object.assign(x.dependencies, { readPreview: reader });
    await x.connected();
    await x.probe.preview("2026-01");
    await x.probe.preview("2025-12", true);
    expect(reader).toHaveBeenCalledTimes(1);
    await x.probe.preview("2026-01", true);
    expect(reader).toHaveBeenLastCalledWith(
      fakeToken,
      { month: "2026-01", pageToken: "curseur", seenIds: ["a1"] },
      expect.any(AbortSignal),
    );
  });
  it("ignore et efface un résultat arrivé après déconnexion ou révocation", async () => {
    for (const action of ["disconnect", "revoke"] as const) {
      const x = setup();
      let finish!: (b: ReturnType<typeof batch>) => void;
      const reader = vi.fn(
        () =>
          new Promise<ReturnType<typeof batch>>((r) => {
            finish = r;
          }),
      );
      const display = vi.fn();
      Object.assign(x.dependencies, {
        readPreview: reader,
        notifyPreview: display,
      });
      await x.connected();
      const pending = x.probe.preview("2026-01");
      // La déconnexion est aussi l’annulation explicite d’une recherche en cours.
      if (action === "disconnect") x.probe.disconnect();
      else {
        x.probe.disconnect();
        x.probe.connect(true);
        x.respond();
        x.probe.revoke();
      }
      finish(batch());
      await pending;
      expect(display).toHaveBeenLastCalledWith(null, false);
      expect(x.probe.snapshot().connected).toBe(false);
    }
  });
  it("efface l’aperçu, annule le réseau et refuse un retour tardif à l’expiration", async () => {
    const x = setup();
    let finish!: (b: ReturnType<typeof batch>) => void;
    const reader = vi.fn(
      (_t: string, _input: unknown, _signal: AbortSignal) =>
        new Promise<ReturnType<typeof batch>>((r) => {
          finish = r;
        }),
    );
    const display = vi.fn();
    Object.assign(x.dependencies, {
      readPreview: reader,
      notifyPreview: display,
    });
    await x.probe.prepare(true);
    x.probe.connect(true);
    x.respond({ expires_in: 1 });
    const pending = x.probe.preview("2026-01");
    await vi.advanceTimersByTimeAsync(1000);
    expect(reader.mock.calls[0][2].aborted).toBe(true);
    finish(batch());
    await pending;
    expect(x.probe.snapshot().notice).toBe("expired");
    expect(display).toHaveBeenLastCalledWith(null, false);
  });
  it("ne garde aucun résultat après une erreur ou un délai dépassé", async () => {
    const x = setup();
    const display = vi.fn();
    const reader = vi.fn(async () => {
      throw new Error(fakeToken);
    });
    Object.assign(x.dependencies, {
      readPreview: reader,
      notifyPreview: display,
    });
    await x.connected();
    await x.probe.preview("2026-01");
    expect(x.probe.snapshot().notice).toBe("previewFailed");
    expect(display).toHaveBeenLastCalledWith(null, false);
    expect(JSON.stringify(x.states)).not.toContain(fakeToken);
    let finish!: (b: ReturnType<typeof batch>) => void;
    reader.mockImplementationOnce(
      () =>
        new Promise((r) => {
          finish = r;
        }),
    );
    x.probe.connect(true);
    x.respond();
    const pending = x.probe.preview("2026-01");
    await vi.advanceTimersByTimeAsync(60_000);
    finish(batch());
    await pending;
    expect(x.probe.snapshot().notice).toBe("previewFailed");
    expect(display).toHaveBeenLastCalledWith(null, false);
  });
  it("permet d’effacer les résultats sans révoquer le consentement ou enregistrer une transaction", async () => {
    const x = setup();
    const display = vi.fn();
    Object.assign(x.dependencies, {
      readPreview: vi.fn(async () => batch()),
      notifyPreview: display,
    });
    await x.connected();
    await x.probe.preview("2026-01");
    x.probe.forgetPreview();
    expect(display).toHaveBeenLastCalledWith(null, false);
    expect(x.probe.snapshot().connected).toBe(true);
    expect(x.sdk.revoke).not.toHaveBeenCalled();
  });
});
