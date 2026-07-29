import { useEffect, useMemo, useState } from "react";
import { moneyCents } from "./financeStore";
import {
  AUGUST_REVENUE_TARGET,
  buildAugustPlan,
} from "./rockefellerFinance";

const SETTINGS_KEY = "wonder-rockefeller-desk-v1";
const SHOPPING_KEY = "wonder-budget-reinvestment-list-v1";

const DEFAULT_SHOPPING = [
  "Desktop setup for Mac / best compute",
  "Video games for streaming",
  "Camera equipment",
];

type DeskSettings = {
  targetIncome: number;
};

function loadSettings(): DeskSettings {
  if (typeof localStorage === "undefined") {
    return { targetIncome: AUGUST_REVENUE_TARGET };
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return {
      targetIncome:
        Number.isFinite(Number(parsed.targetIncome)) &&
        Number(parsed.targetIncome) >= 0
          ? Number(parsed.targetIncome)
          : AUGUST_REVENUE_TARGET,
    };
  } catch {
    return { targetIncome: AUGUST_REVENUE_TARGET };
  }
}

function loadShopping(): string[] {
  if (typeof localStorage === "undefined") return DEFAULT_SHOPPING;
  try {
    const parsed = JSON.parse(localStorage.getItem(SHOPPING_KEY) || "[]");
    if (!Array.isArray(parsed)) return DEFAULT_SHOPPING;
    const list = parsed
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
    return list.length ? list : DEFAULT_SHOPPING;
  } catch {
    return DEFAULT_SHOPPING;
  }
}

const COLORS: Record<string, string> = {
  reinvest: "#0f766e",
  capital: "#4f46e5",
  health: "#16a34a",
  personal: "#dc2626",
};

function BudgetDonut({
  allocations,
  target,
}: {
  allocations: ReturnType<typeof buildAugustPlan>["allocations"];
  target: number;
}) {
  let cursor = 0;
  const stops = allocations.map((allocation) => {
    const start = cursor;
    const end = cursor + allocation.percent * 100;
    cursor = end;
    return `${COLORS[allocation.id]} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
  });

  return (
    <div className="wd-budget-donut" aria-label="Budget allocation pie">
      <div
        className="wd-budget-donut-disk"
        style={{ background: `conic-gradient(${stops.join(", ")})` }}
      >
        <span>
          <strong>{moneyCents(target)}</strong>
          <small>after tax</small>
        </span>
      </div>
      <ul className="wd-budget-donut-legend">
        {allocations.map((allocation) => (
          <li key={allocation.id}>
            <i style={{ background: COLORS[allocation.id] }} aria-hidden />
            <span>{allocation.label}</span>
            <strong>
              {moneyCents(allocation.amount)} ·{" "}
              {Math.round(allocation.percent * 100)}%
            </strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function estimateGrossForNet(targetNet: number): {
  gross: number;
  taxes: number;
  rate: number;
} {
  const targetAnnualNet = targetNet * 12;
  let low = targetAnnualNet;
  let high = targetAnnualNet * 2;
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (mid - estimateAnnualTax(mid) >= targetAnnualNet) high = mid;
    else low = mid;
  }
  const gross = high / 12;
  const taxes = estimateAnnualTax(high) / 12;
  return {
    gross: Math.round(gross * 100) / 100,
    taxes: Math.round(taxes * 100) / 100,
    rate: taxes / gross,
  };
}

function bracketTax(
  taxable: number,
  brackets: { upTo: number; rate: number }[],
): number {
  let tax = 0;
  let floor = 0;
  for (const bracket of brackets) {
    const amount = Math.max(0, Math.min(taxable, bracket.upTo) - floor);
    tax += amount * bracket.rate;
    floor = bracket.upTo;
    if (taxable <= bracket.upTo) return tax;
  }
  return tax;
}

function estimateAnnualTax(gross: number): number {
  const seTaxable = gross * 0.9235;
  const socialSecurityCap = 184_500;
  const seTax =
    Math.min(seTaxable, socialSecurityCap) * 0.124 + seTaxable * 0.029;
  const federalTaxable = Math.max(0, gross - seTax / 2 - 16_100);
  const federal = bracketTax(federalTaxable, [
    { upTo: 12_400, rate: 0.1 },
    { upTo: 50_400, rate: 0.12 },
    { upTo: 105_700, rate: 0.22 },
    { upTo: 201_775, rate: 0.24 },
    { upTo: 256_225, rate: 0.32 },
    { upTo: 640_600, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ]);
  const caTaxable = Math.max(0, gross - 5_706);
  const california = bracketTax(caTaxable, [
    { upTo: 11_079, rate: 0.01 },
    { upTo: 26_264, rate: 0.02 },
    { upTo: 41_452, rate: 0.04 },
    { upTo: 57_542, rate: 0.06 },
    { upTo: 72_724, rate: 0.08 },
    { upTo: 371_479, rate: 0.093 },
    { upTo: 445_771, rate: 0.103 },
    { upTo: 742_953, rate: 0.113 },
    { upTo: Infinity, rate: 0.123 },
  ]);
  return federal + california + seTax;
}

export function RockefellerDesk() {
  const [settings, setSettings] = useState(loadSettings);
  const [shopping, setShopping] = useState(loadShopping);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(SHOPPING_KEY, JSON.stringify(shopping));
  }, [shopping]);

  const plan = useMemo(
    () => buildAugustPlan(settings.targetIncome, 0.01, 0.01),
    [settings],
  );
  const tax = useMemo(
    () => estimateGrossForNet(settings.targetIncome),
    [settings.targetIncome],
  );

  function addItem() {
    const item = draft.trim();
    if (!item) return;
    setShopping((current) => [...current, item]);
    setDraft("");
  }

  return (
    <section
      className="wd-panel wd-rockefeller wd-budget-ledger"
      aria-label="August budget"
    >
      <header className="wd-budget-head">
        <div>
          <p className="wd-ledger-scope">August 2026</p>
          <h2>Budget</h2>
        </div>
        <label className="wd-owner-target">
          <span>Goal income</span>
          <span className="wd-owner-money-input">
            $
            <input
              type="number"
              min="0"
              step="100"
              value={settings.targetIncome}
              onChange={(event) =>
                setSettings({
                  targetIncome: Math.max(0, Number(event.target.value) || 0),
                })
              }
            />
          </span>
        </label>
      </header>

      <dl className="wd-budget-metrics">
        <div className="wd-math-metric" tabIndex={0}>
          <dt>Gross needed</dt>
          <dd>{moneyCents(tax.gross)}</dd>
          <span className="wd-math-popover">
            <strong>Self-employment estimate</strong>
            {moneyCents(settings.targetIncome)} net after roughly{" "}
            {Math.round(tax.rate * 100)}% tax means collecting about{" "}
            {moneyCents(tax.gross)}.
          </span>
        </div>
        <div className="wd-math-metric" tabIndex={0}>
          <dt>Taxes</dt>
          <dd className="is-neg">{moneyCents(tax.taxes)}</dd>
          <span className="wd-math-popover">
            <strong>Federal + California + self-employment</strong>
            Estimated from 2026 IRS federal brackets, 2026 self-employment
            limits, and California's latest published resident table.
          </span>
        </div>
        <div>
          <dt>Personal cap</dt>
          <dd className="is-neg">
            {moneyCents(settings.targetIncome * 0.01)}
          </dd>
        </div>
        <div>
          <dt>Restaurants</dt>
          <dd className="is-neg">$0.00</dd>
        </div>
      </dl>

      <div className="wd-budget-grid">
        <BudgetDonut allocations={plan.allocations} target={plan.targetIncome} />

        <div className="wd-budget-table-wrap">
          <table className="wd-budget-table">
            <thead>
              <tr>
                <th>Purpose</th>
                <th className="num">%</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {plan.allocations.map((allocation) => (
                <tr key={allocation.id}>
                  <td>{allocation.label}</td>
                  <td className="num">
                    {Math.round(allocation.percent * 100)}%
                  </td>
                  <td className="num">{moneyCents(allocation.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <table className="wd-budget-table is-small">
            <thead>
              <tr>
                <th>Personal</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {plan.personal.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td className="num">{moneyCents(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <section className="wd-reinvest-list" aria-label="Reinvestment shopping list">
        <div className="wd-reinvest-title">
          <p className="wd-ledger-scope">Reinvestment list</p>
        </div>
        <ul>
          {shopping.map((item, index) => (
            <li key={`${item}-${index}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <input
                value={item}
                onChange={(event) => {
                  const next = [...shopping];
                  next[index] = event.target.value;
                  setShopping(next);
                }}
              />
              <button
                type="button"
                className="wd-row-x"
                aria-label={`Remove ${item}`}
                onClick={() =>
                  setShopping((current) =>
                    current.filter((_, itemIndex) => itemIndex !== index),
                  )
                }
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="wd-reinvest-add">
          <input
            aria-label="Add reinvestment item"
            value={draft}
            placeholder="Add item"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") addItem();
            }}
          />
          <button type="button" aria-label="Add item" onClick={addItem}>
            +
          </button>
        </div>
      </section>
    </section>
  );
}
