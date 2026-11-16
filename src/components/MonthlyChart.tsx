import { useState } from "react";
import { BarChart3 } from "lucide-react";
import { money, monthlyTotals } from "../lib/accounting";
import type { Article } from "../lib/model";
const MONTHS = [
  "Jan",
  "Fév",
  "Mar",
  "Avr",
  "Mai",
  "Juin",
  "Juil",
  "Août",
  "Sep",
  "Oct",
  "Nov",
  "Déc",
];
export function MonthlyChart({
  articles,
  rate,
  year,
  activeMonth,
  onMonthSelect,
}: {
  articles: Article[];
  rate: number;
  year: number;
  activeMonth?: string;
  onMonthSelect?: (month: string) => void;
}) {
  const rows = monthlyTotals(articles, rate, year);
  const [localSelection, setSelected] = useState<number | null>(null);
  const selected = activeMonth?.startsWith(`${year}-`)
    ? Number(activeMonth.slice(5, 7)) - 1
    : localSelection;
  function selectMonth(index: number) {
    setSelected(selected === index ? null : index);
    onMonthSelect?.(rows[index].month);
  }
  const hasSales = rows.some((r) => r.soldCount > 0);
  const max = Math.max(
    1,
    ...rows.map((r) => r.revenue),
    ...rows.map((r) => r.net),
  );
  const min = Math.min(0, ...rows.map((r) => r.net));
  const scale = 187 / (max - min);
  const baseline = 25 + max * scale;
  const axisMoney = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    notation: "compact",
    maximumFractionDigits: 0,
  });
  const selectedRow = selected === null ? null : rows[selected];
  return (
    <div className="chart-container">
      <div className="chart-legend">
        <span>
          <i className="legend-revenue" />
          Chiffre d’affaires
        </span>
        <span>
          <i className="legend-profit" />
          Bénéfice estimé
        </span>
      </div>
      <div className="chart-wrap">
        <svg
          className="monthly-chart"
          viewBox="0 0 700 258"
          role="img"
          aria-label={`Évolution mensuelle du chiffre d’affaires et du bénéfice en ${year}. ${hasSales ? "Valeurs détaillées disponibles en sélectionnant un mois et dans le tableau mensuel des statistiques." : "Aucune vente enregistrée."}`}
        >
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <line
                x1="55"
                x2="689"
                y1={25 + (i * 187) / 3}
                y2={25 + (i * 187) / 3}
                stroke="#e9ede9"
                strokeDasharray="4 5"
              />
              <text
                x="44"
                y={29 + (i * 187) / 3}
                textAnchor="end"
                fill="#939a93"
                fontSize="10"
              >
                {hasSales
                  ? axisMoney.format((max - ((max - min) * i) / 3) / 100)
                  : i === 3
                    ? "0 €"
                    : ""}
              </text>
            </g>
          ))}
          {min < 0 && (
            <line
              x1="55"
              x2="689"
              y1={baseline}
              y2={baseline}
              stroke="#c8d4c4"
            />
          )}
          {rows.map((row, i) => {
            const x = 66 + i * 52;
            const revenueHeight = row.revenue * scale;
            const netHeight = Math.abs(row.net) * scale;
            return (
              <g
                key={row.month}
                className="chart-month"
                role="button"
                tabIndex={0}
                aria-label={`${MONTHS[i]} ${year} : CA ${money(row.revenue)}, bénéfice ${money(row.net)}`}
                onClick={() => selectMonth(i)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    selectMonth(i);
                  }
                }}
              >
                <title>
                  {MONTHS[i]} : {money(row.revenue)} de CA · {money(row.net)} de
                  bénéfice
                </title>
                <rect
                  x={x - 6}
                  y="13"
                  width="43"
                  height="222"
                  rx="5"
                  fill={selected === i ? "#f0f4ec" : "transparent"}
                  className="chart-hit"
                />
                <rect
                  x={x}
                  y={baseline - revenueHeight}
                  width="13"
                  height={revenueHeight}
                  rx="3"
                  fill="#408674"
                />
                <rect
                  x={x + 16}
                  y={row.net >= 0 ? baseline - netHeight : baseline}
                  width="13"
                  height={netHeight}
                  rx="3"
                  fill={row.net >= 0 ? "#c2d69a" : "#d79b92"}
                />
                <text
                  x={x + 14}
                  y="249"
                  fill={selected === i ? "#176453" : "#8a928b"}
                  fontSize="11"
                  textAnchor="middle"
                >
                  {MONTHS[i]}
                </text>
              </g>
            );
          })}
        </svg>
        {!hasSales && (
          <div className="chart-empty">
            <span>
              <BarChart3 size={23} strokeWidth={1.4} />
            </span>
            <strong>Vos premières ventes donnent le rythme</strong>
            <p>Votre évolution apparaîtra ici, au fil des mois.</p>
          </div>
        )}
      </div>
      {selectedRow && (
        <div className="chart-selected" aria-live="polite">
          <strong>
            {MONTHS[selected!]} {year}
          </strong>
          <span>CA : {money(selectedRow.revenue)}</span>
          <span className={selectedRow.net < 0 ? "negative" : "positive"}>
            Bénéfice : {money(selectedRow.net)}
          </span>
        </div>
      )}
    </div>
  );
}
