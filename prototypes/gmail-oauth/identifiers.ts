import { digest, type ImportKind, KINDS } from "../../protocols/gmail-transfer";
import config from "./config.json";
export const sourceKey = (id: string) =>
  digest(`gmail-personnel:${config.clientId}:${id}`);
export const stageKey = (kind: ImportKind, reference: string) =>
  digest(`gmail-personnel:${config.clientId}:${kind}:${reference}`);
export const referenceKey = (reference: string) =>
  digest(`vinted-reference:${config.clientId}:${reference}`);
export async function relatedKeys(reference: string) {
  return Object.fromEntries(
    await Promise.all(
      KINDS.map(async (kind) => [kind, await stageKey(kind, reference)]),
    ),
  ) as Record<ImportKind, string>;
}
