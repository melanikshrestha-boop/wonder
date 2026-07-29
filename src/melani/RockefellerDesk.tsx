import { useEffect, useMemo, useState } from "react";
import { InteractivePieChart } from "./FinCharts";
import { moneyCents } from "./financeStore";
import {
  AUGUST_REVENUE_TARGET,
  buildAugustPlan,
} from "./rockefellerFinance";

const SETTINGS_KEY = "wonder-rockefeller-desk-v1";

type DeskSettings = {
  targetIncome: number;
  personalCapRate: 0.01 | 0.05;
};

function loadSettings(): DeskSettings {
  if (typeof localStorage === "undefined") {
    return { targetIncome: AUGUST_REVENUE_TARGET, personalCapRate: 0.05 };
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return {
      targetIncome:
        Number.isFinite(Number(parsed.targetIncome)) &&
        Number(parsed.targetIncome) >= 0
          ? Number(parsed.targetIncome)
          : AUGUST_REVENUE_TARGET,
      personalCapRate: parsed.personalCapRate === 0.01 ? 0.01 : 0.05,
    };
  } catch {
    return { targetIncome: AUGUST_REVENUE_TARGET, personalCapRate: 0.05 };
  }
}

const COLORS: Record<string, string> = {
  tax: "#5b67d6",
  reinvest: "#129b88",
  invest: "#8b5cf6",
  reserve: "#e5a50a",
  personal: "#ef5a67",
};

export function RockefellerDesk() {
  const [settings, setSettings] = useState(loadSettings);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  const plan = useMemo(
    () =>
      buildAugustPlan(settings.targetIncome, settings.personalCapRate, 0.01),
    [settings],
  );

  const slices = plan.allocations.map((allocation) => ({
    name: allocation.label,
    value: allocation.amount,
    color: COLORS[allocation.id],
  }));

  return (
    <section
      className="wd-panel wd-rockefeller wd-allocation-only"
      aria-label="August budget allocation"
    >
      <header className="wd-allocation-title">
        <div>
          <p className="wd-kicker">AUGUST 2026 · FORECAST</p>
          <h2>Every dollar has one job.</h2>
        </div>
        <label className="wd-owner-target">
          <span>Target</span>
          <span className="wd-owner-money-input">
            $
            <input
              type="number"
              min="0"
              step="100"
              value={settings.targetIncome}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  targetIncome: Math.max(0, Number(event.target.value) || 0),
                }))
              }
            />
          </span>
        </label>
      </header>

      <InteractivePieChart
        title=""
        slices={slices}
        size={330}
        holeRatio={0.58}
        centerPrimary={moneyCents(plan.targetIncome)}
        centerSecondary="forecast only"
        showLegend
        className="wd-allocation-pie"
        formatValue={(value, fraction) =>
          `${moneyCents(value)} · ${Math.round(fraction * 100)}%`
        }
      />

      <div className="wd-cap-choice" aria-label="Personal spending ceiling">
        <span>Personal cap</span>
        <button
          type="button"
          className={settings.personalCapRate === 0.05 ? "is-active" : ""}
          onClick={() =>
            setSettings((current) => ({
              ...current,
              personalCapRate: 0.05,
            }))
          }
        >
          5% · {moneyCents(settings.targetIncome * 0.05)}
        </button>
        <button
          type="button"
          className={settings.personalCapRate === 0.01 ? "is-active" : ""}
          onClick={() =>
            setSettings((current) => ({
              ...current,
              personalCapRate: 0.01,
            }))
          }
        >
          1% · {moneyCents(settings.targetIncome * 0.01)}
        </button>
      </div>

      <div className="wd-restaurant-zero" title="Restaurant spending is outside the August plan.">
        Restaurants <strong>$0</strong>
      </div>
    </section>
  );
}
