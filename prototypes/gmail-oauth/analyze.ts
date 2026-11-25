import { validDate } from "../../protocols/gmail-transfer";
import { parisDate } from "../../protocols/paris";
export type EventKind =
  | "purchase"
  | "sale_announced"
  | "sale_final"
  | "purchase_final"
  | "refund"
  | "cancellation"
  | "incomplete";
export interface Analysis {
  kind: EventKind;
  confidence: "reliable" | "incomplete" | "ambiguous";
  confirmed: boolean;
  name: string | null;
  purchasePrice: number | null;
  salePrice: number | null;
  itemPrice: number | null;
  shipping: number | null;
  protection: number | null;
  otherFees: number | null;
  date: string;
  dateEstimated: boolean;
  reference: string | null;
  quantity: number | null;
  itemNames: string[];
  notes: string[];
  missing: string[];
}
const norm = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/[\u00a0\u202f]/g, " ")
    .toLowerCase();
export function subjectType(subject: string): EventKind | null {
  const s = norm(subject).trim();
  if (
    /\b(rembours|annul|correction (?:du |de )?(?:paiement|montant)|ajustement financier)/.test(
      s,
    )
  )
    return /\brembours/.test(s) ? "refund" : "cancellation";
  if (
    /bordereau|expedi|livraison|livre[!\s]|message|offre de prix|favori|promotion|rappel|en route/.test(
      s,
    )
  )
    return null;
  if (
    /(?:ton|votre|le|voici (?:ton|votre)) recu (?:pour|de) (?:la |ta |votre )?commande/.test(
      s,
    ) ||
    /^recu (?:de|pour) (?:ta |votre |la )?commande/.test(s)
  )
    return "purchase";
  if (
    /(?:ton|votre|l')\s*article (?:s'est|s est|a ete|est) vendu|tu as vendu|vous avez vendu/.test(
      s,
    )
  )
    return "sale_announced";
  if (
    /^(?:la |votre |ta )?transaction (?:est |a ete )?finalisee[! .…]*$/.test(s)
  )
    return "sale_final";
  return null;
}
export function euros(value: string): number | null {
  const v = value
    .trim()
    .replace(/[ \u00a0\u202f]/g, "")
    .replace(",", ".");
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(v)) return null;
  const [a, b = ""] = v.split(".");
  const n = Number(a) * 100 + Number(b.padEnd(2, "0"));
  return Number.isSafeInteger(n) && n <= 999999999 ? n : null;
}
const MONEY =
  "(\\d{1,7}(?:[ \\u00a0\\u202f]\\d{3})*(?:[,.]\\d{1,2})?)\\s*(?:€|EUR\\b)";
function labeled(
  text: string,
  label: string,
): { value: number | null; conflict: boolean } {
  const values = [
    ...text.matchAll(
      new RegExp(`(?:^|[\\n;])${label}\\s*[:：]?\\s*${MONEY}`, "gim"),
    ),
  ]
    .map((m) => euros(m[1]))
    .filter((v): v is number => v !== null);
  const distinct = [...new Set(values)];
  return {
    value: distinct.length === 1 ? distinct[0] : null,
    conflict: distinct.length > 1,
  };
}
function moneyFromPattern(text: string, pattern: string) {
  const values = [...text.matchAll(new RegExp(pattern, "gi"))]
    .map((m) => euros(m[1]))
    .filter((v): v is number => v !== null);
  const unique = [...new Set(values)];
  return {
    value: unique.length === 1 ? unique[0] : null,
    conflict: unique.length > 1,
  };
}
function explicitDate(
  text: string,
  kind: EventKind,
): { value: string | null; conflict: boolean } {
  const labels =
    kind === "purchase" || kind === "purchase_final"
      ? "date d.achat|date de (?:la )?commande|commande passee le"
      : kind === "sale_final"
        ? "date de finalisation|date d.encaissement|paiement (?:recu|credite) le|finalisee le"
        : kind === "sale_announced"
          ? "date de vente|vendu le"
          : kind === "refund"
            ? "date du remboursement|remboursement effectue le"
            : "date d.annulation|annulee? le";
  const s = norm(text);
  const found: string[] = [];
  let invalid = false;
  for (const m of s.matchAll(
    new RegExp(
      `(?:${labels})\\s*[:：]?\\s*(\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[/.]\\d{1,2}[/.]\\d{4}|\\d{1,2}\\s+[a-z]+\\s+\\d{4})`,
      "gi",
    ),
  )) {
    let d = m[1];
    const numeric = d.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
    if (numeric)
      d = `${numeric[3]}-${numeric[2].padStart(2, "0")}-${numeric[1].padStart(2, "0")}`;
    const words = d.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/);
    if (words) {
      const month =
        [
          "janvier",
          "fevrier",
          "mars",
          "avril",
          "mai",
          "juin",
          "juillet",
          "aout",
          "septembre",
          "octobre",
          "novembre",
          "decembre",
        ].indexOf(words[2]) + 1;
      d = `${words[3]}-${String(month).padStart(2, "0")}-${words[1].padStart(2, "0")}`;
    }
    if (validDate(d)) found.push(d);
    else invalid = true;
  }
  const unique = [...new Set(found)];
  return {
    value: unique.length === 1 ? unique[0] : null,
    conflict: invalid || unique.length > 1,
  };
}
function referenceCandidates(
  text: string,
  htmlReferences: string[] = [],
): string[] {
  const found = [
    ...text.matchAll(
      /(?:r[eé]f[eé]rence|num[eé]ro|n[°o])\s+(?:(?:de|du)\s+)?(?:(?:la|ta|votre)\s+)?(?:commande|transaction)\s*[:#]\s*([a-zA-Z0-9-]{4,128})(?![a-zA-Z0-9-])/gi,
    ),
  ].map((m) => m[1]);
  return [...new Set([...found, ...htmlReferences])];
}
export function transactionReference(
  text: string,
  htmlReferences: string[] = [],
): string | null {
  const refs = referenceCandidates(text, htmlReferences);
  return refs.length === 1 ? refs[0] : null;
}
export function analyzeNotification(
  subject: string,
  text: string,
  receivedAt: string,
  evidence: { names?: string[]; references?: string[] } = {},
): Analysis {
  const proposed = subjectType(subject);
  const body = norm(text);
  let kind: EventKind = proposed ?? "incomplete";
  const notes: string[] = [];
  const missing: string[] = [];
  let confirmed = false,
    conflict = false;
  const total = labeled(
    body,
    "(?:montant paye|total paye|montant total paye|total de la commande|total ttc)",
  );
  const item = labeled(
    body,
    "(?:prix de l.article|prix des articles|sous.total des articles)",
  );
  const shipping = labeled(
    body,
    "(?:frais de port|frais de livraison|livraison)",
  );
  const protection = labeled(
    body,
    "(?:frais de protection acheteur|protection acheteur)",
  );
  const other = labeled(body, "(?:autres frais)");
  let sale = labeled(body, "(?:prix de vente|montant de la vente)");
  if (kind === "purchase")
    confirmed =
      /(?:recu|montant paye|commande (?:confirmee|payee)|paiement (?:effectue|confirme))/.test(
        body,
      );
  if (kind === "sale_announced") {
    confirmed =
      /(?:ton|votre|l')\s*article (?:s'est|s est|a ete|est) vendu|tu as vendu|vous avez vendu|(?:un|l') acheteur a (?:achete|paye) (?:ton|votre) article/.test(
        body,
      );
    if (sale.value === null && !sale.conflict && confirmed)
      sale = moneyFromPattern(body, `(?:vendu[^\\n]{0,160}?pour\\s+)${MONEY}`);
    if (sale.value === null && !sale.conflict && confirmed) sale = item;
  }
  if (kind === "sale_final") {
    const ownerWallet =
      /(?:ton|votre) porte[- ]monnaie|(?:ton|votre) solde vinted/.test(body);
    const creditLabel = labeled(
      body,
      "(?:montant credite|montant recu|montant vire|paiement recu)",
    );
    let credit = creditLabel;
    if (credit.value === null && !credit.conflict)
      credit = moneyFromPattern(
        body,
        `${MONEY}[^\\n]{0,60}?(?:a|ont) ete (?:vire|viree|vers[eé]|credit[eé])s?[^\\n]{0,80}(?:ton|votre) porte[- ]monnaie`,
      );
    if (credit.value === null && !credit.conflict)
      credit = moneyFromPattern(
        body,
        `(?:avons|a) (?:vire|verse|credite)\\s+${MONEY}[^\\n]{0,100}(?:ton|votre) porte[- ]monnaie`,
      );
    const relation = [
      moneyFromPattern(
        body,
        `${MONEY}[^\\n]{0,60}?(?:a|ont) ete (?:vire|viree|verse|credite)s?[^\\n]{0,80}(?:ton|votre) porte[- ]monnaie`,
      ),
      moneyFromPattern(
        body,
        `(?:avons|a) (?:vire|verse|credite)\\s+${MONEY}[^\\n]{0,100}(?:ton|votre) porte[- ]monnaie`,
      ),
    ];
    if (
      relation.some(
        (r) =>
          r.conflict ||
          (r.value !== null &&
            credit.value !== null &&
            r.value !== credit.value),
      )
    )
      credit = { value: null, conflict: true };
    const credited =
      ownerWallet &&
      /(?:a|ont) ete (?:vire|verse|credite)|(?:avons|a) (?:vire|verse|credite)|montant credite|paiement recu/.test(
        body,
      );
    const buyerFinal =
      /(?:paiement|montant)[^\n]{0,100}(?:au vendeur|a ete transmis au vendeur)|le vendeur a recu (?:son|le) paiement/.test(
        body,
      );
    if (credited && !buyerFinal) {
      confirmed = true;
      sale = credit;
    } else if (buyerFinal && !credited) {
      kind = "purchase_final";
      confirmed = true;
      sale = { value: null, conflict: false };
    } else
      notes.push(
        "Le contenu ne confirme pas suffisamment un paiement reçu sur votre porte-monnaie.",
      );
  }
  if (kind === "refund") {
    const refund = labeled(
      body,
      "(?:montant rembourse|remboursement|montant du remboursement)",
    );
    sale = refund;
    confirmed =
      refund.value !== null &&
      /remboursement (?:effectue|confirme)|(?:avons|a ete) rembourse|montant rembourse/.test(
        body,
      );
  }
  if (kind === "cancellation")
    confirmed =
      /commande (?:a ete |est )?annulee|transaction (?:a ete |est )?annulee|vente (?:a ete |est )?annulee/.test(
        body,
      );
  conflict =
    total.conflict ||
    item.conflict ||
    shipping.conflict ||
    protection.conflict ||
    other.conflict ||
    sale.conflict;
  const named = [
    ...text.matchAll(
      /(?:^|\n)\s*(?:nom de l.article|article|produit)\s*[:：]\s*([^\n]{2,160})/gi,
    ),
  ].map((m) => m[1].trim());
  const itemNames = [
    ...new Set(named.length ? named : (evidence.names ?? [])),
  ].filter((n) => n.length <= 160 && !/[\u0000-\u001f\u007f]/.test(n));
  const quantityMatch = body.match(
    /(?:quantite|nombre d.articles)\s*[:：]\s*(\d{1,3})(?!\d)/,
  );
  const quantity = quantityMatch
    ? Number(quantityMatch[1])
    : itemNames.length > 1
      ? itemNames.length
      : null;
  if (quantity !== null && (quantity < 1 || quantity > 100)) {
    conflict = true;
    notes.push("Quantité non prise en charge.");
  }
  const name =
    itemNames.length === 1
      ? itemNames[0]
      : itemNames.length > 1
        ? `Lot de ${quantity ?? itemNames.length} articles`
        : null;
  const date = explicitDate(text, kind);
  conflict ||= date.conflict;
  const ref = transactionReference(text, evidence.references);
  conflict ||= referenceCandidates(text, evidence.references).length > 1;
  if (!ref && evidence.references?.length) notes.push("Référence ambiguë.");
  if (!name) missing.push("Nom de l’article");
  if (kind === "purchase" && total.value === null)
    missing.push("Montant total payé");
  if (
    (kind === "sale_announced" || kind === "sale_final") &&
    sale.value === null
  )
    missing.push("Montant de vente ou reçu");
  if (!confirmed)
    notes.push(
      "Événement non confirmé par le contenu : vérification nécessaire.",
    );
  if (conflict)
    notes.push(
      "Plusieurs valeurs incompatibles : ne pas valider automatiquement.",
    );
  if (!date.value)
    notes.push("Date du message proposée comme estimation, en Europe/Paris.");
  return {
    kind,
    confirmed,
    confidence:
      !confirmed || conflict
        ? "ambiguous"
        : missing.length
          ? "incomplete"
          : "reliable",
    name,
    purchasePrice: kind === "purchase" ? total.value : null,
    salePrice: sale.value,
    itemPrice: item.value,
    shipping: shipping.value,
    protection: protection.value,
    otherFees: other.value,
    date: date.value ?? parisDate(new Date(receivedAt)),
    dateEstimated: !date.value,
    reference: ref,
    quantity,
    itemNames,
    notes,
    missing,
  };
}
