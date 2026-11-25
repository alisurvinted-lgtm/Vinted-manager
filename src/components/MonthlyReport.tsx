import { ArrowDown, ArrowUp, Minus, ShoppingBag } from "lucide-react";
import {
  amountClass,
  changePercent,
  money,
  monthlyReport,
} from "../lib/accounting";
import { monthLabel, monthRange } from "../lib/periods";
import type { Article } from "../lib/model";

export function MonthlyReport({
  articles,
  rate,
  month,
  reviewCount = 0,
}: {
  articles: Article[];
  rate: number;
  month: string;
  reviewCount?: number;
}) {
  const report = monthlyReport(articles, rate, month);
  const { current, previous } = report;
  const range = monthRange(month);
  return (
    <section
      className="panel monthly-report"
      aria-labelledby="monthly-report-title"
    >
      <div className="panel-heading">
        <div>
          <h2 id="monthly-report-title">Bilan de {monthLabel(month)}</h2>
          <p>
            Du 1er au {range.last.slice(-2)} {monthLabel(month)} · heure de
            Paris
          </p>
        </div>
      </div>
      <dl className="monthly-facts">
        <Fact
          title="Ventes en attente à la fin du mois"
          value={String(current.pendingCount)}
          help={`${money(current.pendingAmount)} en attente, hors encaissements`}
        />
        <Fact
          title="Capital dans le stock actuel"
          value={money(current.stockInvestment)}
        />
        <Fact
          title="Encaissements − achats du mois"
          value={money(current.cashFlow)}
          help="Flux connu, hors dates de paiement des boosts/nettoyages"
        />
        <Fact title="Notifications à vérifier" value={String(reviewCount)} />
        <Fact title="Ventes finalisées" value={String(current.soldCount)} />
        <Fact
          title="Articles en stock actuellement"
          value={String(current.stockCount)}
        />
        <Fact
          title="Bénéfices calculables"
          value={money(current.knownNet)}
          help={`${current.completeSoldCount} vente(s) au coût connu`}
        />
        <Fact
          title="Bénéfices à compléter"
          value={String(current.incompleteProfitCount)}
          help="Coût d’achat inconnu, jamais assimilé à zéro"
        />
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
        <strong className={amountClass(current.net)}>
          {current.net === null ? "Total à compléter" : money(current.net)}
        </strong>
      </div>
      <div className="monthly-purchases">
        <ShoppingBag size={19} />
        <div>
          <strong>Achats TTC effectués en {monthLabel(month)}</strong>
          <p>
            {current.purchasedCount} achat(s), vendus ou encore en stock.
            Distincts du coût des articles vendus ci-dessus.
          </p>
        </div>
        <strong data-testid="monthly-purchases">
          {money(current.purchaseOutflow)}
        </strong>
      </div>
      {(current.incompleteProfitCount > 0 ||
        current.unknownPurchaseDates > 0) && (
        <p className="info-box">
          {current.incompleteProfitCount} vente(s) au bénéfice à compléter.{" "}
          {current.unknownPurchaseDates} date(s) d’achat inconnue(s), exclues
          des dépenses mensuelles tant qu’elles ne sont pas renseignées.
        </p>
      )}
      {current.estimatedSaleDates > 0 && (
        <p className="field-help">
          {current.estimatedSaleDates} date(s) d’encaissement estimée(s) depuis
          la notification Gmail, modifiables dans la fiche article.
        </p>
      )}
      {(current.saleRefundAmount > 0 || current.purchaseRefunds > 0) && (
        <p className="info-box">
          Remboursements de ventes : {money(current.saleRefundAmount)} ·
          remboursements d’achats : {money(current.purchaseRefunds)}. Les
          corrections sont placées à leur date. Les cotisations restent estimées
          et doivent être vérifiées pour la déclaration.
        </p>
      )}
      <details className="monthly-explanations">
        <summary>Comparaison et détails du calcul</summary>
        <p className="monthly-method">
          Les frais sont rattachés aux articles vendus, sans supposer leur date
          de paiement. Le stock et le capital affichés à l’accueil décrivent la
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
      </details>
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
  current: number | null;
  previous: number | null;
  count?: boolean;
}) {
  if (current === null || previous === null)
    return (
      <div className="comparison-row">
        <span>{title}</span>
        <strong>{money(current)}</strong>
        <span>{money(previous)}</span>
        <span>À compléter</span>
      </div>
    );
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
