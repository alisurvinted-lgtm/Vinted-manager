import { ArrowDown, ArrowUp, Minus, ShoppingBag } from "lucide-react";
import { changePercent, money, monthlyReport } from "../lib/accounting";
import { monthLabel } from "../lib/periods";
import type { Article } from "../lib/model";

export function MonthlyReport({
  articles,
  rate,
  month,
}: {
  articles: Article[];
  rate: number;
  month: string;
}) {
  const report = monthlyReport(articles, rate, month);
  const { current, previous } = report;
  return (
    <section
      className="panel monthly-report"
      aria-labelledby="monthly-report-title"
    >
      <div className="panel-heading">
        <div>
          <h2 id="monthly-report-title">Bilan de {monthLabel(month)}</h2>
          <p>Les ventes de ce mois, avec leurs coûts réels enregistrés</p>
        </div>
      </div>
      <dl className="monthly-facts">
        <Fact title="Articles vendus" value={String(current.soldCount)} />
        <Fact title="Prix de vente moyen" value={money(current.averageSale)} />
        <Fact
          title="Coût des articles vendus"
          value={money(current.acquisitionCost)}
          help="Achats TTC, quelle que soit leur date"
        />
        <Fact
          title="Frais de boost des ventes"
          value={money(current.boostFees)}
        />
        <Fact
          title="Nettoyage des ventes"
          value={money(current.cleaningFees)}
        />
        <Fact
          title="Cotisations estimées"
          value={money(current.contributions)}
        />
      </dl>
      <div className="monthly-result">
        <span>
          Bénéfice net estimé
          <small>
            Ventes − achats des articles vendus − frais − cotisations
          </small>
        </span>
        <strong className={current.net < 0 ? "negative" : "positive"}>
          {money(current.net)}
        </strong>
      </div>
      <div className="monthly-purchases">
        <ShoppingBag size={19} />
        <div>
          <strong>Achats TTC effectués en {monthLabel(month)}</strong>
          <p>
            {current.purchasedCount} article
            {current.purchasedCount > 1 ? "s" : ""} acheté
            {current.purchasedCount > 1 ? "s" : ""}, vendu
            {current.purchasedCount > 1 ? "s" : ""} ou encore en stock. Cette
            dépense est distincte du coût des ventes du mois.
          </p>
        </div>
        <strong data-testid="monthly-purchases">
          {money(current.purchaseOutflow)}
        </strong>
      </div>
      <p className="monthly-method">
        Les frais sont rattachés aux articles vendus, sans supposer leur date de
        paiement. Le stock et le capital affichés à l’accueil décrivent la
        situation actuelle.
      </p>
      {previous && report.previousMonth ? (
        <div className="monthly-comparison">
          <h3>Comparaison avec {monthLabel(report.previousMonth)}</h3>
          <div className="comparison-heading" aria-hidden="true">
            <span />
            <span>Mois choisi</span>
            <span>Mois précédent</span>
            <span>Écart</span>
          </div>
          <Comparison
            title="Chiffre d’affaires"
            current={current.revenue}
            previous={previous.revenue}
          />
          <Comparison
            title="Bénéfice estimé"
            current={current.net}
            previous={previous.net}
          />
          <Comparison
            title="Articles vendus"
            current={current.soldCount}
            previous={previous.soldCount}
            count
          />
          <Comparison
            title="Prix de vente moyen"
            current={current.averageSale}
            previous={previous.averageSale}
          />
        </div>
      ) : (
        <p className="monthly-method">
          La comparaison commence en février 1900.
        </p>
      )}
    </section>
  );
}
function Fact({
  title,
  value,
  help,
}: {
  title: string;
  value: string;
  help?: string;
}) {
  return (
    <div>
      <dt>{title}</dt>
      <dd>{value}</dd>
      {help && <small>{help}</small>}
    </div>
  );
}
function Comparison({
  title,
  current,
  previous,
  count = false,
}: {
  title: string;
  current: number;
  previous: number;
  count?: boolean;
}) {
  const delta = current - previous;
  const percent = changePercent(current, previous);
  const format = (value: number) => (count ? String(value) : money(value));
  const Icon = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus;
  return (
    <div className="comparison-row">
      <span>{title}</span>
      <strong aria-label={`${title}, mois choisi`}>{format(current)}</strong>
      <span aria-label={`${title}, mois précédent`}>{format(previous)}</span>
      <span
        className={`comparison-delta ${delta > 0 ? "positive" : delta < 0 ? "negative" : ""}`}
      >
        <Icon size={13} />
        <span>
          {delta > 0 ? "+" : ""}
          {format(delta)}
          {percent !== null && (
            <small>
              {percent > 0 ? "+" : ""}
              {new Intl.NumberFormat("fr-FR", {
                maximumFractionDigits: 2,
              }).format(percent / 100)}{" "}
              %
            </small>
          )}
        </span>
      </span>
    </div>
  );
}
