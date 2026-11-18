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
// Un seul point d’accès fixe, sans adresse personnelle, liste de messages, corps ou pièce jointe.
export async function checkAccess(
  token: string,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch(GMAIL_PROBE_URL, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    credentials: "omit",
    cache: "no-store",
    redirect: "error",
    referrerPolicy: "no-referrer",
    signal,
  });
  if (
    !response.ok ||
    !response.headers.get("content-type")?.includes("application/json")
  )
    throw new Error("Accès Gmail non confirmé.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Accès Gmail non confirmé.");
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 1024) throw new Error("Réponse Gmail invalide.");
      parts.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const part of parts) {
    buffer.set(part, offset);
    offset += part.byteLength;
  }
  try {
    const profile: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(buffer),
    );
    if (
      !profile ||
      typeof profile !== "object" ||
      Array.isArray(profile) ||
      Object.keys(profile).join() !== "historyId" ||
      typeof (profile as { historyId?: unknown }).historyId !== "string" ||
      !/^\d{1,30}$/.test((profile as { historyId: string }).historyId)
    )
      throw new Error();
  } catch {
    throw new Error("Réponse Gmail invalide.");
  } finally {
    buffer.fill(0);
    for (const part of parts) part.fill(0);
  }
}
