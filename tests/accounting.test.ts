import { describe, expect, it } from "vitest";
import {
  contribution,
  feeTotal,
  monthlyTotals,
  parseMoney,
  parseRate,
  profit,
  totals,
} from "../src/lib/accounting";
import { DEFAULT_RATE, type Article } from "../src/lib/model";
const article = (patch: Partial<Article> = {}): Article => ({
  id: "test",
  name: "Polaire",
  genre: "Unisexe",
  category: "Polaire",
  purchaseDate: "2026-01-01",
  purchasePrice: 1500,
  status: "sold",
  salePrice: 3500,
  saleDate: "2026-02-03",
  fees: [
    { id: "boost", type: "Boost Vinted", amount: 200 },
    { id: "cleaning", type: "Nettoyage", amount: 100 },
  ],
  createdAt: "2026-01-01T12:00:00Z",
  updatedAt: "2026-02-03T12:00:00Z",
  ...patch,
});
describe("Calculs monétaires en centimes", () => {
  it("calcule 12,3 % avec un arrondi au centime supérieur à mi-centime", () => {
    expect(contribution(3500, DEFAULT_RATE)).toBe(431);
  });
  it("reproduit le bénéfice de l’exemple : 12,69 €", () => {
    expect(profit(article(), DEFAULT_RATE)).toBe(1269);
  });
  it("additionne plusieurs frais et autorise des frais de même type", () => {
    const a = article();
    a.fees.push({ id: "boost2", type: "Boost Vinted", amount: 50 });
    expect(feeTotal(a)).toBe(350);
    expect(profit(a, DEFAULT_RATE)).toBe(1219);
  });
  it("gère les pertes", () => {
    expect(profit(article({ salePrice: 1000 }), DEFAULT_RATE)).toBe(-923);
  });
  it("ne calcule pas de bénéfice réalisé pour le stock", () => {
    expect(
      profit(
        article({ status: "stock", salePrice: null, saleDate: null }),
        DEFAULT_RATE,
      ),
    ).toBe(0);
  });
  it.each([
    ["15,99", 1599],
    ["15.99", 1599],
    ["0,01", 1],
    ["0.29", 29],
    ["12.3", 1230],
    [" 20 ", 2000],
    ["0", 0],
  ])("convertit %s en %i centimes", (value, expected) =>
    expect(parseMoney(value)).toBe(expected),
  );
  it.each([
    "-1",
    "NaN",
    "Infinity",
    "1e3",
    "",
    "12.345",
    "2,3.4",
    "9999999999999",
  ])("refuse le montant invalide %s", (value) =>
    expect(() => parseMoney(value)).toThrow(),
  );
  it("accepte un taux de 0 à 100 % avec deux décimales", () => {
    expect(parseRate("12,3")).toBe(1230);
    expect(parseRate("12.35")).toBe(1235);
    expect(parseRate("0")).toBe(0);
    expect(parseRate("100")).toBe(10000);
    expect(() => parseRate("100,01")).toThrow();
  });
  it("recalcule les ventes passées au taux choisi", () => {
    expect(profit(article(), 1000)).toBe(1350);
    expect(contribution(3500, 0)).toBe(0);
  });
});
describe("Agrégations", () => {
  const stock = article({
    id: "stock",
    status: "stock",
    saleDate: null,
    salePrice: null,
  });
  const january = article({ id: "jan", saleDate: "2026-01-31" });
  it("calcule le CA par mois de vente, et exclut les invendus", () => {
    const t = totals([article(), stock, january], DEFAULT_RATE, "2026-02");
    expect(t.revenue).toBe(3500);
    expect(t.net).toBe(1269);
    expect(t.contributions).toBe(431);
    expect(t.soldCount).toBe(1);
    expect(t.stockCount).toBe(1);
  });
  it("déplace le chiffre d’affaires quand la date de vente change", () => {
    const changed = article({ saleDate: "2026-03-01" });
    expect(totals([changed], DEFAULT_RATE, "2026-02").revenue).toBe(0);
    expect(totals([changed], DEFAULT_RATE, "2026-03").revenue).toBe(3500);
  });
  it("calcule le stock investi en incluant achats et frais", () => {
    expect(totals([stock], DEFAULT_RATE).stockInvestment).toBe(1800);
  });
  it("calcule les moyennes et l’année sans mélanger les autres années", () => {
    const t = totals(
      [article(), article({ id: "previous", saleDate: "2025-02-01" })],
      DEFAULT_RATE,
      "2026",
    );
    expect(t.averageSale).toBe(3500);
    expect(t.averageProfit).toBe(1269);
    expect(t.soldCount).toBe(1);
  });
  it("ne divise pas par zéro sur un espace vide", () => {
    expect(totals([], DEFAULT_RATE).averageSale).toBe(0);
    expect(totals([], DEFAULT_RATE).averageProfit).toBe(0);
  });
  it("arrondit les cotisations vente par vente", () => {
    expect(
      totals(
        [article({ salePrice: 4 }), article({ id: "2", salePrice: 4 })],
        DEFAULT_RATE,
      ).contributions,
    ).toBe(0);
  });
  it("produit douze mois calculés à partir des ventes", () => {
    const rows = monthlyTotals([article()], DEFAULT_RATE, 2026);
    expect(rows).toHaveLength(12);
    expect(rows[1].revenue).toBe(3500);
    expect(rows[0].revenue).toBe(0);
  });
});
