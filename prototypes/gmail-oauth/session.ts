import type { PreviewBatch } from "./preview-model";
import type { PreviewRequest } from "./preview";
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export interface ProbeConfig {
  enabled: boolean;
  clientId: string;
  expectedOrigin: string;
  personalModeConfirmed: boolean;
  securityReviewConfirmed: boolean;
}
export function isApproved(config: ProbeConfig): boolean {
  return (
    config.enabled === true &&
    config.personalModeConfirmed === true &&
    config.securityReviewConfirmed === true &&
    /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(config.clientId) &&
    config.expectedOrigin === "https://alisurvinted-lgtm.github.io"
  );
}
export interface TokenResponse {
  access_token?: unknown;
  expires_in?: unknown;
  token_type?: unknown;
  scope?: unknown;
  error?: unknown;
}
export interface GoogleAuthorization {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    include_granted_scopes: false;
    callback: (response: TokenResponse) => void;
    error_callback: (error: { type?: string }) => void;
  }): {
    requestAccessToken(options: { prompt: "select_account consent" }): void;
  };
  revoke(
    token: string,
    callback: (response: { successful?: boolean }) => void,
  ): void;
}
export const messages = {
  disabled: "Configuration en attente. Aucune connexion Google n’est activée.",
  idle: "Préparez le test, puis connectez-vous à Google.",
  preparing: "Préparation de la connexion Google…",
  ready: "Prêt. Touchez Se connecter à Google pour ouvrir l’autorisation.",
  authorizing:
    "Terminez l’autorisation dans la fenêtre Google. Vous pouvez annuler ici.",
  connected:
    "Autorisation reçue en mémoire. La recherche se fait uniquement à votre demande.",
  checking: "Vérification de l’accès à Gmail, sans lecture de message…",
  verified:
    "Accès Gmail en lecture seule confirmé. Les notifications sont lues uniquement à votre demande.",
  previewing:
    "Lecture des notifications Vinted en cours… Vous pouvez arrêter en vous déconnectant.",
  previewReady:
    "Aperçu prêt à vérifier. Aucun article n’a été créé ni modifié.",
  previewFailed:
    "La recherche n’a pas abouti. L’aperçu a été effacé. Reconnectez-vous et réessayez ; votre comptabilité reste inchangée.",
  revoking: "Révocation demandée à Google…",
  revoked:
    "Google a confirmé la révocation. La déconnexion locale est terminée.",
  disconnected:
    "Déconnecté de ce test. L’autorisation Google reste à révoquer séparément.",
  expired:
    "L’autorisation temporaire a expiré. Reconnectez-vous pour reprendre le test.",
  denied: "Autorisation refusée. Aucune donnée Gmail n’a été consultée.",
  popup:
    "La fenêtre Google a été fermée ou bloquée. Réessayez depuis le bouton de connexion.",
  scope:
    "Les droits reçus ne correspondent pas à ce test. Déconnectez cette application depuis votre compte Google.",
  failed: "Le test n’a pas abouti. Aucune donnée comptable n’a été modifiée.",
  revokeFailed:
    "La révocation n’est pas confirmée. L’accès local a été effacé ; retirez aussi l’autorisation depuis votre compte Google.",
} as const;
export type Notice = keyof typeof messages;
export type ProbeState = Readonly<{
  notice: Notice;
  connected: boolean;
  ready: boolean;
  busy: boolean;
}>;
export interface ProbeDependencies {
  origin: string;
  secure: boolean;
  loadGoogle: () => Promise<GoogleAuthorization>;
  checkAccess: (token: string, signal: AbortSignal) => Promise<void>;
  notify: (state: ProbeState) => void;
  readPreview?: (
    token: string,
    input: PreviewRequest,
    signal: AbortSignal,
  ) => Promise<PreviewBatch>;
  notifyPreview?: (batch: PreviewBatch | null, append: boolean) => void;
}
// Seule cette fermeture conserve temporairement le jeton. Les états publics ne le contiennent jamais.
export function createProbe(config: ProbeConfig, deps: ProbeDependencies) {
  const allowed =
    isApproved(config) && deps.secure && deps.origin === config.expectedOrigin;
  let google: GoogleAuthorization | undefined;
  let credential: string | undefined;
  let generation = 0;
  let expiresAt = 0;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let request: AbortController | undefined;
  let previewMonth = "";
  let nextPageToken: string | null = null;
  let seenIds: string[] = [];
  let state: ProbeState = Object.freeze({
    notice: allowed ? "idle" : "disabled",
    connected: false,
    ready: false,
    busy: false,
  });
  function publish(notice: Notice, busy = false) {
    state = Object.freeze({
      notice,
      connected: !!credential,
      ready: !!google,
      busy,
    });
    deps.notify(state);
  }
  function forgetPreview() {
    previewMonth = "";
    nextPageToken = null;
    seenIds = [];
    deps.notifyPreview?.(null, false);
  }
  function clear() {
    generation++;
    forgetPreview();
    credential = undefined;
    expiresAt = 0;
    clearTimeout(expiry);
    clearTimeout(watchdog);
    expiry = undefined;
    watchdog = undefined;
    request?.abort();
    request = undefined;
  }
  function disconnect() {
    clear();
    publish(allowed ? "disconnected" : "disabled");
  }
  return {
    snapshot: () => state,
    async prepare(accepted: boolean) {
      if (!allowed || !accepted || state.busy || credential || google) return;
      const attempt = ++generation;
      publish("preparing", true);
      try {
        const sdk = await deps.loadGoogle();
        if (attempt !== generation) return;
        google = sdk;
        publish("ready");
      } catch {
        if (attempt === generation) publish("failed");
      }
    },
    // Appel synchrone depuis un geste utilisateur : aucun await avant la fenêtre OAuth.
    connect(accepted: boolean) {
      if (!allowed || !accepted || !google || state.busy || credential) return;
      clear();
      const attempt = generation;
      publish("authorizing", true);
      watchdog = setTimeout(() => {
        if (attempt !== generation) return;
        clear();
        publish("popup");
      }, 180_000);
      try {
        const client = google.initTokenClient({
          client_id: config.clientId,
          scope: GMAIL_SCOPE,
          include_granted_scopes: false,
          callback(response) {
            if (attempt !== generation || state.notice !== "authorizing")
              return;
            clearTimeout(watchdog);
            if (!response || typeof response !== "object") {
              clear();
              publish("failed");
              return;
            }
            if (response.error) {
              clear();
              publish(response.error === "access_denied" ? "denied" : "failed");
              return;
            }
            const lifetime =
              typeof response.expires_in === "number" ||
              (typeof response.expires_in === "string" &&
                /^\d+$/.test(response.expires_in))
                ? Number(response.expires_in)
                : NaN;
            const scopes =
              typeof response.scope === "string"
                ? response.scope.trim().split(/\s+/)
                : [];
            if (scopes?.length !== 1 || scopes[0] !== GMAIL_SCOPE) {
              clear();
              publish("scope");
              return;
            }
            if (
              typeof response.access_token !== "string" ||
              !/^[\x21-\x7e]{1,8192}$/.test(response.access_token) ||
              typeof response.token_type !== "string" ||
              response.token_type.toLowerCase() !== "bearer" ||
              !Number.isSafeInteger(lifetime) ||
              lifetime <= 0 ||
              lifetime > 86_400
            ) {
              clear();
              publish("failed");
              return;
            }
            credential = response.access_token;
            expiresAt = Date.now() + lifetime * 1000;
            expiry = setTimeout(() => {
              if (attempt !== generation) return;
              clear();
              publish("expired");
            }, lifetime * 1000);
            publish("connected");
          },
          error_callback() {
            if (attempt !== generation || state.notice !== "authorizing")
              return;
            clear();
            publish("popup");
          },
        });
        client.requestAccessToken({ prompt: "select_account consent" });
      } catch {
        if (attempt !== generation) return;
        clear();
        publish("failed");
      }
    },
    async check() {
      if (!allowed || !credential || state.busy) return;
      if (Date.now() >= expiresAt) {
        clear();
        publish("expired");
        return;
      }
      const attempt = generation;
      request = new AbortController();
      const active = request;
      publish("checking", true);
      watchdog = setTimeout(() => active.abort(), 20_000);
      try {
        await deps.checkAccess(credential, active.signal);
        if (attempt === generation) publish("verified");
      } catch {
        if (attempt !== generation) return;
        clear();
        publish("failed");
      } finally {
        if (attempt === generation) {
          clearTimeout(watchdog);
          request = undefined;
        }
      }
    },
    async preview(month: string, append = false) {
      if (!allowed || !credential || state.busy || !deps.readPreview) return;
      if (Date.now() >= expiresAt) {
        clear();
        publish("expired");
        return;
      }
      if (append && (month !== previewMonth || !nextPageToken)) return;
      const input: PreviewRequest = append
        ? { month, pageToken: nextPageToken!, seenIds }
        : { month };
      if (!append) forgetPreview();
      const attempt = generation;
      request = new AbortController();
      const active = request;
      publish("previewing", true);
      watchdog = setTimeout(() => {
        if (attempt === generation) {
          clear();
          publish("previewFailed");
        }
      }, 60_000);
      try {
        const batch = await deps.readPreview(credential, input, active.signal);
        if (attempt !== generation || active.signal.aborted) return;
        previewMonth = batch.month;
        nextPageToken = batch.nextPageToken;
        seenIds = batch.seenIds;
        deps.notifyPreview?.(batch, append);
        publish("previewReady");
      } catch {
        if (attempt !== generation) return;
        clear();
        publish("previewFailed");
      } finally {
        if (attempt === generation) {
          clearTimeout(watchdog);
          request = undefined;
        }
      }
    },
    forgetPreview() {
      if (!state.busy) {
        forgetPreview();
        publish(credential ? "connected" : allowed ? "idle" : "disabled");
      }
    },
    revoke() {
      if (!allowed || !google || !credential || state.busy) return;
      if (Date.now() >= expiresAt) {
        clear();
        publish("expired");
        return;
      }
      let pending: string | undefined = credential;
      clear();
      const attempt = generation;
      publish("revoking", true);
      watchdog = setTimeout(() => {
        pending = undefined;
        if (attempt !== generation) return;
        clear();
        publish("revokeFailed");
      }, 20_000);
      try {
        google.revoke(pending!, (result) => {
          pending = undefined;
          if (attempt !== generation) return;
          clear();
          publish(result?.successful === true ? "revoked" : "revokeFailed");
        });
        pending = undefined;
      } catch {
        pending = undefined;
        if (attempt !== generation) return;
        clear();
        publish("revokeFailed");
      }
    },
    disconnect,
  };
}
