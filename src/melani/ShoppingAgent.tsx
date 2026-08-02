/**
 * Shopping channel — groceri.es-inspired run:
 * fixed menu → auto list → aisle path → check boxes → XP.
 * Hate grocery shopping? Don't plan. Just clear the path.
 */
import {
  ArrowRight,
  ArrowSquareOut,
  Check,
  Plus,
  ShoppingCartSimple,
  X,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import {
  COSTCO_LOGIN_URL,
  COSTCO_STOREFRONT_URL,
  costcoSameDaySearchUrl,
  loadCostcoPlan,
  loadInventory,
  missingItems,
  saveCostcoPlan,
  saveInventory,
  SHOPPING_EVENT,
  stageCostcoPlan,
  storeSearchUrl,
  type CostcoPlan,
  type HomeItem,
  type StockState,
} from "./shoppingStore";
import {
  addGroceryXp,
  buildGroceryRun,
  GROCERY_EVENT,
  groupByAisle,
  loadGroceryRun,
  loadGroceryXp,
  loadPantryIds,
  runCheer,
  runProgress,
  saveGroceryRun,
  savePantryIds,
  toggleRunItem,
  type GroceryRun,
} from "./groceryEngine";
import { MealsShop } from "./MealsShop";
import "./shopping-agent.css";
import "./meals-shop.css";

const STATES: StockState[] = ["out", "low", "stocked"];

export function ShoppingAgent() {
  const [items, setItems] = useState<HomeItem[]>(loadInventory);
  const [plan, setPlan] = useState<CostcoPlan | null>(loadCostcoPlan);
  const [run, setRun] = useState<GroceryRun | null>(loadGroceryRun);
  const [xp, setXp] = useState(loadGroceryXp);
  const [days, setDays] = useState(7);
  const [name, setName] = useState("");
  const [area, setArea] = useState("Home");
  const [launching, setLaunching] = useState(false);
  const [notice, setNotice] = useState("");
  const [pantry, setPantry] = useState(() => loadPantryIds());

  useEffect(() => {
    const sync = () => {
      setItems(loadInventory());
      setPlan(loadCostcoPlan());
      setRun(loadGroceryRun());
      setXp(loadGroceryXp());
      setPantry(loadPantryIds());
    };
    window.addEventListener(SHOPPING_EVENT, sync);
    window.addEventListener(GROCERY_EVENT, sync);
    return () => {
      window.removeEventListener(SHOPPING_EVENT, sync);
      window.removeEventListener(GROCERY_EVENT, sync);
    };
  }, []);

  const missing = useMemo(() => missingItems(items), [items]);
  const areas = useMemo(() => [...new Set(items.map((item) => item.area))], [items]);
  const activePlanItems = plan?.items.filter((item) => !item.done) || [];
  const progress = run ? runProgress(run) : null;
  const aisleGroups = run ? groupByAisle(run) : [];

  function update(id: string, state: StockState) {
    const next = items.map((item) =>
      item.id === id ? { ...item, state, updatedAt: new Date().toISOString() } : item
    );
    setItems(next);
    saveInventory(next);
  }

  function add() {
    const clean = name.trim();
    if (!clean) return;
    const next = [
      ...items,
      {
        id: `home-${Date.now()}`,
        name: clean,
        area,
        state: "low" as const,
        preferredStore: "either" as const,
        updatedAt: new Date().toISOString(),
      },
    ];
    setItems(next);
    saveInventory(next);
    setName("");
  }

  function patchPlan(next: CostcoPlan | null) {
    setPlan(next);
    saveCostcoPlan(next);
  }

  function startFixedMenuRun(n = days) {
    const next = buildGroceryRun(n, { pantryIds: pantry });
    setRun(next);
    saveGroceryRun(next);
    // Also stage into Costco plan so Confirm and shop still works
    stageCostcoPlan(
      next.items.map((item) => ({
        name: item.name,
        quantity: Math.max(1, Math.ceil(item.quantity)),
      }))
    );
    setPlan(loadCostcoPlan());
    setNotice(
      `Built a ${n}-day run from your fixed menu. Pantry skipped. Walk the aisles.`
    );
  }

  function onToggleRunItem(id: string) {
    if (!run) return;
    const next = toggleRunItem(run, id);
    const before = runProgress(run);
    const after = runProgress(next);
    setRun(next);
    saveGroceryRun(next);
    // XP when finishing the run
    if (before.pct < 100 && after.pct === 100) {
      const gained = 25 + next.days;
      setXp(addGroceryXp(gained));
      setNotice(`Run complete. +${gained} XP. Same menu next week — no new decisions.`);
    }
  }

  function removePlanItem(id: string) {
    if (!plan) return;
    const nextItems = plan.items.filter((item) => item.id !== id);
    patchPlan(nextItems.length ? { ...plan, items: nextItems } : null);
  }

  function finishPlanItem(id: string) {
    if (!plan) return;
    patchPlan({
      ...plan,
      items: plan.items.map((item) =>
        item.id === id ? { ...item, done: true } : item
      ),
    });
  }

  async function launchCostcoPlan() {
    const list =
      run && run.items.some((i) => !i.done)
        ? run.items.filter((i) => !i.done)
        : activePlanItems;
    if (!list.length || launching) return;
    const popup = window.open("about:blank", "wonder-costco-shopping");
    if (popup) popup.opener = null;
    setLaunching(true);
    setNotice("");
    const firstName =
      "search" in list[0]
        ? (list[0] as { search?: string; name: string }).search || list[0].name
        : list[0].name;
    let destination = costcoSameDaySearchUrl(firstName);
    let usedShoppingList = false;
    try {
      const response = await fetch("/api/instacart/shopping-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Melani fixed-menu run",
          items: list.map((item) => ({
            name: item.name,
            quantity:
              "quantity" in item
                ? Math.max(1, Math.ceil(Number(item.quantity) || 1))
                : 1,
          })),
        }),
      });
      const payload = (await response.json()) as { url?: string };
      if (response.ok && payload.url) {
        destination = payload.url;
        usedShoppingList = true;
      }
    } catch {
      /* Costco Same-Day search remains the no-setup fallback. */
    }

    if (popup) popup.location.href = destination;
    else window.open(destination, "_blank", "noopener,noreferrer");
    if (plan) {
      patchPlan({
        ...plan,
        launchedAt: new Date().toISOString(),
        launchUrl: destination,
      });
    }
    setNotice(
      usedShoppingList
        ? "List opened. Match products, pick Costco, leave. Don't browse."
        : "Costco Same-Day opened. Use aisle Find links. Speedrun mode."
    );
    setLaunching(false);
  }

  return (
    <div className="shop-agent">
      <header className="shop-hero">
        <p className="shop-eyebrow">Grocery speedrun · groceri.es style</p>
        <h1>
          {progress && progress.pct === 100
            ? "Run complete"
            : progress
              ? `${progress.done} / ${progress.total} cleared`
              : missing.length
                ? `${missing.length} things need attention`
                : "Build a run. Don't invent a menu."}
        </h1>
        <p>
          Your fixed food menu turns into a shopping list automatically. Pantry
          stays home. Aisles are a path. Check boxes, earn XP, leave the store.
        </p>
        <p className="shop-xp">
          Run XP <strong>{xp}</strong>
          {progress ? (
            <span className="shop-cheer">
              {" "}
              · {runCheer(progress.pct, progress.done, progress.total)}
            </span>
          ) : null}
        </p>
      </header>

      {/* Trader Joe's · exact grams + run-out (same as Meals → Shop) */}
      <MealsShop />

      {/* ── Fixed-menu grocery run (the fun / anti-hate layer) ── */}
      <section className="shop-run" aria-label="Fixed menu grocery run">
        <div className="shop-run-head">
          <div>
            <p className="shop-run-kicker">From fixed meals</p>
            <h2>This week&apos;s list</h2>
          </div>
          <div className="shop-run-days">
            {[3, 7, 14].map((n) => (
              <button
                key={n}
                type="button"
                className={days === n ? "is-on" : undefined}
                onClick={() => setDays(n)}
              >
                {n}d
              </button>
            ))}
            <button
              type="button"
              className="shop-run-build"
              onClick={() => startFixedMenuRun(days)}
            >
              {run ? "Rebuild list" : "Build list"}
            </button>
          </div>
        </div>

        {progress ? (
          <div className="shop-run-bar-wrap" aria-hidden>
            <div
              className="shop-run-bar"
              style={{ width: `${progress.pct}%` }}
            />
          </div>
        ) : null}

        {run && aisleGroups.length ? (
          <div className="shop-aisles">
            {aisleGroups.map((group, gi) => {
              const aisleDone = group.items.every((i) => i.done);
              return (
                <div
                  key={group.aisle}
                  className={`shop-aisle${aisleDone ? " is-clear" : ""}`}
                >
                  <h3>
                    <span className="shop-aisle-num">{gi + 1}</span>
                    {group.aisle}
                    {aisleDone ? (
                      <span className="shop-aisle-badge">clear</span>
                    ) : null}
                  </h3>
                  <ul>
                    {group.items.map((item) => (
                      <li
                        key={item.id}
                        className={item.done ? "is-done" : undefined}
                      >
                        <button
                          type="button"
                          className="shop-check"
                          aria-pressed={item.done}
                          aria-label={
                            item.done
                              ? `Uncheck ${item.name}`
                              : `Check ${item.name}`
                          }
                          onClick={() => onToggleRunItem(item.id)}
                        >
                          {item.done ? <Check size={14} weight="bold" /> : null}
                        </button>
                        <div className="shop-line">
                          <strong>{item.name}</strong>
                          <span>
                            {item.quantity} {item.unit}
                          </span>
                        </div>
                        <a
                          href={costcoSameDaySearchUrl(item.search)}
                          target="_blank"
                          rel="noreferrer"
                          title={`Find ${item.name}`}
                        >
                          Find <ArrowSquareOut size={12} />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            <footer className="shop-run-footer">
              <button
                type="button"
                className="shop-costco-launch"
                onClick={() => void launchCostcoPlan()}
                disabled={
                  launching ||
                  !(run.items.some((i) => !i.done) || activePlanItems.length)
                }
              >
                <ShoppingCartSimple size={16} />
                {launching ? "Preparing" : "Confirm and shop"}
                <ArrowRight size={14} />
              </button>
              <button
                type="button"
                className="shop-costco-clear"
                onClick={() => {
                  setRun(null);
                  saveGroceryRun(null);
                }}
              >
                Clear run
              </button>
            </footer>
            {notice ? <p className="shop-costco-notice">{notice}</p> : null}
          </div>
        ) : (
          <p className="shop-run-empty">
            Tap <strong>Build list</strong> for {days} days of your fixed
            breakfast · lunch · salmon dinner · snack. No recipe browsing.
          </p>
        )}
      </section>

      <section className="shop-costco">
        <div className="shop-costco-head">
          <div>
            <p>Costco Same-Day</p>
            <h2>
              {activePlanItems.length
                ? `${activePlanItems.length} items staged`
                : "Your Costco account"}
            </h2>
          </div>
          <div className="shop-costco-links">
            <a href={COSTCO_LOGIN_URL} target="_blank" rel="noreferrer">
              Sign in <ArrowSquareOut size={13} />
            </a>
            <a href={COSTCO_STOREFRONT_URL} target="_blank" rel="noreferrer">
              Open store <ArrowSquareOut size={13} />
            </a>
          </div>
        </div>

        {plan?.items.length ? (
          <div className="shop-costco-plan">
            {plan.items.map((item) => (
              <div key={item.id} className={item.done ? "is-done" : ""}>
                <span className="shop-costco-qty">{item.quantity}</span>
                <strong>{item.name}</strong>
                <a
                  href={costcoSameDaySearchUrl(item.name)}
                  target="_blank"
                  rel="noreferrer"
                  title={`Find ${item.name} at Costco`}
                >
                  Find <ArrowSquareOut size={12} />
                </a>
                <button
                  type="button"
                  onClick={() => finishPlanItem(item.id)}
                  title="Mark added"
                >
                  <Check size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => removePlanItem(item.id)}
                  title="Remove from list"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
            <footer>
              <button
                type="button"
                className="shop-costco-launch"
                onClick={() => void launchCostcoPlan()}
                disabled={!activePlanItems.length || launching}
              >
                <ShoppingCartSimple size={16} />
                {launching ? "Preparing" : "Confirm and shop"}
                <ArrowRight size={14} />
              </button>
              <button
                type="button"
                className="shop-costco-clear"
                onClick={() => patchPlan(null)}
              >
                Clear
              </button>
            </footer>
          </div>
        ) : null}
      </section>

      <section className="shop-missing">
        <div className="shop-section-head">
          <div>
            <p>House gaps</p>
            <h2>Missing and running low</h2>
          </div>
          <span>{missing.length}</span>
        </div>
        {!missing.length ? (
          <p className="shop-empty">
            <Check size={18} /> No restock needed.
          </p>
        ) : (
          <div className="shop-order-list">
            {missing.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <span>
                    {item.area} · {item.state}
                  </span>
                </div>
                <div className="shop-store-actions">
                  <a
                    href={storeSearchUrl("costco", item.name)}
                    target="_blank"
                    rel="noreferrer"
                    title="Find at Costco"
                  >
                    Costco <ArrowSquareOut size={13} />
                  </a>
                  <a
                    href={storeSearchUrl("walmart", item.name)}
                    target="_blank"
                    rel="noreferrer"
                    title="Find at Walmart"
                  >
                    Walmart <ArrowSquareOut size={13} />
                  </a>
                  <button
                    onClick={() => update(item.id, "stocked")}
                    title="Mark stocked"
                  >
                    <Check size={15} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="shop-inventory">
        <div className="shop-section-head">
          <div>
            <p>Pantry + house</p>
            <h2>What is already home</h2>
          </div>
        </div>
        <p className="shop-pantry-hint">
          Pantry items (oil, seeds, salt…) stay off the weekly run. Mark stock
          below so Mel knows what&apos;s low.
        </p>
        <div className="shop-add">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && add()}
            placeholder="Add an item"
          />
          <select
            value={area}
            onChange={(event) => setArea(event.target.value)}
          >
            {[...areas, ...(areas.includes("Home") ? [] : ["Home"])].map(
              (value) => (
                <option key={value}>{value}</option>
              )
            )}
          </select>
          <button onClick={add} aria-label="Add item">
            <Plus size={16} />
          </button>
        </div>
        <div className="shop-areas">
          {areas.map((areaName) => (
            <div key={areaName} className="shop-area">
              <h3>{areaName}</h3>
              {items
                .filter((item) => item.area === areaName)
                .map((item) => (
                  <div className="shop-stock-row" key={item.id}>
                    <span>{item.name}</span>
                    <div>
                      {STATES.map((state) => (
                        <button
                          key={state}
                          className={item.state === state ? "is-active" : ""}
                          onClick={() => update(item.id, state)}
                        >
                          {state}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          ))}
        </div>
        {/* Quiet pantry controls for advanced users */}
        <details className="shop-pantry-edit">
          <summary>Edit which fixed-menu items count as pantry</summary>
          <ul className="shop-pantry-list">
            {[
              "chia",
              "flax",
              "pumpkin-seeds",
              "makhana",
              "honey",
              "olive-oil",
              "salt-pepper",
            ].map((id) => {
              const on = pantry.has(id);
              return (
                <li key={id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => {
                        const next = new Set(pantry);
                        if (on) next.delete(id);
                        else next.add(id);
                        setPantry(next);
                        savePantryIds(next);
                      }}
                    />{" "}
                    {id}
                  </label>
                </li>
              );
            })}
          </ul>
        </details>
      </section>
    </div>
  );
}

export function isShoppingAgentPage(pageId: string) {
  return pageId === "pg-agent-shopping";
}
