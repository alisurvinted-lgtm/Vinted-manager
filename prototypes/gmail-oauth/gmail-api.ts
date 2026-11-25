const BASE = "https://gmail.googleapis.com/gmail/v1/users/me/";
export class GmailReadError extends Error {
  constructor(public readonly reason: "access" | "size" | "format") {
    super("Lecture Gmail interrompue.");
  }
}
// Seuls ces trois chemins de lecture peuvent être construits, jamais une URL de message importée.
export async function gmailRead(
  path: string,
  params: URLSearchParams,
  token: string,
  signal: AbortSignal,
  maxBytes = 524288,
): Promise<unknown> {
  if (!/^(profile|messages|messages\/[a-zA-Z0-9_-]{1,128})$/.test(path))
    throw new GmailReadError("format");
  const response = await fetch(BASE + path + "?" + params.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    credentials: "omit",
    cache: "no-store",
    redirect: "error",
    referrerPolicy: "no-referrer",
    signal,
  });
  if (!response.ok) throw new GmailReadError("access");
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new GmailReadError("format");
  const reader = response.body?.getReader();
  if (!reader) throw new GmailReadError("format");
  const parts: Uint8Array[] = [];
  let length = 0;
  let joined: Uint8Array | undefined;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        value.fill(0);
        throw new GmailReadError("size");
      }
      parts.push(value);
    }
    joined = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
      joined.set(part, offset);
      offset += part.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(joined));
  } catch (error) {
    if (error instanceof GmailReadError || signal.aborted) throw error;
    throw new GmailReadError("format");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
    joined?.fill(0);
    for (const part of parts) part.fill(0);
  }
}
export const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export const boundedText = (v: unknown, max: number): string =>
  typeof v === "string" && v.length <= max ? v : "";
