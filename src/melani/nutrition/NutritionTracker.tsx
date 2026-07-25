/**
 * NutritionTracker — calories and macros, logged the way you talk.
 *
 *   ┌ date nav ─────────────────────────────────────────────┐
 *   │ calorie ring · protein/carbs/fat/fibre bars           │
 *   │ quick-add: plain English → parsed chips → log         │
 *   │ coach: pace, protein owed, foods that close the gap   │
 *   │ breakfast / lunch / dinner / snacks — editable rows   │
 *   │ 14-day calorie + protein trend                        │
 *   └───────────────────────────────────────────────────────┘
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { todayKey } from "../data";
import {
  defaultPortion,
  macrosFor,
  searchFoods,
  type Food,
  type Macros,
} from "./foodDb";
import { parseFoodText, type ParsedItem } from "./parseFood";
import {
  addEntries,
  addWater,
  entriesBySlot,
  history,
  loadDay,
  loadProfile,
  loadRecents,
  loadTargets,
  loadWater,
  moveEntry,
  onNutritionChange,
  removeEntry,
  saveProfile,
  saveTargets,
  setEntryGrams,
  shiftDay,
  SLOT_LABEL,
  SLOTS,
  dayTotals,
  type MealSlot,
  type NutriEntry,
} from "./nutritionStore";
import {
  buildInsights,
  energyModel,
  remaining,
  suggestClosers,
} from "./nutritionInsights";
import {
  isPlausibleBarcode,
  lookupBarcode,
  offToFood,
  searchProducts,
  type OffProduct,
} from "./openFoodFacts";
import {
  addRecipe,
  loadRecipes,
  markRecipeUsed,
  perServing,
  recipeFromEntries,
  recipeToEntries,
  removeRecipe,
  saveRecipes,
  sortedRecipes,
  type Recipe,
} from "./recipes";
import "./nutrition.css";

const MACRO_META = [
  { key: "protein_g", label: "Protein", color: "#22d3ee" },
  { key: "carbs_g", label: "Carbs", color: "#a78bfa" },
  { key: "fat_g", label: "Fat", color: "#f472b6" },
  { key: "fiber_g", label: "Fibre", color: "#84cc16" },
] as const;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** ISO "2026-07-25" → "Jul 25". */
function prettyDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1].slice(0, 3)} ${d}${y !== new Date().getFullYear() ? ` ${y}` : ""}`;
}

/** The eating window that matches the clock right now. */
function slotForNow(now = new Date()): MealSlot {
  const h = now.getHours();
  if (h < 11) return "breakfast";
  if (h < 16) return "lunch";
  if (h < 21) return "dinner";
  return "snack";
}

function CalorieRing({ eaten, target }: { eaten: number; target: number }) {
  const size = 168;
  const r = size / 2 - 12;
  const c = 2 * Math.PI * r;
  const ratio = target > 0 ? eaten / target : 0;
  const dash = c * Math.min(1, Math.max(0, ratio));
  const over = eaten > target;
  const left = Math.round(target - eaten);
  return (
    <div className="nut-ring">
      <svg width={size} height={size} role="img" aria-label={`${Math.round(eaten)} of ${target} calories`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--nut-track)" strokeWidth="12" />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={over ? "#f97316" : "var(--nut-accent)"} strokeWidth="12"
          strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="nut-ring-mid">
        <b>{Math.abs(left)}</b>
        <span>{over ? "cal over" : "cal left"}</span>
        <em>{Math.round(eaten)} / {target}</em>
      </div>
    </div>
  );
}

function MacroBar({
  label, value, target, color,
}: { label: string; value: number; target: number; color: string }) {
  const ratio = target > 0 ? Math.min(1.35, value / target) : 0;
  return (
    <div className="nut-macro">
      <div className="nut-macro-top">
        <span>{label}</span>
        <b>{Math.round(value)}<i>/{Math.round(target)}g</i></b>
      </div>
      <div className="nut-macro-track">
        <div
          className="nut-macro-fill"
          style={{ width: `${Math.min(100, ratio * 100)}%`, background: color }}
        />
        {ratio > 1 && <div className="nut-macro-over" style={{ borderColor: color }} />}
      </div>
    </div>
  );
}

function TrendChart({ days, target }: { days: { day: string; totals: Macros }[]; target: number }) {
  const w = 720;
  const h = 150;
  const pad = 10;
  const max = Math.max(target * 1.25, ...days.map((d) => d.totals.calories), 1);
  const bw = (w - pad * 2) / days.length;
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="nut-trend" role="img" aria-label="14-day calorie trend">
      <line x1={pad} x2={w - pad} y1={y(target)} y2={y(target)}
        stroke="var(--nut-accent)" strokeDasharray="4 5" strokeOpacity="0.55" />
      {days.map((d, i) => {
        const cal = d.totals.calories;
        const top = y(cal);
        const over = cal > target;
        return (
          <g key={d.day}>
            <rect
              x={pad + i * bw + bw * 0.18}
              y={top}
              width={bw * 0.64}
              height={Math.max(0, h - pad - top)}
              rx="3"
              fill={cal === 0 ? "var(--nut-track)" : over ? "#f97316" : "var(--nut-accent)"}
              fillOpacity={cal === 0 ? 1 : 0.85}
            />
            <text
              x={pad + i * bw + bw / 2}
              y={h - 1}
              textAnchor="middle"
              fontSize="8.5"
              fill="var(--nut-sub)"
            >
              {Number(d.day.slice(-2))}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function NutritionTracker() {
  const [day, setDay] = useState(() => todayKey());
  const [entries, setEntries] = useState<NutriEntry[]>(() => loadDay(day));
  const [targets, setTargets] = useState(() => loadTargets());
  const [profile, setProfile] = useState(() => loadProfile());
  const [water, setWater] = useState(() => loadWater(day));
  const [quick, setQuick] = useState("");
  const [slot, setSlot] = useState<MealSlot>(() => slotForNow());
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Food | null>(null);
  const [pickQty, setPickQty] = useState(1);
  const [pickUnit, setPickUnit] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [flash, setFlash] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [barcode, setBarcode] = useState("");
  const [offBusy, setOffBusy] = useState(false);
  const [offNote, setOffNote] = useState("");
  const [online, setOnline] = useState<OffProduct[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>(() => loadRecipes());
  const [recipeName, setRecipeName] = useState("");
  const quickRef = useRef<HTMLInputElement>(null);

  const isToday = day === todayKey();

  const refresh = useCallback(() => {
    setEntries(loadDay(day));
    setWater(loadWater(day));
    setTargets(loadTargets());
    setProfile(loadProfile());
    setRecipes(loadRecipes());
  }, [day]);

  useEffect(() => refresh(), [refresh]);
  useEffect(() => onNutritionChange(refresh), [refresh]);

  function say(message: string) {
    setFlash(message);
    window.setTimeout(() => setFlash(""), 2400);
  }

  const totals = useMemo(() => dayTotals(entries), [entries]);
  const left = useMemo(() => remaining(targets, totals), [targets, totals]);
  const bySlot = useMemo(() => entriesBySlot(entries), [entries]);
  const parsed = useMemo(() => (quick.trim() ? parseFoodText(quick) : null), [quick]);
  const insights = useMemo(
    () => buildInsights({ day, entries, totals, targets, profile, isToday }),
    [day, entries, totals, targets, profile, isToday]
  );
  const closers = useMemo(
    () => (isToday ? suggestClosers(left, 3, entries.map((e) => e.foodId || "")) : []),
    [isToday, left, entries]
  );
  const trend = useMemo(() => history(14, day), [day, entries]);
  const energy = useMemo(() => energyModel(profile, totals.calories), [profile, totals]);
  const results = useMemo(() => (search.trim() ? searchFoods(search, 10) : []), [search]);
  const recents = useMemo(() => loadRecents().slice(0, 8), [entries]);

  function logParsed(items: ParsedItem[]) {
    if (!items.length) return;
    addEntries(
      items.map((item) => ({
        slot,
        name: item.name,
        grams: item.grams,
        qtyLabel: item.qtyLabel,
        macros: item.macros,
        foodId: item.food?.id,
        source: "text" as const,
      })),
      day
    );
    setQuick("");
    say(`Logged ${items.length} item${items.length > 1 ? "s" : ""} · ${Math.round(items.reduce((s, i) => s + i.macros.calories, 0))} cal`);
    quickRef.current?.focus();
  }

  function logFood(food: Food, grams: number, label: string) {
    addEntries(
      [{
        slot,
        name: food.name,
        grams,
        qtyLabel: label,
        macros: macrosFor(food, grams),
        foodId: food.id,
        source: "search" as const,
      }],
      day
    );
    setPicked(null);
    setSearch("");
    say(`Added ${food.name}`);
  }

  // Packaged products are a supplement to the local database, so this runs
  // debounced, never blocks typing, and silently yields nothing when offline.
  useEffect(() => {
    const q = search.trim();
    if (q.length < 3 || picked) { setOnline([]); return; }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      searchProducts(q, 6).then((found) => {
        if (!cancelled) setOnline(found);
      });
    }, 650);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [search, picked]);

  async function scanBarcode() {
    const code = barcode.trim();
    if (!code) return;
    setOffBusy(true);
    setOffNote("");
    const result = await lookupBarcode(code);
    setOffBusy(false);
    if (!result.ok) {
      setOffNote(
        result.reason === "not-found"
          ? "No product with that barcode. Search by name instead."
          : result.reason === "no-nutrition"
            ? "That product has no nutrition data on Open Food Facts."
            : result.reason === "offline"
              ? "You're offline — barcode lookup needs a connection."
              : "Open Food Facts is unreachable right now."
      );
      return;
    }
    const food = offToFood(result.product);
    setPicked(food);
    setPickQty(1);
    setPickUnit(0);
    setBarcode("");
    setOffNote(result.cached ? "From your cache — no network needed." : "");
  }

  function saveTodayAsRecipe() {
    const name = recipeName.trim();
    if (!name || !entries.length) return;
    const next = addRecipe(recipes, recipeFromEntries(name, entries, 1));
    setRecipes(next);
    saveRecipes(next);
    setRecipeName("");
    say(`Saved "${name}" — ${entries.length} ingredients`);
  }

  function logRecipe(recipe: Recipe, servings: number) {
    const rows = recipeToEntries(recipe, servings, slot);
    if (!rows.length) return;
    addEntries(rows, day);
    const next = markRecipeUsed(recipes, recipe.id);
    setRecipes(next);
    saveRecipes(next);
    say(`Logged ${recipe.name} · ${perServing(recipe).calories * servings} cal`);
  }

  const pickPortion = picked ? picked.portions[pickUnit] || defaultPortion(picked) : null;
  const pickGrams = pickPortion ? Math.round(pickPortion.grams * pickQty) : 0;

  return (
    <div className="nut">
      <header className="nut-head">
        <button className="nut-nav" onClick={() => setDay(shiftDay(day, -1))} aria-label="Previous day">‹</button>
        <div className="nut-title">
          <h1>{isToday ? "Today" : prettyDay(day)}</h1>
          <p>
            {isToday ? prettyDay(day) : "Past day"} · {entries.length} item{entries.length === 1 ? "" : "s"} logged
          </p>
        </div>
        <button className="nut-nav" onClick={() => setDay(shiftDay(day, 1))} aria-label="Next day">›</button>
        {!isToday && (
          <button className="nut-today" onClick={() => setDay(todayKey())}>Today</button>
        )}
        <button className="nut-gear" onClick={() => setShowSettings((s) => !s)} aria-label="Targets and profile">⚙</button>
      </header>

      {showSettings && (
        <section className="nut-panel nut-settings">
          <div className="nut-panel-title">Targets &amp; body</div>
          <div className="nut-settings-grid">
            {(["calories", "protein_g", "carbs_g", "fat_g", "fiber_g"] as const).map((key) => (
              <label key={key}>
                <span>{key === "calories" ? "Calories" : key.replace("_g", "")}</span>
                <input
                  type="number" min="0" inputMode="numeric"
                  value={targets[key]}
                  onChange={(e) => {
                    const next = { ...targets, [key]: Math.max(0, Number(e.target.value) || 0) };
                    setTargets(next);
                    saveTargets(next);
                  }}
                />
              </label>
            ))}
            <label>
              <span>Weight lb</span>
              <input
                type="number" min="0" inputMode="decimal"
                value={profile.weight_lb}
                onChange={(e) => {
                  const next = { ...profile, weight_lb: Math.max(0, Number(e.target.value) || 0), weightConfirmed: true };
                  setProfile(next);
                  saveProfile(next);
                }}
              />
            </label>
            <label>
              <span>Activity</span>
              <select
                value={profile.activity}
                onChange={(e) => {
                  const next = { ...profile, activity: e.target.value as typeof profile.activity };
                  setProfile(next);
                  saveProfile(next);
                }}
              >
                <option value="sedentary">Sedentary</option>
                <option value="light">Light</option>
                <option value="moderate">Moderate</option>
                <option value="active">Active</option>
                <option value="athlete">Athlete</option>
              </select>
            </label>
            <label>
              <span>Goal</span>
              <select
                value={profile.goal}
                onChange={(e) => {
                  const next = { ...profile, goal: e.target.value as typeof profile.goal };
                  setProfile(next);
                  saveProfile(next);
                }}
              >
                <option value="cut">Cut</option>
                <option value="maintain">Maintain</option>
                <option value="gain">Gain</option>
              </select>
            </label>
          </div>
          <p className="nut-settings-note">
            Resting burn {energy.bmr} cal · total burn {energy.tdee} cal · {profile.goal} target {energy.recommended} cal.
            {!profile.weightConfirmed && " Set your weight to make these real."}
          </p>
        </section>
      )}

      <section className="nut-hero">
        <CalorieRing eaten={totals.calories} target={targets.calories} />
        <div className="nut-macros">
          {MACRO_META.map((m) => (
            <MacroBar
              key={m.key}
              label={m.label}
              value={totals[m.key]}
              target={targets[m.key]}
              color={m.color}
            />
          ))}
          <div className="nut-water">
            <span>Water</span>
            <b>{(water / 1000).toFixed(1)} L</b>
            <button onClick={() => setWater(addWater(250, day))}>+250 ml</button>
            <button onClick={() => setWater(addWater(500, day))}>+500 ml</button>
          </div>
        </div>
      </section>

      <section className="nut-panel nut-quick">
        <div className="nut-panel-title">
          Quick log
          <div className="nut-slots">
            {SLOTS.map((s) => (
              <button
                key={s}
                className={`nut-slot-pick${slot === s ? " on" : ""}`}
                onClick={() => setSlot(s)}
              >
                {SLOT_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
        <div className="nut-quick-row">
          <input
            ref={quickRef}
            className="nut-quick-input"
            value={quick}
            placeholder="2 eggs, a cup of white rice and 6oz grilled chicken"
            onChange={(e) => setQuick(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && parsed?.items.length) logParsed(parsed.items);
            }}
          />
          <button
            className="nut-quick-go"
            disabled={!parsed?.items.length}
            onClick={() => parsed && logParsed(parsed.items)}
          >
            Log
          </button>
        </div>
        {parsed && (parsed.items.length > 0 || parsed.unmatched.length > 0) && (
          <div className="nut-preview">
            {parsed.items.map((item, i) => (
              <span key={`${item.name}-${i}`} className={`nut-chip is-${item.confidence}`}>
                <b>{item.qtyLabel} · {item.name}</b>
                <i>{item.macros.calories} cal · {item.macros.protein_g}p</i>
              </span>
            ))}
            {parsed.unmatched.map((u) => (
              <span key={u} className="nut-chip is-unknown">
                <b>{u}</b><i>not recognised</i>
              </span>
            ))}
            {parsed.items.length > 1 && (
              <span className="nut-chip is-total">
                <b>Total</b>
                <i>{parsed.totals.calories} cal · {parsed.totals.protein_g}g protein</i>
              </span>
            )}
          </div>
        )}

        <div className="nut-search-row">
          <input
            className="nut-search-input"
            value={search}
            placeholder="or search the food database…"
            onChange={(e) => { setSearch(e.target.value); setPicked(null); }}
          />
          <input
            className="nut-barcode-input"
            value={barcode}
            placeholder="barcode"
            inputMode="numeric"
            onChange={(e) => { setBarcode(e.target.value); setOffNote(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") void scanBarcode(); }}
          />
          <button
            className="nut-quick-go"
            disabled={offBusy || !isPlausibleBarcode(barcode)}
            onClick={() => void scanBarcode()}
          >
            {offBusy ? "…" : "Find"}
          </button>
        </div>
        {offNote && <p className="nut-off-note">{offNote}</p>}
        {!!results.length && !picked && (
          <ul className="nut-results">
            {results.map((food) => (
              <li key={food.id}>
                <button onClick={() => { setPicked(food); setPickQty(1); setPickUnit(0); }}>
                  <span className="nut-result-name">{food.name}</span>
                  <span className="nut-result-macros">
                    {food.per100g.calories} cal · {food.per100g.protein_g}p / 100g
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {!!online.length && !picked && (
          <>
            <p className="nut-online-lead">
              Packaged products · Open Food Facts
            </p>
            <ul className="nut-results is-online">
              {online.map((product) => (
                <li key={product.barcode}>
                  <button onClick={() => { setPicked(offToFood(product)); setPickQty(1); setPickUnit(0); }}>
                    <span className="nut-result-name">
                      {product.name}
                      {product.brand && <i> · {product.brand}</i>}
                    </span>
                    <span className="nut-result-macros">
                      {product.per100g.calories} cal · {product.per100g.protein_g}p / 100g
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {picked && (
          <div className="nut-portion">
            <strong>{picked.name}</strong>
            <input
              type="number" min="0" step="0.5" inputMode="decimal"
              value={pickQty}
              onChange={(e) => setPickQty(Math.max(0, Number(e.target.value) || 0))}
            />
            <select value={pickUnit} onChange={(e) => setPickUnit(Number(e.target.value))}>
              {picked.portions.map((p, i) => (
                <option key={p.label} value={i}>{p.label} ({p.grams} g)</option>
              ))}
            </select>
            <span className="nut-portion-out">
              {pickGrams} g · {macrosFor(picked, pickGrams).calories} cal · {macrosFor(picked, pickGrams).protein_g}g protein
            </span>
            <button
              className="nut-quick-go"
              onClick={() => pickPortion && logFood(picked, pickGrams, `${pickQty} ${pickPortion.label}`)}
            >
              Add
            </button>
            <button className="nut-ghost" onClick={() => setPicked(null)}>Cancel</button>
          </div>
        )}

        {!!recents.length && !search && (
          <div className="nut-recents">
            {recents.map((r) => (
              <button
                key={`${r.foodId || r.name}`}
                onClick={() => {
                  addEntries([{
                    slot, name: r.name, grams: r.grams, qtyLabel: r.qtyLabel,
                    macros: r.macros, foodId: r.foodId, source: "search",
                  }], day);
                  say(`Added ${r.name}`);
                }}
              >
                ↺ {r.name} <i>{r.macros.calories}</i>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="nut-panel">
        <div className="nut-panel-title">
          Recipes
          <span className="nut-recipe-save">
            <input
              value={recipeName}
              placeholder={entries.length ? "name today's meal…" : "log food first"}
              disabled={!entries.length}
              onChange={(e) => setRecipeName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveTodayAsRecipe(); }}
            />
            <button type="button" disabled={!entries.length || !recipeName.trim()} onClick={saveTodayAsRecipe}>
              Save today
            </button>
          </span>
        </div>
        {recipes.length === 0 ? (
          <p className="nut-slot-empty">
            No recipes yet. Log a meal, name it above, and it becomes one tap forever after.
          </p>
        ) : (
          <ul className="nut-recipes">
            {sortedRecipes(recipes).map((recipe) => {
              const each = perServing(recipe);
              return (
                <li key={recipe.id}>
                  <div className="nut-recipe-main">
                    <b>{recipe.name}</b>
                    <span>
                      {recipe.ingredients.length} ingredient{recipe.ingredients.length === 1 ? "" : "s"}
                      {recipe.servings > 1 ? ` · makes ${recipe.servings}` : ""}
                      {recipe.useCount > 0 ? ` · used ${recipe.useCount}×` : ""}
                    </span>
                  </div>
                  <div className="nut-recipe-macros">
                    <b>{each.calories}</b>
                    <i>{each.protein_g}p · {each.carbs_g}c · {each.fat_g}f / serving</i>
                  </div>
                  <button className="nut-recipe-log" onClick={() => logRecipe(recipe, 1)}>
                    Log 1
                  </button>
                  <button className="nut-recipe-log is-half" onClick={() => logRecipe(recipe, 0.5)}>
                    ½
                  </button>
                  <button
                    className="nut-entry-x"
                    onClick={() => {
                      if (!confirm(`Delete the recipe "${recipe.name}"?`)) return;
                      const next = removeRecipe(recipes, recipe.id);
                      setRecipes(next);
                      saveRecipes(next);
                    }}
                    aria-label={`Delete ${recipe.name}`}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {(insights.length > 0 || closers.length > 0) && (
        <section className="nut-panel">
          <div className="nut-panel-title">Coach</div>
          <ul className="nut-insights">
            {insights.map((ins) => (
              <li key={ins.id} className={`is-${ins.tone}`}>
                <b>{ins.title}</b>
                <span>{ins.detail}</span>
              </li>
            ))}
          </ul>
          {closers.length > 0 && (
            <div className="nut-closers">
              <p className="nut-closers-lead">Closes the gap without breaking the budget:</p>
              <div className="nut-closer-row">
                {closers.map((s) => (
                  <button
                    key={s.food.id}
                    onClick={() => logFood(s.food, s.grams, s.label)}
                  >
                    <b>{s.food.name}</b>
                    <i>{s.label}</i>
                    <em>{s.reason}</em>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <section className="nut-panel">
        <div className="nut-panel-title">The day</div>
        {SLOTS.map((s) => {
          const rows = bySlot[s];
          const slotTotals = dayTotals(rows);
          return (
            <div key={s} className="nut-slot">
              <div className="nut-slot-head">
                <h3>{SLOT_LABEL[s]}</h3>
                <span>{rows.length ? `${slotTotals.calories} cal · ${slotTotals.protein_g}g protein` : "—"}</span>
              </div>
              {rows.length === 0 ? (
                <p className="nut-slot-empty">Nothing logged.</p>
              ) : (
                <ul className="nut-entries">
                  {rows.map((entry) => (
                    <li key={entry.id}>
                      <div className="nut-entry-main">
                        <b>{entry.name}</b>
                        <span>{entry.qtyLabel}</span>
                      </div>
                      {editing === entry.id ? (
                        <input
                          className="nut-entry-grams"
                          autoFocus
                          type="number" min="0" inputMode="numeric"
                          defaultValue={entry.grams}
                          onBlur={(e) => {
                            setEntryGrams(entry.id, Number(e.target.value) || 0, day);
                            setEditing(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            if (e.key === "Escape") setEditing(null);
                          }}
                        />
                      ) : (
                        <button
                          className="nut-entry-weight"
                          onClick={() => setEditing(entry.id)}
                          title="Edit weight"
                        >
                          {entry.grams > 0 ? `${entry.grams} g` : "—"}
                        </button>
                      )}
                      <div className="nut-entry-macros">
                        <b>{entry.macros.calories}</b>
                        <i>{entry.macros.protein_g}p · {entry.macros.carbs_g}c · {entry.macros.fat_g}f</i>
                      </div>
                      <select
                        className="nut-entry-move"
                        value={entry.slot}
                        onChange={(e) => moveEntry(entry.id, e.target.value as MealSlot, day)}
                        aria-label="Move to another meal"
                      >
                        {SLOTS.map((target) => (
                          <option key={target} value={target}>{SLOT_LABEL[target]}</option>
                        ))}
                      </select>
                      <button
                        className="nut-entry-x"
                        onClick={() => removeEntry(entry.id, day)}
                        aria-label={`Remove ${entry.name}`}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </section>

      <section className="nut-panel">
        <div className="nut-panel-title">Last 14 days · calories vs target</div>
        <TrendChart days={trend} target={targets.calories} />
      </section>

      {flash && <div className="nut-flash">{flash}</div>}
    </div>
  );
}

export const NUTRITION_PAGE_ID = "pg-nutrition";

export function isNutritionPage(id: string): boolean {
  return id === NUTRITION_PAGE_ID || id === "pg-macros" || id === "pg-calories";
}
