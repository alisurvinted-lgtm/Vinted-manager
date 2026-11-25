import { describe, expect, it, vi, afterEach } from "vitest";
import {
  analyzeNotification,
  subjectType,
} from "../prototypes/gmail-oauth/analyze";
import {
  messageEvidence,
  messageText,
} from "../prototypes/gmail-oauth/mail-content";
import { parisDate, parisMonthBounds } from "../protocols/paris";
const received = "2026-11-30T23:30:00Z";
afterEach(() => vi.unstubAllEnvs());
describe("Trois événements ciblés et preuve par contenu", () => {
  it.each([
    "Ton reçu pour la commande fictive",
    "Votre reçu pour la commande 1234",
  ])("reconnaît un reçu : %s", (s) => expect(subjectType(s)).toBe("purchase"));
  it.each(["Ton article s’est vendu !", "Votre article a été vendu !"])(
    "reconnaît une annonce : %s",
    (s) => expect(subjectType(s)).toBe("sale_announced"),
  );
  it("ne valide pas un objet sans confirmation dans le contenu", () => {
    expect(
      analyzeNotification(
        "La transaction est finalisée",
        "Une offre a été reçue.",
        received,
      ).confidence,
    ).toBe("ambiguous");
  });
  it.each([
    "Ton bordereau d’envoi est prêt",
    "Ton colis est en route",
    "Notification de livraison",
    "Un membre t’a envoyé un message",
    "Tu as reçu une offre de prix",
    "Ton article a été ajouté aux favoris",
    "Une promotion sur Vinted",
    "Rappel : expédie ton colis",
  ])("exclut %s", (s) => expect(subjectType(s)).toBeNull());
  it("préfère le montant total payé et ne rajoute pas une seconde fois les composantes", () => {
    const a = analyzeNotification(
      "Ton reçu pour la commande fictive",
      "Voici ton reçu.\nArticle : Baskets synthétiques\nMontant payé : 7,21 €\nPrix de l’article : 3,20 €\nFrais de port : 2,90 €\nProtection acheteur : 1,11 €\nDate d’achat : 27/11/2026\nRéférence de commande : SYNTH-1122",
      received,
    );
    expect(a).toMatchObject({
      kind: "purchase",
      confirmed: true,
      confidence: "reliable",
      purchasePrice: 721,
      itemPrice: 320,
      shipping: 290,
      protection: 111,
      date: "2026-11-27",
      dateEstimated: false,
      reference: "SYNTH-1122",
    });
  });
  it("laisse le total inconnu lorsque seules des composantes incomplètes existent", () => {
    const a = analyzeNotification(
      "Ton reçu pour la commande fictive",
      "Voici ton reçu.\nArticle : Veste synthétique\nPrix de l’article : 3,20 €\nFrais de port : 2,90 €",
      received,
    );
    expect(a.purchasePrice).toBeNull();
    expect(a.confidence).toBe("incomplete");
  });
  it("propose une vente en cours sans la transformer en encaissement", () => {
    const a = analyzeNotification(
      "Ton article s’est vendu !",
      "Ton article s’est vendu !\nArticle : Jean synthétique\nPrix de vente : 27,80 €",
      received,
    );
    expect(a).toMatchObject({
      kind: "sale_announced",
      salePrice: 2780,
      confidence: "reliable",
      date: "2026-12-01",
      dateEstimated: true,
    });
  });
  it("déduit le rôle vendeur depuis le crédit effectif sur son porte-monnaie", () => {
    const a = analyzeNotification(
      "La transaction est finalisée",
      "Article : Pull synthétique\nNous avons viré 9,80 € sur ton porte-monnaie Vinted.\nDate de finalisation : 1 décembre 2026",
      received,
    );
    expect(a).toMatchObject({
      kind: "sale_final",
      salePrice: 980,
      confidence: "reliable",
      dateEstimated: false,
      date: "2026-12-01",
    });
  });
  it("ne transforme pas un remboursement crédité au porte-monnaie en chiffre d’affaires", () => {
    const a = analyzeNotification(
      "La transaction est finalisée",
      "Article : Pull fictif\nNous avons viré 9,80 € sur ton porte-monnaie Vinted.\nLe remboursement a été effectué.",
      received,
    );
    expect(a.confirmed).toBe(false);
    expect(a.confidence).toBe("ambiguous");
  });
  it("ne prend pas le solde du porte-monnaie ou un montant publicitaire pour le prix encaissé", () => {
    const a = analyzeNotification(
      "La transaction est finalisée",
      "Article : Pull synthétique\nTu as un solde de 200 € sur ton porte-monnaie. Offre de 5 € disponible.",
      received,
    );
    expect(a.confirmed).toBe(false);
    expect(a.salePrice).toBeNull();
  });
  it("reconnaît une finalisation acheteur sans créer une seconde acquisition", () => {
    const a = analyzeNotification(
      "La transaction est finalisée",
      "Article : Sac synthétique\nLe paiement a été transmis au vendeur.\nRéférence de transaction : FICTIF-3322",
      received,
    );
    expect(a.kind).toBe("purchase_final");
    expect(a.confirmed).toBe(true);
    expect(a.salePrice).toBeNull();
  });
  it("refuse le niveau fiable lorsqu’un libellé fournit des montants contradictoires", () => {
    expect(
      analyzeNotification(
        "Ton reçu pour la commande fictive",
        "Voici ton reçu.\nArticle : Test synthétique\nMontant payé : 10 €\nMontant payé : 11 €",
        received,
      ).confidence,
    ).toBe("ambiguous");
  });
  it("signale une date explicite impossible plutôt que la valider comme certaine", () => {
    const a = analyzeNotification(
      "Ton reçu pour la commande fictive",
      "Voici ton reçu.\nArticle : Pull fictif\nMontant payé : 8 €\nDate d’achat : 31/02/2026",
      received,
    );
    expect(a.confidence).toBe("ambiguous");
    expect(a.dateEstimated).toBe(true);
  });
  it("refuse un montant crédité contredit par une autre formulation du paiement", () => {
    const a = analyzeNotification(
      "La transaction est finalisée",
      "Article : Pull fictif\nMontant crédité : 9,80 €\nNous avons viré 11,80 € sur ton porte-monnaie Vinted.",
      received,
    );
    expect(a.confidence).toBe("ambiguous");
    expect(a.salePrice).toBeNull();
  });
  it("ne rapproche pas automatiquement deux références différentes dans un reçu", () => {
    const a = analyzeNotification(
      "Ton reçu pour la commande fictive",
      "Voici ton reçu.\nArticle : Pull fictif\nMontant payé : 8 €\nRéférence de commande : FICTIF-1010\nRéférence de commande : FICTIF-2020",
      received,
    );
    expect(a.reference).toBeNull();
    expect(a.confidence).toBe("ambiguous");
  });
  it("reconnaît un lot sans répartir arbitrairement son total", () => {
    const a = analyzeNotification(
      "Ton reçu pour la commande fictive",
      "Voici ton reçu.\nArticle : Pull synthétique\nArticle : Jean synthétique\nNombre d’articles : 2\nMontant payé : 15,80 €",
      received,
    );
    expect(a.quantity).toBe(2);
    expect(a.itemNames).toHaveLength(2);
    expect(a.purchasePrice).toBe(1580);
    expect(a.name).toBe("Lot de 2 articles");
  });
  it("détecte les corrections sans interpréter une demande de remboursement comme un remboursement effectif", () => {
    expect(subjectType("Ton remboursement a été effectué")).toBe("refund");
    expect(
      analyzeNotification(
        "Remboursement demandé",
        "Ta demande de remboursement est en cours.",
        received,
      ).confirmed,
    ).toBe(false);
  });
});
describe("HTML inerte et périodes Europe/Paris", () => {
  it("extrait localement un titre d’image et une référence Vinted sans charger un lien", () => {
    const html =
      '<img src="https://pixel.example.invalid/private" onerror="alert(1)" alt="Polaire synthétique"><a href="https://www.vinted.fr/transactions/SYNTH-1234">Suivi</a><a href="https://evil.invalid/transactions/FAUX-1234">Autre</a><script>voler()</script>';
    const payload = {
      mimeType: "text/html",
      body: { data: Buffer.from(html).toString("base64url") },
    };
    expect(messageEvidence(payload)).toEqual({
      names: ["Polaire synthétique"],
      references: ["SYNTH-1234"],
    });
    expect(messageText(payload)).not.toContain("voler()");
  });
  it("utilise Paris même si l’appareil est réglé sur un autre fuseau", () => {
    vi.stubEnv("TZ", "America/Los_Angeles");
    expect(parisDate(new Date(received))).toBe("2026-12-01");
    expect(new Date(parisMonthBounds("2026-12").start).toISOString()).toBe(
      "2026-11-30T23:00:00.000Z",
    );
    const march = parisMonthBounds("2026-03");
    expect(march.end - march.start).toBe(31 * 86400000 - 3600000);
  });
});
