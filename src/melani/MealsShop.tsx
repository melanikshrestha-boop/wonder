/**
 * Shop · 52-week buy plan from locked meals.
 * Assumes you restocked today — only shows when each thing is due next.
 * Color = cadence: green weekly · blue ~2wk · violet month · gold pantry.
 * Top line = $600/mo grocery budget vs locked-day burn (food only).
 */
import { useMemo, useState } from "react";
import {
  buildMealShopGamePlan,
  coreDayGroceryBudget,
  shopCadenceBand,
  type MealShopScheduleItem,
  type MealShopTripLine,
} from "./data";
import "./meals-shop.css";

function bandOf(it: MealShopScheduleItem | undefined, short: string): string {
  if (!it) return "bi";
  return shopCadenceBand(it.daysPerBuy, it.weeklyAlways);
}

function chipLabel(l: MealShopTripLine): string {
  return l.buyQty > 1 ? `${l.short} ×${l.buyQty}` : l.short;
}

function money(n: number): string {
  const abs = Math.abs(n);
  const body = abs >= 100 ? abs.toFixed(0) : abs.toFixed(0);
  return n < 0 ? `−$${body}` : `$${body}`;
}

export function MealsShop() {
  const plan = useMemo(
    () => buildMealShopGamePlan({ weekCount: 52, stockedToday: true }),
    []
  );

  // Steak default for budget; sockeye is usually cheaper on protein line
  const budget = useMemo(() => coreDayGroceryBudget("steak"), []);
  const topSpend = useMemo(
    () => budget.lines.filter((l) => l.priced).slice(0, 5),
    [budget]
  );

  const meta = useMemo(() => {
    const m = new Map<string, MealShopScheduleItem>();
    for (const it of plan.items) m.set(it.short, it);
    return m;
  }, [plan]);

  const weekly = plan.items.filter((it) => it.weeklyAlways);
  const bulkMeta = plan.items.filter((it) => !it.weeklyAlways);

  // Only weeks where Costco or Direct is due (skip empty / TJ-only noise)
  const bulkTrips = plan.trips.filter(
    (t) => t.costco.length > 0 || t.direct.length > 0
  );

  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? bulkTrips : bulkTrips.slice(0, 12);

  const budgetPct = Math.min(100, budget.pctOfBudget);

  return (
    <div className="ms">
      <header className="ms-head">
        <h2 className="fx-h2">SHOP · 52 WEEKS</h2>
        <p className="ms-meta">Stocked today · next buys only</p>
      </header>

      {/* $600/mo grocery budget — food only, not Blueprint */}
      <div
        className={`ms-budget${budget.overBudget ? " is-over" : ""}`}
        aria-label="Monthly grocery budget"
      >
        <p className="ms-budget-line">
          <span className="ms-budget-label">Grocery / month</span>
          <strong className="ms-budget-num">
            {money(budget.perMonth)}
            <span className="ms-budget-of"> / {money(budget.budgetUsd)}</span>
          </strong>
        </p>
        <div
          className="ms-budget-bar"
          role="progressbar"
          aria-valuenow={budgetPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${budget.pctOfBudget} percent of grocery budget`}
        >
          <span
            className="ms-budget-fill"
            style={{ width: `${budgetPct}%` }}
          />
        </div>
        <p className="ms-budget-sub">
          {budget.overBudget
            ? `${money(budget.perMonth - budget.budgetUsd)} over · food only · Blueprint separate`
            : `${money(budget.remainingUsd)} left · food only · Blueprint separate`}
          {" · "}
          steak day estimate
        </p>
        {topSpend.length > 0 ? (
          <p className="ms-budget-top" aria-label="Biggest monthly food costs">
            {topSpend.map((l) => (
              <span key={l.name} className="ms-budget-chip">
                {l.short} {money(l.perMonth)}
              </span>
            ))}
          </p>
        ) : null}
        {budget.unpriced.length > 0 ? (
          <p className="ms-budget-miss">
            Missing price: {budget.unpriced.slice(0, 4).join(" · ")}
            {budget.unpriced.length > 4 ? "…" : ""}
          </p>
        ) : null}
      </div>

      {/* Color key — 4 chips */}
      <p className="ms-buy-legend" aria-hidden>
        <span className="ms-chip is-wk">weekly</span>
        <span className="ms-chip is-bi">2 wk</span>
        <span className="ms-chip is-mo">month</span>
        <span className="ms-chip is-yr">pantry</span>
      </p>

      {/* Always — TJ produce once */}
      <div className="ms-buy-block">
        <p className="ms-buy-when">Every week · TJ</p>
        <div className="ms-chips">
          {weekly.map((it) => (
            <span key={it.id} className="ms-chip is-wk">
              {it.short}
            </span>
          ))}
        </div>
      </div>

      {/* How long bulk lasts (one quiet line each) */}
      <div className="ms-buy-block">
        <p className="ms-buy-when">Bulk lasts</p>
        <div className="ms-chips">
          {bulkMeta.map((it) => {
            const band = shopCadenceBand(it.daysPerBuy, false);
            const q = it.buyQty > 1 ? ` ×${it.buyQty}` : "";
            const days =
              it.daysPerBuy >= 60
                ? `${(it.daysPerBuy / 30.44).toFixed(0)}mo`
                : `${Math.round(it.daysPerBuy)}d`;
            return (
              <span key={it.id} className={`ms-chip is-${band}`}>
                {it.short}
                {q} · {days}
              </span>
            );
          })}
        </div>
      </div>

      {/* Calendar — date + chips */}
      <div className="ms-buy-cal">
        <p className="ms-buy-when">When to buy bulk</p>
        {visible.map((t) => {
          const lines = [...t.costco, ...t.direct];
          return (
            <div key={t.weekIndex} className="ms-buy-row">
              <span className="ms-buy-date">{t.label}</span>
              <div className="ms-chips">
                {lines.map((l) => {
                  const it = meta.get(l.short);
                  const band = bandOf(it, l.short);
                  return (
                    <span
                      key={`${t.weekIndex}-${l.full}`}
                      className={`ms-chip is-${band}`}
                    >
                      {chipLabel(l)}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
        {bulkTrips.length > 12 ? (
          <button
            type="button"
            className="ms-more"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? "Less" : `All ${bulkTrips.length} trips`}
          </button>
        ) : null}
      </div>
    </div>
  );
}
