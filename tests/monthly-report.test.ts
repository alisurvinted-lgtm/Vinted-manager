import { describe, expect, it, vi } from "vitest";
import { changePercent, monthlyReport } from "../src/lib/accounting";
import { isMonth, monthLabel, moveMonth, monthRange } from "../src/lib/periods";
import { DEFAULT_RATE, currentMonth, type Article } from "../src/lib/model";
const sold = (patch: Partial<Article> = {}): Article => ({
  id: "fictif-sold",
  name: "Article synthétique",
  genre: "Unisexe",
  category: "Polaire",
  purchaseDate: "2025-12-20",
  purchasePrice: 1500,
  status: "sold",
  saleDate: "2026-01-04",
  salePrice: 3500,
  fees: [
    { id: "boost", type: "Boost Vinted", amount: 200 },
    { id: "clean", type: "Nettoyage", amount: 100 },
  ],
  createdAt: "2025-12-20T12:00:00Z",
  updatedAt: "2026-01-04T12:00:00Z",
  ...patch,
});
const stock = (): Article =>
  sold({
    id: "fictif-stock",
    status: "stock",
    saleDate: null,
    salePrice: null,
    purchaseDate: "2026-01-10",
    purchasePrice: 1000,
    fees: [{ id: "stock-boost", type: "Boost Vinted", amount: 50 }],
  });
describe("Bilan mensuel V2", () => {
  it("sépare les achats du mois du coût des articles vendus venant du mois précédent", () => {
    const report = monthlyReport([sold(), stock()], DEFAULT_RATE, "2026-01");
    expect(report.current).toMatchObject({
      revenue: 3500,
      net: 1269,
      acquisitionCost: 1500,
      purchaseOutflow: 1000,
      purchasedCount: 1,
      boostFees: 200,
      cleaningFees: 100,
      salesFees: 300,
      contributions: 431,
      soldCount: 1,
      averageSale: 3500,
      stockCount: 1,
      stockInvestment: 1050,
    });
    expect(report.previousMonth).toBe("2025-12");
    expect(report.previous).toMatchObject({
      revenue: 0,
      acquisitionCost: 0,
      purchaseOutflow: 1500,
      soldCount: 0,
    });
  });
  it("ne réalise aucun bénéfice ni CA sur le stock et ne lui affecte pas les frais des ventes", () => {
    const result = monthlyReport([stock()], DEFAULT_RATE, "2026-01").current;
    expect(result.revenue).toBe(0);
    expect(result.net).toBe(0);
    expect(result.salesFees).toBe(0);
    expect(result.purchaseOutflow).toBe(1000);
    expect(result.stockInvestment).toBe(1050);
  });
  it("rattache les frais à la vente sans inventer une date de paiement", () => {
    const article = sold();
    article.fees.push({ id: "boost2", type: "Boost Vinted", amount: 150 });
    const report = monthlyReport([article], DEFAULT_RATE, "2026-01");
    expect(report.current.boostFees).toBe(350);
    expect(report.current.cleaningFees).toBe(100);
    expect(report.current.net).toBe(1119);
    expect(report.previous!.salesFees).toBe(0);
  });
  it("déplace ventes, coût et frais ensemble lors du changement de date de vente", () => {
    const article = sold({ saleDate: "2026-02-01" });
    expect(
      monthlyReport([article], DEFAULT_RATE, "2026-01").current,
    ).toMatchObject({ revenue: 0, acquisitionCost: 0, salesFees: 0 });
    expect(
      monthlyReport([article], DEFAULT_RATE, "2026-02").current,
    ).toMatchObject({
      revenue: 3500,
      acquisitionCost: 1500,
      salesFees: 300,
      net: 1269,
    });
  });
  it("recalcule le bénéfice et les cotisations au taux choisi, y compris sur la comparaison", () => {
    const report = monthlyReport(
      [
        sold(),
        sold({
          id: "dec-sale",
          purchaseDate: "2025-12-01",
          saleDate: "2025-12-31",
        }),
      ],
      1000,
      "2026-01",
    );
    expect(report.current.net).toBe(1350);
    expect(report.current.contributions).toBe(350);
    expect(report.previous!.net).toBe(1350);
  });
  it("gère les mois vides sans prix moyen ni évolution fictifs", () => {
    const report = monthlyReport([], DEFAULT_RATE, "2026-01");
    expect(report.current.averageSale).toBe(0);
    expect(report.current.net).toBe(0);
    expect(report.previous!.soldCount).toBe(0);
    expect(changePercent(10, 0)).toBeNull();
  });
  it("conserve le stock comme situation actuelle indépendamment du mois affiché", () => {
    expect(
      monthlyReport([stock()], DEFAULT_RATE, "2025-01").current.stockCount,
    ).toBe(1);
    expect(
      monthlyReport([stock()], DEFAULT_RATE, "2027-01").current.stockInvestment,
    ).toBe(1050);
  });
  it("ne modifie jamais les articles, leurs frais ou les dates", () => {
    const articles = [sold(), stock()];
    const before = structuredClone(articles);
    monthlyReport(articles, DEFAULT_RATE, "2026-01");
    expect(articles).toEqual(before);
  });
  it("évite les pourcentages trompeurs avec une référence négative ou nulle", () => {
    expect(changePercent(2000, 1000)).toBe(10000);
    expect(changePercent(4, 3)).toBe(3333);
    expect(changePercent(-500, 1000)).toBeNull();
    expect(changePercent(1000, -500)).toBeNull();
    expect(changePercent(0, 0)).toBeNull();
  });
  it("refuse une période malformée", () => {
    expect(() => monthlyReport([], DEFAULT_RATE, "2026-13")).toThrow();
    expect(() => monthlyReport([], DEFAULT_RATE, "2026-1")).toThrow();
  });
});
describe("Choix de mois et changement d’année", () => {
  it.each([
    ["2026-02", "28"],
    ["2028-02", "29"],
    ["2026-04", "30"],
    ["2100-02", "28"],
    ["2000-02", "29"],
    ["9999-12", "31"],
  ])("utilise les vraies bornes civiles de %s", (month, day) => {
    expect(monthRange(month)).toEqual({
      first: `${month}-01`,
      last: `${month}-${day}`,
    });
  });
  it("sélectionne le mois courant à Paris, même avant minuit UTC", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-12-31T23:30:00Z"));
      expect(currentMonth()).toBe("2027-01");
      vi.setSystemTime(new Date("2026-03-31T22:30:00Z"));
      expect(currentMonth()).toBe("2026-04");
    } finally {
      vi.useRealTimers();
    }
  });
  it("n’inclut pas la finalisation du 1er mars dans les encaissements de février", () => {
    const article = sold({
      purchaseDate: "2028-02-01",
      saleDate: "2028-03-01",
      announcedSaleDate: "2028-02-29",
      announcedSalePrice: 3500,
    });
    expect(
      monthlyReport([article], DEFAULT_RATE, "2028-02").current,
    ).toMatchObject({
      revenue: 0,
      pendingCount: 1,
      pendingAmount: 3500,
      purchaseOutflow: 1500,
    });
    expect(
      monthlyReport([article], DEFAULT_RATE, "2028-03").current,
    ).toMatchObject({ revenue: 3500, pendingCount: 0, purchaseOutflow: 0 });
  });
  it("distingue le bénéfice connu du total inconnu sans supprimer le CA", () => {
    const report = monthlyReport(
      [
        sold(),
        sold({ id: "cout-inconnu", purchaseDate: null, purchasePrice: null }),
      ],
      DEFAULT_RATE,
      "2026-01",
    );
    expect(report.current).toMatchObject({
      revenue: 7000,
      net: null,
      knownNet: 1269,
      completeSoldCount: 1,
      incompleteProfitCount: 1,
      contributions: 862,
    });
  });
  it("passe de décembre à janvier et inversement", () => {
    expect(moveMonth("2025-12", 1)).toBe("2026-01");
    expect(moveMonth("2026-01", -1)).toBe("2025-12");
  });
  it("respecte les limites de dates existantes", () => {
    expect(moveMonth("1900-01", -1)).toBeNull();
    expect(moveMonth("9999-12", 1)).toBeNull();
    expect(monthlyReport([], DEFAULT_RATE, "1900-01").previous).toBeNull();
  });
  it.each(["2026-00", "2026-13", "2026-1", "1899-12", "abcd-01"])(
    "refuse %s",
    (value) => expect(isMonth(value)).toBe(false),
  );
  it("affiche le mois et l’année en français", () => {
    expect(monthLabel("2026-01")).toBe("janvier 2026");
  });
});
