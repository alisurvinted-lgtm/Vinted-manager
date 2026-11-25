import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useRegisterSW } from "virtual:pwa-register/react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Download,
  Euro,
  HardDrive,
  Home,
  Leaf,
  LockKeyhole,
  Package,
  Percent,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Shirt,
  Sparkles,
  WifiOff,
  Upload,
  X,
} from "lucide-react";
import { db } from "./lib/db";
import { currentMonth, defaultSettings, type Activity } from "./lib/model";
import {
  amountClass,
  money,
  monthlyTotals,
  rateLabel,
  totals,
} from "./lib/accounting";
import { AddButton, ArticleRow, EmptyState, Modal } from "./components/ui";
import { ArticleForm } from "./components/ArticleForm";
import { ArticleDetail } from "./components/ArticleDetail";
import { Settings } from "./components/Settings";
import { MonthlyChart } from "./components/MonthlyChart";
import { MonthlyReport } from "./components/MonthlyReport";
import { GmailImport } from "./components/GmailImport";
import { ImportReview } from "./components/ImportReview";
import { VintedImport } from "./components/VintedImport";
import { isMonth, monthLabel, moveMonth } from "./lib/periods";

type Tab = "home" | "articles" | "stats";
type View =
  | { type: "add" }
  | { type: "detail"; id: string }
  | { type: "edit"; id: string; action?: "sell" | "fees" }
  | { type: "settings" }
  | { type: "help" }
  | { type: "vinted-import" }
  | { type: "gmail-import" }
  | null;
const navItems = [
  { id: "home", title: "Accueil", icon: Home },
  { id: "articles", title: "Mes articles", icon: Shirt },
  { id: "stats", title: "Statistiques", icon: BarChart3 },
] as const;
const monthName = monthLabel;
const activityLabels: Record<Activity["type"], string> = {
  created: "Article ajouté",
  updated: "Article modifié",
  sold: "Article vendu",
  restocked: "Remis en stock",
  deleted: "Article supprimé",
};

export default function App() {
  const data = useLiveQuery(async () => ({
    articles: await db.articles.toArray(),
    imports: (await db.imports.toArray()).filter((i) => !i.resolved),
    settings: (await db.settings.get("preferences")) ?? defaultSettings,
    activities: await db.activities
      .orderBy("date")
      .reverse()
      .limit(5)
      .toArray(),
  }));
  const [tab, setTab] = useState<Tab>("home");
  const [view, setView] = useState<View>(() =>
    location.hash === "#gmail-import" ? { type: "gmail-import" } : null,
  );
  const [month, setMonth] = useState(currentMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [filter, setFilter] = useState<"all" | "stock" | "sold">("all");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [swError, setSwError] = useState(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError() {
      setSwError(true);
    },
  });
  useEffect(() => {
    if (location.hash === "#gmail-import")
      history.replaceState(null, "", location.pathname + location.search);
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    if (navigator.storage?.persist)
      void navigator.storage.persist().catch(() => {});
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  function navigate(next: Tab) {
    setTab(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  const articles = data?.articles ?? [];
  const settings = data?.settings ?? defaultSettings;
  const summary = totals(articles, settings.rateBps, month);
  const annual = totals(articles, settings.rateBps, String(year));
  const sorted = [...articles].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  const visible = sorted.filter(
    (a) =>
      (filter === "all" || a.status === filter) &&
      a.name
        .toLocaleLowerCase("fr")
        .includes(search.toLocaleLowerCase("fr").trim()),
  );
  const viewedArticle =
    view && (view.type === "detail" || view.type === "edit")
      ? articles.find((a) => a.id === view.id)
      : undefined;
  const years = [
    ...new Set([
      new Date().getFullYear(),
      year,
      ...articles
        .filter((a) => a.purchaseDate)
        .map((a) => Number(a.purchaseDate!.slice(0, 4))),
      ...articles
        .filter((a) => a.saleDate)
        .map((a) => Number(a.saleDate!.slice(0, 4))),
    ]),
  ].sort((a, b) => b - a);
  function saved(message = "Article enregistré.") {
    setView(null);
    setToast(message);
  }
  function shiftMonth(offset: number) {
    const next = moveMonth(month, offset);
    if (next) setMonth(next);
  }
  const openStock = () => {
    setFilter("stock");
    setSearch("");
    navigate("articles");
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("home");
          }}
          aria-label="Vinted Manager, accueil"
        >
          <span className="brand-mark">
            <span>v</span>
            <Sparkles size={12} />
          </span>
          <span>
            vinted<span className="brand-subtitle">MANAGER</span>
          </span>
        </a>
        <div className="workspace-label">MON ESPACE PERSONNEL</div>
        <nav aria-label="Navigation principale">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${tab === item.id ? "active" : ""}`}
              aria-current={tab === item.id ? "page" : undefined}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={20} />
              <span>{item.title}</span>
              {tab === item.id && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-card">
            <span className="local-card-icon">
              <ShieldCheck size={21} />
            </span>
            <strong>Vos données, chez vous.</strong>
            <p>
              Un espace privé, sans compte.
              <br />
              Juste vous et votre activité.
            </p>
            <span>
              <span className="tiny-dot" /> Stockage sur cet appareil
            </span>
          </div>
          <button
            className="nav-item"
            onClick={() => setView({ type: "settings" })}
          >
            <SettingsIcon size={19} /> Paramètres
          </button>
          <button
            className="sidebar-help"
            onClick={() => setView({ type: "help" })}
          >
            <CircleHelp size={15} /> Un peu d’aide ?<ArrowUpRight size={14} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <span className="mobile-brand">
              <span className="brand-mark small">v</span> Vinted Manager
            </span>
            <span className="desktop-breadcrumb">
              Mon espace <ChevronRight size={13} />{" "}
              <strong>{navItems.find((n) => n.id === tab)?.title}</strong>
            </span>
          </div>
          <div className="topbar-right">
            <span className="device-status">
              {online ? <span className="tiny-dot" /> : <WifiOff size={14} />}
              <span>{online ? "Sur cet appareil" : "Mode hors ligne"}</span>
            </span>
            <button
              className="icon-button"
              aria-label="Ouvrir les paramètres"
              onClick={() => setView({ type: "settings" })}
            >
              <SettingsIcon size={20} />
            </button>
          </div>
        </header>
        {needRefresh && (
          <div className="update-banner" role="status">
            <span>Une nouvelle version est disponible.</span>
            <button onClick={() => void updateServiceWorker(true)}>
              Actualiser
            </button>
          </div>
        )}
        {swError && (
          <div className="update-banner" role="status">
            Le mode hors ligne n’a pas pu être activé. Rechargez une fois
            connecté.
          </div>
        )}
        <main id="main-content">
          <div
            className={`page-heading ${tab === "home" ? "home-heading" : ""}`}
          >
            <div>
              <div className="eyebrow">
                <span />{" "}
                {tab === "home"
                  ? "CHAQUE ARTICLE COMPTE"
                  : tab === "articles"
                    ? "UNE SECONDE VIE, BIEN SUIVIE"
                    : "PRENEZ UN PEU DE RECUL"}
              </div>
              <h1>
                {tab === "home" ? (
                  <>
                    Votre activité, <em>en toute clarté.</em>
                  </>
                ) : tab === "articles" ? (
                  "Mes articles"
                ) : (
                  "Vos chiffres, simplement."
                )}
              </h1>
              <p>
                {tab === "home"
                  ? "Moins de calculs. Plus de place pour vos belles trouvailles."
                  : tab === "articles"
                    ? "De la trouvaille à la vente, gardez le fil de votre stock."
                    : "L’essentiel pour comprendre et faire grandir votre activité."}
              </p>
            </div>
            <AddButton onClick={() => setView({ type: "add" })} />
          </div>
          {!data ? (
            <div className="loading-state" role="status">
              Ouverture de votre espace…
            </div>
          ) : (
            <>
              {tab === "home" && (
                <>
                  <div className="section-toolbar">
                    <h2>
                      Ce mois-ci <span className="period-dot">·</span>{" "}
                      <span className="muted month-heading">
                        {monthName(month)}
                      </span>
                    </h2>
                    <div className="month-picker">
                      <button
                        className="icon-button"
                        aria-label="Mois précédent"
                        onClick={() => shiftMonth(-1)}
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <label className="month-input-label">
                        <span>{monthName(month)}</span>
                        <input
                          aria-label="Mois sélectionné"
                          type="month"
                          min="1900-01"
                          max="9999-12"
                          value={month}
                          onChange={(e) => {
                            if (isMonth(e.target.value))
                              setMonth(e.target.value);
                          }}
                        />
                      </label>
                      <button
                        className="icon-button"
                        aria-label="Mois suivant"
                        onClick={() => shiftMonth(1)}
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="metrics-grid">
                    <Metric
                      title="Chiffre d’affaires"
                      amount={money(summary.revenue)}
                      caption={`${summary.soldCount} article${summary.soldCount > 1 ? "s vendus" : " vendu"} ce mois-ci`}
                      icon={ArrowUpRight}
                      featured
                    />
                    <Metric
                      title="Bénéfice net estimé"
                      amount={money(summary.net)}
                      caption="Après achats, frais et cotisations"
                      icon={ArrowDownLeft}
                      positive={summary.net !== null && summary.net >= 0}
                      negative={summary.net !== null && summary.net < 0}
                    />
                    <Metric
                      title="Cotisations estimées"
                      amount={money(summary.contributions)}
                      caption={`${rateLabel(settings.rateBps)} % du chiffre d’affaires`}
                      icon={Percent}
                    />
                    <Metric
                      title="Stock disponible"
                      amount={String(summary.stockCount)}
                      caption={
                        <>
                          article{summary.stockCount > 1 ? "s" : ""}{" "}
                          actuellement en stock
                        </>
                      }
                      icon={Package}
                      onClick={openStock}
                    />
                  </div>
                  <div className="gmail-entry">
                    <button
                      className="button secondary"
                      disabled={!online}
                      onClick={() => setView({ type: "gmail-import" })}
                    >
                      Importer depuis Gmail
                    </button>
                    <span>
                      {online
                        ? "Vérifier puis confirmer, sans import automatique."
                        : "La connexion Gmail nécessite Internet. Vos articles restent disponibles hors ligne."}
                    </span>
                  </div>
                  <ImportReview records={data.imports} />
                  <MonthlyReport
                    articles={articles}
                    rate={settings.rateBps}
                    month={month}
                  />
                  <div className="dashboard-middle">
                    <section className="panel chart-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Au fil des mois</h2>
                          <p>Une vue d’ensemble de votre activité</p>
                        </div>
                        <span className="year-badge">{month.slice(0, 4)}</span>
                      </div>
                      <MonthlyChart
                        articles={articles}
                        rate={settings.rateBps}
                        year={Number(month.slice(0, 4))}
                        activeMonth={month}
                        onMonthSelect={setMonth}
                      />
                    </section>
                    <section className="panel stock-panel">
                      <div className="stock-illustration">
                        <Package size={33} strokeWidth={1.3} />
                        <span className="illustration-spark one">✦</span>
                        <span className="illustration-spark two">✧</span>
                      </div>
                      <h2>
                        Votre prochain chapitre
                        <br /> est déjà dans votre stock.
                      </h2>
                      <p>
                        {summary.stockCount
                          ? `${summary.stockCount} article${summary.stockCount > 1 ? "s" : ""} prêt${summary.stockCount > 1 ? "s" : ""} à trouver une nouvelle maison.`
                          : "Les belles trouvailles commencent avec un premier article."}
                      </p>
                      <div className="stock-investment">
                        <span>Investi dans le stock actuel</span>
                        <strong>{money(summary.stockInvestment)}</strong>
                      </div>
                      <button className="text-button" onClick={openStock}>
                        Voir mon stock <ArrowRight size={16} />
                      </button>
                    </section>
                  </div>
                  <section className="panel activity-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Dernières opérations</h2>
                        <p>Les cinq derniers mouvements de votre activité</p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => navigate("articles")}
                      >
                        Mes articles <ArrowRight size={16} />
                      </button>
                    </div>
                    {data.activities.length === 0 ? (
                      <EmptyState
                        small
                        title="Tout commence par une trouvaille"
                        text="Ajoutez votre premier article. Nous nous occupons des calculs."
                        onAdd={() => setView({ type: "add" })}
                      />
                    ) : (
                      <div className="activity-list">
                        {data.activities.map((activity) => {
                          const exists = articles.some(
                            (a) => a.id === activity.articleId,
                          );
                          return (
                            <button
                              key={activity.id}
                              className="activity-row"
                              disabled={!exists}
                              onClick={() =>
                                setView({
                                  type: "detail",
                                  id: activity.articleId,
                                })
                              }
                            >
                              <span
                                className={`activity-icon ${activity.type === "sold" ? "is-sale" : ""}`}
                              >
                                {activity.type === "sold" ? (
                                  <ArrowUpRight size={18} />
                                ) : (
                                  <Package size={18} />
                                )}
                              </span>
                              <span className="activity-info">
                                <strong>{activity.name}</strong>
                                <span>{activityLabels[activity.type]}</span>
                              </span>
                              <span className="activity-date">
                                {new Intl.DateTimeFormat("fr-FR", {
                                  day: "numeric",
                                  month: "short",
                                }).format(new Date(activity.date))}
                              </span>
                              <strong
                                className={
                                  activity.type === "sold" ? "positive" : ""
                                }
                              >
                                {money(activity.amount)}
                              </strong>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </section>
                  <button
                    className="backup-reminder"
                    onClick={() => setView({ type: "settings" })}
                  >
                    <span className="reminder-icon">
                      <Download size={20} />
                    </span>
                    <span>
                      <strong>Le bon réflexe : une petite sauvegarde.</strong>
                      <span>
                        Vos données restent sur cet appareil. Pensez à les
                        exporter régulièrement.
                      </span>
                    </span>
                    <ArrowUpRight size={19} />
                  </button>
                </>
              )}
              {tab === "articles" && (
                <>
                  <div className="articles-toolbar">
                    <div
                      className="segmented filters"
                      role="group"
                      aria-label="Filtrer les articles"
                    >
                      {(
                        [
                          { id: "all", label: "Tous" },
                          { id: "stock", label: "En stock" },
                          { id: "sold", label: "Vendus" },
                        ] as const
                      ).map((f) => (
                        <button
                          key={f.id}
                          aria-pressed={filter === f.id}
                          className={filter === f.id ? "active" : ""}
                          onClick={() => setFilter(f.id)}
                        >
                          {f.label}
                          <span>
                            {
                              articles.filter(
                                (a) => f.id === "all" || a.status === f.id,
                              ).length
                            }
                          </span>
                        </button>
                      ))}
                    </div>
                    <label className="search-field">
                      <Search size={18} />
                      <input
                        type="search"
                        aria-label="Rechercher par nom"
                        placeholder="Rechercher un article…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="articles-import-action">
                    <button
                      className="button secondary"
                      onClick={() => setView({ type: "vinted-import" })}
                    >
                      <Upload size={16} /> Importer depuis Vinted
                    </button>
                    <span>Export officiel uniquement · en préparation</span>
                  </div>
                  <section className="panel articles-panel">
                    <div className="panel-heading">
                      <h2>
                        {filter === "all"
                          ? "Tous les articles"
                          : filter === "sold"
                            ? "Articles vendus"
                            : "Articles en stock"}{" "}
                        <span className="count-pill">{visible.length}</span>
                      </h2>
                      <span className="muted text-small">
                        Du plus récent au plus ancien
                      </span>
                    </div>
                    {visible.length ? (
                      <div className="articles-list">
                        {visible.map((a) => (
                          <ArticleRow
                            key={a.id}
                            article={a}
                            rate={settings.rateBps}
                            onClick={() =>
                              setView({ type: "detail", id: a.id })
                            }
                          />
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        title={
                          search
                            ? "Aucun article trouvé"
                            : filter === "sold"
                              ? "Vos ventes apparaîtront ici"
                              : "Une place pour vos trouvailles"
                        }
                        text={
                          search
                            ? "Essayez un autre nom ou un autre filtre."
                            : filter === "sold"
                              ? "Ouvrez un article en stock pour le marquer comme vendu."
                              : "Ajoutez un article en quelques secondes et gardez votre stock à jour."
                        }
                        onAdd={
                          !search && filter !== "sold"
                            ? () => setView({ type: "add" })
                            : undefined
                        }
                      />
                    )}
                  </section>
                </>
              )}
              {tab === "stats" && (
                <>
                  <div className="section-toolbar">
                    <h2>
                      Vue d’ensemble <span className="period-dot">·</span>{" "}
                      <span className="muted">{year}</span>
                    </h2>
                    <label className="year-select">
                      Année{" "}
                      <select
                        aria-label="Année des statistiques"
                        value={year}
                        onChange={(e) => setYear(Number(e.target.value))}
                      >
                        {years.map((y) => (
                          <option key={y}>{y}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="metrics-grid">
                    <Metric
                      title="Chiffre d’affaires"
                      amount={money(annual.revenue)}
                      caption={`${annual.soldCount} vente${annual.soldCount > 1 ? "s" : ""} sur l’année`}
                      icon={Euro}
                      featured
                    />
                    <Metric
                      title="Bénéfice net estimé"
                      amount={money(annual.net)}
                      caption="Après achats, frais et cotisations"
                      icon={ArrowDownLeft}
                      positive={annual.net !== null && annual.net >= 0}
                      negative={annual.net !== null && annual.net < 0}
                    />
                    <Metric
                      title="Cotisations estimées"
                      amount={money(annual.contributions)}
                      caption={`Taux actuel : ${rateLabel(settings.rateBps)} %`}
                      icon={Percent}
                    />
                    <Metric
                      title="Articles vendus"
                      amount={String(annual.soldCount)}
                      caption={`Du 1er janvier au 31 décembre ${year}`}
                      icon={Check}
                    />
                  </div>
                  <section className="panel chart-panel stats-chart">
                    <div className="panel-heading">
                      <div>
                        <h2>L’évolution de votre activité</h2>
                        <p>
                          Chiffre d’affaires et bénéfice estimé, mois par mois
                        </p>
                      </div>
                      <span className="year-badge">{year}</span>
                    </div>
                    <MonthlyChart
                      articles={articles}
                      rate={settings.rateBps}
                      year={year}
                    />
                  </section>
                  <div className="secondary-metrics">
                    <SmallMetric
                      title="Articles en stock"
                      value={String(annual.stockCount)}
                      caption="Stock actuel, toutes années"
                    />
                    <SmallMetric
                      title="Investi dans le stock"
                      value={money(annual.stockInvestment)}
                      caption="Achats TTC et frais inclus"
                    />
                    <SmallMetric
                      title="Prix de vente moyen"
                      value={money(annual.averageSale)}
                      caption={`Sur les ventes de ${year}`}
                    />
                    <SmallMetric
                      title="Bénéfice moyen par vente"
                      value={money(annual.averageProfit)}
                      caption={`Sur les ventes de ${year}`}
                    />
                  </div>
                  <section className="panel monthly-panel">
                    <div className="panel-heading">
                      <h2>Le détail par mois</h2>
                      <span className="year-badge">{year}</span>
                    </div>
                    <div className="table-scroll">
                      <table>
                        <caption className="sr-only">
                          Résultats mensuels pour {year}
                        </caption>
                        <thead>
                          <tr>
                            <th scope="col">Mois</th>
                            <th scope="col">Ventes</th>
                            <th scope="col">Chiffre d’affaires</th>
                            <th scope="col">Cotisations</th>
                            <th scope="col">Bénéfice estimé</th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthlyTotals(articles, settings.rateBps, year).map(
                            (row) => (
                              <tr key={row.month}>
                                <th scope="row">
                                  <button
                                    className="month-row-link"
                                    aria-label={`Afficher le bilan de ${monthName(row.month)}`}
                                    onClick={() => {
                                      setMonth(row.month);
                                      navigate("home");
                                    }}
                                  >
                                    {monthName(row.month).split(" ")[0]}
                                    <ChevronRight size={12} />
                                  </button>
                                </th>
                                <td>{row.soldCount}</td>
                                <td>{money(row.revenue)}</td>
                                <td>{money(row.contributions)}</td>
                                <td
                                  className={
                                    row.net !== null && row.net < 0
                                      ? "negative"
                                      : row.net !== null && row.net > 0
                                        ? "positive"
                                        : ""
                                  }
                                >
                                  {money(row.net)}
                                </td>
                              </tr>
                            ),
                          )}
                        </tbody>
                        <tfoot>
                          <tr>
                            <th scope="row">Total {year}</th>
                            <td>{annual.soldCount}</td>
                            <td>{money(annual.revenue)}</td>
                            <td>{money(annual.contributions)}</td>
                            <td className={amountClass(annual.net)}>
                              {money(annual.net)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </section>
                </>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>
              <LockKeyhole size={13} /> Local, privé et sans abonnement.
            </span>
            <span>Les bénéfices affichés sont des estimations de gestion.</span>
            <span className="footer-leaf">
              <Leaf size={14} /> La seconde main a de l’avenir.
            </span>
          </footer>
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Navigation mobile">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={tab === item.id ? "active" : ""}
            aria-current={tab === item.id ? "page" : undefined}
            onClick={() => navigate(item.id)}
          >
            <item.icon size={22} strokeWidth={tab === item.id ? 2 : 1.7} />
            <span>{item.title}</span>
          </button>
        ))}
      </nav>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          <span>{toast}</span>
          <button aria-label="Masquer le message" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {(view?.type === "add" || (view?.type === "edit" && viewedArticle)) && (
        <ArticleForm
          key={view.type === "add" ? "new" : viewedArticle!.id}
          article={view.type === "edit" ? viewedArticle : undefined}
          sell={view.type === "edit" && view.action === "sell"}
          focusFees={view.type === "edit" && view.action === "fees"}
          rate={settings.rateBps}
          onClose={() => setView(null)}
          onSaved={() => saved()}
        />
      )}
      {view?.type === "detail" && viewedArticle && (
        <ArticleDetail
          article={viewedArticle}
          rate={settings.rateBps}
          onClose={() => setView(null)}
          onEdit={(action) =>
            setView({ type: "edit", id: viewedArticle.id, action })
          }
          onSaved={saved}
        />
      )}
      {view?.type === "settings" && (
        <Settings
          settings={settings}
          articles={articles}
          onClose={() => setView(null)}
        />
      )}
      {view?.type === "gmail-import" && (
        <GmailImport
          articles={articles}
          onClose={() => setView(null)}
          onSaved={saved}
        />
      )}
      {view?.type === "vinted-import" && (
        <VintedImport
          onClose={() => setView(null)}
          onManual={() => setView({ type: "add" })}
        />
      )}
      {view?.type === "help" && (
        <Modal
          title="Simple, du début à la vente."
          onClose={() => setView(null)}
        >
          <div className="help-content">
            <p>
              <strong>1. Ajoutez une trouvaille.</strong>
              <br />
              Son nom, sa catégorie et le prix total payé suffisent pour
              commencer.
            </p>
            <p>
              <strong>2. Une vente ? Enregistrez-la.</strong>
              <br />
              Ouvrez l’article, touchez « Marquer comme vendu », puis renseignez
              le prix et la date.
            </p>
            <p>
              <strong>3. Vos chiffres suivent.</strong>
              <br />
              Le chiffre d’affaires, les cotisations et le bénéfice sont
              recalculés automatiquement.
            </p>
            <div className="info-box">
              <HardDrive size={20} />
              <p>
                Vos données restent dans ce navigateur. Pensez à exporter une
                sauvegarde chiffrée dans les paramètres avant de changer
                d’appareil ou d’effacer les données Safari.
              </p>
            </div>
            <p className="muted">
              Application personnelle, gratuite et indépendante de Vinted.
              Aucune connexion à votre compte Vinted.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
function Metric({
  title,
  amount,
  caption,
  icon: Icon,
  featured,
  positive,
  negative,
  onClick,
}: {
  title: string;
  amount: string;
  caption: React.ReactNode;
  icon: typeof Euro;
  featured?: boolean;
  positive?: boolean;
  negative?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className="metric-top">
        <span>{title}</span>
        <span className="metric-icon">
          <Icon size={18} strokeWidth={1.7} />
        </span>
      </div>
      <strong
        className={`metric-value ${positive ? "positive" : ""} ${negative ? "negative" : ""}`}
      >
        {amount}
      </strong>
      <span className="metric-caption">{caption}</span>
      {featured && <span className="metric-decoration" />}
    </>
  );
  return onClick ? (
    <button className="metric-card metric-button" onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className={`metric-card ${featured ? "featured" : ""}`}>{content}</div>
  );
}
function SmallMetric({
  title,
  value,
  caption,
}: {
  title: string;
  value: string;
  caption: string;
}) {
  return (
    <div>
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{caption}</small>
    </div>
  );
}
