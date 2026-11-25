import { sourceKey } from "./identifiers";
import { subjectType } from "./analyze";
import { boundedText, GmailReadError, gmailRead, record } from "./gmail-api";
import {
  decodeMailHeader,
  isAuthenticated,
  isFrenchVintedSender,
  messageText,
  messageEvidence,
  onlyHeader,
  readHeaders,
} from "./mail-content";
import { monthBounds, proposedRow, type PreviewBatch } from "./preview-model";
export const PREVIEW_PAGE_SIZE = 20;
export const PREVIEW_MAX_MESSAGES = 200;
export interface PreviewRequest {
  month: string;
  pageToken?: string;
  seenIds?: readonly string[];
  knownSourceKeys?: readonly string[];
}
const headerNames = ["From", "Subject", "Authentication-Results"];
const metadataFields = "id,internalDate,payload(headers),labelIds";
const bodyFields =
  "id,payload(mimeType,filename,body(data,size),parts(mimeType,filename,body(data,size),parts(mimeType,filename,body(data,size),parts(mimeType,filename,body(data,size),parts(mimeType,filename,body(data,size))))))";
export async function readPreview(
  token: string,
  input: PreviewRequest,
  signal: AbortSignal,
): Promise<PreviewBatch> {
  const { start, end } = monthBounds(input.month);
  if (
    input.pageToken !== undefined &&
    (!input.pageToken || input.pageToken.length > 2048)
  )
    throw new Error("Pagination Gmail invalide.");
  const known = new Set(input.seenIds ?? []);
  if (known.size >= PREVIEW_MAX_MESSAGES)
    throw new Error("Limite de l’aperçu atteinte.");
  const maxResults = Math.min(
    PREVIEW_PAGE_SIZE,
    PREVIEW_MAX_MESSAGES - known.size,
  );
  const query = `from:(@vinted.fr) after:${Math.floor(start / 1000) - 1} before:${Math.floor(end / 1000)} -in:spam -in:trash`;
  const params = new URLSearchParams({
    q: query,
    maxResults: String(maxResults),
    includeSpamTrash: "false",
    fields: "messages(id),nextPageToken",
  });
  if (input.pageToken) params.set("pageToken", input.pageToken);
  const listing = await gmailRead("messages", params, token, signal, 32768);
  if (
    !record(listing) ||
    (listing.messages !== undefined &&
      (!Array.isArray(listing.messages) ||
        listing.messages.length > maxResults))
  )
    throw new Error("Liste Gmail invalide.");
  const ids: string[] = [];
  for (const value of (listing.messages ?? []) as unknown[]) {
    if (
      !record(value) ||
      typeof value.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(value.id)
    )
      throw new Error("Identifiant Gmail invalide.");
    if (!known.has(value.id)) {
      known.add(value.id);
      ids.push(value.id);
    }
  }
  const rows: PreviewBatch["rows"] = [];
  let ignored = 0;
  let alreadyKnown = 0;
  const knownSources = new Set(input.knownSourceKeys ?? []);
  // Séquentiel et borné : aucune synchronisation permanente ni relance automatique.
  for (const id of ids) {
    signal.throwIfAborted();
    if (knownSources.has(await sourceKey(id))) {
      alreadyKnown++;
      continue;
    }
    const metadataParams = new URLSearchParams({
      format: "metadata",
      fields: metadataFields,
    });
    for (const h of headerNames) metadataParams.append("metadataHeaders", h);
    const metadata = await gmailRead(
      "messages/" + id,
      metadataParams,
      token,
      signal,
      32768,
    );
    if (
      !record(metadata) ||
      metadata.id !== id ||
      typeof metadata.internalDate !== "string" ||
      !/^\d{1,16}$/.test(metadata.internalDate)
    ) {
      ignored++;
      continue;
    }
    const timestamp = Number(metadata.internalDate);
    if (
      !Number.isSafeInteger(timestamp) ||
      timestamp < start ||
      timestamp >= end ||
      (Array.isArray(metadata.labelIds) &&
        metadata.labelIds.some((l) => l === "SPAM" || l === "TRASH"))
    ) {
      ignored++;
      continue;
    }
    const headers = readHeaders(metadata.payload);
    if (!isFrenchVintedSender(onlyHeader(headers, "from"))) {
      ignored++;
      continue;
    }
    const subject =
      decodeMailHeader(boundedText(onlyHeader(headers, "subject"), 8192))
        .slice(0, 512)
        .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "") ||
      "Notification sans objet";
    if (subjectType(subject) === null) {
      ignored++;
      continue;
    }
    const authenticated = isAuthenticated(headers);
    let evidence: { names: string[]; references: string[] } | undefined;
    let text = "",
      warning: string | null = null;
    if (!authenticated)
      warning =
        "Authentification de l’expéditeur non confirmée. Le contenu n’a pas été chargé ; vérifiez dans Gmail.";
    else if (subjectType(subject) === null)
      warning =
        "Objet non reconnu comme transaction. Le contenu n’a pas été chargé ; vérifiez dans Gmail.";
    else {
      try {
        const content = await gmailRead(
          "messages/" + id,
          new URLSearchParams({ format: "full", fields: bodyFields }),
          token,
          signal,
        );
        if (!record(content) || content.id !== id)
          throw new Error("Message inattendu.");
        text = messageText(content.payload);
        evidence = messageEvidence(content.payload);
        if (!text)
          warning = "Aucun texte exploitable. Consultez le message dans Gmail.";
      } catch (error) {
        if (
          signal.aborted ||
          (error instanceof GmailReadError && error.reason === "access")
        )
          throw error;
        warning =
          "Contenu trop volumineux ou non pris en charge. Aucune information n’a été devinée.";
      }
    }
    rows.push(
      proposedRow(
        id,
        subject,
        new Date(timestamp).toISOString(),
        authenticated,
        text,
        warning,
        evidence,
      ),
    );
  }
  const next = listing.nextPageToken;
  if (
    next !== undefined &&
    (typeof next !== "string" || !next || next.length > 2048)
  )
    throw new Error("Pagination Gmail invalide.");
  if (input.pageToken && next === input.pageToken)
    throw new Error("Pagination Gmail répétée.");
  if (input.pageToken && ids.length === 0 && next)
    throw new Error("Pagination sans nouveau message.");
  return {
    month: input.month,
    rows,
    seenIds: [...known],
    limited: known.size >= PREVIEW_MAX_MESSAGES && typeof next === "string",
    nextPageToken: typeof next === "string" ? next : null,
    examined: ids.length,
    ignored,
    alreadyKnown,
    complete: !next,
  };
}
