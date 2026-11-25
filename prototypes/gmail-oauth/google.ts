import { gmailRead, record } from "./gmail-api";
import type { GoogleAuthorization } from "./session";
export const GOOGLE_LIBRARY = "https://accounts.google.com/gsi/client";
export const GMAIL_PROBE_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/profile?fields=historyId";
type GoogleWindow = Window & {
  google?: { accounts?: { oauth2?: GoogleAuthorization } };
};
let loading: Promise<GoogleAuthorization> | undefined;
export function loadGoogle(): Promise<GoogleAuthorization> {
  const sdk = (window as GoogleWindow).google?.accounts?.oauth2;
  if (
    typeof sdk?.initTokenClient === "function" &&
    typeof sdk.revoke === "function"
  )
    return Promise.resolve(sdk);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GOOGLE_LIBRARY;
    script.async = true;
    script.referrerPolicy = "no-referrer";
    const finish = (success: boolean) => {
      clearTimeout(timeout);
      script.onload = null;
      script.onerror = null;
      const loaded = (window as GoogleWindow).google?.accounts?.oauth2;
      if (
        success &&
        typeof loaded?.initTokenClient === "function" &&
        typeof loaded.revoke === "function"
      )
        resolve(loaded);
      else {
        script.remove();
        loading = undefined;
        reject(new Error("Connexion Google indisponible."));
      }
    };
    const timeout = setTimeout(() => finish(false), 20_000);
    script.onload = () => finish(true);
    script.onerror = () => finish(false);
    document.head.append(script);
  });
  return loading;
}
// Ce contrôle conserve le périmètre de la phase 1 : aucun message demandé.
export async function checkAccess(
  token: string,
  signal: AbortSignal,
): Promise<void> {
  const profile = await gmailRead(
    "profile",
    new URLSearchParams({ fields: "historyId" }),
    token,
    signal,
    1024,
  );
  if (
    !record(profile) ||
    Object.keys(profile).join() !== "historyId" ||
    typeof profile.historyId !== "string" ||
    !/^\d{1,30}$/.test(profile.historyId)
  )
    throw new Error("Réponse Gmail invalide.");
}
