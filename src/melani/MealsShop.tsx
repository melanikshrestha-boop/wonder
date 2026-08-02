/**
 * Meals → Shop
 * Grouped by meal (breakfast / lunch / dinner) — not produce aisles.
 * Tap = bought · tap again = undo (clear). No double-tap gesture.
 */
import { useEffect, useMemo, useState } from "react";
import {
  BLUEPRINT_MEALS,
  TJ_SHOP_EVENT,
  computeRunOut,
  formatAmount,
  groupRowsByMeal,
  loadShopChecks,
  loadStock,
  markShopBought,
  plainDayIngredientList,
  setStockAmount,
  type BlueprintMealId,
  type ShopItemState,
} from "./blueprintDiet";
import "./meals-shop.css";

type Props = {
  defaultDays?: number;
};

export function MealsShop({ defaultDays = 7 }: Props) {
  const [days, setDays] = useState(defaultDays);
  const [optional, setOptional] = useState(false);
  const [stock, setStock] = useState(loadStock);
  const [checks, setChecks] = useState(loadShopChecks);
  const [mode, setMode] = useState<"buy" | "stock" | "day">("buy");

  useEffect(() => {
    const sync = () => {
      setStock(loadStock());
      setChecks(loadShopChecks());
    };
    window.addEventListener(TJ_SHOP_EVENT, sync);
    return () => window.removeEventListener(TJ_SHOP_EVENT, sync);
  }, []);

  const mealIds: BlueprintMealId[] = optional
    ? ["breakfast", "lunch", "dinner", "optional"]
    : ["breakfast", "lunch", "dinner"];

  const rows = useMemo(
    () => computeRunOut(mealIds, days, stock),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [optional, days, stock]
  );

  const buyRows = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.packsToBuy > 0 ||
          checks[r.id] === "bought" ||
          checks[r.id] === "own"
      ),
    [rows, checks]
  );

  const buyByMeal = useMemo(
    () => groupRowsByMeal(buyRows, mealIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buyRows, optional]
  );
  const stockByMeal = useMemo(
    () => groupRowsByMeal(rows, mealIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, optional]
  );
  const dayList = useMemo(() => plainDayIngredientList(optional), [optional]);

  const dayByMeal = useMemo(() => {
    const map = new Map<string, typeof dayList>();
    for (const row of dayList) {
      const arr = map.get(row.meal) || [];
      arr.push(row);
      map.set(row.meal, arr);
    }
    return BLUEPRINT_MEALS.filter((m) => mealIds.includes(m.id))
      .map((m) => ({
        title: m.title,
        short: m.short,
        items: map.get(m.title) || [],
      }))
      .filter((g) => g.items.length > 0);
  }, [dayList, optional]);

  const buyCount = rows.filter(
    (r) =>
      r.packsToBuy > 0 &&
      checks[r.id] !== "own" &&
      checks[r.id] !== "bought"
  ).length;

  function refreshShop() {
    setChecks(loadShopChecks());
    setStock(loadStock());
  }

  /** Tap = buy · same row again = undo. Immediate, no delay / no double-tap. */
  function handleBuyTap(id: string, packs: number) {
    markShopBought(id, packs);
    refreshShop();
  }

  function rowClass(state: ShopItemState | undefined): string {
    if (state === "bought") return "is-bought";
    if (state === "own") return "is-own";
    return "";
  }

  return (
    <div className="ms">
      <header className="ms-head">
        <h2 className="fx-h2">SHOP · BY MEAL</h2>
        <p className="ms-meta">
          {mode === "buy"
            ? `What to grab at TJ for the next ${days} days. Tap = bought · tap again = undo${
                buyCount > 0 ? ` · ${buyCount} left` : ""
              }`
            : mode === "stock"
              ? `What’s left at home vs how much you use per day (${days}-day window).`
              : "Exact grams for one full day of the locked plan — not a buy list."}
        </p>
      </header>

      <div className="ms-toolbar">
        <div className="ms-modes" role="tablist" aria-label="Shop view">
          {(
            [
              ["buy", "Buy list"],
              ["stock", "At home"],
              ["day", "One day exact"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              className={mode === id ? "is-on" : undefined}
              onClick={() => setMode(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {mode !== "day" ? (
          <div className="ms-days" role="group" aria-label="Days to cover">
            <span className="ms-days-label">Cover</span>
            {[3, 7, 14].map((n) => (
              <button
                key={n}
                type="button"
                className={days === n ? "is-on" : undefined}
                onClick={() => setDays(n)}
              >
                {n} days
              </button>
            ))}
            <button
              type="button"
              className={optional ? "is-on" : undefined}
              onClick={() => setOptional((v) => !v)}
              title="Include optional pudding ingredients"
            >
              + pudding
            </button>
          </div>
        ) : null}
      </div>

      {mode === "day" ? (
        <section className="ms-panel" aria-label="One day by meal">
          <h2 className="fx-h2">EXACT · ONE DAY</h2>
          {dayByMeal.map((g) => (
            <div key={g.title} className="ms-meal-block">
              <h3 className="ms-meal-h">{g.title}</h3>
              <p className="ms-meal-short">{g.short}</p>
              <table className="ms-table">
                <tbody>
                  {g.items.map((row, i) => (
                    <tr key={`${row.name}-${i}`}>
                      <td className="ms-num">{row.amount}</td>
                      <td>{row.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      ) : null}

      {mode === "buy" ? (
        <section className="ms-panel" aria-label="Buy by meal">
          <h2 className="fx-h2">BUY · BY MEAL</h2>
          {!buyByMeal.length ? (
            <p className="ms-empty">
              Nothing to buy for {days}d — stock covers it, or mark items own.
            </p>
          ) : (
            buyByMeal.map((g, gi) => (
              <div key={g.mealId} className="ms-meal-block">
                <h3 className="ms-meal-h">
                  <span className="ms-meal-n">{gi + 1}</span>
                  {g.title}
                </h3>
                <p className="ms-meal-short">{g.short}</p>
                <ul>
                  {g.items.map((item) => {
                    const st = checks[item.id] as ShopItemState | undefined;
                    const also =
                      item.mealIds.length > 1
                        ? item.mealIds
                            .filter((m) => m !== item.primaryMeal)
                            .map((m) =>
                              m === "optional"
                                ? "pudding"
                                : m.charAt(0).toUpperCase() + m.slice(1)
                            )
                            .join(" · ")
                        : "";
                    return (
                      <li key={item.id} className={rowClass(st)}>
                        <button
                          type="button"
                          className={`ms-check${st === "own" ? " is-own" : ""}${
                            st === "bought" ? " is-bought" : ""
                          }`}
                          aria-label={
                            st === "bought" || st === "own"
                              ? `${item.name} marked — tap to undo`
                              : `${item.name}: tap to mark bought`
                          }
                          onClick={() =>
                            handleBuyTap(item.id, item.packsToBuy)
                          }
                        >
                          {st === "own" ? "●" : st === "bought" ? "✓" : ""}
                        </button>
                        <div className="ms-line">
                          <strong>{item.tjProduct}</strong>
                          <span>
                            {st === "own"
                              ? "Own · at home"
                              : st === "bought"
                                ? "Bought today"
                                : `Buy ${item.packsToBuy}${
                                    item.packSize
                                      ? ` × ${formatAmount(item.packSize, item.unit)}`
                                      : ""
                                  } · ${formatAmount(item.usePerDay, item.unit)}/day`}
                            {st !== "own" &&
                            st !== "bought" &&
                            item.daysLeft != null
                              ? ` · ${item.daysLeft}d left`
                              : ""}
                            {also ? ` · also ${also}` : ""}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </section>
      ) : null}

      {mode === "stock" ? (
        <section className="ms-panel" aria-label="Home stock by meal">
          <h2 className="fx-h2">STOCK · BY MEAL</h2>
          <p className="ms-hint">
            How many days each item lasts from what’s in the house.
          </p>
          {stockByMeal.map((g) => (
            <div key={g.mealId} className="ms-meal-block">
              <h3 className="ms-meal-h">{g.title}</h3>
              <p className="ms-meal-short">{g.short}</p>
              <ul className="ms-stock-list">
                {g.items.map((item) => (
                  <li key={item.id}>
                    <div className="ms-stock-name">
                      <strong>{item.name}</strong>
                      <span>
                        {formatAmount(item.usePerDay, item.unit)}/day
                        {item.daysLeft != null ? (
                          <>
                            {" · "}
                            <em
                              className={
                                item.daysLeft < days ? "is-low" : undefined
                              }
                            >
                              {item.daysLeft}d left
                            </em>
                          </>
                        ) : (
                          " · —"
                        )}
                      </span>
                    </div>
                    <label className="ms-stock-input">
                      <span className="ms-vis">Left</span>
                      <input
                        type="number"
                        min={0}
                        step={item.unit === "each" ? 0.5 : 1}
                        value={stock[item.id] ?? ""}
                        placeholder="0"
                        onChange={(e) => {
                          const v = e.target.value;
                          const map = setStockAmount(
                            item.id,
                            v === "" ? 0 : Number(v)
                          );
                          setStock({ ...map });
                        }}
                      />
                      <span className="ms-unit">{item.unit}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
