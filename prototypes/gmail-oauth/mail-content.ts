import { boundedText, record } from "./gmail-api";
export interface Header {
  name: string;
  value: string;
}
export function readHeaders(payload: unknown): Header[] {
  if (
    !record(payload) ||
    !Array.isArray(payload.headers) ||
    payload.headers.length > 150
  )
    return [];
  return payload.headers.flatMap((h) =>
    record(h) && boundedText(h.name, 128) && boundedText(h.value, 16384)
      ? [
          {
            name: String(h.name).toLowerCase(),
            value: String(h.value).replace(/\r?\n[ \t]+/g, " "),
          },
        ]
      : [],
  );
}
export function onlyHeader(headers: Header[], name: string): string {
  const rows = headers.filter((h) => h.name === name);
  return rows.length === 1 ? rows[0].value : "";
}
export function isFrenchVintedSender(value: string): boolean {
  // Exact domaine : les sous-domaines, adresses multiples et domaines ressemblants sont refusés.
  const address = "[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@vinted\\.fr";
  return new RegExp(`^(?:${address}|[^<>\\r\\n]*<${address}>)$`, "i").test(
    value.trim(),
  );
}
export function isAuthenticated(headers: Header[]): boolean {
  const results = headers.filter(
    (h) =>
      h.name === "authentication-results" &&
      /^mx\.google\.com\s*;/i.test(h.value.trim()),
  );
  if (results.length !== 1) return false;
  return results[0].value.split(";").some((part) => {
    const s = part.trim();
    return (
      (/^dmarc=pass\b/i.test(s) &&
        /\bheader\.from=vinted\.fr(?:\s|$)/i.test(s)) ||
      (/^dkim=pass\b/i.test(s) &&
        /\bheader\.(?:d=vinted\.fr|i=(?:[^\s@;]+)?@vinted\.fr)(?:\s|$)/i.test(
          s,
        ))
    );
  });
}
export function decodeBase64Text(value: unknown): string {
  const data = boundedText(value, 280000);
  if (!data || !/^[a-zA-Z0-9_\-/+]*={0,2}$/.test(data))
    throw new Error("Contenu du message non pris en charge.");
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  if (normalized.length % 4 === 1)
    throw new Error("Contenu du message non pris en charge.");
  const bytes = Uint8Array.from(
    atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")),
    (c) => c.charCodeAt(0),
  );
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } finally {
    bytes.fill(0);
  }
}
export function htmlAsText(html: string): string {
  // Traitement de chaîne uniquement : aucun document HTML n’est créé, aucun élément n’est chargé.
  const chunks: string[] = [];
  let index = 0,
    skipped = "";
  while (index < html.length) {
    if (html.startsWith("<!--", index)) {
      const end = html.indexOf("-->", index + 4);
      if (end < 0) break;
      index = end + 3;
      continue;
    }
    if (html[index] === "<") {
      const end = html.indexOf(">", index + 1);
      if (end < 0) {
        if (!skipped) chunks.push(html.slice(index));
        break;
      }
      const tag = html
        .slice(index + 1, Math.min(end, index + 80))
        .trim()
        .toLowerCase();
      const name = tag.match(/^\/?([a-z0-9]+)/)?.[1] ?? "";
      if (skipped) {
        if (tag.startsWith("/") && name === skipped) skipped = "";
      } else if (
        ["script", "style", "head"].includes(name) &&
        !tag.startsWith("/")
      )
        skipped = name;
      else
        chunks.push(
          name === "br" ||
            (tag.startsWith("/") &&
              [
                "p",
                "div",
                "li",
                "tr",
                "td",
                "th",
                "table",
                "h1",
                "h2",
                "h3",
              ].includes(name))
            ? "\n"
            : " ",
        );
      index = end + 1;
    } else {
      const next = html.indexOf("<", index);
      if (!skipped)
        chunks.push(html.slice(index, next < 0 ? html.length : next));
      index = next < 0 ? html.length : next;
    }
  }
  return chunks
    .join("")
    .replace(
      /&(#x[0-9a-f]{1,6}|#\d{1,7}|amp|lt|gt|quot|apos|nbsp|euro);/gi,
      (all, key: string) => {
        const names: Record<string, string> = {
          amp: "&",
          lt: "<",
          gt: ">",
          quot: '"',
          apos: "'",
          nbsp: " ",
          euro: "€",
        };
        const lower = key.toLowerCase();
        if (names[lower]) return names[lower];
        const number = lower.startsWith("#x")
          ? parseInt(lower.slice(2), 16)
          : Number(lower.slice(1));
        return number > 0 &&
          number <= 0x10ffff &&
          !(number >= 0xd800 && number <= 0xdfff)
          ? String.fromCodePoint(number)
          : all;
      },
    );
}
export function messageText(payload: unknown): string {
  const plain: string[] = [],
    html: string[] = [];
  let visited = 0;
  function walk(part: unknown, depth: number) {
    if (!record(part) || depth > 8 || ++visited > 120)
      throw new Error("Structure de message non prise en charge.");
    if (boundedText(part.filename, 1024)) return;
    const type = boundedText(part.mimeType, 128).toLowerCase();
    if (
      (type === "text/plain" || type === "text/html") &&
      record(part.body) &&
      part.body.data
    ) {
      const decoded = decodeBase64Text(part.body.data);
      (type === "text/plain" ? plain : html).push(
        type === "text/html" ? htmlAsText(decoded) : decoded,
      );
    }
    if (part.parts !== undefined) {
      if (!Array.isArray(part.parts) || part.parts.length > 100)
        throw new Error("Structure de message non prise en charge.");
      for (const child of part.parts) walk(child, depth + 1);
    }
  }
  walk(payload, 0);
  const text = (plain.length ? plain : html).join("\n");
  if (text.length > 200000) throw new Error("Message trop volumineux.");
  return text
    .replace(
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,
      "",
    )
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function decodeMailHeader(value: string): string {
  const allowed = new Set([
    "utf-8",
    "utf8",
    "us-ascii",
    "iso-8859-1",
    "windows-1252",
  ]);
  return value
    .replace(/(\?=)[ \t]+(?==\?)/g, "$1")
    .replace(
      /=\?([a-zA-Z0-9-]{1,32})\?([bq])\?([^?]{1,4096})\?=/gi,
      (original, charset: string, encoding: string, data: string) => {
        if (!allowed.has(charset.toLowerCase())) return original;
        let bytes: Uint8Array | undefined;
        try {
          if (encoding.toLowerCase() === "b") {
            if (!/^[a-zA-Z0-9+/]*={0,2}$/.test(data)) return original;
            bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
          } else {
            const raw: number[] = [];
            for (let i = 0; i < data.length; i++) {
              if (data[i] === "=") {
                if (!/^[a-fA-F0-9]{2}$/.test(data.slice(i + 1, i + 3)))
                  return original;
                raw.push(parseInt(data.slice(i + 1, i + 3), 16));
                i += 2;
              } else {
                if (data.charCodeAt(i) > 127) return original;
                raw.push(data[i] === "_" ? 32 : data.charCodeAt(i));
              }
            }
            bytes = Uint8Array.from(raw);
          }
          return new TextDecoder(charset, { fatal: true }).decode(bytes);
        } catch {
          return original;
        } finally {
          bytes?.fill(0);
        }
      },
    );
}

export function messageEvidence(payload: unknown): {
  names: string[];
  references: string[];
} {
  const names = new Set<string>(),
    references = new Set<string>();
  let visited = 0;
  function walk(part: unknown, depth: number) {
    if (!record(part) || depth > 8 || ++visited > 120) return;
    if (boundedText(part.filename, 1024)) return;
    if (
      part.mimeType === "text/html" &&
      record(part.body) &&
      typeof part.body.data === "string"
    ) {
      const html = decodeBase64Text(part.body.data);
      for (const m of html.matchAll(
        /<img\b[^>]{0,4096}\balt\s*=\s*["']([^"']{2,180})["'][^>]{0,4096}>/gi,
      )) {
        const value = htmlAsText(m[1]).replace(/\s+/g, " ").trim();
        if (
          value.length >= 4 &&
          value.length <= 160 &&
          !/vinted|logo|avatar|profil|icon|etoile|étoile|protection acheteur|livraison|application|photo du vendeur|^image$|^article$/i.test(
            value,
          ) &&
          !/@|https?:/.test(value)
        )
          names.add(value);
        if (names.size > 20) break;
      }
      for (const m of html.matchAll(/\bhref\s*=\s*["']([^"']{1,1024})["']/gi)) {
        try {
          const url = new URL(m[1].replaceAll("&amp;", "&"));
          if (
            url.protocol !== "https:" ||
            !["vinted.fr", "www.vinted.fr"].includes(url.hostname)
          )
            continue;
          const id = url.pathname.match(
            /^\/transactions?\/([a-zA-Z0-9-]{4,128})(?:\/|$)/,
          )?.[1];
          if (id) references.add(id);
        } catch {
          /* Un lien n’est jamais suivi. */
        }
        if (references.size > 20) break;
      }
    }
    if (Array.isArray(part.parts))
      for (const child of part.parts.slice(0, 100)) walk(child, depth + 1);
  }
  walk(payload, 0);
  return { names: [...names], references: [...references] };
}
