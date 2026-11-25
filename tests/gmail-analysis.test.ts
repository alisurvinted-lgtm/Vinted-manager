import { describe, expect, it, vi, afterEach } from "vitest";
import {
  analyzeNotification,
  subjectType,
} from "../prototypes/gmail-oauth/analyze";
import {
  messageEvidence,
  messageText,
} from "../prototypes/gmail-oauth/mail-content";
import { proposedRow } from "../prototypes/gmail-oauth/preview-model";
import { proposalSelection } from "../prototypes/gmail-oauth/transfer";
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

describe("Phase 2 — filtrage et préremplissage ciblés", () => {
  it.each([
    "Confirmation requise : ton article s’est vendu !",
    "Ton article s’est vendu ! — confirmation requise",
    "Confirme que la transaction est finalisée",
    "Voici un message : ton article s’est vendu !",
    "Ton bordereau d’envoi a été annulé",
    "Une offre promotionnelle avec remboursement",
  ])("écarte une notification non comptable : %s", (subject) =>
    expect(subjectType(subject)).toBeNull(),
  );
  it("ne confond pas une confirmation déjà acquise et une confirmation à effectuer", () => {
    expect(
      subjectType("Ton reçu pour la commande fictive — paiement confirmé"),
    ).toBe("purchase");
  });
  it("garde les corrections financières même lorsqu’une intervention est demandée", () => {
    expect(subjectType("Commande annulée — confirmation requise")).toBe(
      "cancellation",
    );
    expect(subjectType("Ton remboursement est confirmé")).toBe("refund");
  });
  it("préfère le montant réellement payé au total avant remise, sans additionner le port", () => {
    const a = analyzeNotification(
      "Ton reçu pour la commande fictive",
      "Voici ton reçu.\nArticle : Baskets fictives\n  Montant payé : 7,21 €\nTotal de la commande : 9,21 €\nPrix de l’article : 3,20 €\nFrais de port : 2,90 €\nProtection acheteur : 1,11 €",
      received,
    );
    expect(a).toMatchObject({
      purchasePrice: 721,
      shipping: 290,
      protection: 111,
      confidence: "reliable",
    });
  });
  it.each([
    "Nous avons versé 9,80 € sur ton solde Vinted.",
    "Le montant de 9,80 € a été viré sur votre solde Vinted.",
    "9,80 € ont été ajoutés à ton solde Vinted.",
    "Ton solde Vinted a été crédité de 9,80 €.",
    "Montant crédité : 9,80 €\nLe montant a été transféré sur ton solde Vinted.",
  ])("extrait un versement réellement effectué : %s", (body) => {
    const a = analyzeNotification(
      "La transaction est finalisée",
      "Article : Pull fictif\n" + body,
      received,
    );
    expect(a).toMatchObject({
      kind: "sale_final",
      confirmed: true,
      salePrice: 980,
      purchasePrice: null,
      confidence: "reliable",
    });
  });
  it.each([
    "Le montant de 9,80 € sera viré sur ton solde Vinted.",
    "9,80 € seront versés sur ton solde Vinted.\nMontant crédité : 9,80 €",
    "9,80 € n’ont pas été versés sur ton solde Vinted.\nMontant crédité : 9,80 €",
    "Le montant de 9,80 € n’a pas été viré sur ton solde Vinted.",
    "Aucun montant n’a été crédité sur ton solde Vinted.\nMontant crédité : 9,80 €",
    "Ton solde Vinted est de 209,80 €.\nPrix de l’article : 9,80 €",
  ])("ne confirme pas un encaissement absent ou futur : %s", (body) => {
    const a = analyzeNotification(
      "La transaction est finalisée",
      "Article : Pull fictif\n" + body,
      received,
    );
    expect(a.confirmed).toBe(false);
    expect(a.confidence).not.toBe("reliable");
  });
  it.each(["-9,80", "−9,80", "9,801", "123456789"])(
    "ne transforme pas un montant négatif ou invalide en crédit positif : %s",
    (amount) => {
      const a = analyzeNotification(
        "La transaction est finalisée",
        `Article : Pull fictif\n${amount} € ont été versés sur ton solde Vinted.`,
        received,
      );
      expect(a.confidence).not.toBe("reliable");
      expect(a.salePrice).toBeNull();
    },
  );
  it("accepte un signe positif explicite pour un crédit confirmé", () => {
    expect(
      analyzeNotification(
        "La transaction est finalisée",
        "Article : Pull fictif\n+9,80 € ont été versés sur ton solde Vinted.",
        received,
      ),
    ).toMatchObject({ salePrice: 980, confidence: "reliable" });
  });
  it("préfère la date d’achat explicite à une date générique et laisse les contradictions à vérifier", () => {
    const a = analyzeNotification(
      "Ton reçu pour la commande fictive",
      "Voici ton reçu.\nArticle : Pull fictif\nMontant payé : 7,21 €\nDate d’achat : 28/11/2026\nDate de transaction : 29/11/2026",
      received,
    );
    expect(a).toMatchObject({
      date: "2026-11-28",
      dateEstimated: false,
      confidence: "reliable",
    });
    const b = analyzeNotification(
      "Ton article s’est vendu !",
      "Ton article s’est vendu !\nArticle : Pull fictif\nPrix de vente : 9,80 €\nDate de vente : 27/11/2026\nDate de vente : 28/11/2026",
      received,
    );
    expect(b.confidence).toBe("ambiguous");
    expect(b.dateEstimated).toBe(true);
  });
  it("refuse deux crédits contradictoires, sans prendre le solde global pour la vente", () => {
    const a = analyzeNotification(
      "La transaction est finalisée",
      "Article : Pull fictif\nMontant crédité : 9,80 €\nNous avons versé 11,80 € sur ton solde Vinted.\nTon solde Vinted est de 209,80 €.",
      received,
    );
    expect(a.salePrice).toBeNull();
    expect(a.confidence).toBe("ambiguous");
  });
  it("ne rattache pas un premier montant à un crédit portant sur un autre montant", () => {
    const a = analyzeNotification(
      "La transaction est finalisée",
      "Article : Pull fictif\nUne offre de 5 € et le montant de 9,80 € a été viré sur ton solde Vinted.",
      received,
    );
    expect(a.salePrice).toBe(980);
  });
  it.each([
    [
      "Ton reçu pour la commande fictive",
      "Voici ton reçu.\nMontant payé : 7,21 €\nDate de transaction : 28/11/2026",
      "purchase",
      null,
    ],
    [
      "Ton article s’est vendu !",
      "Ton article s’est vendu !\nPrix de vente : 9,80 €\nDate de vente annoncée : 28/11/2026",
      "sale_announced",
      980,
    ],
    [
      "La transaction est finalisée",
      "Nous avons versé 9,80 € sur ton solde Vinted.\nDate de transaction : 28 novembre 2026",
      "sale_final",
      980,
    ],
  ])(
    "préfère une date explicitement liée à l’événement : %s",
    (subject, body, kind, salePrice) => {
      const a = analyzeNotification(
        subject,
        "Article : Pull fictif\n" + body,
        received,
      );
      expect(a).toMatchObject({
        kind,
        salePrice,
        date: "2026-11-28",
        dateEstimated: false,
      });
    },
  );
  it.each([
    ["2026-11-30T23:30:00Z", "2026-12-01"],
    ["2026-12-01T00:30:00+02:00", "2026-11-30"],
    ["1er décembre 2026", "2026-12-01"],
  ])(
    "interprète une date explicite sans perdre la période Paris : %s",
    (date, expected) => {
      const a = analyzeNotification(
        "La transaction est finalisée",
        `Article : Pull fictif\nNous avons versé 9,80 € sur ton solde Vinted.\nDate de transaction : ${date}`,
        received,
      );
      expect(a).toMatchObject({
        date: expected,
        dateEstimated: false,
        confidence: "reliable",
      });
    },
  );
  it("ne normalise pas silencieusement un horodatage de février impossible", () => {
    const a = analyzeNotification(
      "La transaction est finalisée",
      "Article : Pull fictif\nNous avons versé 9,80 € sur ton solde Vinted.\nDate de transaction : 2026-02-30T12:00:00Z",
      received,
    );
    expect(a.confidence).toBe("ambiguous");
    expect(a.dateEstimated).toBe(true);
  });
  it("n’utilise pas un autre total lorsqu’un montant payé négatif est invalide", () => {
    const a = analyzeNotification(
      "Ton reçu pour la commande fictive",
      "Voici ton reçu.\nArticle : Pull fictif\nMontant payé : -7,21 €\nTotal TTC : 9,21 €",
      received,
    );
    expect(a.purchasePrice).toBeNull();
    expect(a.confidence).toBe("ambiguous");
  });
  it("conserve les références et l’estimation Paris jusqu’à la proposition, sans zéro ni corps Gmail", async () => {
    const row = proposedRow(
      "message-synthetique-phase2",
      "La transaction est finalisée",
      received,
      true,
      "Article : Pull fictif\nNous avons versé 9,80 € sur ton solde Vinted.\nRéférence de transaction : FICTIF-PHASE2-101",
      null,
    );
    const [item] = await proposalSelection([row]);
    expect(item).toMatchObject({
      kind: "sale_final",
      salePrice: 980,
      purchasePrice: null,
      purchaseDate: null,
      date: "2026-12-01",
      dateEstimated: true,
      confidence: "reliable",
    });
    expect(item.referenceKey).toMatch(/^[a-f0-9]{64}$/);
    expect(item.relatedKeys?.sale_announced).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(item)).not.toContain("Nous avons");
    expect(JSON.stringify(item)).not.toContain("FICTIF-PHASE2-101");
  });
  it("ne convertit pas l’objet d’une vente en preuve de paiement ni un achat inconnu en zéro", async () => {
    const row = proposedRow(
      "message-annonce-phase2",
      "Ton article s’est vendu !",
      received,
      true,
      "Ton article s’est vendu !\nArticle : Pull fictif\nPrix de vente : 9,80 €",
      null,
    );
    const [item] = await proposalSelection([row]);
    expect(item).toMatchObject({
      kind: "sale_announced",
      salePrice: 980,
      purchasePrice: null,
      dateEstimated: true,
    });
  });
  it.each(["2024-02", "2025-02", "2026-11", "2026-12", "2026-03", "2026-10"])(
    "utilise les premiers jours civils de deux mois consécutifs : %s",
    (month) => {
      const [year, m] = month.split("-").map(Number);
      const range = parisMonthBounds(month);
      expect(parisDate(range.start)).toBe(month + "-01");
      const next = new Date(Date.UTC(year, m, 1));
      const nextMonth = next.toISOString().slice(0, 7);
      expect(parisDate(range.end)).toBe(nextMonth + "-01");
      expect(parisDate(range.end - 1).slice(0, 7)).toBe(month);
    },
  );
});
